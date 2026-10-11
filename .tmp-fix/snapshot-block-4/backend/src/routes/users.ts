import { Hono } from 'hono';
import type { AppEnv } from '../env';
import type { AppDb } from '../db/client';
import { ok, paginated } from '../lib/errors';
import { auditActor, auditIp, withPrefix } from '../lib/audit';
import {
  createUserSchema,
  listQuerySchema,
  parseOr422,
  pathParam,
  setUserRolesSchema,
  setUserStatusSchema,
  updateUserSchema,
} from '../lib/validation';
import { authenticate, getAuth, type AuthContext } from '../middleware/auth';
import { requirePermissions } from '../middleware/rbac';
import { writeAudit } from '../services/activityService';
import type { Actor } from '../services/authz';
import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  setUserRoles,
  setUserStatus,
  updateUser,
} from '../services/userService';

type Vars = { db: AppDb; auth: AuthContext };

/** Actor snapshot for the service-level hierarchy checks (Block 2). */
const actorOf = (a: AuthContext): Actor => ({ id: a.user.id, permissions: a.permissions, roleIds: a.user.roles });

const users = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

users.use('*', authenticate);

users.get('/', requirePermissions('user.view'), async (c) => {
  const query = parseOr422(listQuerySchema, {
    search: c.req.query('search'),
    status: c.req.query('status'),
    page: c.req.query('page'),
    pageSize: c.req.query('pageSize'),
  });
  const { items, total } = await listUsers(c.get('db'), query);
  return paginated(c, items, { page: query.page, pageSize: query.pageSize, total });
});

users.get('/:id', requirePermissions('user.view'), async (c) => {
  return ok(c, await getUser(c.get('db'), pathParam(c, 'id')));
});

const rolesCsv = (roles: string[]) => [...roles].sort().join(',');
type Image = Record<string, string>;
const userImage = (u: { name: string; email: string; status: string; roles: string[] }): Image => ({
  name: u.name,
  email: u.email,
  status: u.status,
  roles: rolesCsv(u.roles),
});

/**
 * Block 3 (BE-023): audit hooks for user administration. Awaited (security
 * sensitive) and written only AFTER the mutation succeeded, so rejected
 * requests leave no row. Before-image = `getUser` (2 statements), row = 1.
 */
async function auditUser(
  c: { req: { header: (name: string) => string | undefined }; get: (k: 'db') => AppDb },
  actorCtx: AuthContext,
  action: 'user_create' | 'user_update' | 'user_status' | 'user_roles' | 'user_delete',
  target: { id: string; name: string },
  before: Image | undefined,
  after: Image | undefined,
) {
  const actor = auditActor(actorCtx);
  const verb = { user_create: 'Created', user_update: 'Updated', user_status: 'Changed status of', user_roles: 'Changed roles of', user_delete: 'Deleted' }[action];
  await writeAudit(c.get('db'), {
    category: 'system',
    action,
    description: `${verb} user ${target.name}`,
    userId: actor.id,
    userName: actor.name,
    entityType: 'user',
    entityId: target.id,
    metadata: { ...(before ? withPrefix('before', before) : {}), ...(after ? withPrefix('after', after) : {}) },
    ipAddress: auditIp(c),
  });
}

users.post('/', requirePermissions('user.create'), async (c) => {
  const body = parseOr422(createUserSchema, await c.req.json().catch(() => ({})));
  const actor = getAuth(c);
  const created = await createUser(c.get('db'), body, actorOf(actor));
  await auditUser(c, actor, 'user_create', created, undefined, userImage(created));
  return c.json({ data: created }, 201);
});

users.patch('/:id', requirePermissions('user.update'), async (c) => {
  const body = parseOr422(updateUserSchema, await c.req.json().catch(() => ({})));
  const actor = getAuth(c);
  const id = pathParam(c, 'id');
  const before = await getUser(c.get('db'), id);
  const updated = await updateUser(c.get('db'), id, body, actorOf(actor));
  await auditUser(c, actor, 'user_update', updated, userImage(before), userImage(updated));
  return ok(c, updated);
});

users.patch('/:id/status', requirePermissions('user.update'), async (c) => {
  const body = parseOr422(setUserStatusSchema, await c.req.json().catch(() => ({})));
  const actor = getAuth(c);
  const id = pathParam(c, 'id');
  const before = await getUser(c.get('db'), id);
  const updated = await setUserStatus(c.get('db'), id, body.status, actorOf(actor));
  await auditUser(c, actor, 'user_status', updated, { status: before.status }, { status: updated.status });
  return ok(c, updated);
});

users.put('/:id/roles', requirePermissions('user.update'), async (c) => {
  const body = parseOr422(setUserRolesSchema, await c.req.json().catch(() => ({})));
  const actor = getAuth(c);
  const id = pathParam(c, 'id');
  const before = await getUser(c.get('db'), id);
  const updated = await setUserRoles(c.get('db'), id, body.roles, actorOf(actor));
  await auditUser(c, actor, 'user_roles', updated, { roles: rolesCsv(before.roles) }, { roles: rolesCsv(updated.roles) });
  return ok(c, updated);
});

users.delete('/:id', requirePermissions('user.delete'), async (c) => {
  const actor = getAuth(c);
  const id = pathParam(c, 'id');
  const before = await getUser(c.get('db'), id);
  await deleteUser(c.get('db'), id, actorOf(actor));
  await auditUser(c, actor, 'user_delete', before, userImage(before), undefined);
  return c.body(null, 204);
});

export default users;
