import { permissions } from '../db/schema';
import type { AppDb } from '../db/client';
import { toPublicPermission, type PublicPermission } from '../lib/presenters';

/** Permission catalog is read-only — seeded from `frontend/.../permissions.json`. */
export async function listPermissions(db: AppDb): Promise<PublicPermission[]> {
  const rows = await db.select().from(permissions);
  return rows.map(toPublicPermission);
}
