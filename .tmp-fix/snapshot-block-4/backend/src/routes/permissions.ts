import { Hono } from 'hono';
import type { AppEnv } from '../env';
import type { AppDb } from '../db/client';
import { ok } from '../lib/errors';
import { authenticate, type AuthContext } from '../middleware/auth';
import { requirePermissions } from '../middleware/rbac';
import { listPermissions } from '../services/permissionService';

type Vars = { db: AppDb; auth: AuthContext };

const perms = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

perms.use('*', authenticate);

/** Read-only catalog — seeded from `frontend/src/data/mock/permissions.json`. */
perms.get('/', requirePermissions('permission.view'), async (c) => {
  return ok(c, await listPermissions(c.get('db')));
});

export default perms;
