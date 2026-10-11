import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { roles, userRoles, users } from '../db/schema';
import type { AppDb } from '../db/client';
import { chunkByParams, runAtomic, type AtomicStatement } from '../lib/atomic';
import { conflict, forbidden, notFound } from '../lib/errors';
import { likeContains } from '../lib/sql';
import { hashPassword } from '../lib/password';
import { toPublicUser, type PublicUser } from '../lib/presenters';
import { newId, nowIso } from '../lib/tokens';
import type { ListQuery } from '../lib/validation';
import {
  MSG,
  SUPER_ADMIN_ROLE_ID,
  assertCovers,
  assertNotLastSuperAdmin,
  isSuperAdmin,
  permissionsOfRoles,
  privilegesOfUser,
  type Actor,
} from './authz';

export type { Actor } from './authz';

export interface UserListItem extends PublicUser {}

/** Role links for one user, chunked to D1's bound-parameter cap (2 values per row). */
function roleLinkInserts(db: AppDb, userId: string, roleIds: string[]): AtomicStatement[] {
  return chunkByParams(roleIds.map((roleId) => ({ userId, roleId })), 2, 0).map((chunk) => db.insert(userRoles).values(chunk));
}

async function roleIdsFor(db: AppDb, userId: string): Promise<string[]> {
  const rows = await db.select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, userId));
  return rows.map((r) => r.roleId);
}

async function assertRolesExist(db: AppDb, roleIds: string[]): Promise<void> {
  // BE-027: one query per 90 ids (was one per role); the FIRST missing id in
  // request order is still the one reported.
  const found = new Set<string>();
  for (let i = 0; i < roleIds.length; i += 90) {
    const rows = await db.select({ id: roles.id }).from(roles).where(inArray(roles.id, roleIds.slice(i, i + 90)));
    for (const r of rows) found.add(r.id);
  }
  const missing = roleIds.find((id) => !found.has(id));
  if (missing !== undefined) {
    throw conflict(`Role not found: ${missing}`, { roles: [`Role not found: ${missing}`] });
  }
}

/** Role ids for many users in one query per 90 ids (ordered by role id, like the per-user query). */
async function roleIdsForMany(db: AppDb, userIds: string[]): Promise<Map<string, string[]>> {
  const by = new Map<string, string[]>();
  for (let i = 0; i < userIds.length; i += 90) {
    const rows = await db
      .select({ userId: userRoles.userId, roleId: userRoles.roleId })
      .from(userRoles)
      .where(inArray(userRoles.userId, userIds.slice(i, i + 90)))
      .orderBy(userRoles.userId, userRoles.roleId);
    for (const r of rows) {
      const list = by.get(r.userId) ?? [];
      list.push(r.roleId);
      by.set(r.userId, list);
    }
  }
  return by;
}

/**
 * A caller holding `user.update` may assign ordinary roles (Manager UX), but
 * only roles whose permissions the caller holds (BE-003): granting a role is
 * granting its permissions. A role carrying `permission.assign` additionally
 * requires `permission.assign` (kept for its specific message). Super Admin is
 * exempt. One batched query regardless of the number of roles.
 */
async function assertNoPrivilegeEscalation(db: AppDb, roleIds: string[], actor: Actor): Promise<void> {
  if (isSuperAdmin(actor) || roleIds.length === 0) return;
  const granted = await permissionsOfRoles(db, roleIds);
  if (granted.includes('permission.assign') && !actor.permissions.includes('permission.assign')) {
    throw forbidden('Assigning this role requires the permission.assign permission');
  }
  assertCovers(actor, granted, MSG.grantRole);
}

/**
 * BE-002: an actor may only modify a user they do not rank below (the actor
 * holds every permission the target carries). Acting on yourself is always
 * allowed here; self-lockout is guarded separately. Returns the target's role
 * ids when they were loaded (for the last-admin check), else `undefined`.
 */
async function assertCanManageTarget(db: AppDb, targetId: string, actor: Actor): Promise<string[] | undefined> {
  if (targetId === actor.id || isSuperAdmin(actor)) return undefined;
  const target = await privilegesOfUser(db, targetId);
  assertCovers(actor, target.permissions, MSG.targetOutranks);
  return target.roleIds;
}

export async function listUsers(
  db: AppDb,
  query: ListQuery,
): Promise<{ items: UserListItem[]; total: number }> {
  const conditions = [];
  if (query.search) {
    conditions.push(or(likeContains(users.name, query.search), likeContains(users.email, query.search)));
  }
  if (query.status !== 'all') {
    conditions.push(eq(users.status, query.status));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(where);
  const total = Number(totalRows[0]?.count ?? 0);

  const offset = (query.page - 1) * query.pageSize;
  // BE-035: insertion order (scan or status-equality index), made explicit.
  const rows = await db.select().from(users).where(where).orderBy(sql`rowid`).limit(query.pageSize).offset(offset);

  // BE-027: role ids for the whole page in one query (was one per user).
  const roleIds = await roleIdsForMany(db, rows.map((r) => r.id));
  const items: UserListItem[] = rows.map((row) => toPublicUser(row, roleIds.get(row.id) ?? []));
  return { items, total };
}

export async function getUser(db: AppDb, id: string): Promise<UserListItem> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('User not found');
  return toPublicUser(row, await roleIdsFor(db, row.id));
}

