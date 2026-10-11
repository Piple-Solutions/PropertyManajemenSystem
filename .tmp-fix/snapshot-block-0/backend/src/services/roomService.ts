import { and, eq, like, sql } from 'drizzle-orm';
import { reservationRooms, rooms, roomTypes } from '../db/schema';
import type { AppDb } from '../db/client';
import { conflict, notFound } from '../lib/errors';
import { toPublicRoom, type PublicRoom } from '../lib/presenters';
import { newId, nowIso } from '../lib/tokens';
import type { RoomListQuery } from '../lib/validation';

export interface CreateRoomInput {
  roomNumber: string;
  roomTypeId: string;
  status?: 'active' | 'inactive' | 'maintenance';
}

export interface UpdateRoomInput {
  roomNumber?: string;
  roomTypeId?: string;
  status?: 'active' | 'inactive' | 'maintenance';
}

async function assertRoomTypeExists(db: AppDb, roomTypeId: string): Promise<void> {
  const rows = await db.select({ id: roomTypes.id }).from(roomTypes).where(eq(roomTypes.id, roomTypeId)).limit(1);
  if (rows.length === 0) {
    throw conflict(`Room type not found: ${roomTypeId}`, { roomTypeId: [`Room type not found: ${roomTypeId}`] });
  }
}

export async function listRooms(db: AppDb, query: RoomListQuery): Promise<{ items: PublicRoom[]; total: number }> {
  const conditions = [];
  if (query.search) {
    conditions.push(like(rooms.roomNumber, `%${query.search}%`));
  }
  if (query.status !== 'all') conditions.push(eq(rooms.status, query.status));
  if (query.roomTypeId !== 'all') conditions.push(eq(rooms.roomTypeId, query.roomTypeId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(rooms)
    .where(where);
  const total = Number(totalRows[0]?.count ?? 0);

  const offset = (query.page - 1) * query.pageSize;
  const rows = await db.select().from(rooms).where(where).limit(query.pageSize).offset(offset);

  return { items: rows.map(toPublicRoom), total };
}

export async function getRoom(db: AppDb, id: string): Promise<PublicRoom> {
  const rows = await db.select().from(rooms).where(eq(rooms.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('Room not found');
  return toPublicRoom(row);
}

export async function createRoom(db: AppDb, input: CreateRoomInput): Promise<PublicRoom> {
  const roomNumber = input.roomNumber.trim();
  const clash = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.roomNumber, roomNumber)).limit(1);
  if (clash.length > 0) {
    throw conflict('Room number already exists', { roomNumber: ['Room number already exists'] });
  }
  await assertRoomTypeExists(db, input.roomTypeId.trim());

  const now = nowIso();
  const id = newId('room');
  await db.insert(rooms).values({
    id,
    roomNumber,
    roomTypeId: input.roomTypeId.trim(),
    status: input.status ?? 'active',
    createdAt: now,
    updatedAt: now,
  });
  return getRoom(db, id);
}

export async function updateRoom(db: AppDb, id: string, input: UpdateRoomInput): Promise<PublicRoom> {
  const rows = await db.select().from(rooms).where(eq(rooms.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('Room not found');

  if (input.roomNumber !== undefined) {
    const roomNumber = input.roomNumber.trim();
    const clash = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.roomNumber, roomNumber)).limit(1);
    if (clash.length > 0 && clash[0].id !== id) {
      throw conflict('Room number already exists', { roomNumber: ['Room number already exists'] });
    }
  }
  if (input.roomTypeId !== undefined) {
    await assertRoomTypeExists(db, input.roomTypeId.trim());
  }

  const patch: Partial<{ roomNumber: string; roomTypeId: string; status: string; updatedAt: string }> = {
    updatedAt: nowIso(),
  };
  if (input.roomNumber !== undefined) patch.roomNumber = input.roomNumber.trim();
  if (input.roomTypeId !== undefined) patch.roomTypeId = input.roomTypeId.trim();
  if (input.status !== undefined) patch.status = input.status;

  await db.update(rooms).set(patch).where(eq(rooms.id, id));
  return getRoom(db, id);
}

export async function setRoomStatus(
  db: AppDb,
  id: string,
  status: 'active' | 'inactive' | 'maintenance',
): Promise<PublicRoom> {
  return updateRoom(db, id, { status });
}

export async function deleteRoom(db: AppDb, id: string): Promise<void> {
  const rows = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, id)).limit(1);
  if (rows.length === 0) throw notFound('Room not found');
  // Historical snapshots in reservation_rooms are preserved (no FK), but
  // deleting a room still referenced by any reservation is blocked so history
  // cannot dangle without an explicit decision.
  const used = await db
    .select({ id: reservationRooms.id })
    .from(reservationRooms)
    .where(eq(reservationRooms.roomId, id))
    .limit(1);
  if (used.length > 0) {
    throw conflict('Room is still referenced by reservations', {
      room: ['This room has reservation history and cannot be deleted'],
    });
  }
  await db.delete(rooms).where(eq(rooms.id, id));
}
