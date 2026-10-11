import { and, eq, like, or, sql } from 'drizzle-orm';
import { rooms, roomTypes } from '../db/schema';
import type { AppDb } from '../db/client';
import { conflict, notFound } from '../lib/errors';
import { toPublicRoomType, type PublicRoomType } from '../lib/presenters';
import { newId, nowIso } from '../lib/tokens';
import type { RoomTypeListQuery } from '../lib/validation';

export interface CreateRoomTypeInput {
  name: string;
  description: string;
  capacity: number;
  facilities?: string[];
  defaultRate: number;
  images?: string[];
  status?: 'active' | 'inactive';
}

export interface UpdateRoomTypeInput {
  name?: string;
  description?: string;
  capacity?: number;
  facilities?: string[];
  defaultRate?: number;
  images?: string[];
  status?: 'active' | 'inactive';
}

function cleanStrings(values: string[] | undefined): string[] {
  if (!values) return [];
  return values.map((s) => s.trim()).filter((s) => s.length > 0);
}

export async function listRoomTypes(
  db: AppDb,
  query: RoomTypeListQuery,
): Promise<{ items: PublicRoomType[]; total: number }> {
  const conditions = [];
  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(or(like(roomTypes.name, pattern), like(roomTypes.description, pattern)));
  }
  if (query.status !== 'all') conditions.push(eq(roomTypes.status, query.status));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(roomTypes)
    .where(where);
  const total = Number(totalRows[0]?.count ?? 0);

  const offset = (query.page - 1) * query.pageSize;
  const rows = await db.select().from(roomTypes).where(where).limit(query.pageSize).offset(offset);

  return { items: rows.map(toPublicRoomType), total };
}

export async function getRoomType(db: AppDb, id: string): Promise<PublicRoomType> {
  const rows = await db.select().from(roomTypes).where(eq(roomTypes.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('Room type not found');
  return toPublicRoomType(row);
}

export async function createRoomType(db: AppDb, input: CreateRoomTypeInput): Promise<PublicRoomType> {
  const name = input.name.trim();
  const existing = await db.select({ id: roomTypes.id }).from(roomTypes).where(eq(roomTypes.name, name)).limit(1);
  if (existing.length > 0) {
    throw conflict('Room type name already exists', { name: ['Room type name already exists'] });
  }
  const now = nowIso();
  const id = newId('room-type');
  await db.insert(roomTypes).values({
    id,
    name,
    description: input.description.trim(),
    capacity: Math.trunc(input.capacity),
    facilities: JSON.stringify(cleanStrings(input.facilities)),
    defaultRate: Math.round(input.defaultRate),
    images: JSON.stringify((input.images ?? []).map((s) => s.trim()).filter((s) => s.length > 0)),
    status: input.status ?? 'active',
    createdAt: now,
    updatedAt: now,
  });
  return getRoomType(db, id);
}

export async function updateRoomType(db: AppDb, id: string, input: UpdateRoomTypeInput): Promise<PublicRoomType> {
  const rows = await db.select().from(roomTypes).where(eq(roomTypes.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('Room type not found');

  if (input.name !== undefined) {
    const name = input.name.trim();
    const clash = await db.select({ id: roomTypes.id }).from(roomTypes).where(eq(roomTypes.name, name)).limit(1);
    if (clash.length > 0 && clash[0].id !== id) {
      throw conflict('Room type name already exists', { name: ['Room type name already exists'] });
    }
  }

  const patch: Partial<{
    name: string;
    description: string;
    capacity: number;
    facilities: string;
    defaultRate: number;
    images: string;
    status: string;
    updatedAt: string;
  }> = { updatedAt: nowIso() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.description !== undefined) patch.description = input.description.trim();
  if (input.capacity !== undefined) patch.capacity = Math.trunc(input.capacity);
  if (input.facilities !== undefined) patch.facilities = JSON.stringify(cleanStrings(input.facilities));
  if (input.defaultRate !== undefined) patch.defaultRate = Math.round(input.defaultRate);
  if (input.images !== undefined) {
    patch.images = JSON.stringify(input.images.map((s) => s.trim()).filter((s) => s.length > 0));
  }
  if (input.status !== undefined) patch.status = input.status;

  await db.update(roomTypes).set(patch).where(eq(roomTypes.id, id));
  return getRoomType(db, id);
}

export async function setRoomTypeStatus(
  db: AppDb,
  id: string,
  status: 'active' | 'inactive',
): Promise<PublicRoomType> {
  return updateRoomType(db, id, { status });
}

export async function deleteRoomType(db: AppDb, id: string): Promise<void> {
  const rows = await db.select({ id: roomTypes.id }).from(roomTypes).where(eq(roomTypes.id, id)).limit(1);
  if (rows.length === 0) throw notFound('Room type not found');
  const used = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.roomTypeId, id)).limit(1);
  if (used.length > 0) {
    throw conflict('Room type is still used by rooms', { roomType: ['Reassign rooms before deleting this type'] });
  }
  await db.delete(roomTypes).where(eq(roomTypes.id, id));
}
