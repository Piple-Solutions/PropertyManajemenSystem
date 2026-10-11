import { ApiError, apiFetch, clearToken, getToken, setToken } from './api.mjs';
/**
 * Auth client backed by the real API (`POST /api/auth/*`, `GET /api/auth/me`).
 * Method names intentionally match the previous mock service so call sites
 * (`authStore`, password pages) keep working with minimal changes.
 */
class AuthService {
    async login(email, password) {
        try {
            const json = await apiFetch('/api/auth/login', {
                method: 'POST',
                body: { email, password },
                auth: false,
            });
            setToken(json.data.token);
            return { user: json.data.user, token: json.data.token };
        }
        catch (err) {
            // X-005: bad credentials stay `null` (the store shows its usual text);
            // any OTHER 401 message from the backend (e.g. "User is inactive") is
            // passed through so the user learns why the login was refused.
            if (err instanceof ApiError && err.status === 401 && err.message === 'Invalid email or password')
                return null;
            throw err;
        }
    }
    async logout() {
        try {
            await apiFetch('/api/auth/logout', { method: 'POST' });
        }
        catch {
            // Best effort — session ends client-side regardless.
        }
        finally {
            clearToken();
        }
    }
    async register(data) {
        try {
            const json = await apiFetch('/api/auth/register', {
                method: 'POST',
                body: data,
                auth: false,
            });
            setToken(json.data.token);
            return json.data;
        }
        catch (err) {
            if (err instanceof ApiError && err.status === 409)
                return null;
            throw err;
        }
    }
    /** Session restore — always verified against the backend (`GET /me`). */
    async restoreSession() {
        const token = getToken();
        if (!token)
            return null;
        try {
            const json = await apiFetch('/api/auth/me');
            return { user: json.data.user, token };
        }
        catch (err) {
            // FE-003: only a 401 means the session is gone. A network blip or a 5xx
            // must not wipe the stored token (the next load can retry).
            if (err instanceof ApiError && err.status === 401)
                clearToken();
            return null;
        }
    }
    /** Fresh permission set for the current session (used by PermissionContext). */
    async getMyPermissions() {
        // FE-003: errors propagate. The permission store keeps the last known set
        // when this rejects, and a 401 is handled globally by `apiFetch`.
        const json = await apiFetch('/api/auth/me');
        return json.data.permissions;
    }
    async changePassword(userId, currentPassword, newPassword) {
        void userId; // identity comes from the Bearer token, never from the caller
        try {
            await apiFetch('/api/auth/change-password', {
                method: 'POST',
                body: { currentPassword, newPassword },
            });
            return true;
        }
        catch {
            return false;
        }
    }
    async forgotPassword(email) {
        const json = await apiFetch('/api/auth/forgot-password', { method: 'POST', body: { email }, auth: false });
        return json.data;
    }
    async resetPassword(token, newPassword) {
        try {
            await apiFetch('/api/auth/reset-password', {
                method: 'POST',
                body: { token, newPassword },
                auth: false,
            });
            return true;
        }
        catch {
            return false;
        }
    }
}
export const authService = new AuthService();
export default authService;
