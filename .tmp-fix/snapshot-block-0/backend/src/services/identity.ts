import { eq } from 'drizzle-orm';
import { permissions, rolePermissions, roles, userRoles, users } from '../db/schema';
import type { AppDb } from '../db/client';
import { toPublicUser, unionPermissions, type PublicRole } from '../lib/presenters';
import type { AuthContext } from '../middleware/auth';

/**
 * Load the full auth context (user + roles + union permissions) for a user id.
 * Returns `null` when the user does not exist. Callers decide whether an
 * `inactive` status is acceptable (login/me: no; token checks: no).
 */
export async function loadAuthContext(db: AppDb, userId: string): Promise<AuthContext | null> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const row = rows[0] as typeof rows[number] | undefined;
  if (!row) return null;

  const roleRows = await db
    .select({ role: roles })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, row.id));

  const publicRoles: PublicRole[] = [];
  for (const { role } of roleRows) {
    const permRows = await db
      .select({ name: permissions.name })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, role.id));
    publicRoles.push({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: permRows.map((p) => p.name),
      status: role.status as 'active' | 'inactive',
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    });
  }

  return {
    user: toPublicUser(
      row,
      publicRoles.map((r) => r.id),
    ),
    roles: publicRoles,
    permissions: unionPermissions(publicRoles),
  };
}
