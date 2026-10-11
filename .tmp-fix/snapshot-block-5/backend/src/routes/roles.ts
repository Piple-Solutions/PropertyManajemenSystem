import { Hono } from 'hono';
import type { AppEnv } from '../env';
import type { AppDb } from '../db/client';
import { ok, paginated } from '../lib/errors';
import { auditActor, auditIp, withPrefix } from '../lib/audit';
import {
  createRoleSchema,
  listQuerySchema,
  parseOr422,
  pathParam,
  setRolePermissionsSchema,
  updateRoleSchema,
} from '../lib/validation';
import { authenticate, getAuth, type AuthContext } from '../middleware/auth';
import { writeAudit } from '../services/activityService';
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

type Image = Record<string, string>;
const roleImage = (r: { name: string; description: string; status: string; permissions: string[] }): Image => ({
  name: r.name,
  description: r.description,
  status: r.status,
  permissions: [...r.permissions].sort().join(','),
});

/**
 * Block 3 (BE-023): audit hooks for role administration (awaited, written only
 * after the mutation succeeded). Before-image = `getRole` (2 statements).
 */
async function auditRole(
  c: { req: { header: (name: string) => string | undefined }; get: (k: 'db') => AppDb },
  actorCtx: AuthContext,
  action: 'role_create' | 'role_update' | 'role_permissions' | 'role_delete',
  target: { id: string; name: string },
  before: Image | undefined,
  after: Image | undefined,
  extra: Record<string, string> = {},
) {
  const actor = auditActor(actorCtx);
  const verb = { role_create: 'Created', role_update: 'Updated', role_permissions: 'Changed permissions of', role_delete: 'Deleted' }[action];
  await writeAudit(c.get('db'), {
    category: 'system',
    action,
    description: `${verb} role ${target.name}`,
    userId: actor.id,
    userName: actor.name,
    entityType: 'role',
    entityId: target.id,
    metadata: { ...(before ? withPrefix('before', before) : {}), ...(after ? withPrefix('after', after) : {}), ...extra },
    ipAddress: auditIp(c),
  });
}

roles.post('/', requirePermissions('role.create'), async (c) => {
  const body = parseOr422(createRoleSchema, await c.req.json().catch(() => ({})));
  const actor = getAuth(c);
  const created = await createRole(c.get('db'), body, actorOf(actor));
  await auditRole(c, actor, 'role_create', created, undefined, roleImage(created));
  return c.json({ data: created }, 201);
});

roles.patch('/:id', requirePermissions('role.update'), async (c) => {
  const body = parseOr422(updateRoleSchema, await c.req.json().catch(() => ({})));
  const actor = getAuth(c);
  const id = pathParam(c, 'id');
  const before = await getRole(c.get('db'), id);
  const updated = await updateRole(c.get('db'), id, body, actorOf(actor));
  await auditRole(c, actor, 'role_update', updated, roleImage(before), roleImage(updated));
  return ok(c, updated);
});

roles.put('/:id/permissions', requirePermissions('permission.assign'), async (c) => {
  const body = parseOr422(setRolePermissionsSchema, await c.req.json().catch(() => ({})));
  const actor = getAuth(c);
  const id = pathParam(c, 'id');
  const before = await getRole(c.get('db'), id);
  const updated = await setRolePermissions(c.get('db'), id, body.permissions, actorOf(actor));
  const was = new Set(before.permissions);
  const now = new Set(updated.permissions);
  await auditRole(
    c,
    actor,
    'role_permissions',
    updated,
    { permissions: [...before.permissions].sort().join(',') },
    { permissions: [...updated.permissions].sort().join(',') },
    {
      added: [...now].filter((p) => !was.has(p)).sort().join(','),
      removed: [...was].filter((p) => !now.has(p)).sort().join(','),
    },
  );
  return ok(c, updated);
});

roles.delete('/:id', requirePermissions('role.delete'), async (c) => {
  const actor = getAuth(c);
  const id = pathParam(c, 'id');
  const before = await getRole(c.get('db'), id);
  await deleteRole(c.get('db'), id, actorOf(actor));
  await auditRole(c, actor, 'role_delete', before, roleImage(before), undefined);
  return c.body(null, 204);
});

export default roles;
