import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { reservationService } from '../services/reservationService';

export interface OccupancyStay {
  status: 'checked-in' | 'reserved';
  guestName: string;
  reservationCode: string;
  reservationId: string;
  checkInDate: string;
  checkOutDate: string;
}

export interface RoomOccupancy {
  /** Stay overlapping today (checked-in wins over reserved). Null when free today. */
  current: OccupancyStay | null;
  /** Earliest upcoming reserved stay after today. Null when none. */
  next: OccupancyStay | null;
}

const EMPTY: RoomOccupancy = { current: null, next: null };

function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.max(0, Math.round(ms / 86400000));
}

export function occupancyNights(stay: OccupancyStay): number {
  return nightsBetween(stay.checkInDate, stay.checkOutDate);
}

/**
 * Lazy per-room occupancy for the floor map popup.
 * Queries the server-filtered calendar (same pattern as DayReservationsPopup):
 * today (half-open, checkout day counts as free) + the next 90 days.
 * Results are cached per room id for the session.
 */
export function useRoomOccupancy(roomId: string | null): { occupancy: RoomOccupancy; loading: boolean } {
  const cache = useRef(new Map<string, RoomOccupancy>());
  const [occupancy, setOccupancy] = useState<RoomOccupancy>(EMPTY);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!roomId) {
      setOccupancy(EMPTY);
      setLoading(false);
      return;
    }
    const cached = cache.current.get(roomId);
    if (cached) {
      setOccupancy(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const today = new Date();
    const todayStr = toISODate(today);
    const tomorrowStr = toISODate(addDays(today, 1));
    const horizonStr = toISODate(addDays(today, 90));

    Promise.all([
      reservationService.getCalendar(todayStr, tomorrowStr, { roomId }),
      reservationService.getCalendar(tomorrowStr, horizonStr, { roomId }),
    ])
      .then(([todayEntries, futureEntries]) => {
        if (cancelled) return;
        const overlapping = todayEntries.filter(
          (e) =>
            (e.status === 'checked-in' || e.status === 'reserved') &&
            e.checkInDate <= todayStr &&
            todayStr < e.checkOutDate,
        );
        overlapping.sort((a, b) =>
          a.status === b.status ? a.checkInDate.localeCompare(b.checkInDate) : a.status === 'checked-in' ? -1 : 1,
        );
        const current = overlapping[0]
          ? {
              status: overlapping[0].status as 'checked-in' | 'reserved',
              guestName: overlapping[0].guestName,
              reservationCode: overlapping[0].reservationCode,
              reservationId: overlapping[0].id,
              checkInDate: overlapping[0].checkInDate,
              checkOutDate: overlapping[0].checkOutDate,
            }
          : null;
        const upcoming = futureEntries
          .filter((e) => e.status === 'reserved' && e.checkInDate > todayStr)
          .sort((a, b) => a.checkInDate.localeCompare(b.checkInDate))[0];
        const next = upcoming
          ? {
              status: 'reserved' as const,
              guestName: upcoming.guestName,
              reservationCode: upcoming.reservationCode,
              reservationId: upcoming.id,
              checkInDate: upcoming.checkInDate,
              checkOutDate: upcoming.checkOutDate,
            }
          : null;
        const result: RoomOccupancy = { current, next };
        cache.current.set(roomId, result);
        setOccupancy(result);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setOccupancy(EMPTY);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  return { occupancy, loading };
}
