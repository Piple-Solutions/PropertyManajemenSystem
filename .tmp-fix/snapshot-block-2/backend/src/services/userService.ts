import { and, eq, like, or, sql } from 'drizzle-orm';
import { permissions, rolePermissions, roles, userRoles, users } from '../db/schema';
import type { AppDb } from '../db/client';
import { conflict, forbidden, notFound } from '../lib/errors';
import { hashPassword } from '../lib/password';
import { toPublicUser, type PublicUser } from '../lib/presenters';
import { newId, nowIso } from '../lib/tokens';
import type { ListQuery } from '../lib/validation';

export interface UserListItem extends PublicUser {}

async function roleIdsFor(db: AppDb, userId: string): Promise<string[]> {
  const rows = await db.select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, userId));
  return rows.map((r) => r.roleId);
}

async function assertRolesExist(db: AppDb, roleIds: string[]): Promise<void> {
  for (const roleId of roleIds) {
    const rows = await db.select({ id: roles.id }).from(roles).where(eq(roles.id, roleId)).limit(1);
    if (rows.length === 0) {
      throw conflict(`Role not found: ${roleId}`, { roles: [`Role not found: ${roleId}`] });
    }
  }
}

export interface Actor {
  id: string;
  permissions: string[];
}

/**
 * A caller holding `user.update` may assign ordinary roles (Manager UX), but
 * granting a role that itself carries `permission.assign` would let anyone
 * bootstrap admin rights. Such assignments require `permission.assign`.
 */
async function assertNoPrivilegeEscalation(db: AppDb, roleIds: string[], actor: Actor): Promise<void> {
  if (actor.permissions.includes('permission.assign')) return;
  for (const roleId of roleIds) {
    const permRows = await db
      .select({ name: permissions.name })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, roleId));
    if (permRows.some((p) => p.name === 'permission.assign')) {
      throw forbidden('Assigning this role requires the permission.assign permission');
    }
  }
}

export async function listUsers(
  db: AppDb,
  query: ListQuery,
): Promise<{ items: UserListItem[]; total: number }> {
  const conditions = [];
  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(or(like(users.name, pattern), like(users.email, pattern)));
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
  const rows = await db.select().from(users).where(where).limit(query.pageSize).offset(offset);

  const items: UserListItem[] = [];
  for (const row of rows) {
    items.push(toPublicUser(row, await roleIdsFor(db, row.id)));
  }
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
  await db.insert(users).values({
    id,
    name: input.name.trim(),
    email: normalized,
    passwordHash: hashPassword(input.password),
    status: input.status ?? 'active',
    tokenVersion: 0,
    createdAt: now,
    updatedAt: now,
  });
  for (const roleId of uniqueRoles) {
    await db.insert(userRoles).values({ userId: id, roleId });
  }
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

  await db.update(users).set(patch).where(eq(users.id, id));
  if (roleIds !== undefined) {
    await db.delete(userRoles).where(eq(userRoles.userId, id));
    for (const roleId of roleIds) {
      await db.insert(userRoles).values({ userId: id, roleId });
    }
  }
  const updated = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
  return toPublicUser(updated, await roleIdsFor(db, id));
}

export async function setUserStatus(
  db: AppDb,
  id: string,
  status: 'active' | 'inactive',
  actorId: string,
): Promise<UserListItem> {
  if (id === actorId && status === 'inactive') {
    throw forbidden('You cannot deactivate your own account');
  }
  return updateUser(db, id, { status });
}

export async function setUserRoles(db: AppDb, id: string, roleIds: string[], actor: Actor): Promise<UserListItem> {
  const unique = [...new Set(roleIds)];
  await assertRolesExist(db, unique);
  await assertNoPrivilegeEscalation(db, unique, actor);
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
  if (rows.length === 0) throw notFound('User not found');
  await db.delete(userRoles).where(eq(userRoles.userId, id));
  for (const roleId of unique) {
    await db.insert(userRoles).values({ userId: id, roleId });
  }
  const updated = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
  return toPublicUser(updated, unique);
}

export async function deleteUser(db: AppDb, id: string, actorId: string): Promise<void> {
  if (id === actorId) throw forbidden('You cannot delete your own account');
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
  if (rows.length === 0) throw notFound('User not found');
  await db.delete(userRoles).where(eq(userRoles.userId, id));
  await db.delete(users).where(eq(users.id, id));
}
