import { Hono } from 'hono';
import type { AppEnv } from '../env';
import type { AppDb } from '../db/client';
import { forbidden, ok } from '../lib/errors';
import {
  AttemptLimiter,
  PUBLIC_REGISTRATION_ENABLED,
  REGISTRATION_CLOSED_MESSAGE,
  clientAddress,
  isLocalhostUrl,
  tooManyAttempts,
} from '../lib/security';
import { auditActor, auditIp } from '../lib/audit';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  parseOr422,
  registerSchema,
  resetPasswordSchema,
} from '../lib/validation';
import { authenticate, getAuth, type AuthContext } from '../middleware/auth';
import {
  changePassword,
  forgotPassword,
  login,
  register,
  resetPassword,
} from '../services/authService';
import { recordActivity } from '../services/activityService';

type Vars = { db: AppDb; auth: AuthContext };

const auth = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

/**
 * BE-006: in-isolate, best-effort throttles (no D1 writes). Keyed by
 * client address + identifier; generous so shared-NAT users are never locked
 * out by ordinary typos. Real protection = Cloudflare rate-limiting rule.
 */
const WINDOW_MS = 10 * 60_000;
const loginFailures = new AttemptLimiter(20, WINDOW_MS);
const forgotRequests = new AttemptLimiter(10, WINDOW_MS);
const resetFailures = new AttemptLimiter(20, WINDOW_MS);

auth.post('/login', async (c) => {
  const body = parseOr422(loginSchema, await c.req.json().catch(() => ({})));
  const key = `${clientAddress(c.req)}|${body.email}`;
  const wait = loginFailures.blockedFor(key);
  if (wait > 0) {
    c.header('Retry-After', String(wait));
    throw tooManyAttempts(wait);
  }
  let result;
  try {
    result = await login(c.get('db'), c.env, body.email, body.password);
  } catch (err) {
    if ((err as { status?: number }).status === 401) loginFailures.recordFailure(key);
    throw err;
  }
  loginFailures.clear(key);
  await recordActivity(c.get('db'), {
    category: 'authentication',
    action: 'login',
    description: `${result.user.name} logged in`,
    userId: result.user.id,
    userName: result.user.name,
    metadata: { email: result.user.email },
    ipAddress: auditIp(c),
  });
  return ok(c, result);
});

auth.post('/register', async (c) => {
  // BE-001: public self-registration is closed (in-code constant, no env var).
  if (!PUBLIC_REGISTRATION_ENABLED) throw forbidden(REGISTRATION_CLOSED_MESSAGE);
  const body = parseOr422(registerSchema, await c.req.json().catch(() => ({})));
  const result = await register(c.get('db'), c.env, body);
  await recordActivity(c.get('db'), {
    category: 'authentication',
    action: 'register',
    description: `${result.user.name} registered a new account`,
    userId: result.user.id,
    userName: result.user.name,
    metadata: { email: result.user.email },
    ipAddress: auditIp(c),
  });
  return c.json({ data: result }, 201);
});

/**
 * Stateless JWT logout: the server cannot revoke the token itself, so logout
 * discards credentials on the client (and the frontend MUST delete the stored
 * token). The endpoint exists so clients have a single place to terminate the
 * session; future server-side blocklisting can hook in here.
 */
auth.post('/logout', authenticate, async (c) => {
  const actor = auditActor(getAuth(c));
  await recordActivity(c.get('db'), {
    category: 'authentication',
    action: 'logout',
    description: `${actor.name} logged out`,
    userId: actor.id,
    userName: actor.name,
    ipAddress: auditIp(c),
  });
  return ok(c, { message: 'Logged out. Discard the access token on the client.' });
});

auth.get('/me', authenticate, async (c) => {
  const ctx = getAuth(c);
  return ok(c, { user: ctx.user, permissions: ctx.permissions });
});

auth.post('/change-password', authenticate, async (c) => {
  const body = parseOr422(changePasswordSchema, await c.req.json().catch(() => ({})));
  const ctx = getAuth(c);
  await changePassword(c.get('db'), ctx.user.id, body.currentPassword, body.newPassword);
  const actor = auditActor(ctx);
  await recordActivity(c.get('db'), {
    category: 'authentication',
    action: 'password_change',
    description: `${actor.name} changed password`,
    userId: actor.id,
    userName: actor.name,
    ipAddress: auditIp(c),
  });
  return ok(c, { message: 'Password changed. Please log in again with the new password.' });
});

auth.post('/forgot-password', async (c) => {
  const body = parseOr422(forgotPasswordSchema, await c.req.json().catch(() => ({})));
  const key = `${clientAddress(c.req)}|${body.email}`;
  const wait = forgotRequests.blockedFor(key);
  if (wait > 0) {
    c.header('Retry-After', String(wait));
    throw tooManyAttempts(wait);
  }
  forgotRequests.recordFailure(key); // counts every request: it is the abuse signal here
  // BE-008: the dev flag only takes effect for a localhost origin.
  const { resetToken } = await forgotPassword(c.get('db'), c.env, body.email, isLocalhostUrl(c.req.url));
  // Generic message regardless of outcome — prevents account enumeration.
  // No audit row: the caller is unauthenticated and the outcome is
  // intentionally indistinguishable, so there is no trustworthy actor.
  const data: { message: string; resetToken?: string } = {
    message: 'If an account with that email exists, reset instructions have been sent.',
  };
  if (resetToken) data.resetToken = resetToken; // dev-only flag, see service
  return ok(c, data);
});

auth.post('/reset-password', async (c) => {
  const body = parseOr422(resetPasswordSchema, await c.req.json().catch(() => ({})));
  const resetKey = `${clientAddress(c.req)}|reset`;
  const resetWait = resetFailures.blockedFor(resetKey);
  if (resetWait > 0) {
    c.header('Retry-After', String(resetWait));
    throw tooManyAttempts(resetWait);
  }
  let userId: string;
  let userName: string;
  try {
    ({ userId, userName } = await resetPassword(c.get('db'), body.token, body.newPassword));
  } catch (err) {
    if ((err as { status?: number }).status === 422) resetFailures.recordFailure(resetKey);
    throw err;
  }
  await recordActivity(c.get('db'), {
    category: 'authentication',
    action: 'password_change',
    description: `${userName} reset password`,
    userId,
    userName,
    ipAddress: auditIp(c),
  });
  return ok(c, { message: 'Password reset successfully. Please log in.' });
});

export default auth;
