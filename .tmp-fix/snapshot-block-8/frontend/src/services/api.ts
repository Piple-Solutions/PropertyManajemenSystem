/**
 * Minimal REST client for the PMS backend (Cloudflare Workers + Hono).
 *
 * - Base URL from `VITE_API_URL` (see `frontend/.env.example`).
 *   Defaults to `http://localhost:8787` (`wrangler dev`).
 * - Auth via `Authorization: Bearer <JWT>` stored in `localStorage`.
 * - Backend envelope: `{ data }` (+ `{ pagination }` for lists).
 *
 * NOTE on token storage: the JWT lives in `localStorage` to match the
 * existing AuthContext architecture (survives reloads, no cookie infra on
 * Workers static hosting). This is NOT equivalent to an HttpOnly Secure
 * cookie — XSS would expose it. Documented limitation; mitigations are
 * short expiry (1h) + server-side permission checks on every request.
 */

export const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8787';

const TOKEN_KEY = 'pms_token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable — session will not persist */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  // Legacy keys from the mock era — never store passwords or user blobs.
  try {
    localStorage.removeItem('pms_user');
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  status: number;
  errors?: Record<string, string[]>;

  constructor(status: number, message: string, errors?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Send `Authorization: Bearer` (default true). */
  auth?: boolean;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the API server. Is the backend running?');
  }
  if (res.status === 204) return undefined as T;
  let json: Record<string, unknown> | null = null;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const message =
      (json?.message as string | undefined) || `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message, json?.errors as Record<string, string[]> | undefined);
  }
  return (json ?? undefined) as T;
}

/** Flatten `{ field: [msgs] }` into a single display string. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.errors) {
      const parts = Object.values(err.errors).flat();
      if (parts.length > 0) return parts.join(' ');
    }
    return err.message || fallback;
  }
  return fallback;
}
