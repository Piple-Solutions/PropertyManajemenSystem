/**
 * Worker environment bindings.
 *
 * - `DB`: D1 database binding (configured in `wrangler.jsonc`).
 * - `JWT_SECRET`: signing secret — MUST come from `wrangler secret put`,
 *   never from source code. `.dev.vars` only for local dev.
 * - `JWT_EXPIRES_IN`: access-token lifetime in seconds (default 3600).
 * - `RESET_TOKEN_TTL_MIN`: password-reset token lifetime in minutes (default 15).
 * - `FRONTEND_ORIGIN`: comma-separated CORS allowlist (default localhost:5173).
 */
export interface AppEnv {
  DB: D1Database;
  JWT_SECRET: string;
  JWT_EXPIRES_IN?: string;
  RESET_TOKEN_TTL_MIN?: string;
  FRONTEND_ORIGIN?: string;
  /**
   * Upstream Indonesian-holiday feed used by `GET /api/public/holidays`.
   * Defaults to the community calendar.json dataset (see
   * `services/holidayService.ts`). Override to point at a mirror or the
   * richer SKB-3-Menteri feed.
   */
  HOLIDAY_SOURCE_URL?: string;
  /**
   * Local-dev / test only. When `'true'`, `POST /api/auth/forgot-password`
   * returns the raw reset token so the flow is testable without an email
   * provider. NEVER set in production.
   */
  DEV_EXPOSE_RESET_TOKEN?: string;
}

export function getJwtExpiresIn(env: AppEnv): number {
  const v = Number(env.JWT_EXPIRES_IN ?? '3600');
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 3600;
}

export function getResetTtlMin(env: AppEnv): number {
  const v = Number(env.RESET_TOKEN_TTL_MIN ?? '15');
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 15;
}

export function getAllowedOrigins(env: AppEnv): string[] {
  const raw = env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
