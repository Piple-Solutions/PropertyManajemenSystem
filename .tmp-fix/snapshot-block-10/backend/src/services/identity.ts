import { eq } from 'drizzle-orm';
import { permissions, rolePermissions, roles, userRoles, users } from '../db/schema';
import type { AppDb } from '../db/client';
import { toPublicUser, unionPermissions, type PublicRole } from '../lib/presenters';
import type { AuthContext } from '../middleware/auth';
import { SUPER_ADMIN_ROLE_ID } from './authz';

type UserRow = typeof users.$inferSelect;

/**
 * Load the full auth context (user + roles + union permissions) for a user id.
 * Returns `null` when the user does not exist. Callers decide whether an
 * `inactive` status is acceptable (login/me: no; token checks: no).
 *
 * BE-027: roles and their permissions come from ONE joined query (was
 * 1 + one query per role), and a caller that already loaded the user row
 * (the `authenticate` middleware) passes it in so it is not read twice. This
 * is the per-request permission memo: the context is built once per request
 * and handed to handlers through `c.get('auth')`.
 *
 * Ordering matches the previous per-role queries: roles by role id,
 * permissions of a role by permission id.
 */
export async function loadAuthContext(db: AppDb, userId: string, preloaded?: UserRow): Promise<AuthContext | null> {
  let row = preloaded;
  if (!row) {
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    row = rows[0] as UserRow | undefined;
  }
  if (!row) return null;

  const joined = await db
    .select({
      roleId: roles.id,
      name: roles.name,
      description: roles.description,
      status: roles.status,
      createdAt: roles.createdAt,
      updatedAt: roles.updatedAt,
      permission: permissions.name,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .leftJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(userRoles.userId, row.id))
    .orderBy(userRoles.roleId, rolePermissions.permissionId);

  const byId = new Map<string, PublicRole>();
  for (const r of joined) {
    let role = byId.get(r.roleId);
    if (!role) {
      role = {
        id: r.roleId,
        name: r.name,
        description: r.description,
        permissions: [],
        status: r.status as 'active' | 'inactive',
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
      byId.set(r.roleId, role);
    }
    if (r.permission) role.permissions.push(r.permission);
  }
  const publicRoles = [...byId.values()];

  return {
    user: toPublicUser(
      row,
      publicRoles.map((r) => r.id),
    ),
    roles: publicRoles,
    // BE-007: an inactive role grants nothing. The Super Admin role is immune
    // so a status flip can never lock the owner out.
    permissions: unionPermissions(publicRoles.filter((r) => r.status === 'active' || r.id === SUPER_ADMIN_ROLE_ID)),
  };
}
