import { apiFetch } from './api';
import { roleService } from './roleService';

export interface UserPayload {
  name: string;
  email: string;
  password?: string;
  roles: string[];
  status?: 'active' | 'inactive';
}

/**
 * User management client (`/api/users`). Async — call sites use
 * `useEffect` + state. Names match the previous mock-backed service.
 */
class UserService {
  async getAll(): Promise<any[]> {
    const json = await apiFetch<{ data: any[] }>('/api/users?page=1&pageSize=100');
    return json.data;
  }

  async getById(id: string): Promise<any | undefined> {
    try {
      const json = await apiFetch<{ data: any }>(`/api/users/${encodeURIComponent(id)}`);
      return json.data;
    } catch {
      return undefined;
    }
  }

  async create(data: UserPayload & { password: string }): Promise<any> {
    const json = await apiFetch<{ data: any }>('/api/users', { method: 'POST', body: data });
    return json.data;
  }

  async update(id: string, updates: Partial<UserPayload>): Promise<any | null> {
    try {
      const json = await apiFetch<{ data: any }>(`/api/users/${encodeURIComponent(id)}`, {
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
      await apiFetch(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return true;
    } catch {
      return false;
    }
  }

  async toggleStatus(id: string): Promise<boolean> {
    const user = await this.getById(id);
    if (!user) return false;
    const next = user.status === 'active' ? 'inactive' : 'active';
    try {
      await apiFetch(`/api/users/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: { status: next },
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Effective permissions = union of permission names across the user's roles. */
  async getUserPermissions(userId: string): Promise<string[]> {
    const user = await this.getById(userId);
    if (!user || !Array.isArray(user.roles)) return [];
    const set = new Set<string>();
    for (const roleId of user.roles as string[]) {
      const role = await roleService.getById(roleId);
      if (role && Array.isArray(role.permissions)) {
        for (const p of role.permissions as string[]) set.add(p);
      }
    }
    return [...set];
  }
}

export const userService = new UserService();
export default userService;
