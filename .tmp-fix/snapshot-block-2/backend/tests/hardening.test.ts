import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createD1Db } from '../src/db/client';
import { isLocalhostUrl, isPlaceholderSecret, AttemptLimiter } from '../src/lib/security';
import { register } from '../src/services/authService';
import { ADMIN, STAFF, jsonHeaders, loginAs, setupTestApp } from './helpers/app';
import type { TestContext } from './helpers/app';
import { backendRoot } from './helpers/fake-d1';
import { clearHolidayCache } from '../src/services/holidayService';

/**
 * Block 1 regression tests (BE-001, BE-004, BE-005, BE-006, BE-008, BE-011,
 * BE-012, BE-014). Converted from the PoC/known-unsafe baselines.
 */
let ctx: TestContext;
beforeEach(() => {
  ctx = setupTestApp();
});

const post = (path: string, body: unknown, url = '', env = ctx.env, headers: Record<string, string> = {}) =>
  ctx.app.request(`${url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }, env);

describe('BE-001: public registration is closed', () => {
  it('returns 403 with an Indonesian message and creates nothing', async () => {
    const before = (ctx.sqlite.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
    const res = await post('/api/auth/register', { name: 'Anon User', email: 'anon@x.com', password: 'anon1234' });
    expect(res.status).toBe(403);
    const json = (await res.json()) as { message: string };
    expect(json.message).toMatch(/Pendaftaran akun publik dinonaktifkan/);
    expect((ctx.sqlite.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c).toBe(before);
  });

  it('is closed even for invalid bodies and duplicate emails (no enumeration)', async () => {
    expect((await post('/api/auth/register', {})).status).toBe(403);
    expect((await post('/api/auth/register', { name: 'Dup', email: ADMIN.email, password: 'dup12345' })).status).toBe(403);
  });

  it('keeps the service-level behavior intact (default Staff role only, email normalized)', async () => {
    const db = createD1Db(ctx.env.DB);
    const result = await register(db, ctx.env, { name: 'New Hire', email: 'HIRE@hotel.com', password: 'hire1234' });
    expect(result.user.roles).toEqual(['role-003']);
    expect(result.user.email).toBe('hire@hotel.com');
    expect(result.permissions).not.toContain('permission.assign');
  });
});

describe('BE-005: JWT_SECRET placeholder guard', () => {
  it('detects placeholders and empty values, but not a merely short secret', () => {
    expect(isPlaceholderSecret('')).toBe(true);
    expect(isPlaceholderSecret('   ')).toBe(true);
    expect(isPlaceholderSecret(undefined)).toBe(true);
    expect(isPlaceholderSecret('dev-only-insecure-secret-change-me-min-32-chars')).toBe(true);
    expect(isPlaceholderSecret('please-CHANGE-ME-now')).toBe(true);
    expect(isPlaceholderSecret('k9X2mQ7vLp4RtZ8wYb3N')).toBe(false); // real but short: warn only
    expect(isPlaceholderSecret('test-secret-that-is-long-enough-for-hs256-ok')).toBe(false);
  });

  it('rejects requests with a placeholder secret on a non-localhost origin', async () => {
    const env = { ...ctx.env, JWT_SECRET: 'dev-only-insecure-secret-change-me-min-32-chars' };
    const res = await ctx.app.request('https://pms.example-hotel.workers.dev/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password }),
    }, env);
    expect(res.status).toBe(500);
    expect(((await res.json()) as { message: string }).message).toMatch(/JWT_SECRET/);
  });

  it('keeps working on localhost with the placeholder (local development)', async () => {
    const env = { ...ctx.env, JWT_SECRET: 'dev-only-insecure-secret-change-me-min-32-chars' };
    const res = await ctx.app.request('http://localhost:8787/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password }),
    }, env);
    expect(res.status).toBe(200);
  });

  it('does not block a real secret on a non-localhost origin, nor health/public', async () => {
    const ok = await ctx.app.request('https://pms.example-hotel.workers.dev/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password }),
    }, ctx.env);
    expect(ok.status).toBe(200);
    const badEnv = { ...ctx.env, JWT_SECRET: '' };
    const health = await ctx.app.request('https://pms.example-hotel.workers.dev/api/health', {}, badEnv);
    expect(health.status).toBe(200);
  });

  it('isLocalhostUrl recognises local hosts only', () => {
    for (const u of ['http://localhost:8787/x', 'http://127.0.0.1/x', 'http://[::1]:8787/x', 'http://dev.localhost/x']) {
      expect(isLocalhostUrl(u), u).toBe(true);
    }
    for (const u of ['https://pms.workers.dev/x', 'https://localhost.evil.com/x', 'not a url']) {
      expect(isLocalhostUrl(u), u).toBe(false);
    }
  });
});

describe('BE-008: reset token only exposed on localhost', () => {
  const forgot = (url: string) =>
    ctx.app.request(`${url}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: STAFF.email }),
    }, ctx.env);

  it('returns the token for a localhost origin when the dev flag is on', async () => {
    const res = await forgot('http://localhost:8787');
    expect(((await res.json()) as { data: { resetToken?: string } }).data.resetToken).toBeTruthy();
  });

  it('never returns the token for a deployed origin even with the flag on', async () => {
    const res = await forgot('https://pms.example-hotel.workers.dev');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: Record<string, unknown> }).data.resetToken).toBeUndefined();
    // The token row is still created (delivery channel is the owner's decision).
    expect((ctx.sqlite.prepare('SELECT COUNT(*) AS c FROM password_reset_tokens').get() as { c: number }).c).toBe(1);
  });
});

