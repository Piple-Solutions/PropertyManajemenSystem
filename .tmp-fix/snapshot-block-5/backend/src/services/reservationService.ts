import { and, eq, gt, inArray, like, lt, ne, or, sql } from 'drizzle-orm';
import { reservationNightlyRates, reservationRooms, reservations, roomTypes, rooms } from '../db/schema';
import type { AppDb } from '../db/client';
import { conflict, notFound, unprocessable } from '../lib/errors';
import { toPublicReservation, type PublicReservation } from '../lib/presenters';
import {
  MAX_NIGHTS,
  calculatePricing,
  enumerateNights,
  nextReservationCode,
  nightsBetween,
  splitRoomTotals,
  type PricingTerms,
} from '../lib/pricing';
import { newId, nowIso } from '../lib/tokens';
import type { ReservationListQuery } from '../lib/validation';

export interface RoomInput {
  roomId: string;
  roomNumber: string;
  roomTypeName?: string;
}

export interface PricingInput {
  mode: 'same' | 'different';
  nightlyRates: Array<{ date: string; rate: number }>;
  paymentType: 'no_dp' | 'dp';
  dpType: 'percentage' | 'fixed';
  dpPercentage?: number;
  dpFixedAmount?: number;
}

export interface CreateReservationInput {
  guestName: string;
  source: 'direct' | 'phone' | 'whatsapp' | 'website' | 'ota' | 'other';
  checkInDate: string;
  checkOutDate: string;
  notes?: string;
  rooms: RoomInput[];
  pricing: PricingInput;
}

export interface UpdateReservationInput {
  guestName?: string;
  source?: CreateReservationInput['source'];
  checkInDate?: string;
  checkOutDate?: string;
  notes?: string;
  rooms?: RoomInput[];
  pricing?: PricingInput;
}

function termsOf(p: PricingInput): PricingTerms {
  return {
    paymentType: p.paymentType,
    dpType: p.dpType,
    dpPercentage: p.dpPercentage,
    dpFixedAmount: p.dpFixedAmount,
  };
}

/**
 * Nightly dates must exactly cover the stay `[checkIn, checkOut)`.
 * Prevents totals diverging from the booked range.
 */
function assertNightlyCoverRange(nightly: Array<{ date: string }>, checkIn: string, checkOut: string): void {
  const expected = enumerateNights(checkIn, checkOut);
  const got = nightly.map((n) => n.date).sort();
  const want = [...expected].sort();
  const same = got.length === want.length && got.every((d, i) => d === want[i]);
  if (!same) {
    throw unprocessable('Nightly rates must cover every night of the stay.', {
      'pricing.nightlyRates': ['Nightly rates must cover every night of the stay.'],
    });
  }
}

/** Fixed-DP cap needs the computed total — mirrors frontend `validatePricing`. */
function assertFixedCap(pricing: PricingInput, roomTotal: number): void {
  if (pricing.paymentType === 'dp' && pricing.dpType === 'fixed' && (pricing.dpFixedAmount ?? 0) > roomTotal) {
    throw unprocessable('DP amount cannot exceed the reservation total.', {
      'pricing.dpFixedAmount': ['DP amount cannot exceed the reservation total.'],
    });
  }
}

function assertUniqueRooms(rooms: RoomInput[]): void {
  const ids = rooms.map((r) => r.roomId);
  if (new Set(ids).size !== ids.length) {
    throw unprocessable('Duplicate rooms in a single reservation.', {
      rooms: ['Each room may only be selected once.'],
    });
  }
}

/** One room row as the booking logic needs it (server-side truth). */
interface BookableRoom {
  id: string;
  roomNumber: string;
  status: string;
  roomTypeName: string;
}

/** D1 allows 100 bound parameters per statement. */
const ROOM_LOOKUP_CHUNK = 90;

