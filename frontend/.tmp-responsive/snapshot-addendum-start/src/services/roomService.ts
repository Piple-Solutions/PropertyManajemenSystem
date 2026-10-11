import { apiFetch } from './api';
import type { Room } from '@/types/auth.types';

export interface RoomPayload {
  roomNumber: string;
  roomTypeId: string;
  status?: 'active' | 'inactive' | 'maintenance';
}

/**
 * Room client backed by the real API (`/api/rooms`).
 * Async — call sites use `useEffect` + state. Names match the previous
 * mock-backed service. Server `search/status/roomTypeId/pagination` params
 * exist but lists still filter client-side (capped at 100 rows).
 */
class RoomService {
  async getAll(): Promise<Room[]> {
    const json = await apiFetch<{ data: Room[] }>('/api/rooms?page=1&pageSize=100');
    return json.data;
  }

  async getById(id: string): Promise<Room | undefined> {
    try {
      const json = await apiFetch<{ data: Room }>(`/api/rooms/${encodeURIComponent(id)}`);
      return json.data;
    } catch {
      return undefined;
    }
  }

  async getByRoomTypeId(roomTypeId: string): Promise<Room[]> {
    const all = await this.getAll();
    return all.filter((item) => item.roomTypeId === roomTypeId);
  }

  async create(data: RoomPayload): Promise<Room> {
    const json = await apiFetch<{ data: Room }>('/api/rooms', { method: 'POST', body: data });
    return json.data;
  }

  async update(id: string, updates: Partial<RoomPayload>): Promise<Room | null> {
    try {
      const json = await apiFetch<{ data: Room }>(`/api/rooms/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: updates,
      });
      return json.data;
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await apiFetch(`/api/rooms/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return true;
    } catch {
      return false;
    }
  }

  async toggleStatus(id: string): Promise<boolean> {
    const item = await this.getById(id);
    if (!item) return false;
    // Maintenance rooms toggle back to active; active/inactive flip.
    const next = item.status === 'active' ? 'inactive' : 'active';
    try {
      await apiFetch(`/api/rooms/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: { status: next },
      });
      return true;
    } catch {
      return false;
    }
  }
}

export const roomService = new RoomService();
export default roomService;
