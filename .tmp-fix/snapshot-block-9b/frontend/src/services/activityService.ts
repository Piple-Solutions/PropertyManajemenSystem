import { apiFetch, fetchAllPages } from './api';
import type { Activity } from '@/types/auth.types';

interface ListResponse {
  data: Activity[];
  pagination: { page: number; pageSize: number; total: number };
}

/**
 * Activity audit-log client backed by the real API (`/api/activities`).
 * Async — call sites use `useEffect` + state. Names match the previous
 * mock-backed service. The log is append-only and server-generated: there is
 * no `create` method (no write endpoint exists), so the frontend can never
 * fabricate audit records.
 */
/** The audit log grows without bound; load at most the newest 10 pages (1000 rows). */
const ACTIVITY_MAX_PAGES = 10;

class ActivityService {
  async getAll(): Promise<Activity[]> {
    // FE-002: newest-first, so the 10-page cap keeps the most recent 1000 rows.
    return fetchAllPages<Activity>('/api/activities', { maxPages: ACTIVITY_MAX_PAGES });
  }

  async getById(id: string): Promise<Activity | undefined> {
    try {
      const json = await apiFetch<{ data: Activity }>(`/api/activities/${encodeURIComponent(id)}`);
      return json.data;
    } catch {
      return undefined;
    }
  }

  async getByCategory(category: string): Promise<Activity[]> {
    return fetchAllPages<Activity>(`/api/activities?category=${encodeURIComponent(category)}`, {
      maxPages: ACTIVITY_MAX_PAGES,
    });
  }

  async getByUser(userId: string): Promise<Activity[]> {
    return fetchAllPages<Activity>(`/api/activities?userId=${encodeURIComponent(userId)}`, {
      maxPages: ACTIVITY_MAX_PAGES,
    });
  }

  async getByDateRange(startDate: string, endDate: string): Promise<Activity[]> {
    const all = await this.getAll();
    return all.filter((item) => {
      const date = new Date(item.createdAt);
      return date >= new Date(startDate) && date <= new Date(endDate);
    });
  }

  async getRecent(limit = 20): Promise<Activity[]> {
    const json = await apiFetch<ListResponse>(`/api/activities?page=1&pageSize=${limit}`);
    return json.data.slice(0, limit);
  }
}

export const activityService = new ActivityService();
export default activityService;