/** Load rooms (+ type name) in as few statements as possible (1 per 90 ids). */
async function loadRooms(db: AppDb, roomIds: string[]): Promise<Map<string, BookableRoom>> {
  const unique = [...new Set(roomIds)];
  const found = new Map<string, BookableRoom>();
  for (let i = 0; i < unique.length; i += ROOM_LOOKUP_CHUNK) {
    const rows = await db
      .select({ id: rooms.id, roomNumber: rooms.roomNumber, status: rooms.status, roomTypeName: roomTypes.name })
      .from(rooms)
      .leftJoin(roomTypes, eq(rooms.roomTypeId, roomTypes.id))
      .where(inArray(rooms.id, unique.slice(i, i + ROOM_LOOKUP_CHUNK)));
    for (const r of rows) found.set(r.id, { ...r, roomTypeName: r.roomTypeName ?? '' });
  }
  return found;
}

/**
 * Phase 3 compatibility: every `roomId` on a NEW write must exist in the real
 * `rooms` inventory table. Historical `reservation_rooms` snapshots
 * (roomNumber/roomTypeName) are never rewritten when room/type data changes.
 */
function assertRoomsExist(found: Map<string, BookableRoom>, roomIds: string[]): void {
  const missing = [...new Set(roomIds)].filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw unprocessable(`Room(s) not found: ${missing.join(', ')}`, {
      rooms: [`Room(s) not found: ${missing.join(', ')}`],
    });
  }
}

/**
 * BE-024: rooms that are in maintenance or inactive cannot be booked. Only
 * rooms that exist are checked here (existence is `assertRoomsExist`).
 */
function assertRoomsActive(found: Map<string, BookableRoom>, roomIds: string[]): void {
  const blocked = [...new Set(roomIds)]
    .map((id) => found.get(id))
    .filter((r): r is BookableRoom => r !== undefined && r.status !== 'active');
  if (blocked.length > 0) {
    const label = blocked.map((r) => `${r.roomNumber} (${r.status})`).join(', ');
    const msg = `Kamar tidak aktif dan tidak dapat dipesan: ${label}`;
    throw unprocessable(msg, { rooms: [msg] });
  }
}

/** BE-025: stays longer than MAX_NIGHTS are rejected, never truncated. */
function assertStayLength(checkIn: string, checkOut: string): void {
  if (nightsBetween(checkIn, checkOut) > MAX_NIGHTS) {
    const msg = `Maksimal menginap ${MAX_NIGHTS} malam per reservasi.`;
    throw unprocessable(msg, { checkOutDate: [msg] });
  }
}

/** BE-017: statuses whose dates, rooms and prices are frozen. */
const LOCKED_STATUSES = new Set(['checked-out', 'cancelled']);

/** Payment terms that matter: DP value only counts when paymentType is `dp`. */
function effectiveTerms(t: { paymentType: string; dpType: string; dpPercentage?: number | null; dpFixedAmount?: number | null }) {
  if (t.paymentType !== 'dp') return 'no_dp';
  return t.dpType === 'percentage' ? `dp:percentage:${Number(t.dpPercentage ?? 0)}` : `dp:fixed:${Math.round(Number(t.dpFixedAmount ?? 0))}`;
}

/**
 * BE-017: a checked-out or cancelled reservation may still have its guest
 * name, source and notes edited (the wizard PATCHes the FULL payload for
 * every status), but dates, rooms, nightly rates and payment terms must be
 * exactly what is stored. Compares values, so an unchanged full payload passes.
 */
