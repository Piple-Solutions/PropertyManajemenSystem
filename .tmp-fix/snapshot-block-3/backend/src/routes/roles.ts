import { Hono } from 'hono';
import type { AppEnv } from '../env';
import type { AppDb } from '../db/client';
import { ok, paginated } from '../lib/errors';
import {
  createRoleSchema,
  listQuerySchema,
  parseOr422,
  pathParam,
  setRolePermissionsSchema,
  updateRoleSchema,
} from '../lib/validation';
import { authenticate, getAuth, type AuthContext } from '../middleware/auth';
import type { Actor } from '../services/authz';
import { requirePermissions } from '../middleware/rbac';
import {
  createRole,
  deleteRole,
  getRole,
  listRoles,
  setRolePermissions,
  updateRole,
} from '../services/roleService';

type Vars = { db: AppDb; auth: AuthContext };

/** Actor snapshot for the service-level hierarchy checks (Block 2). */
const actorOf = (a: AuthContext): Actor => ({ id: a.user.id, permissions: a.permissions, roleIds: a.user.roles });

const roles = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

roles.use('*', authenticate);

roles.get('/', requirePermissions('role.view'), async (c) => {
  const query = parseOr422(listQuerySchema, {
    search: c.req.query('search'),
    status: c.req.query('status'),
    page: c.req.query('page'),
    pageSize: c.req.query('pageSize'),
  });
  const { items, total } = await listRoles(c.get('db'), query);
  return paginated(c, items, { page: query.page, pageSize: query.pageSize, total });
});

roles.get('/:id', requirePermissions('role.view'), async (c) => {
  return ok(c, await getRole(c.get('db'), pathParam(c, 'id')));
});

roles.post('/', requirePermissions('role.create'), async (c) => {
  const body = parseOr422(createRoleSchema, await c.req.json().catch(() => ({})));
  return c.json({ data: await createRole(c.get('db'), body, actorOf(getAuth(c))) }, 201);
});

roles.patch('/:id', requirePermissions('role.update'), async (c) => {
  const body = parseOr422(updateRoleSchema, await c.req.json().catch(() => ({})));
  return ok(c, await updateRole(c.get('db'), pathParam(c, 'id'), body, actorOf(getAuth(c))));
});

roles.put('/:id/permissions', requirePermissions('permission.assign'), async (c) => {
  const body = parseOr422(setRolePermissionsSchema, await c.req.json().catch(() => ({})));
  return ok(c, await setRolePermissions(c.get('db'), pathParam(c, 'id'), body.permissions, actorOf(getAuth(c))));
});

roles.delete('/:id', requirePermissions('role.delete'), async (c) => {
  await deleteRole(c.get('db'), pathParam(c, 'id'), actorOf(getAuth(c)));
  return c.body(null, 204);
});

export default roles;
