import { reservationService, type CreateReservationPayload } from '@/services/reservationService';
import { reservationPricingService } from '@/services/reservationPricingService';
import { roomService } from '@/services/roomService';
import { roomTypeService } from '@/services/roomTypeService';
import type { Room, RoomType } from '@/types/auth.types';
import type { ReservationDraft } from '@/types/reservationDraft.types';
import { createEmptyDraft } from '@/types/reservationDraft.types';

/** Sum of selected rooms' room-type default rates (per-night reference, aggregate). */
export function resolveReferenceRate(
  roomIds: string[],
  rooms?: Room[],
  types?: RoomType[],
): { referenceRate: number; roomTypeName: string } {
  if (roomIds.length === 0) return { referenceRate: 0, roomTypeName: '' };
  // Async-aware: when room/type arrays are provided (API path) use them;
  // otherwise fall back to empty (legacy sync mock path removed in Phase 3).
  // Callers that need live data should load via roomService/roomTypeService
  // and pass the arrays in.
  if (!rooms || !types) return { referenceRate: 0, roomTypeName: '' };
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const typeById = new Map(types.map((t) => [t.id, t]));
  let total = 0;
  const names = new Set<string>();
  for (const roomId of roomIds) {
    const room = roomById.get(roomId);
    if (!room) continue;
    const rt = typeById.get(room.roomTypeId);
    if (!rt) continue;
    total += Number(rt.defaultRate) || 0;
    names.add(rt.name);
  }
  return {
    referenceRate: total,
    roomTypeName: names.size === 1 ? [...names][0] : names.size > 1 ? `${names.size} room types` : '',
  };
}

/** Build the shared wizard draft for new or existing reservations. */
export async function buildReservationDraft(id?: string): Promise<ReservationDraft> {
  if (!id) return createEmptyDraft();
  const existing = await reservationService.getFullById(id);
  if (!existing) return createEmptyDraft();
  const rooms = existing.rooms ?? [];
  let referenceRate = 0;
  try {
    const [allRooms, allTypes] = await Promise.all([roomService.getAll(), roomTypeService.getAll()]);
    referenceRate = resolveReferenceRate(
      rooms.map((r) => r.roomId),
      allRooms,
      allTypes,
    ).referenceRate;
  } catch {
    referenceRate = 0;
  }
  const pricing = reservationPricingService.getState(existing, {
    checkInDate: existing.checkInDate,
    checkOutDate: existing.checkOutDate,
    referenceRate: referenceRate || 750000,
    rateSource: existing.source,
  });
  return {
    guestName: existing.guestName || '',
    notes: existing.notes || '',
    source: existing.source || '',
    checkInDate: existing.checkInDate || '',
    checkOutDate: existing.checkOutDate || '',
    roomIds: rooms.map((r) => r.roomId),
    pricing,
  };
}

/**
 * Room ids booked by OTHER reservations overlapping [checkIn, checkOut).
 * Resolved server-side; returns [] when dates are invalid or on error
 * (the server re-enforces overlap on save).
 */
export async function getBookedRoomIdsForRange(
  checkInDate: string,
  checkOutDate: string,
  excludeReservationId?: string,
): Promise<string[]> {
  if (!checkInDate || !checkOutDate) return [];
  const ci = new Date(`${checkInDate}T00:00:00`);
  const co = new Date(`${checkOutDate}T00:00:00`);
  if (Number.isNaN(ci.getTime()) || Number.isNaN(co.getTime()) || co <= ci) return [];
  try {
    return await reservationService.getAvailability(checkInDate, checkOutDate, excludeReservationId);
  } catch {
    return [];
  }
}

async function toCreatePayload(draft: ReservationDraft): Promise<CreateReservationPayload> {
  let rooms: Room[] = [];
  let types: RoomType[] = [];
  try {
    [rooms, types] = await Promise.all([roomService.getAll(), roomTypeService.getAll()]);
  } catch {
    rooms = [];
    types = [];
  }
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const typeById = new Map(types.map((t) => [t.id, t]));
  return {
    guestName: draft.guestName.trim(),
    source: draft.source,
    checkInDate: draft.checkInDate,
    checkOutDate: draft.checkOutDate,
    notes: typeof draft.notes === 'string' ? draft.notes : '',
    rooms: draft.roomIds.map((roomId) => {
      const room = roomById.get(roomId);
      const rt = room?.roomTypeId ? typeById.get(room.roomTypeId) : undefined;
      return {
        roomId,
        roomNumber: room?.roomNumber || roomId,
        roomTypeName: rt?.name || '',
      };
    }),
    pricing: {
      mode: draft.pricing.mode,
      nightlyRates: draft.pricing.nightlyRates.map((n) => ({ date: n.date, rate: Math.round(n.rate) })),
      paymentType: draft.pricing.paymentType,
      dpType: draft.pricing.dpType,
      ...(draft.pricing.dpType === 'percentage'
        ? { dpPercentage: Number(draft.pricing.dpPercentage) }
        : { dpFixedAmount: Math.round(Number(draft.pricing.dpFixedAmount)) }),
    },
  };
}

/**
 * Persist the wizard draft through the API.
 * Returns the reservation id. Totals always derive from nightly rates
 * server-side. Throws the API error on failure (callers surface it).
 */
export async function saveReservationDraft(id: string | undefined, draft: ReservationDraft): Promise<string> {
  const payload = await toCreatePayload(draft);
  if (id) {
    await reservationService.update(id, payload);
    return id;
  }
  const created = await reservationService.create(payload);
  return created.id;
}