async function assertLockedFieldsUnchanged(
  db: AppDb,
  row: typeof reservations.$inferSelect,
  patch: UpdateReservationInput,
): Promise<void> {
  const changed: string[] = [];
  if (patch.checkInDate !== undefined && patch.checkInDate !== row.checkInDate) changed.push('tanggal check-in');
  if (patch.checkOutDate !== undefined && patch.checkOutDate !== row.checkOutDate) changed.push('tanggal check-out');
  if (patch.rooms !== undefined) {
    const stored = await db
      .select({ roomId: reservationRooms.roomId })
      .from(reservationRooms)
      .where(eq(reservationRooms.reservationId, row.id));
    const a = stored.map((r) => r.roomId).sort();
    const b = [...new Set(patch.rooms.map((r) => r.roomId))].sort();
    if (a.length !== b.length || a.some((id, i) => id !== b[i])) changed.push('kamar');
  }
  if (patch.pricing !== undefined) {
    const stored = await db
      .select({ date: reservationNightlyRates.date, rate: reservationNightlyRates.rate })
      .from(reservationNightlyRates)
      .where(eq(reservationNightlyRates.reservationId, row.id));
    const storedMap = new Map(stored.map((n) => [n.date, n.rate]));
    const sameRates =
      stored.length === patch.pricing.nightlyRates.length &&
      patch.pricing.nightlyRates.every((n) => storedMap.get(n.date) === Math.round(n.rate));
    if (!sameRates) changed.push('harga per malam');
    if (patch.pricing.mode !== row.pricingMode) changed.push('mode harga');
    if (effectiveTerms(patch.pricing) !== effectiveTerms(row)) changed.push('ketentuan pembayaran/DP');
  }
  if (changed.length > 0) {
    const msg = `Reservasi berstatus ${row.status} tidak dapat diubah ${changed.join(', ')}. Hanya nama tamu, sumber, dan catatan yang dapat diubah.`;
    throw conflict(msg, { status: [msg] });
  }
}

/**
 * Room ids booked by other (non-cancelled) reservations overlapping
 * `[checkIn, checkOut)` — half-open stay intervals, mirroring
 * `frontend/src/utils/reservationDraft.ts#getBookedRoomIdsForRange`.
 */
export async function getBookedRoomIds(
  db: AppDb,
  checkIn: string,
  checkOut: string,
  excludeId?: string,
): Promise<string[]> {
  const conditions = [
    lt(reservations.checkInDate, checkOut),
    gt(reservations.checkOutDate, checkIn),
    ne(reservations.status, 'cancelled'),
  ];
  if (excludeId) conditions.push(ne(reservations.id, excludeId));
  const overlapping = await db
    .select({ id: reservations.id })
    .from(reservations)
    .where(and(...conditions));
  if (overlapping.length === 0) return [];
  const booked = new Set<string>();
  for (const r of overlapping) {
    const rows = await db
      .select({ roomId: reservationRooms.roomId })
      .from(reservationRooms)
      .where(eq(reservationRooms.reservationId, r.id));
    for (const row of rows) booked.add(row.roomId);
  }
  return [...booked];
}

async function assertRoomsFree(
  db: AppDb,
  roomIds: string[],
  checkIn: string,
  checkOut: string,
  excludeId?: string,
): Promise<void> {
  const booked = await getBookedRoomIds(db, checkIn, checkOut, excludeId);
  const clash = roomIds.filter((id) => booked.includes(id));
  if (clash.length > 0) {
    throw conflict(`Room(s) already booked for these dates: ${clash.join(', ')}`, {
      rooms: [`Room(s) already booked for these dates: ${clash.join(', ')}`],
    });
  }
}

async function loadFull(db: AppDb, id: string, withRooms: boolean): Promise<PublicReservation> {
  const rows = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('Reservation not found');
  const nightly = await db
    .select()
    .from(reservationNightlyRates)
    .where(eq(reservationNightlyRates.reservationId, id));
  nightly.sort((a, b) => (a.date < b.date ? -1 : 1));
  const rooms = withRooms
    ? await db.select().from(reservationRooms).where(eq(reservationRooms.reservationId, id))
    : undefined;
  const calc = calculatePricing(
    nightly.map((n) => ({ date: n.date, rate: n.rate })),
    {
      paymentType: row.paymentType as 'no_dp' | 'dp',
      dpType: row.dpType as 'percentage' | 'fixed',
      dpPercentage: row.dpPercentage,
      dpFixedAmount: row.dpFixedAmount,
    },
  );
  return toPublicReservation(row, nightly, rooms, calc);
}

