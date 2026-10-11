import { desc, sql } from 'drizzle-orm';
import { reservations, rooms } from '../db/schema';
import type { AppDb } from '../db/client';
import { todayInJakarta } from '../lib/time';

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
  /** Server business date in Asia/Jakarta (YYYY-MM-DD, BE-026). */
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
  // Asia/Jakarta calendar day (BE-026) — ISO TEXT lexicographic comparison
  // keeps all date predicates (`===`, `>`) valid for YYYY-MM-DD storage.
  const today = todayInJakarta();

  // One grouped read gives the status breakup AND the total; one conditional
  // aggregate gives both date tiles (BE-027: 7 statements -> 3 + recent).
  const statusRows = await db
    .select({ status: reservations.status, count: sql<number>`count(*)` })
    .from(reservations)
    .groupBy(reservations.status);
  const statusCount = new Map(statusRows.map((r) => [r.status, Number(r.count)]));
  const total = statusRows.reduce((sum, r) => sum + Number(r.count), 0);
  const byStatus = {
    reserved: statusCount.get('reserved') ?? 0,
    'checked-in': statusCount.get('checked-in') ?? 0,
    'checked-out': statusCount.get('checked-out') ?? 0,
    cancelled: statusCount.get('cancelled') ?? 0,
  };

  const dateRows = await db
    .select({
      todayCheckins: sql<number>`coalesce(sum(case when ${reservations.checkInDate} = ${today} then 1 else 0 end), 0)`,
      upcoming: sql<number>`coalesce(sum(case when ${reservations.checkInDate} > ${today} and ${reservations.status} != 'cancelled' then 1 else 0 end), 0)`,
    })
    .from(reservations);
  const todayCheckins = Number(dateRows[0]?.todayCheckins ?? 0);
  const upcoming = Number(dateRows[0]?.upcoming ?? 0);

  const roomRows = await db
    .select({ status: rooms.status, count: sql<number>`count(*)` })
    .from(rooms)
    .groupBy(rooms.status);
  const roomCount = new Map(roomRows.map((r) => [r.status, Number(r.count)]));
  const roomStats = {
    total: roomRows.reduce((sum, r) => sum + Number(r.count), 0),
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