export async function createUser(
  db: AppDb,
  input: { name: string; email: string; password: string; roles: string[]; status?: 'active' | 'inactive' },
  actor: Actor,
): Promise<UserListItem> {
  const normalized = input.email.trim().toLowerCase();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, normalized)).limit(1);
  if (existing.length > 0) {
    throw conflict('Email already registered', { email: ['Email already registered'] });
  }
  const uniqueRoles = [...new Set(input.roles)];
  await assertRolesExist(db, uniqueRoles);
  await assertNoPrivilegeEscalation(db, uniqueRoles, actor);

  const now = nowIso();
  const id = newId('user');
  // BE-018: the user and their role links are ONE transaction (never a role-less account).
  await runAtomic(db, [
    db.insert(users).values({
      id,
      name: input.name.trim(),
      email: normalized,
      passwordHash: hashPassword(input.password),
      status: input.status ?? 'active',
      tokenVersion: 0,
      createdAt: now,
      updatedAt: now,
    }),
    ...roleLinkInserts(db, id, uniqueRoles),
  ]);
  return toPublicUser((await db.select().from(users).where(eq(users.id, id)).limit(1))[0], uniqueRoles);
}

export async function updateUser(
  db: AppDb,
  id: string,
  input: { name?: string; email?: string; roles?: string[]; status?: 'active' | 'inactive' },
  actor?: Actor,
): Promise<UserListItem> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('User not found');

  let targetRoleIds: string[] | undefined;
  if (actor) {
    if (id === actor.id && input.status === 'inactive') {
      throw forbidden('You cannot deactivate your own account');
    }
    targetRoleIds = await assertCanManageTarget(db, id, actor);
  }

  const patch: Partial<{ name: string; email: string; status: string; updatedAt: string }> = {
    updatedAt: nowIso(),
  };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.email !== undefined) {
    const normalized = input.email.trim().toLowerCase();
    const clash = await db.select({ id: users.id }).from(users).where(eq(users.email, normalized)).limit(1);
    if (clash.length > 0 && clash[0].id !== id) {
      throw conflict('Email already registered', { email: ['Email already registered'] });
    }
    patch.email = normalized;
  }
  if (input.status !== undefined) patch.status = input.status;

  let roleIds: string[] | undefined;
  if (input.roles !== undefined) {
    roleIds = [...new Set(input.roles)];
    await assertRolesExist(db, roleIds);
    if (actor) await assertNoPrivilegeEscalation(db, roleIds, actor);
  }

  if (actor) {
    // BE-002: never leave the system without an active Super Admin. Only
    // changes that would remove that standing are checked (extra queries only
    // on those rare paths). The holder may still change their own email.
    const losesStanding =
      input.status === 'inactive' ||
      (roleIds !== undefined && !roleIds.includes(SUPER_ADMIN_ROLE_ID)) ||
      (patch.email !== undefined && patch.email !== row.email && id !== actor.id);
    if (losesStanding) {
      const held = targetRoleIds ?? (await roleIdsFor(db, id));
      await assertNotLastSuperAdmin(db, id, row.status === 'active', held);
    }
  }

  // BE-018: profile + role replacement are ONE transaction.
  if (roleIds !== undefined) {
    await runAtomic(db, [
      db.update(users).set(patch).where(eq(users.id, id)),
      db.delete(userRoles).where(eq(userRoles.userId, id)),
      ...roleLinkInserts(db, id, roleIds),
    ]);
  } else {
    await db.update(users).set(patch).where(eq(users.id, id));
  }
  const updated = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
  return toPublicUser(updated, await roleIdsFor(db, id));
}

export async function setUserStatus(
  db: AppDb,
  id: string,
  status: 'active' | 'inactive',
  actor: Actor,
): Promise<UserListItem> {
  return updateUser(db, id, { status }, actor);
}

export async function setUserRoles(db: AppDb, id: string, roleIds: string[], actor: Actor): Promise<UserListItem> {
  const unique = [...new Set(roleIds)];
  await assertRolesExist(db, unique);
  await assertNoPrivilegeEscalation(db, unique, actor);
  const rows = await db.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, id)).limit(1);
  if (rows.length === 0) throw notFound('User not found');
  const targetRoleIds = await assertCanManageTarget(db, id, actor);
  if (!unique.includes(SUPER_ADMIN_ROLE_ID)) {
    await assertNotLastSuperAdmin(db, id, rows[0].status === 'active', targetRoleIds ?? (await roleIdsFor(db, id)));
  }
  // BE-018: replace the role set atomically (a failure keeps the previous roles).
  await runAtomic(db, [db.delete(userRoles).where(eq(userRoles.userId, id)), ...roleLinkInserts(db, id, unique)]);
  const updated = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
  return toPublicUser(updated, unique);
}

export async function deleteUser(db: AppDb, id: string, actor: Actor): Promise<void> {
  if (id === actor.id) throw forbidden('You cannot delete your own account');
  const rows = await db.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, id)).limit(1);
  if (rows.length === 0) throw notFound('User not found');
  const targetRoleIds = await assertCanManageTarget(db, id, actor);
  await assertNotLastSuperAdmin(db, id, rows[0].status === 'active', targetRoleIds ?? (await roleIdsFor(db, id)));
  await runAtomic(db, [db.delete(userRoles).where(eq(userRoles.userId, id)), db.delete(users).where(eq(users.id, id))]);
}
