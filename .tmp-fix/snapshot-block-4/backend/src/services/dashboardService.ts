import { desc, eq, sql } from 'drizzle-orm';
import { reservations, rooms } from '../db/schema';
import type { AppDb } from '../db/client';
import { nowIso } from '../lib/tokens';

export interface DashboardRecentReservation {
  id: string;
  reservationCode: string;
  guestName: string;
  source: string;
  checkInDate: string;
  status: string;
  totalAmount: number;
  createdAt: string;
}

export interface DashboardOverview {
  /** Server UTC date (YYYY-MM-DD). Replaces the hardcoded `2026-09-15`. */
  today: string;
  reservations: {
    total: number;
    /** checkInDate === today (any status, mirrors the dashboard tile). */
    todayCheckins: number;
    /** checkInDate > today AND status !== cancelled. */
    upcoming: number;
    /** status === checked-in. */
    checkedIn: number;
    byStatus: {
      reserved: number;
      'checked-in': number;
      'checked-out': number;
      cancelled: number;
    };
  };
  rooms: {
    total: number;
    active: number;
    maintenance: number;
    inactive: number;
  };
  occupancy: {
    checkedIn: number;
    totalRooms: number;
    /** round(checkedIn / totalRooms * 100), 0 when there are no rooms. */
    rate: number;
  };
  /** 5 newest reservations by createdAt (fields the recent table renders). */
  recent: DashboardRecentReservation[];
}

/**
 * Dashboard overview — server-side aggregation for `DashboardPage.tsx`.
 *
 * Formulas mirror the frontend memos verbatim (moved server-side so the
 * client no longer downloads full lists):
 * - today/upcoming/checked-in counts, status breakup (cancelled INCLUDED in
 *   the total, EXCLUDED from upcoming)
 * - occupancy = checked-in count / total rooms (NOT only active rooms)
 * - recent-5 by createdAt desc
 *
 * Revenue, sales, invoice, and expense sections are intentionally absent:
 * Finance backend stays deferred and those tiles/charts keep their existing
 * mock services.
 */
export async function getDashboardOverview(db: AppDb): Promise<DashboardOverview> {
  // UTC calendar day — ISO TEXT lexicographic comparison keeps all date
  // predicates (`===`, `>`) valid for YYYY-MM-DD storage.
  const today = nowIso().slice(0, 10);

  const totalRows = await db.select({ count: sql<number>`count(*)` }).from(reservations);
  const total = Number(totalRows[0]?.count ?? 0);

  const statusRows = await db
    .select({ status: reservations.status, count: sql<number>`count(*)` })
    .from(reservations)
    .groupBy(reservations.status);
  const statusCount = new Map(statusRows.map((r) => [r.status, Number(r.count)]));
  const byStatus = {
    reserved: statusCount.get('reserved') ?? 0,
    'checked-in': statusCount.get('checked-in') ?? 0,
    'checked-out': statusCount.get('checked-out') ?? 0,
    cancelled: statusCount.get('cancelled') ?? 0,
  };

  const todayRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(reservations)
    .where(eq(reservations.checkInDate, today));
  const todayCheckins = Number(todayRows[0]?.count ?? 0);

  const upcomingRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(reservations)
    .where(sql`${reservations.checkInDate} > ${today} AND ${reservations.status} != 'cancelled'`);
  const upcoming = Number(upcomingRows[0]?.count ?? 0);

  const roomRows = await db
    .select({ status: rooms.status, count: sql<number>`count(*)` })
    .from(rooms)
    .groupBy(rooms.status);
  const roomCount = new Map(roomRows.map((r) => [r.status, Number(r.count)]));
  const roomTotalRows = await db.select({ count: sql<number>`count(*)` }).from(rooms);
  const roomStats = {
    total: Number(roomTotalRows[0]?.count ?? 0),
    active: roomCount.get('active') ?? 0,
    maintenance: roomCount.get('maintenance') ?? 0,
    inactive: roomCount.get('inactive') ?? 0,
  };

  const recentRows = await db
    .select({
      id: reservations.id,
      reservationCode: reservations.reservationCode,
      guestName: reservations.guestName,
      source: reservations.source,
      checkInDate: reservations.checkInDate,
      status: reservations.status,
      totalAmount: reservations.totalAmount,
      createdAt: reservations.createdAt,
    })
    .from(reservations)
    .orderBy(desc(reservations.createdAt), desc(reservations.id))
    .limit(5);

  const checkedIn = byStatus['checked-in'];
  return {
    today,
    reservations: { total, todayCheckins, upcoming, checkedIn, byStatus },
    rooms: roomStats,
    occupancy: {
      checkedIn,
      totalRooms: roomStats.total,
      rate: roomStats.total > 0 ? Math.round((checkedIn / roomStats.total) * 100) : 0,
    },
    recent: recentRows.map((r) => ({ ...r })),
  };
}
