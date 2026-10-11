import { ApiError, apiFetch, fetchAllPages } from './api';
import type { Reservation, ReservationRoom } from '@/types/auth.types';

export interface ApiNightlyRate {
  date: string;
  rate: number;
}

export interface ApiReservationPricing {
  mode: 'same' | 'different';
  nightlyRates: ApiNightlyRate[];
}

export interface ApiReservationPayment {
  type: 'no_dp' | 'dp';
  dpType: 'percentage' | 'fixed';
  dpPercentage?: number;
  dpFixedAmount?: number;
}

export interface ApiReservationCalc {
  nights: number;
  nightDates: string[];
  roomTotal: number;
  dpAmount: number;
  remainingBalance: number;
}

/** Backend reservation: header fields + embedded pricing/payment/calc/rooms. */
export interface ApiReservation extends Reservation {
  pricing: ApiReservationPricing;
  payment: ApiReservationPayment;
  calc: ApiReservationCalc;
  rooms?: ReservationRoom[];
}

export interface ReservationRoomInput {
  roomId: string;
  roomNumber: string;
  roomTypeName?: string;
}

export interface ReservationPricingInput {
  mode: 'same' | 'different';
  nightlyRates: ApiNightlyRate[];
  paymentType: 'no_dp' | 'dp';
  dpType: 'percentage' | 'fixed';
  dpPercentage?: number;
  dpFixedAmount?: number;
}

export interface CreateReservationPayload {
  guestName: string;
  source: string;
  checkInDate: string;
  checkOutDate: string;
  notes?: string;
  rooms: ReservationRoomInput[];
  pricing: ReservationPricingInput;
}

export type UpdateReservationPayload = Partial<CreateReservationPayload>;

/**
 * Slim reservation shape returned by `GET /api/reservations/calendar`.
 * Deliberately narrower than `ApiReservation` — no pricing/calc, because the
 * calendar only needs identity, dates, status and room snapshots.
 */
export interface ApiCalendarEntry {
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

/**
 * Reservation client backed by the real API (`/api/reservations`).
 * `getAll` returns the full embedded shape (rooms/pricing/calc included);
 * filter helpers keep their previous names for call-site compatibility.
 */
class ReservationService {
  async getAll(): Promise<ApiReservation[]> {
    // FE-002: all pages (was only the first 100 rows).
    return fetchAllPages<ApiReservation>('/api/reservations');
  }

  async getById(id: string): Promise<Reservation | undefined> {
    try {
      const json = await apiFetch<{ data: ApiReservation }>(`/api/reservations/${encodeURIComponent(id)}`);
      return json.data;
    } catch {
      return undefined;
    }
  }

  async getFullById(id: string): Promise<ApiReservation | undefined> {
    try {
      const json = await apiFetch<{ data: ApiReservation }>(`/api/reservations/${encodeURIComponent(id)}`);
      return json.data;
    } catch {
      return undefined;
    }
  }

  async getByStatus(status: Reservation['status']): Promise<Reservation[]> {
    const all = await this.getAll();
    return all.filter((item) => item.status === status);
  }

  async getByDateRange(checkIn: Date, checkOut: Date): Promise<Reservation[]> {
    const all = await this.getAll();
    return all.filter((item) => {
      const ci = new Date(item.checkInDate);
      const co = new Date(item.checkOutDate);
      return ci <= checkOut && co >= checkIn;
    });
  }

  async getReservationRooms(reservationId: string): Promise<ReservationRoom[]> {
    const full = await this.getFullById(reservationId);
    return full?.rooms ?? [];
  }

  async getReservationWithRooms(reservationId: string): Promise<(Reservation & { rooms: ReservationRoom[] }) | undefined> {
    const full = await this.getFullById(reservationId);
    if (!full) return undefined;
    return { ...full, rooms: full.rooms ?? [] };
  }

  async getAllReservationRooms(): Promise<ReservationRoom[]> {
    const all = await this.getAll();
    return all.flatMap((r) => r.rooms ?? []);
  }

  async getRoomsByReservationId(reservationId: string): Promise<ReservationRoom[]> {
    return this.getReservationRooms(reservationId);
  }

  async create(payload: CreateReservationPayload): Promise<ApiReservation> {
    const json = await apiFetch<{ data: ApiReservation }>('/api/reservations', {
      method: 'POST',
      body: payload,
    });
    return json.data;
  }

  async update(id: string, updates: UpdateReservationPayload): Promise<ApiReservation> {
    const json = await apiFetch<{ data: ApiReservation }>(`/api/reservations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: updates,
    });
    return json.data;
  }

  /**
   * FE-004: the three status actions now REJECT with the real `ApiError`
   * (status + backend message) instead of returning `false`. Every caller
   * (ReservationDetailPage, CheckInButton, CheckOutButton) catches it and shows
   * the message with the existing `ErrorState` component.
   */
  async cancel(id: string): Promise<boolean> {
    await apiFetch(`/api/reservations/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
    return true;
  }

  async checkIn(id: string): Promise<boolean> {
    await apiFetch(`/api/reservations/${encodeURIComponent(id)}/check-in`, { method: 'POST' });
    return true;
  }

  async checkOut(id: string): Promise<boolean> {
    await apiFetch(`/api/reservations/${encodeURIComponent(id)}/check-out`, { method: 'POST' });
    return true;
  }

  /**
   * Like `getFullById` but only a 404 means "not found" (`undefined`); any
   * other failure (401/5xx/network) rejects so the page can say what happened.
   * Additive: the many existing `getFullById` callers keep their behavior.
   */
  async fetchFullById(id: string): Promise<ApiReservation | undefined> {
    try {
      const json = await apiFetch<{ data: ApiReservation }>(`/api/reservations/${encodeURIComponent(id)}`);
      return json.data;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return undefined;
      throw err;
    }
  }

  /** Room ids booked by other reservations overlapping the range. */
  async getAvailability(checkInDate: string, checkOutDate: string, excludeReservationId?: string): Promise<string[]> {
    const params = new URLSearchParams({ checkIn: checkInDate, checkOut: checkOutDate });
    if (excludeReservationId) params.set('excludeId', excludeReservationId);
    const json = await apiFetch<{ data: { bookedRoomIds: string[] } }>(`/api/reservations/availability?${params}`);
    return json.data.bookedRoomIds;
  }

  /**
   * Reservations overlapping `[from, to)` for a calendar month.
   *
   * The interval is HALF-OPEN, matching the backend overlap rule used by
   * `GET /availability` and the pricing nightly window: a guest checks out on
   * `checkOutDate`, so that day is no longer occupied. Callers covering a whole
   * month must therefore pass `to = first day of next month` (i.e. month end
   * + 1 day). The server rejects `to <= from` with 400.
   */
  async getCalendar(
    from: string,
    to: string,
    filters: { roomId?: string; status?: string } = {},
  ): Promise<ApiCalendarEntry[]> {
    const params = new URLSearchParams({ from, to });
    if (filters.roomId) params.set('roomId', filters.roomId);
    if (filters.status) params.set('status', filters.status);
    try {
      const json = await apiFetch<{ data: ApiCalendarEntry[] }>(`/api/reservations/calendar?${params}`);
      return json.data ?? [];
    } catch {
      return [];
    }
  }
}

export const reservationService = new ReservationService();
export default reservationService;
