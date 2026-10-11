import type { AuthContext } from '../middleware/auth';

/**
 * Shared audit-hook helpers. Every hook runs server-side AFTER a trusted
 * mutation succeeds, using the authenticated actor (or the freshly
 * authenticated user for login/register) — the frontend can never write
 * audit rows directly (no POST/PATCH/DELETE activity endpoints exist).
 */

/** Point-in-time actor snapshot for the audit row. */
export function auditActor(auth: AuthContext): { id: string; name: string } {
  return { id: auth.user.id, name: auth.user.name };
}

type HeaderReader = { req: { header: (name: string) => string | undefined } };

/** Best-effort client IP: Cloudflare connecting IP, else first forwarded hop. */
export function auditIp(c: HeaderReader): string | undefined {
  const cf = c.req.header('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return undefined;
}

/** `admin@hotel.com` -> `a***@hotel.com` (audit/log PII masking). */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.?[A-Za-z0-9_-]*/g;
const BCRYPT_RE = /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{20,}/g;
const LONG_TOKEN_RE = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43,}(?![A-Za-z0-9_-])/g;

/** Mask emails, bearer/JWT tokens, bcrypt hashes and long opaque tokens in free text. */
export function maskPii(text: string): string {
  return text
    .replace(BEARER_RE, 'Bearer [token]')
    .replace(JWT_RE, '[token]')
    .replace(BCRYPT_RE, '[hash]')
    .replace(EMAIL_RE, (m) => maskEmail(m))
    .replace(LONG_TOKEN_RE, '[token]');
}

/**
 * Run a best-effort background task: `waitUntil` when the platform provides
 * an execution context (Workers), otherwise await it (tests/Node). Never
 * throws: auditing must not change the HTTP outcome.
 */
export async function runDeferred(
  c: { executionCtx: { waitUntil(promise: Promise<unknown>): void } },
  task: () => Promise<unknown>,
): Promise<void> {
  const safe = task().catch((err) => {
    console.error(JSON.stringify({ level: 'warn', event: 'audit_write_failed', message: maskPii(String((err as Error)?.message ?? err)) }));
  });
  try {
    c.executionCtx.waitUntil(safe);
  } catch {
    await safe;
  }
}

/** Flatten `{a:1}` into `{before_a:'1'}` (string values only, as the audit metadata contract requires). */
export function withPrefix(prefix: 'before' | 'after', values: Record<string, string | number | boolean | null | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) out[`${prefix}_${k}`] = v === null || v === undefined ? '' : String(v);
  return out;
}
