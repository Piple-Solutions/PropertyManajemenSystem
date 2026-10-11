import { ApiError, apiFetch, clearToken, getToken, setToken } from './api';

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface AuthResult {
  user: ApiUser;
  permissions: string[];
  token: string;
  expiresIn: number;
}

/**
 * Auth client backed by the real API (`POST /api/auth/*`, `GET /api/auth/me`).
 * Method names intentionally match the previous mock service so call sites
 * (`authStore`, password pages) keep working with minimal changes.
 */
class AuthService {
  async login(email: string, password: string): Promise<{ user: ApiUser; token: string } | null> {
    try {
      const json = await apiFetch<{ data: AuthResult }>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
        auth: false,
      });
      setToken(json.data.token);
      return { user: json.data.user, token: json.data.token };
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  }

  async logout(): Promise<void> {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Best effort — session ends client-side regardless.
    } finally {
      clearToken();
    }
  }

  async register(data: { name: string; email: string; password: string }): Promise<AuthResult | null> {
    try {
      const json = await apiFetch<{ data: AuthResult }>('/api/auth/register', {
        method: 'POST',
        body: data,
        auth: false,
      });
      setToken(json.data.token);
      return json.data;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) return null;
      throw err;
    }
  }

  /** Session restore — always verified against the backend (`GET /me`). */
  async restoreSession(): Promise<{ user: ApiUser; token: string } | null> {
    const token = getToken();
    if (!token) return null;
    try {
      const json = await apiFetch<{ data: { user: ApiUser; permissions: string[] } }>('/api/auth/me');
      return { user: json.data.user, token };
    } catch {
      clearToken();
      return null;
    }
  }

  /** Fresh permission set for the current session (used by PermissionContext). */
  async getMyPermissions(): Promise<string[]> {
    try {
      const json = await apiFetch<{ data: { user: ApiUser; permissions: string[] } }>('/api/auth/me');
      return json.data.permissions;
    } catch {
      return [];
    }
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean> {
    void userId; // identity comes from the Bearer token, never from the caller
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      return true;
    } catch {
      return false;
    }
  }

  async forgotPassword(email: string): Promise<{ message: string; resetToken?: string }> {
    const json = await apiFetch<{ data: { message: string; resetToken?: string } }>(
      '/api/auth/forgot-password',
      { method: 'POST', body: { email }, auth: false },
    );
    return json.data;
  }

  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: { token, newPassword },
        auth: false,
      });
      return true;
    } catch {
      return false;
    }
  }
}

export const authService = new AuthService();
export default authService;
