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
