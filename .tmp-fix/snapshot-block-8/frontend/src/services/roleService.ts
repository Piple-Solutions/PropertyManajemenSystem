import { apiFetch } from './api';

export interface RolePayload {
  name: string;
  description?: string;
  permissions?: string[];
  status?: 'active' | 'inactive';
}

/**
 * Role management client (`/api/roles`). `update` also syncs `permissions`
 * through `PUT /:id/permissions` when present, preserving the single-call
 * usage in `RoleForm`.
 */
class RoleService {
  async getAll(): Promise<any[]> {
    const json = await apiFetch<{ data: any[] }>('/api/roles?page=1&pageSize=100');
    return json.data;
  }

  async getById(id: string): Promise<any | undefined> {
    try {
      const json = await apiFetch<{ data: any }>(`/api/roles/${encodeURIComponent(id)}`);
      return json.data;
    } catch {
      return undefined;
    }
  }

  async create(data: RolePayload): Promise<any> {
    const json = await apiFetch<{ data: any }>('/api/roles', { method: 'POST', body: data });
    return json.data;
  }

  async update(id: string, updates: RolePayload & Record<string, unknown>): Promise<any | null> {
    try {
      const { permissions, ...base } = updates as RolePayload & { permissions?: string[] };
      const json = await apiFetch<{ data: any }>(`/api/roles/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: base,
      });
      if (permissions !== undefined) {
        await this.setPermissions(id, permissions);
        const refreshed = await this.getById(id);
        return refreshed ?? json.data;
      }
      return json.data;
    } catch {
      return null;
    }
  }

  async setPermissions(id: string, permissions: string[]): Promise<any | null> {
    try {
      const json = await apiFetch<{ data: any }>(`/api/roles/${encodeURIComponent(id)}/permissions`, {
        method: 'PUT',
        body: { permissions },
      });
      return json.data;
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await apiFetch(`/api/roles/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return true;
    } catch {
      return false;
    }
  }
}

export const roleService = new RoleService();
export default roleService;
