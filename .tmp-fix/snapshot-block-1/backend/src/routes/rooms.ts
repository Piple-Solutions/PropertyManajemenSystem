import { Hono } from 'hono';
import type { AppEnv } from '../env';
import type { AppDb } from '../db/client';
import { ok, paginated } from '../lib/errors';
import { auditActor, auditIp } from '../lib/audit';
import {
  createRoomSchema,
  parseOr422,
  pathParam,
  roomListQuerySchema,
  setRoomStatusSchema,
  updateRoomSchema,
} from '../lib/validation';
import { authenticate, getAuth, type AuthContext } from '../middleware/auth';
import { requirePermissions } from '../middleware/rbac';
import { recordActivity } from '../services/activityService';
import { createRoom, deleteRoom, getRoom, listRooms, setRoomStatus, updateRoom } from '../services/roomService';

type Vars = { db: AppDb; auth: AuthContext };

const rooms = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

rooms.use('*', authenticate);

rooms.get('/', requirePermissions('room.view'), async (c) => {
  const query = parseOr422(roomListQuerySchema, {
    search: c.req.query('search'),
    status: c.req.query('status'),
    roomTypeId: c.req.query('roomTypeId'),
    page: c.req.query('page'),
    pageSize: c.req.query('pageSize'),
  });
  const { items, total } = await listRooms(c.get('db'), query);
  return paginated(c, items, { page: query.page, pageSize: query.pageSize, total });
});

rooms.get('/:id', requirePermissions('room.view'), async (c) => {
  return ok(c, await getRoom(c.get('db'), pathParam(c, 'id')));
});

rooms.post('/', requirePermissions('room.create'), async (c) => {
  const body = parseOr422(createRoomSchema, await c.req.json().catch(() => ({})));
  const created = await createRoom(c.get('db'), body);
  const actor = auditActor(getAuth(c));
  await recordActivity(c.get('db'), {
    category: 'system',
    action: 'create',
    description: `Created room ${created.roomNumber}`,
    userId: actor.id,
    userName: actor.name,
    entityType: 'room',
    entityId: created.id,
    metadata: { roomNumber: created.roomNumber, roomTypeId: created.roomTypeId, status: created.status },
    ipAddress: auditIp(c),
  });
  return c.json({ data: created }, 201);
});

rooms.patch('/:id', requirePermissions('room.update'), async (c) => {
  const body = parseOr422(updateRoomSchema, await c.req.json().catch(() => ({})));
  const updated = await updateRoom(c.get('db'), pathParam(c, 'id'), body);
  const actor = auditActor(getAuth(c));
  await recordActivity(c.get('db'), {
    category: 'system',
    action: 'update',
    description: `Updated room ${updated.roomNumber}`,
    userId: actor.id,
    userName: actor.name,
    entityType: 'room',
    entityId: updated.id,
    metadata: { roomNumber: updated.roomNumber, roomTypeId: updated.roomTypeId, status: updated.status },
    ipAddress: auditIp(c),
  });
  return ok(c, updated);
});

rooms.patch('/:id/status', requirePermissions('room.update'), async (c) => {
  const body = parseOr422(setRoomStatusSchema, await c.req.json().catch(() => ({})));
  const updated = await setRoomStatus(c.get('db'), pathParam(c, 'id'), body.status);
  const actor = auditActor(getAuth(c));
  await recordActivity(c.get('db'), {
    category: 'system',
    action: 'update',
    description: `Updated room ${updated.roomNumber} status to ${updated.status}`,
    userId: actor.id,
    userName: actor.name,
    entityType: 'room',
    entityId: updated.id,
    metadata: { roomNumber: updated.roomNumber, status: updated.status },
    ipAddress: auditIp(c),
  });
  return ok(c, updated);
});

rooms.delete('/:id', requirePermissions('room.delete'), async (c) => {
  const id = pathParam(c, 'id');
  const existing = await getRoom(c.get('db'), id);
  await deleteRoom(c.get('db'), id);
  const actor = auditActor(getAuth(c));
  await recordActivity(c.get('db'), {
    category: 'system',
    action: 'delete',
    description: `Deleted room ${existing.roomNumber}`,
    userId: actor.id,
    userName: actor.name,
    entityType: 'room',
    entityId: id,
    metadata: { roomNumber: existing.roomNumber },
    ipAddress: auditIp(c),
  });
  return c.body(null, 204);
});

export default rooms;
