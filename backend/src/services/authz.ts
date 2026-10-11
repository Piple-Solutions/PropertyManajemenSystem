import { and, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';
import { permissions, rolePermissions, userRoles, users } from '../db/schema';
import type { AppDb } from '../db/client';
import { forbidden } from '../lib/errors';

/**
 * Authorization hierarchy (Block 2: BE-002, BE-003, BE-007).
 *
 * The model is a permission-superset hierarchy, not a role ranking:
 * - an actor may modify a user or role only if the actor holds every
 *   permission the target carries;
 * - an actor may grant (assign a role / attach permissions) only what the
 *   actor holds;
 * - the Super Admin role is the root of trust: its holders are exempt from the
 *   subset rules, the role never stops granting permissions, and the last
 *   active holder cannot be removed.
 *
 * Checks run only on user/role mutations (never on read or hot paths) and use
 * bounded, batched queries.
 */
export const SUPER_ADMIN_ROLE_ID = 'role-001';

/** Permissions the Super Admin role must always keep (self-lockout guard). */
export const SUPER_ADMIN_CORE_PERMISSIONS = [
  'user.view',
  'user.create',
  'user.update',
  'user.delete',
  'role.view',
  'role.create',
  'role.update',
  'role.delete',
  'permission.view',
  'permission.assign',
];

export const MSG = {
  targetOutranks: 'Anda tidak dapat mengubah pengguna dengan hak akses lebih tinggi dari Anda.',
  roleOutranks: 'Anda tidak dapat mengubah role dengan izin yang tidak Anda miliki.',
  grantRole: 'Anda tidak dapat memberikan role dengan izin yang tidak Anda miliki.',
  grantPermission: 'Anda tidak dapat memberikan izin yang tidak Anda miliki.',
  needPermissionAssign: 'Menetapkan izin pada role memerlukan izin permission.assign.',
  lastSuperAdmin: 'Super Admin aktif terakhir tidak dapat dihapus, dinonaktifkan, diturunkan, atau diubah emailnya oleh pengguna lain.',
  superAdminRoleStatus: 'Role Super Admin tidak dapat dinonaktifkan.',
  superAdminRoleDelete: 'Role Super Admin tidak dapat dihapus.',
  superAdminRoleCore: 'Role Super Admin harus tetap memiliki izin administrasi pengguna, role, dan izin.',
} as const;

export interface Actor {
  id: string;
  permissions: string[];
  /** Role ids of the actor (from the authenticated context). */
  roleIds?: string[];
}

export function isSuperAdmin(actor: Actor): boolean {
  return actor.roleIds?.includes(SUPER_ADMIN_ROLE_ID) ?? false;
}

/** D1 allows 100 bound parameters per statement; stay well below. */
const CHUNK = 90;

/** Union of permission names carried by the given roles (any role status). */
export async function permissionsOfRoles(db: AppDb, roleIds: string[]): Promise<string[]> {
  const unique = [...new Set(roleIds)];
  const names = new Set<string>();
  for (let i = 0; i < unique.length; i += CHUNK) {
    const rows = await db
      .select({ name: permissions.name })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(inArray(rolePermissions.roleId, unique.slice(i, i + CHUNK)));
    for (const r of rows) names.add(r.name);
  }
  return [...names];
}

/** Role ids + union of permission names of a user (any role status: conservative). */
export async function privilegesOfUser(db: AppDb, userId: string): Promise<{ roleIds: string[]; permissions: string[] }> {
  const rows = await db
    .select({ roleId: userRoles.roleId, name: permissions.name })
    .from(userRoles)
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .leftJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(userRoles.userId, userId));
  const roleIds = new Set<string>();
  const names = new Set<string>();
  for (const r of rows) {
    roleIds.add(r.roleId);
    if (r.name) names.add(r.name);
  }
  return { roleIds: [...roleIds], permissions: [...names] };
}

function covers(actor: Actor, required: string[]): boolean {
  if (isSuperAdmin(actor)) return true;
  const held = new Set(actor.permissions);
  return required.every((p) => held.has(p));
}

/** 403 unless the actor holds every permission in `required` (Super Admin exempt). */
export function assertCovers(actor: Actor, required: string[], message: string): void {
  if (!covers(actor, required)) throw forbidden(message);
}

/**
 * 403 when `userId` is an ACTIVE Super Admin and no other active Super Admin
 * exists. Call before any change that would remove that standing (delete,
 * deactivate, drop the role, or a foreign email change).
 */
export async function assertNotLastSuperAdmin(db: AppDb, userId: string, targetIsActive: boolean, targetRoleIds: string[]): Promise<void> {
  if (!targetIsActive || !targetRoleIds.includes(SUPER_ADMIN_ROLE_ID)) return;
  const others = await db
    .select({ count: sql<number>`count(*)` })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.roleId, SUPER_ADMIN_ROLE_ID), eq(users.status, 'active'), ne(users.id, userId)));
  if (Number(others[0]?.count ?? 0) === 0) throw forbidden(MSG.lastSuperAdmin);
}

/**
 * BE-002 (concurrency): `assertNotLastSuperAdmin` is a read followed by a
 * write, so two Super Admins removing each other at the same moment could
 * both pass it. This statement goes LAST in the same batch as the write: when
 * no active Super Admin would remain it violates NOT NULL on
 * `user_roles.user_id`, which rolls the whole batch back.
 */
export function lastSuperAdminGuard(): SQL {
  return sql`INSERT INTO user_roles (user_id, role_id) SELECT NULL, ${SUPER_ADMIN_ROLE_ID} WHERE NOT EXISTS (SELECT 1 FROM user_roles ur INNER JOIN users u ON u.id = ur.user_id WHERE ur.role_id = ${SUPER_ADMIN_ROLE_ID} AND u.status = 'active')`;
}

/** Runs `write`, mapping a tripped `lastSuperAdminGuard` to the usual 403. */
export async function guardLastSuperAdmin<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    let e: unknown = err;
    for (let depth = 0; depth < 4 && e; depth += 1) {
      const message = String((e as { message?: unknown }).message ?? e);
      if (message.includes('NOT NULL constraint failed') && message.includes('user_roles.user_id')) throw forbidden(MSG.lastSuperAdmin);
      e = (e as { cause?: unknown }).cause;
    }
    throw err;
  }
}
