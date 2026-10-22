import { and, eq, gt, inArray, lt, ne, or, sql, type SQL } from 'drizzle-orm';
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
import { chunkByParams, changesOf, inList, isUniqueViolation, runAtomic, valuesList, type AtomicStatement } from '../lib/atomic';
import { likeContains } from '../lib/sql';
import { idempotencyPivot, idempotencyTripwire, type IdempotencyExecution } from '../lib/idempotency';
import { yearInJakarta } from '../lib/time';
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
  // BE-027: one join instead of one query per overlapping reservation. The
  // ORDER BY reproduces the order the loop produced (reservations by the
  // `check_in_date, check_out_date` index, then their rooms in insertion
  // order), so the response is identical.
  const rows = await db.all<{ room_id: string }>(sql`
    SELECT rr.room_id AS room_id
    FROM reservations o
    JOIN reservation_rooms rr ON rr.reservation_id = o.id
    WHERE o.check_in_date < ${checkOut}
      AND o.check_out_date > ${checkIn}
      AND o.status != 'cancelled'${excludeId ? sql` AND o.id != ${excludeId}` : sql``}
    ORDER BY o.check_in_date, o.check_out_date, o.rowid, rr.rowid`);
  return [...new Set(rows.map((r) => r.room_id))];
}

/**
 * The overlap predicate, as ONE SQL expression (Block 5). It is exactly the
 * rule `getBookedRoomIds` uses: another NON-cancelled reservation holds one of
 * the rooms and its half-open stay `[check_in, check_out)` intersects
 * `[checkIn, checkOut)`. Embedding it in the writing statement makes the
 * availability check and the write a single atomic step.
 */
function overlapExists(roomIds: string[], checkIn: string, checkOut: string, excludeId?: string): SQL {
  return sql`EXISTS (
    SELECT 1 FROM reservation_rooms rr
    JOIN reservations o ON o.id = rr.reservation_id
    WHERE rr.room_id IN (${inList(roomIds)})
      AND o.status != 'cancelled'
      AND o.check_in_date < ${checkOut}
      AND o.check_out_date > ${checkIn}${excludeId ? sql` AND o.id != ${excludeId}` : sql``}
  )`;
}

/** Bound parameters used by `overlapExists`. */
const overlapParams = (roomCount: number, excludeId?: string) => roomCount + 2 + (excludeId ? 1 : 0);

/**
 * Hard cap so the conditional statements always fit D1's 100 bound
 * parameters (the header insert binds 16 values + the overlap predicate).
 */
const MAX_ROOMS_PER_RESERVATION = 60;

function assertRoomCount(roomCount: number): void {
  if (roomCount > MAX_ROOMS_PER_RESERVATION) {
    const msg = `Maksimal ${MAX_ROOMS_PER_RESERVATION} kamar per reservasi.`;
    throw unprocessable(msg, { rooms: [msg] });
  }
}

/** Which of `roomIds` clash (only used to build the 409 message after a failed conditional write). */
async function findClashingRooms(
  db: AppDb,
  roomIds: string[],
  checkIn: string,
  checkOut: string,
  excludeId?: string,
): Promise<string[]> {
  const rows = await db.all<{ room_id: string }>(sql`
    SELECT DISTINCT rr.room_id AS room_id FROM reservation_rooms rr
    JOIN reservations o ON o.id = rr.reservation_id
    WHERE rr.room_id IN (${inList(roomIds)})
      AND o.status != 'cancelled'
      AND o.check_in_date < ${checkOut}
      AND o.check_out_date > ${checkIn}${excludeId ? sql` AND o.id != ${excludeId}` : sql``}`);
  const booked = new Set(rows.map((r) => r.room_id));
  return roomIds.filter((id) => booked.has(id));
}

function roomsBookedConflict(clash: string[]) {
  return conflict(`Room(s) already booked for these dates: ${clash.join(', ')}`, {
    rooms: [`Room(s) already booked for these dates: ${clash.join(', ')}`],
  });
}

