import { sign, verify } from 'hono/jwt';

/**
 * JWT handling (HS256 via WebCrypto — Workers-compatible).
 *
 * Payload contains ONLY the subject (`sub` = user id). Roles/permissions are
 * NEVER embedded: the auth middleware reloads them from D1 on every request
 * so revocations and role changes take effect immediately.
 */
export interface AccessPayload {
  sub: string;
  /** Must equal `users.token_version` — enforced per request. */
  tv: number;
  iat: number;
  exp: number;
}

export async function issueAccessToken(
  userId: string,
  secret: string,
  expiresInSec: number,
  tokenVersion: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: userId, tv: tokenVersion, iat: now, exp: now + expiresInSec }, secret, 'HS256');
}

export async function verifyAccessToken(token: string, secret: string): Promise<AccessPayload> {
  const payload = (await verify(token, secret, 'HS256')) as unknown as AccessPayload;
  if (!payload || typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('Invalid token payload');
  }
  return payload;
}

/** Password-reset tokens: 256-bit random, base64url, transported to the user. */
export function generateResetToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Only this SHA-256 hex digest is persisted (single-use + expiry enforced in DB). */
export async function hashResetToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newId(prefix?: string): string {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}-${id.slice(0, 8)}` : id;
}

export function nowIso(): string {
  return new Date().toISOString();
}
