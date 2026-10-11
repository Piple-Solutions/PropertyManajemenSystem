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
export const API_BASE_URL = ({}).VITE_API_URL?.replace(/\/$/, '') ||
    'http://localhost:8787';
const TOKEN_KEY = 'pms_token';
export function getToken() {
    try {
        return localStorage.getItem(TOKEN_KEY);
    }
    catch {
        return null;
    }
}
export function setToken(token) {
    unauthorizedFired = false; // a new session may be expired again later
    try {
        localStorage.setItem(TOKEN_KEY, token);
    }
    catch {
        /* storage unavailable — session will not persist */
    }
}
export function clearToken() {
    try {
        localStorage.removeItem(TOKEN_KEY);
    }
    catch {
        /* ignore */
    }
    // Legacy keys from the mock era — never store passwords or user blobs.
    try {
        localStorage.removeItem('pms_user');
    }
    catch {
        /* ignore */
    }
}
/**
 * FE-003: one global 401 policy for AUTHENTICATED calls. When a request that
 * carried a Bearer token comes back 401 (expired / invalidated token) the
 * stored token is cleared and the registered handler (AuthProvider) flips the
 * session to logged-out, which sends protected pages to the login screen with
 * `returnTo`. It fires at most once per session, so several in-flight
 * requests cannot loop. The login call itself is never affected (it is sent
 * without a token) and network/5xx errors never reach this path.
 */
let unauthorizedFired = false;
let unauthorizedHandler = null;
export function setUnauthorizedHandler(handler) {
    unauthorizedHandler = handler;
}
function handleUnauthorized() {
    if (unauthorizedFired)
        return;
    unauthorizedFired = true;
    clearToken();
    try {
        unauthorizedHandler?.();
    }
    catch {
        /* a failing handler must not mask the original API error */
    }
}
export class ApiError extends Error {
    constructor(status, message, errors) {
        super(message);
        this.status = status;
        this.errors = errors;
    }
}
export async function apiFetch(path, options = {}) {
    const { method = 'GET', body, auth = true } = options;
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
        const token = getToken();
        if (token)
            headers.Authorization = `Bearer ${token}`;
    }
    const sentToken = Boolean(headers.Authorization);
    let res;
    try {
        res = await fetch(`${API_BASE_URL}${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    }
    catch {
        throw new ApiError(0, 'Cannot reach the API server. Is the backend running?');
    }
    if (res.status === 204)
        return undefined;
    let json = null;
    try {
        json = (await res.json());
    }
    catch {
        /* non-JSON body */
    }
    if (res.status === 401 && sentToken)
        handleUnauthorized();
    if (!res.ok) {
        const message = json?.message || `Request failed with status ${res.status}`;
        throw new ApiError(res.status, message, json?.errors);
    }
    return (json ?? undefined);
}
/** Flatten `{ field: [msgs] }` into a single display string. */
export function apiErrorMessage(err, fallback) {
    if (err instanceof ApiError) {
        if (err.errors) {
            const parts = Object.values(err.errors).flat();
            if (parts.length > 0)
                return parts.join(' ');
        }
        return err.message || fallback;
    }
    return fallback;
}
/**
 * FE-002: list endpoints cap `pageSize` at 100, so a single request silently
 * truncates the table. This follows `pagination.total` and concatenates the
 * pages (same row shape as one big page). Bounded by `maxPages` so a very
 * large table cannot trigger an unbounded request storm; the backend orders
 * rows deterministically (BE-035), so pages do not overlap or skip.
 * With <= 100 rows it issues exactly the single request it always did.
 */
export async function fetchAllPages(path, options = {}) {
    const pageSize = options.pageSize ?? 100;
    const maxPages = options.maxPages ?? 20;
    const joiner = path.includes('?') ? '&' : '?';
    const rows = [];
    for (let page = 1; page <= maxPages; page += 1) {
        const json = await apiFetch(`${path}${joiner}page=${page}&pageSize=${pageSize}`);
        const batch = json.data ?? [];
        rows.push(...batch);
        const total = json.pagination?.total ?? rows.length;
        if (batch.length < pageSize || rows.length >= total)
            break;
    }
    return rows;
}