export async function listReservations(
  db: AppDb,
  query: ReservationListQuery,
): Promise<{ items: PublicReservation[]; total: number }> {
  const conditions = [];
  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(or(like(reservations.guestName, pattern), like(reservations.reservationCode, pattern)));
  }
  if (query.status !== 'all') conditions.push(eq(reservations.status, query.status));
  if (query.source !== 'all') conditions.push(eq(reservations.source, query.source));
  if (query.date) {
    // Stay covers the day: check_in <= date <= check_out (matches list filter).
    conditions.push(sql`${reservations.checkInDate} <= ${query.date} AND ${query.date} <= ${reservations.checkOutDate}`);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(reservations)
    .where(where);
  const total = Number(totalRows[0]?.count ?? 0);

  const offset = (query.page - 1) * query.pageSize;
  const rows = await db.select().from(reservations).where(where).limit(query.pageSize).offset(offset);

  const withRooms = query.include === '' || query.include.split(',').map((s) => s.trim()).includes('rooms');
  const items: PublicReservation[] = [];
  for (const row of rows) {
    items.push(await loadFull(db, row.id, withRooms));
  }
  return { items, total };
}

export async function getReservation(db: AppDb, id: string): Promise<PublicReservation> {
  return loadFull(db, id, true);
}

async function generateUniqueCode(db: AppDb): Promise<string> {
  const totalRows = await db.select({ count: sql<number>`count(*)` }).from(reservations);
  let count = Number(totalRows[0]?.count ?? 0);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = nextReservationCode(count + attempt);
    const clash = await db
      .select({ id: reservations.id })
      .from(reservations)
      .where(eq(reservations.reservationCode, code))
      .limit(1);
    if (clash.length === 0) return code;
  }
  return `RSV-${new Date().getFullYear()}-${newId().slice(0, 8)}`;
}

async function writeNightly(db: AppDb, reservationId: string, nightly: Array<{ date: string; rate: number }>) {
  await db.delete(reservationNightlyRates).where(eq(reservationNightlyRates.reservationId, reservationId));
  for (const n of nightly) {
    await db.insert(reservationNightlyRates).values({
      reservationId,
      date: n.date,
      rate: Math.round(n.rate),
    });
  }
}

async function writeRooms(
  db: AppDb,
  reservationId: string,
  rooms: RoomInput[],
  splits: Array<{ rate: number; subtotal: number }>,
  createdAt: string,
) {
  await db.delete(reservationRooms).where(eq(reservationRooms.reservationId, reservationId));
  for (let i = 0; i < rooms.length; i += 1) {
    const r = rooms[i];
    await db.insert(reservationRooms).values({
      id: newId('res-room'),
      reservationId,
      roomId: r.roomId,
      roomNumber: r.roomNumber.trim(),
      roomTypeName: (r.roomTypeName ?? '').trim(),
      rate: splits[i].rate,
      subtotal: splits[i].subtotal,
      createdAt,
    });
  }
}

