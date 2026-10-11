import { eq } from 'drizzle-orm';
import type { Context, Next } from 'hono';
import { users } from '../db/schema';
import type { AppDb } from '../db/client';
import type { AppEnv } from '../env';
import { unauthorized } from '../lib/errors';
import type { PublicRole, PublicUser } from '../lib/presenters';
import { verifyAccessToken } from '../lib/tokens';
import { loadAuthContext } from '../services/identity';

export interface AuthContext {
  user: PublicUser;
  roles: PublicRole[];
  permissions: string[];
}

type AuthVars = { auth: AuthContext; db: AppDb };

/**
 * Bearer authentication middleware.
 *
 * 1. Requires `Authorization: Bearer <JWT>`.
 * 2. Verifies signature + expiry (HS256, WebCrypto).
 * 3. Loads the user from D1 — rejects unknown or `inactive` users so
 *    deactivation takes effect immediately (no stale claims trusted).
 * 4. Resolves roles + effective permissions (union) and attaches them.
 */
export async function authenticate(c: Context<{ Bindings: AppEnv; Variables: AuthVars }>, next: Next) {
  const header = c.req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    throw unauthorized('Missing or malformed Authorization header');
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) throw unauthorized('Missing bearer token');

  let userId: string;
  let tokenVersion: number;
  try {
    const payload = await verifyAccessToken(token, c.env.JWT_SECRET);
    userId = payload.sub;
    tokenVersion = payload.tv;
  } catch {
    throw unauthorized('Invalid or expired token');
  }

  const db = c.get('db');
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const row = rows[0];
  if (!row) throw unauthorized('User no longer exists');
  if (row.status !== 'active') throw unauthorized('User is inactive');
  if (typeof tokenVersion !== 'number' || row.tokenVersion !== tokenVersion) {
    throw unauthorized('Token has been invalidated (password changed)');
  }

  const auth = await loadAuthContext(db, row.id);
  if (!auth) throw unauthorized('User no longer exists');
  c.set('auth', auth);
  await next();
}

/**
 * Read the attached identity inside protected handlers. The parameter is
 * deliberately structural: Hono intersects context types as middleware
 * composes, so handlers pass their own context straight through.
 */
export function getAuth(c: { get(key: 'auth'): AuthContext }): AuthContext {
  return c.get('auth');
}
