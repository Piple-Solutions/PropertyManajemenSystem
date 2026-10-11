import { Hono } from 'hono';
import type { AppEnv } from '../env';
import type { AppDb } from '../db/client';
import { ok, paginated } from '../lib/errors';
import { auditActor, auditIp } from '../lib/audit';
import {
  createRoomTypeSchema,
  parseOr422,
  pathParam,
  roomTypeListQuerySchema,
  setRoomTypeStatusSchema,
  updateRoomTypeSchema,
} from '../lib/validation';
import { authenticate, getAuth, type AuthContext } from '../middleware/auth';
import { requirePermissions } from '../middleware/rbac';
import { recordActivity } from '../services/activityService';
import {
  createRoomType,
  deleteRoomType,
  getRoomType,
  listRoomTypes,
  setRoomTypeStatus,
  updateRoomType,
} from '../services/roomTypeService';

type Vars = { db: AppDb; auth: AuthContext };

const roomTypes = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

roomTypes.use('*', authenticate);

roomTypes.get('/', requirePermissions('room.view'), async (c) => {
  const query = parseOr422(roomTypeListQuerySchema, {
    search: c.req.query('search'),
    status: c.req.query('status'),
    page: c.req.query('page'),
    pageSize: c.req.query('pageSize'),
  });
  const { items, total } = await listRoomTypes(c.get('db'), query);
  return paginated(c, items, { page: query.page, pageSize: query.pageSize, total });
});

roomTypes.get('/:id', requirePermissions('room.view'), async (c) => {
  return ok(c, await getRoomType(c.get('db'), pathParam(c, 'id')));
});

roomTypes.post('/', requirePermissions('room.create'), async (c) => {
  const body = parseOr422(createRoomTypeSchema, await c.req.json().catch(() => ({})));
  const created = await createRoomType(c.get('db'), body);
  const actor = auditActor(getAuth(c));
  await recordActivity(c.get('db'), {
    category: 'system',
    action: 'create',
    description: `Created room type ${created.name}`,
    userId: actor.id,
    userName: actor.name,
    entityType: 'room-type',
    entityId: created.id,
    metadata: { name: created.name, capacity: String(created.capacity), defaultRate: String(created.defaultRate) },
    ipAddress: auditIp(c),
  });
  return c.json({ data: created }, 201);
});

roomTypes.patch('/:id', requirePermissions('room.update'), async (c) => {
  const body = parseOr422(updateRoomTypeSchema, await c.req.json().catch(() => ({})));
  const updated = await updateRoomType(c.get('db'), pathParam(c, 'id'), body);
  const actor = auditActor(getAuth(c));
  await recordActivity(c.get('db'), {
    category: 'system',
    action: 'update',
    description: `Updated room type ${updated.name}`,
    userId: actor.id,
    userName: actor.name,
    entityType: 'room-type',
    entityId: updated.id,
    metadata: { name: updated.name },
    ipAddress: auditIp(c),
  });
  return ok(c, updated);
});

roomTypes.patch('/:id/status', requirePermissions('room.update'), async (c) => {
  const body = parseOr422(setRoomTypeStatusSchema, await c.req.json().catch(() => ({})));
  const updated = await setRoomTypeStatus(c.get('db'), pathParam(c, 'id'), body.status);
  const actor = auditActor(getAuth(c));
  await recordActivity(c.get('db'), {
    category: 'system',
    action: 'update',
    description: `Updated room type ${updated.name} status to ${updated.status}`,
    userId: actor.id,
    userName: actor.name,
    entityType: 'room-type',
    entityId: updated.id,
    metadata: { name: updated.name, status: updated.status },
    ipAddress: auditIp(c),
  });
  return ok(c, updated);
});

roomTypes.delete('/:id', requirePermissions('room.delete'), async (c) => {
  const id = pathParam(c, 'id');
  const existing = await getRoomType(c.get('db'), id);
  await deleteRoomType(c.get('db'), id);
  const actor = auditActor(getAuth(c));
  await recordActivity(c.get('db'), {
    category: 'system',
    action: 'delete',
    description: `Deleted room type ${existing.name}`,
    userId: actor.id,
    userName: actor.name,
    entityType: 'room-type',
    entityId: id,
    metadata: { name: existing.name },
    ipAddress: auditIp(c),
  });
  return c.body(null, 204);
});

export default roomTypes;
