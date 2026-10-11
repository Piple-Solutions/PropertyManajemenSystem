import type { Context, Next } from 'hono';
import type { AppEnv } from '../env';
import { forbidden } from '../lib/errors';
import type { AuthContext } from './auth';

type RbacVars = { auth: AuthContext };

export function hasPermission(granted: string[], required: string): boolean {
  return granted.includes(required);
}

/**
 * Require ALL listed permissions (403 otherwise).
 * Use for single-permission endpoints: `requirePermissions('user.create')`.
 */
export function requirePermissions(...required: string[]) {
  return async (c: Context<{ Bindings: AppEnv; Variables: RbacVars }>, next: Next) => {
    const auth = c.get('auth');
    const missing = required.filter((p) => !hasPermission(auth.permissions, p));
    if (missing.length > 0) {
      throw forbidden(`Missing required permission(s): ${missing.join(', ')}`);
    }
    await next();
  };
}

/**
 * Require ANY of the listed permissions (403 otherwise).
 * Mirrors the frontend `<RequirePermission anyOf={...}>` route guards.
 */
export function requireAnyPermission(...candidates: string[]) {
  return async (c: Context<{ Bindings: AppEnv; Variables: RbacVars }>, next: Next) => {
    const auth = c.get('auth');
    if (!candidates.some((p) => hasPermission(auth.permissions, p))) {
      throw forbidden(`Requires any of: ${candidates.join(', ')}`);
    }
    await next();
  };
}
