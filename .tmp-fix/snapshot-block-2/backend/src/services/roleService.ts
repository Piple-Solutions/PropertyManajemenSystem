import { and, eq, like, sql } from 'drizzle-orm';
import { permissions, rolePermissions, roles, userRoles } from '../db/schema';
import type { AppDb } from '../db/client';
import { conflict, notFound } from '../lib/errors';
import { toPublicRole, type PublicRole } from '../lib/presenters';
import { newId, nowIso } from '../lib/tokens';
import type { ListQuery } from '../lib/validation';

async function permissionNamesFor(db: AppDb, roleId: string): Promise<string[]> {
  const rows = await db
    .select({ name: permissions.name })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, roleId));
  return rows.map((r) => r.name);
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
): Promise<PublicRole> {
  const name = input.name.trim();
  const existing = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, name)).limit(1);
  if (existing.length > 0) {
    throw conflict('Role name already exists', { name: ['Role name already exists'] });
  }
  const permNames = [...new Set(input.permissions ?? [])];
  await assertPermissionsExist(db, permNames);

  const now = nowIso();
  const id = newId('role');
  await db.insert(roles).values({
    id,
    name,
    description: input.description?.trim() ?? '',
    status: input.status ?? 'active',
    createdAt: now,
    updatedAt: now,
  });
  for (const permName of permNames) {
    const perm = (await db.select({ id: permissions.id }).from(permissions).where(eq(permissions.name, permName)).limit(1))[0];
    await db.insert(rolePermissions).values({ roleId: id, permissionId: perm.id });
  }
  return toPublicRole(
    (await db.select().from(roles).where(eq(roles.id, id)).limit(1))[0],
    permNames,
  );
}

export async function updateRole(
  db: AppDb,
  id: string,
  input: { name?: string; description?: string; status?: 'active' | 'inactive' },
): Promise<PublicRole> {
  const rows = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('Role not found');

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
  return toPublicRole(updated, await permissionNamesFor(db, id));
}

export async function setRolePermissions(db: AppDb, id: string, permNames: string[]): Promise<PublicRole> {
  const rows = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('Role not found');
  const unique = [...new Set(permNames)];
  await assertPermissionsExist(db, unique);

  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
  for (const permName of unique) {
    const perm = (await db.select({ id: permissions.id }).from(permissions).where(eq(permissions.name, permName)).limit(1))[0];
    await db.insert(rolePermissions).values({ roleId: id, permissionId: perm.id });
  }
  await db.update(roles).set({ updatedAt: nowIso() }).where(eq(roles.id, id));
  const updated = (await db.select().from(roles).where(eq(roles.id, id)).limit(1))[0];
  return toPublicRole(updated, unique);
}

export async function deleteRole(db: AppDb, id: string): Promise<void> {
  const rows = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  if (rows.length === 0) throw notFound('Role not found');
  const assigned = await db.select({ userId: userRoles.userId }).from(userRoles).where(eq(userRoles.roleId, id)).limit(1);
  if (assigned.length > 0) {
    throw conflict('Role is still assigned to users', { role: ['Reassign users before deleting this role'] });
  }
  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
  await db.delete(roles).where(eq(roles.id, id));
}
