import { apiFetch } from './api';

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
  /** Server UTC date (YYYY-MM-DD). */
  today: string;
  reservations: {
    total: number;
    todayCheckins: number;
    upcoming: number;
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
    rate: number;
  };
  recent: DashboardRecentReservation[];
}

/**
 * Dashboard client backed by the real API (`/api/dashboard/overview`).
 * Server-computed reservation + room aggregates; revenue/sales/invoice/
 * expense sections intentionally stay on their existing mock services
 * (Finance backend deferred).
 */
class DashboardService {
  async getOverview(): Promise<DashboardOverview> {
    const json = await apiFetch<{ data: DashboardOverview }>('/api/dashboard/overview');
    return json.data;
  }
}

export const dashboardService = new DashboardService();
export default dashboardService;
