import { sign } from 'hono/jwt';
import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, INACTIVE, STAFF, jsonHeaders, loginAs, setupTestApp, TEST_JWT_SECRET } from './helpers/app';
import type { TestContext } from './helpers/app';

let ctx: TestContext;
beforeEach(() => {
  ctx = setupTestApp();
});

describe('POST /api/auth/login', () => {
  it('logs in with valid credentials and returns user + permissions + JWT', async () => {
    const res = await ctx.app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ADMIN),
    }, ctx.env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { user: Record<string, unknown>; permissions: string[]; token: string; expiresIn: number };
    };
    expect(json.data.user.email).toBe(ADMIN.email);
    expect(json.data.user).not.toHaveProperty('passwordHash');
    expect(json.data.user).not.toHaveProperty('password');
    expect(json.data.user.roles).toContain('role-001');
    expect(json.data.permissions).toContain('user.create');
    expect(json.data.permissions).toContain('permission.assign');
    expect(typeof json.data.token).toBe('string');
    expect(json.data.token.split('.')).toHaveLength(3);
    expect(json.data.expiresIn).toBe(3600);
  });

  it('rejects invalid password with 401 and a generic message', async () => {
    const res = await ctx.app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN.email, password: 'wrong-password' }),
    }, ctx.env);
    expect(res.status).toBe(401);
    expect(((await res.json()) as { message: string }).message).toBe('Invalid email or password');
  });

  it('rejects unknown email with the same generic 401 message', async () => {
    const res = await ctx.app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@hotel.com', password: 'whatever123' }),
    }, ctx.env);
    expect(res.status).toBe(401);
    expect(((await res.json()) as { message: string }).message).toBe('Invalid email or password');
  });

  it('rejects inactive users', async () => {
    const res = await ctx.app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(INACTIVE),
    }, ctx.env);
    expect(res.status).toBe(401);
  });

  it('rejects malformed bodies with 422 and field errors', async () => {
    const res = await ctx.app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    }, ctx.env);
    expect(res.status).toBe(422);
    const json = (await res.json()) as { message: string; errors: Record<string, string[]> };
    expect(json.message).toBe('Validation failed');
    expect(json.errors.email).toBeDefined();
  });

  it('updates lastLoginAt on success', async () => {
    const before = ctx.sqlite.prepare('SELECT last_login_at AS v FROM users WHERE id = ?').get('user-001') as { v: string };
    await ctx.app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ADMIN),
    }, ctx.env);
    const after = ctx.sqlite.prepare('SELECT last_login_at AS v FROM users WHERE id = ?').get('user-001') as { v: string };
    expect(after.v).not.toBe(before.v);
  });
});