export async function createReservation(db: AppDb, input: CreateReservationInput): Promise<PublicReservation> {
  assertUniqueRooms(input.rooms);
  const found = await loadRooms(db, input.rooms.map((r) => r.roomId));
  assertRoomsExist(found, input.rooms.map((r) => r.roomId));
  assertRoomsActive(found, input.rooms.map((r) => r.roomId));
  assertStayLength(input.checkInDate, input.checkOutDate);
  // BE-024: the snapshot stored with the reservation is the server's, never the client's.
  const snapshotRooms: RoomInput[] = input.rooms.map((r) => {
    const room = found.get(r.roomId) as BookableRoom;
    return { roomId: r.roomId, roomNumber: room.roomNumber, roomTypeName: room.roomTypeName };
  });
  assertNightlyCoverRange(input.pricing.nightlyRates, input.checkInDate, input.checkOutDate);
  const calc = calculatePricing(input.pricing.nightlyRates, termsOf(input.pricing));
  assertFixedCap(input.pricing, calc.roomTotal);
  await assertRoomsFree(
    db,
    input.rooms.map((r) => r.roomId),
    input.checkInDate,
    input.checkOutDate,
  );

  const now = nowIso();
  const id = newId('res');
  const code = await generateUniqueCode(db);
  await db.insert(reservations).values({
    id,
    reservationCode: code,
    guestName: input.guestName.trim(),
    source: input.source,
    checkInDate: input.checkInDate,
    checkOutDate: input.checkOutDate,
    status: 'reserved',
    notes: input.notes?.trim() ?? '',
    totalAmount: calc.roomTotal,
    pricingMode: input.pricing.mode,
    paymentType: input.pricing.paymentType,
    dpType: input.pricing.dpType,
    dpPercentage: input.pricing.paymentType === 'dp' && input.pricing.dpType === 'percentage' ? (input.pricing.dpPercentage ?? 0) : null,
    dpFixedAmount: input.pricing.paymentType === 'dp' && input.pricing.dpType === 'fixed' ? Math.round(input.pricing.dpFixedAmount ?? 0) : null,
    createdAt: now,
    updatedAt: now,
  });
  await writeNightly(db, id, input.pricing.nightlyRates);
  await writeRooms(db, id, snapshotRooms, splitRoomTotals(calc.roomTotal, input.rooms.length, calc.nights), now);
  return loadFull(db, id, true);
}

