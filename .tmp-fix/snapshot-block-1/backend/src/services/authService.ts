import { and, eq, gt, isNull } from 'drizzle-orm';
import { passwordResetTokens, userRoles, users } from '../db/schema';
import type { AppDb } from '../db/client';
import type { AppEnv } from '../env';
import { getJwtExpiresIn, getResetTtlMin } from '../env';
import { conflict, notFound, unauthorized, unprocessable } from '../lib/errors';
import { hashPassword, verifyPassword } from '../lib/password';
import { toPublicUser } from '../lib/presenters';
import { generateResetToken, hashResetToken, issueAccessToken, newId, nowIso } from '../lib/tokens';
import { loadAuthContext } from './identity';

/** Frontend default role for self-registration (matches mock `role-003` Staff). */
export const DEFAULT_REGISTER_ROLE_ID = 'role-003';

export interface LoginResult {
  user: ReturnType<typeof toPublicUser>;
  permissions: string[];
  token: string;
  expiresIn: number;
}

export async function login(db: AppDb, env: AppEnv, email: string, password: string): Promise<LoginResult> {
  const normalized = email.trim().toLowerCase();
  const rows = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;

  // Generic message — do not reveal whether the email exists.
  if (!row || !verifyPassword(password, row.passwordHash)) {
    throw unauthorized('Invalid email or password');
  }
  if (row.status !== 'active') {
    throw unauthorized('User is inactive');
  }

  const now = nowIso();
  await db.update(users).set({ lastLoginAt: now, updatedAt: now }).where(eq(users.id, row.id));

  const ctx = await loadAuthContext(db, row.id);
  if (!ctx) throw unauthorized('Invalid email or password');

  const expiresIn = getJwtExpiresIn(env);
  const token = await issueAccessToken(row.id, env.JWT_SECRET, expiresIn, row.tokenVersion);
  return { user: ctx.user, permissions: ctx.permissions, token, expiresIn };
}

export async function register(
  db: AppDb,
  env: AppEnv,
  input: { name: string; email: string; password: string },
): Promise<LoginResult> {
  const normalized = input.email.trim().toLowerCase();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, normalized)).limit(1);
  if (existing.length > 0) {
    throw conflict('Email already registered', { email: ['Email already registered'] });
  }

  const now = nowIso();
  const id = newId('user');
  await db.insert(users).values({
    id,
    name: input.name.trim(),
    email: normalized,
    passwordHash: hashPassword(input.password),
    status: 'active',
    tokenVersion: 0,
    createdAt: now,
    updatedAt: now,
  });
  // Public registration assigns ONLY the default Staff role — never admin.
  await db.insert(userRoles).values({ userId: id, roleId: DEFAULT_REGISTER_ROLE_ID });

  const ctx = await loadAuthContext(db, id);
  if (!ctx) throw unprocessable('Registration failed');
  const expiresIn = getJwtExpiresIn(env);
  const token = await issueAccessToken(id, env.JWT_SECRET, expiresIn, 0);
  return { user: ctx.user, permissions: ctx.permissions, token, expiresIn };
}

export async function changePassword(
  db: AppDb,
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('User not found');
  if (!verifyPassword(currentPassword, row.passwordHash)) {
    throw unprocessable('Current password is incorrect', { currentPassword: ['Current password is incorrect'] });
  }
  await db
    .update(users)
    .set({
      passwordHash: hashPassword(newPassword),
      tokenVersion: row.tokenVersion + 1,
      updatedAt: nowIso(),
    })
    .where(eq(users.id, userId));
}

/**
 * Forgot-password: ALWAYS succeeds with a generic message (anti-enumeration).
 * Returns the raw token ONLY when `DEV_EXPOSE_RESET_TOKEN === 'true'`
 * (local development / tests). Production must deliver the token via email —
 * see README "Password reset without an email provider".
 */
export async function forgotPassword(
  db: AppDb,
  env: AppEnv,
  email: string,
): Promise<{ resetToken?: string }> {
  const normalized = email.trim().toLowerCase();
  const rows = await db
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row || row.status !== 'active') return {};

  const token = generateResetToken();
  const ttlMin = getResetTtlMin(env);
  const now = new Date();
  await db.insert(passwordResetTokens).values({
    id: newId('rst'),
    userId: row.id,
    tokenHash: await hashResetToken(token),
    expiresAt: new Date(now.getTime() + ttlMin * 60_000).toISOString(),
    createdAt: now.toISOString(),
  });

  if (env.DEV_EXPOSE_RESET_TOKEN === 'true') {
    return { resetToken: token };
  }
  return {};
}

export async function resetPassword(
  db: AppDb,
  token: string,
  newPassword: string,
): Promise<{ userId: string; userName: string }> {
  const tokenHash = await hashResetToken(token);
  const now = nowIso();
  const rows = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, now),
      ),
    )
    .limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw unprocessable('Invalid or expired reset token', { token: ['Invalid or expired reset token'] });

  const userRows = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
  const user = userRows[0] as (typeof userRows)[number] | undefined;
  if (!user) throw unprocessable('Invalid or expired reset token', { token: ['Invalid or expired reset token'] });

  await db
    .update(users)
    .set({
      passwordHash: hashPassword(newPassword),
      tokenVersion: user.tokenVersion + 1,
      updatedAt: now,
    })
    .where(eq(users.id, user.id));
  await db.update(passwordResetTokens).set({ usedAt: now }).where(eq(passwordResetTokens.id, row.id));
  return { userId: user.id, userName: user.name };
}