describe('bearer middleware + GET /api/auth/me', () => {
  it('restores the session (user + union permissions)', async () => {
    const token = await loginAs(ctx.app, ctx.env, STAFF.email, STAFF.password);
    const res = await ctx.app.request('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } }, ctx.env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { user: { email: string }; permissions: string[] } };
    expect(json.data.user.email).toBe(STAFF.email);
    expect(json.data.permissions).toContain('reservation.view');
  });

  it('returns 401 without a token', async () => {
    const res = await ctx.app.request('/api/auth/me', {}, ctx.env);
    expect(res.status).toBe(401);
  });

  it('returns 401 for a malformed token', async () => {
    const res = await ctx.app.request('/api/auth/me', { headers: { Authorization: 'Bearer junk' } }, ctx.env);
    expect(res.status).toBe(401);
  });

  it('returns 401 for a token signed with the wrong secret', async () => {
    const bad = await sign({ sub: 'user-001', tv: 0, iat: 1, exp: 9999999999 }, 'wrong-secret', 'HS256');
    const res = await ctx.app.request('/api/auth/me', { headers: { Authorization: `Bearer ${bad}` } }, ctx.env);
    expect(res.status).toBe(401);
  });

  it('returns 401 for an expired JWT', async () => {
    const expired = await sign(
      { sub: 'user-001', tv: 0, iat: 1, exp: 2 },
      TEST_JWT_SECRET,
      'HS256',
    );
    const res = await ctx.app.request('/api/auth/me', { headers: { Authorization: `Bearer ${expired}` } }, ctx.env);
    expect(res.status).toBe(401);
  });

  it('returns 401 when the user was deactivated after the token was issued', async () => {
    const token = await loginAs(ctx.app, ctx.env, STAFF.email, STAFF.password);
    ctx.sqlite.prepare("UPDATE users SET status = 'inactive' WHERE id = ?").run('user-003');
    const res = await ctx.app.request('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } }, ctx.env);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('requires authentication and documents stateless semantics', async () => {
    const anon = await ctx.app.request('/api/auth/logout', { method: 'POST' }, ctx.env);
    expect(anon.status).toBe(401);

    const token = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
    const res = await ctx.app.request(
      '/api/auth/logout',
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      ctx.env,
    );
    expect(res.status).toBe(200);
    // Stateless JWT: the token itself is NOT revoked server-side (documented);
    // the client must discard it.
    const stillValid = await ctx.app.request(
      '/api/auth/me',
      { headers: { Authorization: `Bearer ${token}` } },
      ctx.env,
    );
    expect(stillValid.status).toBe(200);
  });
});

describe('POST /api/auth/change-password', () => {
  it('changes the password and invalidates the old token', async () => {
    const token = await loginAs(ctx.app, ctx.env, STAFF.email, STAFF.password);
    const res = await ctx.app.request('/api/auth/change-password', {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify({ currentPassword: STAFF.password, newPassword: 'newpass123' }),
    }, ctx.env);
    expect(res.status).toBe(200);

    // Old token no longer works (token_version bumped).
    const stale = await ctx.app.request(
      '/api/auth/me',
      { headers: { Authorization: `Bearer ${token}` } },
      ctx.env,
    );
    expect(stale.status).toBe(401);

    // New password works.
    const relogin = await ctx.app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: STAFF.email, password: 'newpass123' }),
    }, ctx.env);
    expect(relogin.status).toBe(200);
  });

  it('rejects a wrong current password with 422', async () => {
    const token = await loginAs(ctx.app, ctx.env, STAFF.email, STAFF.password);
    const res = await ctx.app.request('/api/auth/change-password', {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify({ currentPassword: 'nope', newPassword: 'newpass123' }),
    }, ctx.env);
    expect(res.status).toBe(422);
  });

  it('requires authentication', async () => {
    const res = await ctx.app.request('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'x', newPassword: 'newpass123' }),
    }, ctx.env);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/register', () => {
  it('registers with the default Staff role only (never admin)', async () => {
    const res = await ctx.app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Hire', email: 'hire@hotel.com', password: 'hire1234' }),
    }, ctx.env);
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { user: { roles: string[] }; permissions: string[] } };
    expect(json.data.user.roles).toEqual(['role-003']);
    expect(json.data.permissions).not.toContain('permission.assign');
  });

  it('rejects duplicate email with 409', async () => {
    const res = await ctx.app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Dup', email: ADMIN.email, password: 'dup12345' }),
    }, ctx.env);
    expect(res.status).toBe(409);
  });

  it('normalizes email case', async () => {
    const res = await ctx.app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Case', email: 'CASED@hotel.com', password: 'case1234' }),
    }, ctx.env);
    expect(res.status).toBe(201);
    const dup = await ctx.app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Case2', email: 'cased@hotel.com', password: 'case1234' }),
    }, ctx.env);
    expect(dup.status).toBe(409);
  });
});

describe('forgot/reset password', () => {
  it('always returns the generic message (existing and unknown emails alike)', async () => {
    for (const email of [STAFF.email, 'ghost@hotel.com']) {
      const res = await ctx.app.request('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      }, ctx.env);
      expect(res.status).toBe(200);
      expect(((await res.json()) as { data: { message: string } }).data.message).toMatch(/If an account/);
    }
  });

  it('resets with a valid token, then the token is single-use', async () => {
    const forgot = await ctx.app.request('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: STAFF.email }),
    }, ctx.env);
    const { resetToken } = ((await forgot.json()) as { data: { resetToken: string } }).data;
    expect(resetToken).toBeTruthy();

    const reset = await ctx.app.request('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, newPassword: 'reset1234' }),
    }, ctx.env);
    expect(reset.status).toBe(200);

    const relogin = await ctx.app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: STAFF.email, password: 'reset1234' }),
    }, ctx.env);
    expect(relogin.status).toBe(200);

    const reuse = await ctx.app.request('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, newPassword: 'reset9999' }),
    }, ctx.env);
    expect(reuse.status).toBe(422);
  });

  it('stores only a hash of the reset token', async () => {
    const forgot = await ctx.app.request('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: STAFF.email }),
    }, ctx.env);
    const { resetToken } = ((await forgot.json()) as { data: { resetToken: string } }).data;
    const rows = ctx.sqlite.prepare('SELECT token_hash AS h FROM password_reset_tokens').all() as Array<{ h: string }>;
    expect(rows.length).toBe(1);
    expect(rows[0].h).not.toContain(resetToken.slice(0, 8));
    expect(rows[0].h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects expired tokens', async () => {
    const forgot = await ctx.app.request('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: STAFF.email }),
    }, ctx.env);
    const { resetToken } = ((await forgot.json()) as { data: { resetToken: string } }).data;
    ctx.sqlite.prepare("UPDATE password_reset_tokens SET expires_at = '2000-01-01T00:00:00.000Z'").run();
    const reset = await ctx.app.request('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, newPassword: 'reset1234' }),
    }, ctx.env);
    expect(reset.status).toBe(422);
  });

  it('does not expose the token when the dev flag is off', async () => {
    const res = await ctx.app.request('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: STAFF.email }),
    }, { ...ctx.env, DEV_EXPOSE_RESET_TOKEN: undefined });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: Record<string, unknown> }).data.resetToken).toBeUndefined();
  });
});