export async function updateReservation(db: AppDb, id: string, patch: UpdateReservationInput): Promise<PublicReservation> {
  const rows = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('Reservation not found');

  const checkIn = patch.checkInDate ?? row.checkInDate;
  const checkOut = patch.checkOutDate ?? row.checkOutDate;
  if (!(checkOut > checkIn)) {
    throw unprocessable('Check-out must be after check-in.', {
      checkOutDate: ['Check-out must be after check-in.'],
    });
  }

  if (LOCKED_STATUSES.has(row.status)) {
    // BE-017: frozen money/dates/rooms. Only the non-financial fields are
    // applied; nothing else is read or rewritten (a cancelled total stays 0).
    await assertLockedFieldsUnchanged(db, row, patch);
    const lockedHeader: Partial<{ guestName: string; source: string; notes: string; updatedAt: string }> = {
      updatedAt: nowIso(),
    };
    if (patch.guestName !== undefined) lockedHeader.guestName = patch.guestName.trim();
    if (patch.source !== undefined) lockedHeader.source = patch.source;
    if (patch.notes !== undefined) lockedHeader.notes = patch.notes;
    await db.update(reservations).set(lockedHeader).where(eq(reservations.id, id));
    return loadFull(db, id, true);
  }

  const datesChanged =
    (patch.checkInDate !== undefined && patch.checkInDate !== row.checkInDate) ||
    (patch.checkOutDate !== undefined && patch.checkOutDate !== row.checkOutDate);
  // BE-025: only NEW or CHANGED ranges are held to the stay limit (legacy rows are not revalidated).
  if (datesChanged) assertStayLength(checkIn, checkOut);

  const header: Partial<{
    guestName: string;
    source: string;
    checkInDate: string;
    checkOutDate: string;
    notes: string;
    totalAmount: number;
    pricingMode: string;
    paymentType: string;
    dpType: string;
    dpPercentage: number | null;
    dpFixedAmount: number | null;
    updatedAt: string;
  }> = { updatedAt: nowIso() };
  if (patch.guestName !== undefined) header.guestName = patch.guestName.trim();
  if (patch.source !== undefined) header.source = patch.source;
  if (patch.checkInDate !== undefined) header.checkInDate = patch.checkInDate;
  if (patch.checkOutDate !== undefined) header.checkOutDate = patch.checkOutDate;
  if (patch.notes !== undefined) header.notes = patch.notes;

  let nightly = await db
    .select()
    .from(reservationNightlyRates)
    .where(eq(reservationNightlyRates.reservationId, id));
  if (patch.pricing !== undefined) {
    assertNightlyCoverRange(patch.pricing.nightlyRates, checkIn, checkOut);
    const calc = calculatePricing(patch.pricing.nightlyRates, termsOf(patch.pricing));
    assertFixedCap(patch.pricing, calc.roomTotal);
    header.totalAmount = calc.roomTotal;
    header.pricingMode = patch.pricing.mode;
    header.paymentType = patch.pricing.paymentType;
    header.dpType = patch.pricing.dpType;
    header.dpPercentage =
      patch.pricing.paymentType === 'dp' && patch.pricing.dpType === 'percentage' ? (patch.pricing.dpPercentage ?? 0) : null;
    header.dpFixedAmount =
      patch.pricing.paymentType === 'dp' && patch.pricing.dpType === 'fixed' ? Math.round(patch.pricing.dpFixedAmount ?? 0) : null;
    await writeNightly(db, id, patch.pricing.nightlyRates);
    nightly = await db
      .select()
      .from(reservationNightlyRates)
      .where(eq(reservationNightlyRates.reservationId, id));
  } else if (patch.checkInDate !== undefined || patch.checkOutDate !== undefined) {
    // Dates moved without new rates: nightly rows must still cover the stay.
    assertNightlyCoverRange(
      nightly.map((n) => ({ date: n.date })),
      checkIn,
      checkOut,
    );
  }

  let rooms = await db.select().from(reservationRooms).where(eq(reservationRooms.reservationId, id));
  const storedById = new Map(rooms.map((r) => [r.roomId, r]));
  const requestedRooms: RoomInput[] = (patch.rooms ?? rooms.map((r) => ({
    roomId: r.roomId,
    roomNumber: r.roomNumber,
    roomTypeName: r.roomTypeName,
  }))).map((r) => ({ roomId: r.roomId, roomNumber: r.roomNumber, roomTypeName: r.roomTypeName ?? '' }));
  assertUniqueRooms(requestedRooms);

  // One lookup serves existence, the active check and the server snapshot.
  // Skipped for metadata-only edits so the common "save a note" path keeps
  // its original statement count.
  const found =
    patch.rooms !== undefined || datesChanged
      ? await loadRooms(db, requestedRooms.map((r) => r.roomId))
      : new Map<string, BookableRoom>();
  if (patch.rooms !== undefined) {
    assertRoomsExist(found, requestedRooms.map((r) => r.roomId));
  }
  // BE-024: rooms ADDED by this edit, or every room when the dates move, must
  // be active. A room that is already booked keeps working for edits that do
  // not touch occupancy (e.g. the wizard saving a note after the room went to
  // maintenance). Legacy ids that are not in `rooms` are skipped, as before.
  const addedIds = requestedRooms.filter((r) => !storedById.has(r.roomId)).map((r) => r.roomId);
  assertRoomsActive(found, datesChanged ? requestedRooms.map((r) => r.roomId) : addedIds);

  // Snapshots: keep the booking-time values for rooms already on the
  // reservation; rooms newly added take the server's number and type name.
  const effectiveRooms: RoomInput[] = requestedRooms.map((r) => {
    const kept = storedById.get(r.roomId);
    if (kept) return { roomId: r.roomId, roomNumber: kept.roomNumber, roomTypeName: kept.roomTypeName };
    const room = found.get(r.roomId);
    return room
      ? { roomId: r.roomId, roomNumber: room.roomNumber, roomTypeName: room.roomTypeName }
      : { roomId: r.roomId, roomNumber: r.roomNumber, roomTypeName: r.roomTypeName ?? '' };
  });

  // Occupancy only changes when rooms or dates change; metadata/pricing-only
  // patches skip the overlap check (legacy rows may predate the rule).
  if (patch.rooms !== undefined || patch.checkInDate !== undefined || patch.checkOutDate !== undefined) {
    await assertRoomsFree(
      db,
      effectiveRooms.map((r) => r.roomId),
      checkIn,
      checkOut,
      id,
    );
  }

  const totalRows = await db
    .select({ total: sql<number>`coalesce(sum(rate), 0)` })
    .from(reservationNightlyRates)
    .where(eq(reservationNightlyRates.reservationId, id));
  const roomTotal = Number(totalRows[0]?.total ?? 0);
  header.totalAmount = roomTotal;

  if (patch.rooms !== undefined || patch.pricing !== undefined || patch.checkInDate !== undefined || patch.checkOutDate !== undefined) {
    const nights = enumerateNights(checkIn, checkOut).length;
    const createdAt = row.createdAt;
    await writeRooms(db, id, effectiveRooms, splitRoomTotals(roomTotal, effectiveRooms.length, nights), createdAt);
    rooms = await db.select().from(reservationRooms).where(eq(reservationRooms.reservationId, id));
  }

  await db.update(reservations).set(header).where(eq(reservations.id, id));
  return loadFull(db, id, true);
}