describe('BE-011: reset token is single-use even under a race', () => {
  it('two concurrent resets with the same token: exactly one wins', async () => {
    const forgot = await post('/api/auth/forgot-password', { email: STAFF.email });
    const { resetToken } = ((await forgot.json()) as { data: { resetToken: string } }).data;
    const [a, b] = await Promise.all([
      post('/api/auth/reset-password', { token: resetToken, newPassword: 'race-one-1' }),
      post('/api/auth/reset-password', { token: resetToken, newPassword: 'race-two-2' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 422]);
  });

  it('a successful reset invalidates the user’s other outstanding tokens', async () => {
    const t1 = ((await (await post('/api/auth/forgot-password', { email: STAFF.email })).json()) as { data: { resetToken: string } }).data.resetToken;
    const t2 = ((await (await post('/api/auth/forgot-password', { email: STAFF.email })).json()) as { data: { resetToken: string } }).data.resetToken;
    expect((await post('/api/auth/reset-password', { token: t1, newPassword: 'first-new-1' })).status).toBe(200);
    expect((await post('/api/auth/reset-password', { token: t2, newPassword: 'second-new-2' })).status).toBe(422);
  });
});

describe('BE-006: best-effort attempt limiter', () => {
  it('AttemptLimiter blocks after max failures, expires, and clears on success', () => {
    let t = 1_000_000;
    const l = new AttemptLimiter(3, 60_000, 10, () => t);
    for (let i = 0; i < 3; i++) {
      expect(l.blockedFor('k')).toBe(0);
      l.recordFailure('k');
    }
    expect(l.blockedFor('k')).toBeGreaterThan(0);
    expect(l.blockedFor('other')).toBe(0);
    t += 61_000;
    expect(l.blockedFor('k')).toBe(0);
    l.recordFailure('k');
    l.clear('k');
    expect(l.blockedFor('k')).toBe(0);
  });

  it('AttemptLimiter stays bounded', () => {
    const l = new AttemptLimiter(1, 60_000, 5, () => 0);
    for (let i = 0; i < 50; i++) l.recordFailure(`k${i}`);
    let blocked = 0;
    for (let i = 0; i < 50; i++) if (l.blockedFor(`k${i}`) > 0) blocked += 1;
    expect(blocked).toBeLessThanOrEqual(5);
  });

  it('login returns 429 + Retry-After after many failures for the same IP+email, other accounts unaffected, success unaffected below the limit', async () => {
    const headers = { 'cf-connecting-ip': '203.0.113.9' };
    let last = 0;
    for (let i = 0; i < 25; i++) {
      const r = await post('/api/auth/login', { email: ADMIN.email, password: `wrong-${i}-pw` }, '', ctx.env, headers);
      last = r.status;
      if (r.status === 429) {
        expect(r.headers.get('Retry-After')).toBeTruthy();
        expect(((await r.json()) as { message: string }).message).toMatch(/Terlalu banyak percobaan/);
        break;
      }
      expect(r.status).toBe(401);
    }
    expect(last).toBe(429);
    // Same IP, different account: still allowed.
    const other = await post('/api/auth/login', { email: STAFF.email, password: STAFF.password }, '', ctx.env, headers);
    expect(other.status).toBe(200);
    // Different IP, same account: still allowed.
    const elsewhere = await post('/api/auth/login', { email: ADMIN.email, password: ADMIN.password }, '', ctx.env, { 'cf-connecting-ip': '198.51.100.7' });
    expect(elsewhere.status).toBe(200);
  });

  it('a normal user with a few typos is never limited, and success resets the counter', async () => {
    const headers = { 'cf-connecting-ip': '203.0.113.50' };
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 5; i++) {
        expect((await post('/api/auth/login', { email: STAFF.email, password: 'typo-typo' }, '', ctx.env, headers)).status).toBe(401);
      }
      expect((await post('/api/auth/login', { email: STAFF.email, password: STAFF.password }, '', ctx.env, headers)).status).toBe(200);
    }
  });
});

