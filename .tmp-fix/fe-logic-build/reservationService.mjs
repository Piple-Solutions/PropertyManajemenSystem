import { ApiError, apiFetch, fetchAllPages } from './api.mjs';
/**
 * Reservation client backed by the real API (`/api/reservations`).
 * `getAll` returns the full embedded shape (rooms/pricing/calc included);
 * filter helpers keep their previous names for call-site compatibility.
 */
class ReservationService {
    async getAll() {
        // FE-002: all pages (was only the first 100 rows).
        return fetchAllPages('/api/reservations');
    }
    async getById(id) {
        try {
            const json = await apiFetch(`/api/reservations/${encodeURIComponent(id)}`);
            return json.data;
        }
        catch {
            return undefined;
        }
    }
    async getFullById(id) {
        try {
            const json = await apiFetch(`/api/reservations/${encodeURIComponent(id)}`);
            return json.data;
        }
        catch {
            return undefined;
        }
    }
    async getByStatus(status) {
        const all = await this.getAll();
        return all.filter((item) => item.status === status);
    }
    async getByDateRange(checkIn, checkOut) {
        const all = await this.getAll();
        return all.filter((item) => {
            const ci = new Date(item.checkInDate);
            const co = new Date(item.checkOutDate);
            return ci <= checkOut && co >= checkIn;
        });
    }
    async getReservationRooms(reservationId) {
        const full = await this.getFullById(reservationId);
        return full?.rooms ?? [];
    }
    async getReservationWithRooms(reservationId) {
        const full = await this.getFullById(reservationId);
        if (!full)
            return undefined;
        return { ...full, rooms: full.rooms ?? [] };
    }
    async getAllReservationRooms() {
        const all = await this.getAll();
        return all.flatMap((r) => r.rooms ?? []);
    }
    async getRoomsByReservationId(reservationId) {
        return this.getReservationRooms(reservationId);
    }
    async create(payload) {
        const json = await apiFetch('/api/reservations', {
            method: 'POST',
            body: payload,
        });
        return json.data;
    }
    async update(id, updates) {
        const json = await apiFetch(`/api/reservations/${encodeURIComponent(id)}`, {
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
    async cancel(id) {
        await apiFetch(`/api/reservations/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
        return true;
    }
    async checkIn(id) {
        await apiFetch(`/api/reservations/${encodeURIComponent(id)}/check-in`, { method: 'POST' });
        return true;
    }
    async checkOut(id) {
        await apiFetch(`/api/reservations/${encodeURIComponent(id)}/check-out`, { method: 'POST' });
        return true;
    }
    /**
     * Like `getFullById` but only a 404 means "not found" (`undefined`); any
     * other failure (401/5xx/network) rejects so the page can say what happened.
     * Additive: the many existing `getFullById` callers keep their behavior.
     */
    async fetchFullById(id) {
        try {
            const json = await apiFetch(`/api/reservations/${encodeURIComponent(id)}`);
            return json.data;
        }
        catch (err) {
            if (err instanceof ApiError && err.status === 404)
                return undefined;
            throw err;
        }
    }
    /** Room ids booked by other reservations overlapping the range. */
    async getAvailability(checkInDate, checkOutDate, excludeReservationId) {
        const params = new URLSearchParams({ checkIn: checkInDate, checkOut: checkOutDate });
        if (excludeReservationId)
            params.set('excludeId', excludeReservationId);
        const json = await apiFetch(`/api/reservations/availability?${params}`);
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
    async getCalendar(from, to, filters = {}) {
        const params = new URLSearchParams({ from, to });
        if (filters.roomId)
            params.set('roomId', filters.roomId);
        if (filters.status)
            params.set('status', filters.status);
        try {
            const json = await apiFetch(`/api/reservations/calendar?${params}`);
            return json.data ?? [];
        }
        catch {
            return [];
        }
    }
}
export const reservationService = new ReservationService();
export default reservationService;
