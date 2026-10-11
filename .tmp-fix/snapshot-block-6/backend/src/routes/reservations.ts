import { Hono } from 'hono';
import type { AppEnv } from '../env';
import type { AppDb } from '../db/client';
import { badRequest, ok, paginated } from '../lib/errors';
import { auditActor, auditIp } from '../lib/audit';
import {
  availabilityQuerySchema,
  calendarQuerySchema,
  createReservationSchema,
  parseOr422,
  pathParam,
  reservationListQuerySchema,
  updateReservationSchema,
} from '../lib/validation';
import { authenticate, getAuth, type AuthContext } from '../middleware/auth';
import { requirePermissions } from '../middleware/rbac';
import { recordActivity } from '../services/activityService';
import {
  createReservation,
  getBookedRoomIds,
  getCalendar,
  getReservation,
  listReservations,
  transitionReservation,
  updateReservation,
} from '../services/reservationService';

type Vars = { db: AppDb; auth: AuthContext };

const reservations = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

reservations.use('*', authenticate);

reservations.get('/', requirePermissions('reservation.view'), async (c) => {
  const query = parseOr422(reservationListQuerySchema, {
    search: c.req.query('search'),
    status: c.req.query('status'),
    source: c.req.query('source'),
    date: c.req.query('date'),
    page: c.req.query('page'),
    pageSize: c.req.query('pageSize'),
    include: c.req.query('include'),
  });
  const { items, total } = await listReservations(c.get('db'), query);
  return paginated(c, items, { page: query.page, pageSize: query.pageSize, total });
});

reservations.get('/calendar', requirePermissions('reservation.view'), async (c) => {
  const query = parseOr422(calendarQuerySchema, {
    from: c.req.query('from'),
    to: c.req.query('to'),
    roomId: c.req.query('roomId'),
    status: c.req.query('status'),
  });
  if (!(query.to > query.from)) throw badRequest('`to` must be after `from`.');
  return ok(c, await getCalendar(c.get('db'), query));
});

reservations.get('/availability', requirePermissions('reservation.view'), async (c) => {
  const query = parseOr422(availabilityQuerySchema, {
    checkIn: c.req.query('checkIn'),
    checkOut: c.req.query('checkOut'),
    excludeId: c.req.query('excludeId'),
  });
  if (!(query.checkOut > query.checkIn)) {
    throw badRequest('`checkOut` must be after `checkIn`.');
  }
  // Phase 3: rooms inventory exists; booked ids still derive from
  // reservations with the same overlap rule as the wizard. Snapshots are
  // preserved verbatim (no rewrite on room/type changes).
  return ok(c, {
    bookedRoomIds: await getBookedRoomIds(c.get('db'), query.checkIn, query.checkOut, query.excludeId),
  });
});

reservations.get('/:id', requirePermissions('reservation.view'), async (c) => {
  return ok(c, await getReservation(c.get('db'), pathParam(c, 'id')));
});

reservations.post('/', requirePermissions('reservation.create'), async (c) => {
  const body = parseOr422(createReservationSchema, await c.req.json().catch(() => ({})));
  const created = await createReservation(c.get('db'), body);
  const actor = auditActor(getAuth(c));
  await recordActivity(c.get('db'), {
    category: 'reservation',
    action: 'create',
    description: `Created new reservation ${created.reservationCode} for ${created.guestName}`,
    userId: actor.id,
    userName: actor.name,
    entityType: 'reservation',
    entityId: created.id,
    metadata: {
      reservationCode: created.reservationCode,
      guestName: created.guestName,
      totalAmount: String(created.totalAmount),
    },
    ipAddress: auditIp(c),
  });
  return c.json({ data: created }, 201);
});

reservations.patch('/:id', requirePermissions('reservation.update'), async (c) => {
  const body = parseOr422(updateReservationSchema, await c.req.json().catch(() => ({})));
  const updated = await updateReservation(c.get('db'), pathParam(c, 'id'), body);
  const actor = auditActor(getAuth(c));
  await recordActivity(c.get('db'), {
    category: 'reservation',
    action: 'update',
    description: `Updated reservation ${updated.reservationCode} for ${updated.guestName}`,
    userId: actor.id,
    userName: actor.name,
    entityType: 'reservation',
    entityId: updated.id,
    metadata: { reservationCode: updated.reservationCode, guestName: updated.guestName },
    ipAddress: auditIp(c),
  });
  return ok(c, updated);
});

reservations.post('/:id/check-in', requirePermissions('reservation.checkin'), async (c) => {
  const moved = await transitionReservation(c.get('db'), pathParam(c, 'id'), 'check-in');
  const actor = auditActor(getAuth(c));
  await recordActivity(c.get('db'), {
    category: 'reservation',
    action: 'checkin',
    description: `Checked in guest ${moved.guestName} for reservation ${moved.reservationCode}`,
    userId: actor.id,
    userName: actor.name,
    entityType: 'reservation',
    entityId: moved.id,
    metadata: { reservationCode: moved.reservationCode, guestName: moved.guestName },
    ipAddress: auditIp(c),
  });
  return ok(c, moved);
});

reservations.post('/:id/check-out', requirePermissions('reservation.checkout'), async (c) => {
  const moved = await transitionReservation(c.get('db'), pathParam(c, 'id'), 'check-out');
  const actor = auditActor(getAuth(c));
  await recordActivity(c.get('db'), {
    category: 'reservation',
    action: 'checkout',
    description: `Checked out guest ${moved.guestName} for reservation ${moved.reservationCode}`,
    userId: actor.id,
    userName: actor.name,
    entityType: 'reservation',
    entityId: moved.id,
    metadata: { reservationCode: moved.reservationCode, guestName: moved.guestName },
    ipAddress: auditIp(c),
  });
  return ok(c, moved);
});

reservations.post('/:id/cancel', requirePermissions('reservation.delete'), async (c) => {
  const moved = await transitionReservation(c.get('db'), pathParam(c, 'id'), 'cancel');
  const actor = auditActor(getAuth(c));
  await recordActivity(c.get('db'), {
    category: 'reservation',
    action: 'cancel',
    description: `Cancelled reservation ${moved.reservationCode} for ${moved.guestName}`,
    userId: actor.id,
    userName: actor.name,
    entityType: 'reservation',
    entityId: moved.id,
    metadata: { reservationCode: moved.reservationCode, guestName: moved.guestName },
    ipAddress: auditIp(c),
  });
  return ok(c, moved);
});

export default reservations;
