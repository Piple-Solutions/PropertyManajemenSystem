import type { Context, Next } from 'hono';
import { ApiError } from './errors';

/**
 * Perimeter hardening helpers (Block 1: BE-001, BE-005, BE-006, BE-008, BE-014).
 * Everything here is in-code: no env vars, no D1 access, no extra statements.
 */

/**
 * BE-001: public self-registration is closed. Staff accounts are created by
 * an administrator (`POST /api/users`). Kept as an in-code constant (not an
 * env var) so a stray dashboard variable can never re-open it.
 */
export const PUBLIC_REGISTRATION_ENABLED = false;

export const REGISTRATION_CLOSED_MESSAGE =
  'Pendaftaran akun publik dinonaktifkan. Hubungi administrator untuk dibuatkan akun.';

export const SECRET_MISCONFIGURED_MESSAGE =
  'Konfigurasi server tidak aman: JWT_SECRET belum diatur dengan benar. Hubungi administrator.';

export const TOO_MANY_ATTEMPTS_MESSAGE = 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0']);

/** True when the request was addressed to a local development host. */
export function isLocalhostUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return LOCAL_HOSTS.has(host) || host.endsWith('.localhost');
  } catch {
    return false;
  }
}

/**
 * BE-005: only KNOWN placeholders and empty values are rejected. Matching is
 * by tell-tale fragments (the example file ships an obviously-fake value), so
 * a real secret that is merely short is never rejected, only warned about.
 */
const PLACEHOLDER_FRAGMENTS = [
  'change-me',
  'changeme',
  'change_me',
  'insecure',
  'dev-only',
  'placeholder',
  'your-secret',
  'your_secret',
  'yoursecret',
  'secret-here',
  'replace-me',
  'replaceme',
  'example',
];

export function isPlaceholderSecret(secret: string | undefined | null): boolean {
  if (typeof secret !== 'string') return true;
  const value = secret.trim().toLowerCase();
  if (value.length === 0) return true;
  return PLACEHOLDER_FRAGMENTS.some((fragment) => value.includes(fragment));
}

let shortSecretWarned = false;

/**
 * Hono middleware: fail closed on a placeholder/empty `JWT_SECRET` for any
 * non-localhost request. A merely short secret only logs a warning once.
 */
export function jwtSecretGuard() {
  return async (c: Context, next: Next) => {
    const secret = (c.env as { JWT_SECRET?: string } | undefined)?.JWT_SECRET;
    if (isPlaceholderSecret(secret)) {
      if (!isLocalhostUrl(c.req.url)) throw new ApiError(500, SECRET_MISCONFIGURED_MESSAGE);
    } else if (!shortSecretWarned && (secret as string).length < 32) {
      shortSecretWarned = true;
      console.warn('JWT_SECRET is shorter than 32 characters; rotate to a longer random value.');
    }
    await next();
  };
}

/** BE-014: defence-in-depth response headers (no behavior change for clients). */
export function securityHeaders() {
  return async (c: Context, next: Next) => {
    await next();
    const h = c.res.headers;
    h.set('X-Content-Type-Options', 'nosniff');
    h.set('X-Frame-Options', 'DENY');
    h.set('Referrer-Policy', 'no-referrer');
    if (!h.has('Cache-Control') && !c.req.path.startsWith('/api/public') && c.req.path !== '/api/health') {
      h.set('Cache-Control', 'no-store');
    }
    if (c.req.url.startsWith('https://')) {
      h.set('Strict-Transport-Security', 'max-age=15552000');
    }
  };
}

/** Best-effort client address for throttling keys. */
export function clientAddress(headers: { header: (name: string) => string | undefined }): string {
  const cf = headers.header('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const fwd = headers.header('x-forwarded-for')?.split(',')[0]?.trim();
  return fwd || 'unknown';
}

/**
 * BE-006: best-effort, per-isolate attempt limiter.
 *
 * - Key = client address + identifier (so shared-NAT users are not locked out
 *   by each other's typos on different accounts).
 * - Generous limits; only FAILURES count for login; a success clears the key.
 * - No D1 writes. State lives in memory of the isolate, so it is a speed bump,
 *   not a guarantee: real protection is a Cloudflare rate-limiting rule
 *   (owner action, see handover).
 */
export class AttemptLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly maxKeys = 5000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Seconds until the key may try again, or 0 when it is not blocked. */
  blockedFor(key: string): number {
    const entry = this.hits.get(key);
    if (!entry) return 0;
    const t = this.now();
    if (entry.resetAt <= t) {
      this.hits.delete(key);
      return 0;
    }
    return entry.count >= this.max ? Math.ceil((entry.resetAt - t) / 1000) : 0;
  }

  recordFailure(key: string): void {
    const t = this.now();
    const entry = this.hits.get(key);
    if (entry && entry.resetAt > t) {
      entry.count += 1;
      return;
    }
    if (this.hits.size >= this.maxKeys) this.prune(t);
    if (this.hits.size >= this.maxKeys) {
      // Still full of live entries: drop the oldest instead of growing.
      const oldest = this.hits.keys().next().value;
      if (oldest !== undefined) this.hits.delete(oldest);
    }
    this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
  }

  clear(key: string): void {
    this.hits.delete(key);
  }

  private prune(t: number): void {
    for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
  }
}

export function tooManyAttempts(retryAfterSeconds: number): ApiError {
  const err = new ApiError(429, TOO_MANY_ATTEMPTS_MESSAGE);
  (err as ApiError & { retryAfter?: number }).retryAfter = retryAfterSeconds;
  return err;
}