describe('BE-012: public holidays ignore force and hide the upstream URL', () => {
  beforeEach(() => clearHolidayCache());
  afterEach(() => {
    vi.unstubAllGlobals();
    clearHolidayCache();
  });

  it('force=true does not bypass the cache and the response does not echo the source URL or raw error text', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ '2026-01-01': { summary: ['Tahun Baru'], holiday: true } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const env = { ...ctx.env, HOLIDAY_SOURCE_URL: 'https://secret-host.example.test/path?token=abc123' };
    const first = await ctx.app.request('/api/public/holidays?year=2026', {}, env);
    const second = await ctx.app.request('/api/public/holidays?year=2026&force=true', {}, env);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const text = JSON.stringify(await second.json());
    expect(text).not.toContain('secret-host');
    expect(text).not.toContain('abc123');
    const body = JSON.parse(text) as { data: { source: string; available: boolean; days: unknown[]; year: number } };
    expect(typeof body.data.source).toBe('string');
    expect(body.data.available).toBe(true);
    expect(body.data.year).toBe(2026);
  });

  it('upstream failure keeps the shape (available:false, days:[]) without leaking the URL or network text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connect ECONNREFUSED https://secret-host.example.test'); }));
    const env = { ...ctx.env, HOLIDAY_SOURCE_URL: 'https://secret-host.example.test/x' };
    const res = await ctx.app.request('/api/public/holidays?year=2026', {}, env);
    const text = JSON.stringify(await res.json());
    expect(res.status).toBe(200);
    expect(text).not.toContain('secret-host');
    const body = JSON.parse(text) as { data: { available: boolean; days: unknown[]; error?: string } };
    expect(body.data.available).toBe(false);
    expect(body.data.days).toEqual([]);
    expect(typeof body.data.error).toBe('string');
  });
});

describe('BE-014: security headers', () => {
  it('adds hardening headers to API responses (success and error)', async () => {
    const token = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
    const ok = await ctx.app.request('/api/users', { headers: jsonHeaders(token) }, ctx.env);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(ok.headers.get('Cache-Control')).toBe('no-store');
    expect(ok.headers.get('X-Frame-Options')).toBe('DENY');
    const err = await ctx.app.request('/api/users', {}, ctx.env);
    expect(err.status).toBe(401);
    expect(err.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('does not make the public catalog uncacheable and keeps CORS headers', async () => {
    const res = await ctx.app.request('/api/public/room-types', { headers: { Origin: 'http://localhost:5173' } }, ctx.env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBeNull();
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
  });

  it('logout behavior is unchanged (still 200, token not revoked)', async () => {
    const token = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
    expect((await ctx.app.request('/api/auth/logout', { method: 'POST', headers: jsonHeaders(token) }, ctx.env)).status).toBe(200);
    expect((await ctx.app.request('/api/auth/me', { headers: jsonHeaders(token) }, ctx.env)).status).toBe(200);
  });
});

describe('BE-004: seed generator refuses default credentials without an explicit flag', () => {
  const script = resolve(backendRoot, 'scripts', 'generate-seed-sql.mjs');
  const cleanEnv = { ...process.env, PMS_ALLOW_DEFAULT_CREDENTIALS: '' };

  it('exits non-zero, writes nothing, and explains how to proceed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pms-seed-guard-'));
    const out = join(dir, 'seed.sql');
    const r = spawnSync('node', [script, `--out=${out}`], { cwd: backendRoot, env: cleanEnv, encoding: 'utf8' });
    expect(r.status).not.toBe(0);
    expect(existsSync(out)).toBe(false);
    expect(r.stderr).toMatch(/--allow-default-credentials/);
    expect(r.stderr).not.toMatch(/admin123|manager123|staff123/);
  });

  it('works with --allow-default-credentials or PMS_ALLOW_DEFAULT_CREDENTIALS=1', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pms-seed-guard-'));
    const a = join(dir, 'a.sql');
    execFileSync('node', [script, `--out=${a}`, '--allow-default-credentials'], { cwd: backendRoot, env: cleanEnv });
    expect(readFileSync(a, 'utf8')).toContain('INSERT INTO users');
    const b = join(dir, 'b.sql');
    execFileSync('node', [script, `--out=${b}`], { cwd: backendRoot, env: { ...process.env, PMS_ALLOW_DEFAULT_CREDENTIALS: '1' } });
    expect(readFileSync(b, 'utf8')).toContain('INSERT INTO users');
  });
});
