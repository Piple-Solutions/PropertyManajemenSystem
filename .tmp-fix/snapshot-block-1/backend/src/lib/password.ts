import { compareSync, hashSync } from 'bcryptjs';

/**
 * Password hashing for Cloudflare Workers.
 *
 * `bcryptjs` is pure JavaScript (no Node native bindings), so it runs in the
 * Workers runtime where `node:crypto` scrypt, native bcrypt, and argon2 are
 * unavailable. The *Sync variants are used deliberately: they are pure CPU
 * work with no timers/`process.nextTick` dependency, which keeps behavior
 * identical in Workers, Node, and Vitest.
 *
 * Cost 10 ≈ ~80ms per hash — suitable for login/register frequency.
 */
const COST = 10;

export function hashPassword(plain: string): string {
  return hashSync(plain, COST);
}

export function verifyPassword(plain: string, hash: string): boolean {
  if (!plain || !hash) return false;
  try {
    return compareSync(plain, hash);
  } catch {
    return false;
  }
}