export type ReservationTransition = 'check-in' | 'check-out' | 'cancel';

/**
 * Status machine (mirrors the detail-page actions):
 * reserved → checked-in → checked-out, reserved → cancelled (total → 0).
 * Terminal states reject every transition with 409.
 */
export async function transitionReservation(db: AppDb, id: string, action: ReservationTransition): Promise<PublicReservation> {
  const rows = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('Reservation not found');

  const now = nowIso();
  if (action === 'check-in') {
    if (row.status !== 'reserved') throw conflict(`Cannot check in from status '${row.status}'.`);
    await db.update(reservations).set({ status: 'checked-in', updatedAt: now }).where(eq(reservations.id, id));
  } else if (action === 'check-out') {
    if (row.status !== 'checked-in') throw conflict(`Cannot check out from status '${row.status}'.`);
    await db.update(reservations).set({ status: 'checked-out', updatedAt: now }).where(eq(reservations.id, id));
  } else {
    if (row.status !== 'reserved') throw conflict(`Cannot cancel from status '${row.status}'.`);
    await db.update(reservations).set({ status: 'cancelled', totalAmount: 0, updatedAt: now }).where(eq(reservations.id, id));
  }
  return loadFull(db, id, true);
}

export interface CalendarEntry {
  id: string;
  reservationCode: string;
  guestName: string;
  source: string;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  totalAmount: number;
  rooms: Array<{ roomId: string; roomNumber: string; roomTypeName: string }>;
}

/** Reservations overlapping `[from, to]` for the calendar view. */
export async function getCalendar(
  db: AppDb,
  query: { from: string; to: string; roomId?: string; status?: string },
): Promise<CalendarEntry[]> {
  const conditions = [lt(reservations.checkInDate, query.to), gt(reservations.checkOutDate, query.from)];
  if (query.status && query.status !== 'all') conditions.push(eq(reservations.status, query.status));
  const rows = await db
    .select()
    .from(reservations)
    .where(and(...conditions));
  rows.sort((a, b) => (a.checkInDate < b.checkInDate ? -1 : 1));

  const entries: CalendarEntry[] = [];
  for (const row of rows) {
    const rooms = await db
      .select()
      .from(reservationRooms)
      .where(eq(reservationRooms.reservationId, row.id));
    if (query.roomId && !rooms.some((r) => r.roomId === query.roomId)) continue;
    entries.push({
      id: row.id,
      reservationCode: row.reservationCode,
      guestName: row.guestName,
      source: row.source,
      checkInDate: row.checkInDate,
      checkOutDate: row.checkOutDate,
      status: row.status,
      totalAmount: row.totalAmount,
      rooms: rooms.map((r) => ({ roomId: r.roomId, roomNumber: r.roomNumber, roomTypeName: r.roomTypeName })),
    });
  }
  return entries;
}
