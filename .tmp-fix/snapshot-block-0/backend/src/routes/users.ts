import { Hono } from 'hono';
import type { AppEnv } from '../env';
import type { AppDb } from '../db/client';
import { ok, paginated } from '../lib/errors';
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

users.post('/', requirePermissions('user.create'), async (c) => {
  const body = parseOr422(createUserSchema, await c.req.json().catch(() => ({})));
  const actor = getAuth(c);
  return c.json({ data: await createUser(c.get('db'), body, { id: actor.user.id, permissions: actor.permissions }) }, 201);
});

users.patch('/:id', requirePermissions('user.update'), async (c) => {
  const body = parseOr422(updateUserSchema, await c.req.json().catch(() => ({})));
  const actor = getAuth(c);
  return ok(c, await updateUser(c.get('db'), pathParam(c, 'id'), body, { id: actor.user.id, permissions: actor.permissions }));
});

users.patch('/:id/status', requirePermissions('user.update'), async (c) => {
  const body = parseOr422(setUserStatusSchema, await c.req.json().catch(() => ({})));
  const actor = getAuth(c);
  return ok(c, await setUserStatus(c.get('db'), pathParam(c, 'id'), body.status, actor.user.id));
});

users.put('/:id/roles', requirePermissions('user.update'), async (c) => {
  const body = parseOr422(setUserRolesSchema, await c.req.json().catch(() => ({})));
  const actor = getAuth(c);
  return ok(c, await setUserRoles(c.get('db'), pathParam(c, 'id'), body.roles, { id: actor.user.id, permissions: actor.permissions }));
});

users.delete('/:id', requirePermissions('user.delete'), async (c) => {
  const actor = getAuth(c);
  await deleteUser(c.get('db'), pathParam(c, 'id'), actor.user.id);
  return c.body(null, 204);
});

export default users;
