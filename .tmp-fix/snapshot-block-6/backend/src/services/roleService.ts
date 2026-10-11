import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { permissions, rolePermissions, roles, userRoles } from '../db/schema';
import type { AppDb } from '../db/client';
import { chunkByParams, runAtomic, type AtomicStatement } from '../lib/atomic';
import { conflict, forbidden, notFound } from '../lib/errors';
import { toPublicRole, type PublicRole } from '../lib/presenters';
import { newId, nowIso } from '../lib/tokens';
import type { ListQuery } from '../lib/validation';
import { MSG, SUPER_ADMIN_CORE_PERMISSIONS, SUPER_ADMIN_ROLE_ID, assertCovers, isSuperAdmin, type Actor } from './authz';

async function permissionNamesFor(db: AppDb, roleId: string): Promise<string[]> {
  const rows = await db
    .select({ name: permissions.name })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, roleId));
  return rows.map((r) => r.name);
}

/** Permission ids for the given names, in the order of `names` (one query per 90 names). */
async function permissionIdsFor(db: AppDb, names: string[]): Promise<string[]> {
  const byName = new Map<string, string>();
  for (let i = 0; i < names.length; i += 90) {
    const rows = await db
      .select({ id: permissions.id, name: permissions.name })
      .from(permissions)
      .where(inArray(permissions.name, names.slice(i, i + 90)));
    for (const r of rows) byName.set(r.name, r.id);
  }
  return names.map((n) => byName.get(n) as string);
}

/** Role-permission links, chunked to D1's bound-parameter cap (2 values per row). */
function permissionLinkInserts(db: AppDb, roleId: string, permissionIds: string[]): AtomicStatement[] {
  return chunkByParams(permissionIds.map((permissionId) => ({ roleId, permissionId })), 2, 0).map((chunk) =>
    db.insert(rolePermissions).values(chunk),
  );
}

async function assertPermissionsExist(db: AppDb, names: string[]): Promise<void> {
  for (const name of names) {
    const rows = await db.select({ id: permissions.id }).from(permissions).where(eq(permissions.name, name)).limit(1);
    if (rows.length === 0) {
      throw conflict(`Permission not found: ${name}`, { permissions: [`Permission not found: ${name}`] });
    }
  }
}

export async function listRoles(db: AppDb, query: ListQuery): Promise<{ items: PublicRole[]; total: number }> {
  const conditions = [];
  if (query.search) conditions.push(like(roles.name, `%${query.search}%`));
  if (query.status !== 'all') conditions.push(eq(roles.status, query.status));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(roles)
    .where(where);
  const total = Number(totalRows[0]?.count ?? 0);

  const offset = (query.page - 1) * query.pageSize;
  const rows = await db.select().from(roles).where(where).limit(query.pageSize).offset(offset);

  const items: PublicRole[] = [];
  for (const row of rows) {
    items.push(toPublicRole(row, await permissionNamesFor(db, row.id)));
  }
  return { items, total };
}

export async function getRole(db: AppDb, id: string): Promise<PublicRole> {
  const rows = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('Role not found');
  return toPublicRole(row, await permissionNamesFor(db, row.id));
}

export async function createRole(
  db: AppDb,
  input: { name: string; description?: string; permissions?: string[]; status?: 'active' | 'inactive' },
  actor: Actor,
): Promise<PublicRole> {
  // BE-003: attaching permissions is a grant. It needs `permission.assign`
  // (not just `role.create`) and only permissions the actor holds.
  const requested = [...new Set(input.permissions ?? [])];
  if (requested.length > 0) {
    if (!isSuperAdmin(actor) && !actor.permissions.includes('permission.assign')) {
      throw forbidden(MSG.needPermissionAssign);
    }
    assertCovers(actor, requested, MSG.grantPermission);
  }
  const name = input.name.trim();
  const existing = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, name)).limit(1);
  if (existing.length > 0) {
    throw conflict('Role name already exists', { name: ['Role name already exists'] });
  }
  const permNames = requested;
  await assertPermissionsExist(db, permNames);

  const now = nowIso();
  const id = newId('role');
  // BE-018: the role and its permissions are ONE transaction.
  const permIds = permNames.length > 0 ? await permissionIdsFor(db, permNames) : [];
  await runAtomic(db, [
    db.insert(roles).values({
      id,
      name,
      description: input.description?.trim() ?? '',
      status: input.status ?? 'active',
      createdAt: now,
      updatedAt: now,
    }),
    ...permissionLinkInserts(db, id, permIds),
  ]);
  return toPublicRole(
    (await db.select().from(roles).where(eq(roles.id, id)).limit(1))[0],
    permNames,
  );
}