/** D1: at most 100 bound parameters per statement. */
const IN_CHUNK = 90;

function chunks<T>(items: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Build full reservations for a set of header rows with a CONSTANT number of
 * statements (nightly rates + rooms, one `IN (...)` query per 90 ids) instead
 * of 2-3 queries per row (BE-027). Per-reservation row order matches the old
 * per-id queries: rooms by insertion order, nightly rates sorted by date.
 */
async function loadMany(
  db: AppDb,
  headers: Array<typeof reservations.$inferSelect>,
  withRooms: boolean,
): Promise<PublicReservation[]> {
  if (headers.length === 0) return [];
  const ids = headers.map((h) => h.id);
  const nightlyBy = new Map<string, Array<typeof reservationNightlyRates.$inferSelect>>();
  const roomsBy = new Map<string, Array<typeof reservationRooms.$inferSelect>>();
  for (const part of chunks(ids)) {
    const nightly = await db
      .select()
      .from(reservationNightlyRates)
      .where(inArray(reservationNightlyRates.reservationId, part))
      .orderBy(reservationNightlyRates.reservationId, reservationNightlyRates.date);
    for (const n of nightly) {
      const list = nightlyBy.get(n.reservationId) ?? [];
      list.push(n);
      nightlyBy.set(n.reservationId, list);
    }
    if (withRooms) {
      const roomRows = await db
        .select()
        .from(reservationRooms)
        .where(inArray(reservationRooms.reservationId, part))
        .orderBy(sql`rowid`);
      for (const r of roomRows) {
        const list = roomsBy.get(r.reservationId) ?? [];
        list.push(r);
        roomsBy.set(r.reservationId, list);
      }
    }
  }
  return headers.map((row) => {
    const nightly = nightlyBy.get(row.id) ?? [];
    const calc = calculatePricing(
      nightly.map((n) => ({ date: n.date, rate: n.rate })),
      {
        paymentType: row.paymentType as 'no_dp' | 'dp',
        dpType: row.dpType as 'percentage' | 'fixed',
        dpPercentage: row.dpPercentage,
        dpFixedAmount: row.dpFixedAmount,
      },
    );
    return toPublicReservation(row, nightly, withRooms ? (roomsBy.get(row.id) ?? []) : undefined, calc);
  });
}

async function loadFull(db: AppDb, id: string, withRooms: boolean): Promise<PublicReservation> {
  const rows = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('Reservation not found');
  return (await loadMany(db, [row], withRooms))[0];
}

export async function listReservations(
  db: AppDb,
  query: ReservationListQuery,
): Promise<{ items: PublicReservation[]; total: number }> {
  const conditions = [];
  if (query.search) {
    conditions.push(or(likeContains(reservations.guestName, query.search), likeContains(reservations.reservationCode, query.search)));
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

  // BE-035: explicit order = the order SQLite's planner produced so far:
  // an equality filter on an indexed column (status, source) or a plain scan
  // returns insertion order; a date-only filter walks the dates index.
  const byIndexedEquality = query.status !== 'all' || query.source !== 'all';
  const order =
    !byIndexedEquality && query.date
      ? [reservations.checkInDate, reservations.checkOutDate, sql`rowid`]
      : [sql`rowid`];
  const offset = (query.page - 1) * query.pageSize;
  const rows = await db
    .select()
    .from(reservations)
    .where(where)
    .orderBy(...order)
    .limit(query.pageSize)
    .offset(offset);

  const withRooms = query.include === '' || query.include.split(',').map((s) => s.trim()).includes('rooms');
  return { items: await loadMany(db, rows, withRooms), total };
}

export async function getReservation(db: AppDb, id: string): Promise<PublicReservation> {
  return loadFull(db, id, true);
}

/** Attempts before giving up on a booking write (code collisions / transient conflicts). */
const MAX_WRITE_ATTEMPTS = 8;

/**
 * Next `RSV-YYYY-NNN` candidate. The UNIQUE constraint is the final arbiter
 * (BE-029): when a concurrent create takes the same code the whole batch
 * rolls back and the caller retries with a fresh candidate; after a few
 * collisions it falls back to a random suffix.
 */
async function generateUniqueCode(db: AppDb, attempt = 0): Promise<string> {
  if (attempt >= 4) return `RSV-${yearInJakarta()}-${newId().slice(0, 8)}`;
  const totalRows = await db.select({ count: sql<number>`count(*)` }).from(reservations);
  const count = Number(totalRows[0]?.count ?? 0);
  for (let i = 0; i < 5; i += 1) {
    const code = nextReservationCode(count + i);
    const clash = await db
      .select({ id: reservations.id })
      .from(reservations)
      .where(eq(reservations.reservationCode, code))
      .limit(1);
    if (clash.length === 0) return code;
  }
  return `RSV-${yearInJakarta()}-${newId().slice(0, 8)}`;
}

type Guard = { where: SQL; params: number };

/**
 * Per-night rate inserts, chunked to the bound-parameter cap. Rows are only
 * inserted when the reservation header exists and `guard` holds.
 */
function nightlyInserts(reservationId: string, nightly: Array<{ date: string; rate: number }>, guard?: Guard): AtomicStatement[] {
  const rows = nightly.map((n) => [n.date, Math.round(n.rate)]);
  return chunkByParams(rows, 2, 1 + (guard?.params ?? 0)).map((chunk) =>
    sql`
      INSERT INTO reservation_nightly_rates (reservation_id, date, rate)
      SELECT r.id, v.column1, v.column2
      FROM (VALUES ${valuesList(chunk)}) v
      JOIN reservations r ON r.id = ${reservationId}${guard ? sql` WHERE ${guard.where}` : sql``}`,
  );
}

/** Room rows (+ per-room split), chunked; guarded like `nightlyInserts`. */
function roomInserts(
  reservationId: string,
  roomList: RoomInput[],
  splits: Array<{ rate: number; subtotal: number }>,
  createdAt: string,
  guard?: Guard,
): AtomicStatement[] {
  const rows = roomList.map((r, i) => [
    newId('res-room'),
    r.roomId,
    r.roomNumber.trim(),
    (r.roomTypeName ?? '').trim(),
    splits[i].rate,
    splits[i].subtotal,
  ]);
  return chunkByParams(rows, 6, 2 + (guard?.params ?? 0)).map((chunk) =>
    sql`
      INSERT INTO reservation_rooms (id, reservation_id, room_id, room_number, room_type_name, rate, subtotal, created_at)
      SELECT v.column1, r.id, v.column2, v.column3, v.column4, v.column5, v.column6, ${createdAt}
      FROM (VALUES ${valuesList(chunk)}) v
      JOIN reservations r ON r.id = ${reservationId}${guard ? sql` WHERE ${guard.where}` : sql``}`,
  );
}

export async function createReservation(
  db: AppDb,
  input: CreateReservationInput,
  /**
   * Idempotency execution (approved design). When set, the batch appends the
   * pivot + tripwire AFTER its own writes. Both are guarded by the entity
   * existence check, because this header is a CONDITIONAL insert: an overlap
   * conflict legitimately writes 0 rows and must not complete the key (the
   * 409 clash path below is deterministic and is recorded by the wrapper).
   */
  execution?: IdempotencyExecution,
): Promise<PublicReservation> {
  // ---- validate everything first (reads only) ----
  assertUniqueRooms(input.rooms);
  assertRoomCount(input.rooms.length);
  const roomIds = input.rooms.map((r) => r.roomId);
  const found = await loadRooms(db, roomIds);
  assertRoomsExist(found, roomIds);
  assertRoomsActive(found, roomIds);
  assertStayLength(input.checkInDate, input.checkOutDate);
  // BE-024: the snapshot stored with the reservation is the server's, never the client's.
  const snapshotRooms: RoomInput[] = input.rooms.map((r) => {
    const room = found.get(r.roomId) as BookableRoom;
    return { roomId: r.roomId, roomNumber: room.roomNumber, roomTypeName: room.roomTypeName };
  });
  assertNightlyCoverRange(input.pricing.nightlyRates, input.checkInDate, input.checkOutDate);
  const calc = calculatePricing(input.pricing.nightlyRates, termsOf(input.pricing));
  assertFixedCap(input.pricing, calc.roomTotal);

  const now = nowIso();
  const id = newId('res');
  const splits = splitRoomTotals(calc.roomTotal, input.rooms.length, calc.nights);
  const dpPercentage =
    input.pricing.paymentType === 'dp' && input.pricing.dpType === 'percentage' ? (input.pricing.dpPercentage ?? 0) : null;
  const dpFixedAmount =
    input.pricing.paymentType === 'dp' && input.pricing.dpType === 'fixed' ? Math.round(input.pricing.dpFixedAmount ?? 0) : null;

  // ---- one atomic batch (BE-015 / BE-018): the header is inserted ONLY if no
  // overlapping booking exists; rooms and rates are inserted only if the
  // header was. Two concurrent requests therefore cannot both succeed. ----
  const entityGuard = execution ? sql`EXISTS (SELECT 1 FROM reservations WHERE id = ${id})` : undefined;
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const code = await generateUniqueCode(db, attempt);
    const header = sql`
      INSERT INTO reservations (
        id, reservation_code, guest_name, source, check_in_date, check_out_date, status, notes,
        total_amount, pricing_mode, payment_type, dp_type, dp_percentage, dp_fixed_amount, created_at, updated_at
      )
      SELECT ${id}, ${code}, ${input.guestName.trim()}, ${input.source}, ${input.checkInDate}, ${input.checkOutDate},
        'reserved', ${input.notes?.trim() ?? ''}, ${calc.roomTotal}, ${input.pricing.mode}, ${input.pricing.paymentType},
        ${input.pricing.dpType}, ${dpPercentage}, ${dpFixedAmount}, ${now}, ${now}
      WHERE NOT ${overlapExists(roomIds, input.checkInDate, input.checkOutDate)}`;
    let results: unknown[];
    try {
      const statements: AtomicStatement[] = [
        header,
        ...nightlyInserts(id, input.pricing.nightlyRates),
        ...roomInserts(id, snapshotRooms, splits, now),
      ];
      if (execution) {
        statements.push(idempotencyPivot(execution, id, entityGuard));
        statements.push(idempotencyTripwire(execution, id, entityGuard));
      }
      results = await runAtomic(db, statements);
    } catch (err) {
      // BE-029: another request took this code first. Nothing was written
      // (the batch rolled back): try again with a fresh code.
      if (isUniqueViolation(err, 'reservations.reservation_code')) continue;
      throw err;
    }
    if (changesOf(results[0]) === 1) return loadFull(db, id, true);

    // The conditional insert wrote nothing: the room is taken.
    const clash = await findClashingRooms(db, roomIds, input.checkInDate, input.checkOutDate);
    if (clash.length > 0) throw roomsBookedConflict(clash);
    // The blocker disappeared between the write and this read: retry.
  }
  throw conflict('Reservasi tidak dapat disimpan karena bentrok dengan permintaan lain. Silakan coba lagi.');
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

  /** BE-018: every write below only applies while the status is still the one validated here. */
  const statusChanged = async () => {
    const current = await db.select({ status: reservations.status }).from(reservations).where(eq(reservations.id, id)).limit(1);
    const status = current[0]?.status;
    if (status === undefined) return notFound('Reservation not found');
    const msg = `Status reservasi telah berubah menjadi '${status}'. Muat ulang data lalu coba lagi.`;
    return conflict(msg, { status: [msg] });
  };

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
    const done = await db
      .update(reservations)
      .set(lockedHeader)
      .where(and(eq(reservations.id, id), eq(reservations.status, row.status)))
      .run();
    if (changesOf(done) !== 1) throw await statusChanged();
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

  // ---- BE-016: validate EVERYTHING first (reads only, nothing is written yet) ----
  const storedNightly = await db
    .select()
    .from(reservationNightlyRates)
    .where(eq(reservationNightlyRates.reservationId, id));
  let finalNightly: Array<{ date: string; rate: number }> = storedNightly.map((n) => ({ date: n.date, rate: n.rate }));
  if (patch.pricing !== undefined) {
    assertNightlyCoverRange(patch.pricing.nightlyRates, checkIn, checkOut);
    const calc = calculatePricing(patch.pricing.nightlyRates, termsOf(patch.pricing));
    assertFixedCap(patch.pricing, calc.roomTotal);
    header.pricingMode = patch.pricing.mode;
    header.paymentType = patch.pricing.paymentType;
    header.dpType = patch.pricing.dpType;
    header.dpPercentage =
      patch.pricing.paymentType === 'dp' && patch.pricing.dpType === 'percentage' ? (patch.pricing.dpPercentage ?? 0) : null;
    header.dpFixedAmount =
      patch.pricing.paymentType === 'dp' && patch.pricing.dpType === 'fixed' ? Math.round(patch.pricing.dpFixedAmount ?? 0) : null;
    finalNightly = patch.pricing.nightlyRates.map((n) => ({ date: n.date, rate: Math.round(n.rate) }));
  } else if (patch.checkInDate !== undefined || patch.checkOutDate !== undefined) {
    // Dates moved without new rates: nightly rows must still cover the stay.
    assertNightlyCoverRange(
      storedNightly.map((n) => ({ date: n.date })),
      checkIn,
      checkOut,
    );
  }

  const storedRooms = await db.select().from(reservationRooms).where(eq(reservationRooms.reservationId, id));
  const storedById = new Map(storedRooms.map((r) => [r.roomId, r]));
  const requestedRooms: RoomInput[] = (patch.rooms ?? storedRooms.map((r) => ({
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
    assertRoomCount(requestedRooms.length);
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
  const effectiveRoomIds = effectiveRooms.map((r) => r.roomId);

  // The total always derives from the nightly rates that will be stored.
  const roomTotal = finalNightly.reduce((sum, n) => sum + n.rate, 0);
  header.totalAmount = roomTotal;

  // Occupancy only changes when rooms or dates change; metadata/pricing-only
  // patches skip the overlap check (legacy rows may predate the rule).
  const occupancyChanges = patch.rooms !== undefined || patch.checkInDate !== undefined || patch.checkOutDate !== undefined;
  const rewriteNightly = patch.pricing !== undefined;
  const rewriteRooms = occupancyChanges || patch.pricing !== undefined;
  if (occupancyChanges) assertRoomCount(effectiveRoomIds.length);

  // ---- one atomic write. Every statement carries the SAME guard: the status
  // is still the validated one AND (when occupancy changes) no other booking
  // overlaps. The guard cannot flip inside the batch (it excludes this
  // reservation and no statement changes the status), so either every
  // statement applies or none does. ----
  const overlap = occupancyChanges ? overlapExists(effectiveRoomIds, checkIn, checkOut, id) : undefined;
  const guard: Guard = {
    where: sql`EXISTS (SELECT 1 FROM reservations g WHERE g.id = ${id} AND g.status = ${row.status})${overlap ? sql` AND NOT ${overlap}` : sql``}`,
    params: 2 + (overlap ? overlapParams(effectiveRoomIds.length, id) : 0),
  };
  const headerUpdate = db
    .update(reservations)
    .set(header)
    .where(
      overlap
        ? and(eq(reservations.id, id), eq(reservations.status, row.status), sql`NOT ${overlap}`)
        : and(eq(reservations.id, id), eq(reservations.status, row.status)),
    );

  const statements: AtomicStatement[] = [headerUpdate];
  if (rewriteNightly) {
    statements.push(sql`DELETE FROM reservation_nightly_rates WHERE reservation_id = ${id} AND ${guard.where}`);
    statements.push(...nightlyInserts(id, finalNightly, guard));
  }
  if (rewriteRooms) {
    const nights = enumerateNights(checkIn, checkOut).length;
    statements.push(sql`DELETE FROM reservation_rooms WHERE reservation_id = ${id} AND ${guard.where}`);
    statements.push(
      ...roomInserts(id, effectiveRooms, splitRoomTotals(roomTotal, effectiveRooms.length, nights), row.createdAt, guard),
    );
  }

  const results = await runAtomic(db, statements);
  if (changesOf(results[0]) !== 1) {
    if (occupancyChanges) {
      const clash = await findClashingRooms(db, effectiveRoomIds, checkIn, checkOut, id);
      if (clash.length > 0) throw roomsBookedConflict(clash);
    }
    throw await statusChanged();
  }
  return loadFull(db, id, true);
}

export type ReservationTransition = 'check-in' | 'check-out' | 'cancel';

/**
 * Status machine (mirrors the detail-page actions):
 * reserved → checked-in → checked-out, reserved → cancelled (total → 0).
 * Terminal states reject every transition with 409.
 *
 * BE-018: the move is a conditional `UPDATE ... WHERE status = <from>`; when
 * two requests race, exactly one changes a row and the other gets the same
 * 409 it would have received had it arrived later.
 */
export async function transitionReservation(db: AppDb, id: string, action: ReservationTransition): Promise<PublicReservation> {
  const rows = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('Reservation not found');

  const rule = {
    'check-in': { from: 'reserved', to: 'checked-in', refuse: (s: string) => `Cannot check in from status '${s}'.` },
    'check-out': { from: 'checked-in', to: 'checked-out', refuse: (s: string) => `Cannot check out from status '${s}'.` },
    cancel: { from: 'reserved', to: 'cancelled', refuse: (s: string) => `Cannot cancel from status '${s}'.` },
  }[action];
  if (row.status !== rule.from) throw conflict(rule.refuse(row.status));

  const now = nowIso();
  const done = await db
    .update(reservations)
    .set(action === 'cancel' ? { status: rule.to, totalAmount: 0, updatedAt: now } : { status: rule.to, updatedAt: now })
    .where(and(eq(reservations.id, id), eq(reservations.status, rule.from)))
    .run();
  if (changesOf(done) !== 1) {
    const current = await db.select({ status: reservations.status }).from(reservations).where(eq(reservations.id, id)).limit(1);
    if (current.length === 0) throw notFound('Reservation not found');
    throw conflict(rule.refuse(current[0].status));
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
  // BE-035: by check-in date, then check-out date, then insertion order (the
  // dates index order the unsorted query had), so ties are deterministic.
  const rows = await db
    .select()
    .from(reservations)
    .where(and(...conditions))
    .orderBy(reservations.checkInDate, reservations.checkOutDate, sql`rowid`);

  // BE-027: rooms for ALL rows in one query per 90 ids (was one per row).
  const roomsBy = new Map<string, Array<typeof reservationRooms.$inferSelect>>();
  for (const part of chunks(rows.map((r) => r.id))) {
    const roomRows = await db
      .select()
      .from(reservationRooms)
      .where(inArray(reservationRooms.reservationId, part))
      .orderBy(sql`rowid`);
    for (const r of roomRows) {
      const list = roomsBy.get(r.reservationId) ?? [];
      list.push(r);
      roomsBy.set(r.reservationId, list);
    }
  }

  const entries: CalendarEntry[] = [];
  for (const row of rows) {
    const rooms = roomsBy.get(row.id) ?? [];
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
