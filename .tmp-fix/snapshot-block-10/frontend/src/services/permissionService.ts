import { apiFetch } from './api';

/**
 * Permission catalog client (`GET /api/permissions`).
 * The catalog is read-only on the backend (seeded from mock data), so the
 * previous mock-only create/update/delete helpers were removed.
 */
class PermissionService {
  async getAll(): Promise<any[]> {
    const json = await apiFetch<{ data: any[] }>('/api/permissions');
    return json.data;
  }

  async getById(id: string): Promise<any | undefined> {
    const all = await this.getAll();
    return all.find((p: any) => p.id === id);
  }

  async getByName(name: string): Promise<any | undefined> {
    const all = await this.getAll();
    return all.find((p: any) => p.name === name);
  }
}

export const permissionService = new PermissionService();
export default permissionService;