export async function updateRole(
  db: AppDb,
  id: string,
  input: { name?: string; description?: string; status?: 'active' | 'inactive' },
  actor: Actor,
): Promise<PublicRole> {
  const rows = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('Role not found');

  if (id === SUPER_ADMIN_ROLE_ID && input.status === 'inactive') throw forbidden(MSG.superAdminRoleStatus);
  // BE-002/BE-003: a role that outranks the actor cannot be edited by them
  // (renaming or deactivating it changes what its holders can do).
  const currentPermissions = await permissionNamesFor(db, id);
  assertCovers(actor, currentPermissions, MSG.roleOutranks);

  if (input.name !== undefined) {
    const name = input.name.trim();
    const clash = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, name)).limit(1);
    if (clash.length > 0 && clash[0].id !== id) {
      throw conflict('Role name already exists', { name: ['Role name already exists'] });
    }
  }

  const patch: Partial<{ name: string; description: string; status: string; updatedAt: string }> = {
    updatedAt: nowIso(),
  };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.description !== undefined) patch.description = input.description.trim();
  if (input.status !== undefined) patch.status = input.status;

  await db.update(roles).set(patch).where(eq(roles.id, id));
  const updated = (await db.select().from(roles).where(eq(roles.id, id)).limit(1))[0];
  return toPublicRole(updated, currentPermissions);
}

export async function setRolePermissions(db: AppDb, id: string, permNames: string[], actor: Actor): Promise<PublicRole> {
  const rows = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('Role not found');
  const unique = [...new Set(permNames)];
  await assertPermissionsExist(db, unique);

  // BE-003: grant only what you hold, and only on roles you do not rank below.
  assertCovers(actor, unique, MSG.grantPermission);
  if (!isSuperAdmin(actor)) assertCovers(actor, await permissionNamesFor(db, id), MSG.roleOutranks);
  if (id === SUPER_ADMIN_ROLE_ID && !SUPER_ADMIN_CORE_PERMISSIONS.every((p) => unique.includes(p))) {
    throw forbidden(MSG.superAdminRoleCore);
  }

  // BE-018: replace the permission set atomically (a failure keeps the previous set).
  const permIds = unique.length > 0 ? await permissionIdsFor(db, unique) : [];
  await runAtomic(db, [
    db.delete(rolePermissions).where(eq(rolePermissions.roleId, id)),
    ...permissionLinkInserts(db, id, permIds),
    db.update(roles).set({ updatedAt: nowIso() }).where(eq(roles.id, id)),
  ]);
  const updated = (await db.select().from(roles).where(eq(roles.id, id)).limit(1))[0];
  return toPublicRole(updated, unique);
}

export async function deleteRole(db: AppDb, id: string, actor: Actor): Promise<void> {
  const rows = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  if (rows.length === 0) throw notFound('Role not found');
  if (!isSuperAdmin(actor)) assertCovers(actor, await permissionNamesFor(db, id), MSG.roleOutranks);
  const assigned = await db.select({ userId: userRoles.userId }).from(userRoles).where(eq(userRoles.roleId, id)).limit(1);
  if (assigned.length > 0) {
    throw conflict('Role is still assigned to users', { role: ['Reassign users before deleting this role'] });
  }
  if (id === SUPER_ADMIN_ROLE_ID) throw forbidden(MSG.superAdminRoleDelete);
  await runAtomic(db, [db.delete(rolePermissions).where(eq(rolePermissions.roleId, id)), db.delete(roles).where(eq(roles.id, id))]);
}
