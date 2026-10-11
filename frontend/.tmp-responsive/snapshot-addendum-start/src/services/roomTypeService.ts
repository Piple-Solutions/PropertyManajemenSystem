import { apiFetch } from './api';
import type { RoomType } from '@/types/auth.types';

export interface RoomTypePayload {
  name: string;
  description: string;
  capacity: number;
  facilities?: string[];
  defaultRate: number;
  images?: string[];
  status?: 'active' | 'inactive';
}

/**
 * Room-type client backed by the real API (`/api/room-types`).
 * Async — call sites use `useEffect` + state. Names match the previous
 * mock-backed service. Server `search/status/pagination` params exist but
 * lists still filter client-side (capped at 100 rows, Phase-1 scale).
 */
class RoomTypeService {
  async getAll(): Promise<RoomType[]> {
    const json = await apiFetch<{ data: RoomType[] }>('/api/room-types?page=1&pageSize=100');
    return json.data;
  }

  async getById(id: string): Promise<RoomType | undefined> {
    try {
      const json = await apiFetch<{ data: RoomType }>(`/api/room-types/${encodeURIComponent(id)}`);
      return json.data;
    } catch {
      return undefined;
    }
  }

  async create(data: RoomTypePayload): Promise<RoomType> {
    const json = await apiFetch<{ data: RoomType }>('/api/room-types', { method: 'POST', body: data });
    return json.data;
  }

  async update(id: string, updates: Partial<RoomTypePayload>): Promise<RoomType | null> {
    try {
      const json = await apiFetch<{ data: RoomType }>(`/api/room-types/${encodeURIComponent(id)}`, {
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
      await apiFetch(`/api/room-types/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return true;
    } catch {
      return false;
    }
  }

  async toggleStatus(id: string): Promise<boolean> {
    const item = await this.getById(id);
    if (!item) return false;
    const next = item.status === 'active' ? 'inactive' : 'active';
    try {
      await apiFetch(`/api/room-types/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: { status: next },
      });
      return true;
    } catch {
      return false;
    }
  }
}

export const roomTypeService = new RoomTypeService();
export default roomTypeService;
