import { Hono } from 'hono';
import type { AppEnv } from '../env';
import type { AppDb } from '../db/client';
import { ok } from '../lib/errors';
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

auth.post('/login', async (c) => {
  const body = parseOr422(loginSchema, await c.req.json().catch(() => ({})));
  const result = await login(c.get('db'), c.env, body.email, body.password);
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
  const { resetToken } = await forgotPassword(c.get('db'), c.env, body.email);
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
  const { userId, userName } = await resetPassword(c.get('db'), body.token, body.newPassword);
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
