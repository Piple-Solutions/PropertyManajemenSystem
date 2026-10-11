// Pure-logic checks for the Block 8 frontend changes (no test runner is
// installed in frontend/, and nothing may be installed). Transpiles the
// changed TS modules with the already-installed TypeScript and exercises them
// with a mocked fetch/localStorage. Run: node .tmp-fix/fe-logic-check.mjs
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', 'frontend');
const require = createRequire(join(root, 'package.json'));
const ts = require('typescript');
const outDir = join(here, 'fe-logic-build');
mkdirSync(outDir, { recursive: true });

function build(rel) {
  const src = readFileSync(join(root, rel), 'utf8');
  let js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  js = js.replaceAll('import.meta.env', '({})').replace(/from '\.\/api'/g, "from './api.mjs'").replace(/from '\.\/dateUtils'/g, "from './dateUtils.mjs'");
  const name = rel.split('/').pop().replace(/\.ts$/, '.mjs');
  writeFileSync(join(outDir, name), js);
  return pathToFileURL(join(outDir, name)).href;
}

// ---- localStorage + fetch mocks ----
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
};
let fetchImpl = async () => new Response('{}', { status: 200 });
globalThis.fetch = (...args) => fetchImpl(...args);
const json = (status, body) => new Response(JSON.stringify(body), { status });

const dateUtils = await import(build('src/utils/localDate.ts'));
const returnTo = await import(build('src/utils/returnTo.ts'));
const api = await import(build('src/services/api.ts'));
const auth = (await import(build('src/services/authService.ts'))).authService;
const reservations = (await import(build('src/services/reservationService.ts'))).reservationService;

let passed = 0;
const check = (name, fn) =>
  Promise.resolve(fn()).then(
    () => { passed += 1; console.log('ok   ', name); },
    (e) => { console.log('FAIL ', name, '\n     ', e.message); process.exitCode = 1; },
  );

// ---------------- FE-005 ----------------
await check(`toLocalISODate is the local calendar day (TZ=${process.env.TZ ?? 'system'}), unlike toISOString`, () => {
  const d = new Date(2026, 8, 1); // local midnight, 1 Sep 2026
  assert.equal(dateUtils.toLocalISODate(d), '2026-09-01');
  if ((process.env.TZ ?? '') === 'Asia/Jakarta') assert.equal(d.toISOString().slice(0, 10), '2026-08-31'); // the bug
  assert.equal(dateUtils.toLocalISODate(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
  assert.equal(dateUtils.toLocalISODate(new Date(2027, 0, 1, 0, 0)), '2027-01-01');
});
await check('shiftISODate crosses month/year/leap boundaries without a time zone', () => {
  assert.equal(dateUtils.shiftISODate('2026-09-01', -1), '2026-08-31');
  assert.equal(dateUtils.shiftISODate('2027-01-01', -1), '2026-12-31');
  assert.equal(dateUtils.shiftISODate('2028-03-01', -1), '2028-02-29');
  assert.equal(dateUtils.shiftISODate('2026-12-30', 3), '2027-01-02');
  assert.equal(dateUtils.shiftISODate('2026-09-16', -6), '2026-09-10');
});
await check('todayLocalISO matches the local clock', () => {
  const n = new Date();
  assert.equal(dateUtils.todayLocalISO(), dateUtils.toLocalISODate(n));
});

// ---------------- FE-003 returnTo ----------------
await check('safeReturnTo accepts app paths only', () => {
  assert.equal(returnTo.safeReturnTo('?returnTo=%2Fdashboard%2Freservations%3Fx%3D1'), '/dashboard/reservations?x=1');
  for (const bad of ['//evil.com', 'https://evil.com', 'javascript:alert(1)', '/login', '/login?returnTo=%2Fx', '/register', '/\\evil.com', '']) {
    assert.equal(returnTo.safeReturnTo(`?returnTo=${encodeURIComponent(bad)}`), null, bad);
  }
  assert.equal(returnTo.safeReturnTo(''), null);
});
await check('loginPathFor builds /login?returnTo and never loops on auth pages', () => {
  assert.equal(returnTo.loginPathFor({ pathname: '/dashboard/users', search: '?page=2' }), '/login?returnTo=%2Fdashboard%2Fusers%3Fpage%3D2');
  assert.equal(returnTo.loginPathFor({ pathname: '/login', search: '' }), '/login');
  assert.equal(returnTo.loginPathFor({ pathname: '/', search: '' }), '/login');
});

// ---------------- FE-002 fetchAllPages ----------------
function pagedServer(total) {
  const calls = [];
  fetchImpl = async (url) => {
    const u = new URL(url);
    const page = Number(u.searchParams.get('page'));
    const size = Number(u.searchParams.get('pageSize'));
    calls.push({ page, size, path: u.pathname + (u.searchParams.get('category') ? `?category=${u.searchParams.get('category')}` : '') });
    const start = (page - 1) * size;
    const data = Array.from({ length: Math.max(0, Math.min(size, total - start)) }, (_, i) => ({ n: start + i }));
    return json(200, { data, pagination: { page, pageSize: size, total } });
  };
  return calls;
}
await check('fetchAllPages: 250 rows -> 3 requests, 250 rows in order', async () => {
  const calls = pagedServer(250);
  const rows = await api.fetchAllPages('/api/reservations');
  assert.equal(rows.length, 250);
  assert.deepEqual(rows.map((r) => r.n), Array.from({ length: 250 }, (_, i) => i));
  assert.deepEqual(calls.map((c) => c.page), [1, 2, 3]);
  assert.ok(calls.every((c) => c.size === 100));
});
await check('fetchAllPages: <= 100 rows is exactly the single request it always was', async () => {
  const calls = pagedServer(40);
  assert.equal((await api.fetchAllPages('/api/rooms')).length, 40);
  assert.equal(calls.length, 1);
  const exact = pagedServer(100);
  assert.equal((await api.fetchAllPages('/api/rooms')).length, 100);
  assert.equal(exact.length, 1);
  const none = pagedServer(0);
  assert.equal((await api.fetchAllPages('/api/rooms')).length, 0);
  assert.equal(none.length, 1);
});
await check('fetchAllPages: safety cap bounds the request count; query strings are preserved', async () => {
  const calls = pagedServer(100_000);
  const rows = await api.fetchAllPages('/api/activities?category=finance', { maxPages: 3 });
  assert.equal(rows.length, 300);
  assert.equal(calls.length, 3);
  assert.ok(calls.every((c) => c.path.endsWith('category=finance')));
});
await check('fetchAllPages: an error on a later page rejects (no silent truncation)', async () => {
  let n = 0;
  fetchImpl = async () => {
    n += 1;
    return n === 1 ? json(200, { data: Array.from({ length: 100 }, (_, i) => ({ i })), pagination: { page: 1, pageSize: 100, total: 300 } }) : json(500, { message: 'boom' });
  };
  await assert.rejects(() => api.fetchAllPages('/api/users'), /boom/);
});

// ---------------- FE-003 401 handling ----------------
let handled = 0;
api.setUnauthorizedHandler(() => { handled += 1; });
const fresh = () => { handled = 0; api.setToken('tok-1'); };

await check('401 on an authenticated call: token cleared, handler fires ONCE, error still thrown', async () => {
  fresh();
  fetchImpl = async () => json(401, { message: 'Invalid or expired token' });
  await assert.rejects(() => api.apiFetch('/api/rooms'), (e) => e.status === 401);
  await assert.rejects(() => api.apiFetch('/api/users'), (e) => e.status === 401);
  assert.equal(handled, 1);
  assert.equal(api.getToken(), null);
});
await check('a new login re-arms the handler (next expiry handled again)', async () => {
  api.setToken('tok-2');
  fetchImpl = async () => json(401, { message: 'expired' });
  await assert.rejects(() => api.apiFetch('/api/rooms'));
  assert.equal(handled, 2);
});
await check('the login call itself (no token sent) never triggers the handler', async () => {
  fresh();
  api.clearToken();
  fetchImpl = async () => json(401, { message: 'Invalid email or password' });
  const before = handled;
  const result = await auth.login('a@b.co', 'wrong-pass');
  assert.equal(result, null);
  assert.equal(handled, before);
});
await check('network errors and 5xx do NOT log out or clear the token', async () => {
  fresh();
  fetchImpl = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(() => api.apiFetch('/api/rooms'), (e) => e.status === 0);
  fetchImpl = async () => json(503, { message: 'down' });
  await assert.rejects(() => api.apiFetch('/api/rooms'), (e) => e.status === 503);
  assert.equal(handled, 0);
  assert.equal(api.getToken(), 'tok-1');
});
await check('restoreSession: network error keeps the token, 401 clears it', async () => {
  fresh();
  fetchImpl = async () => { throw new TypeError('Failed to fetch'); };
  assert.equal(await auth.restoreSession(), null);
  assert.equal(api.getToken(), 'tok-1');
  fetchImpl = async () => json(401, { message: 'Invalid or expired token' });
  assert.equal(await auth.restoreSession(), null);
  assert.equal(api.getToken(), null);
});
await check('getMyPermissions rethrows so the permission store keeps its last set', async () => {
  fresh();
  fetchImpl = async () => json(500, { message: 'down' });
  await assert.rejects(() => auth.getMyPermissions(), /down/);
  fetchImpl = async () => json(200, { data: { user: {}, permissions: ['room.view'] } });
  assert.deepEqual(await auth.getMyPermissions(), ['room.view']);
});

// ---------------- X-005 ----------------
await check('login: wrong credentials -> null; inactive account -> backend message passed through', async () => {
  api.clearToken();
  fetchImpl = async () => json(401, { message: 'Invalid email or password' });
  assert.equal(await auth.login('a@b.co', 'x'), null);
  fetchImpl = async () => json(401, { message: 'User is inactive' });
  await assert.rejects(() => auth.login('a@b.co', 'x'), (e) => e.status === 401 && e.message === 'User is inactive' && api.apiErrorMessage(e, 'fallback') === 'User is inactive');
  fetchImpl = async () => json(429, { message: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' });
  await assert.rejects(() => auth.login('a@b.co', 'x'), (e) => e.status === 429);
  fetchImpl = async () => json(200, { data: { user: { id: 'u' }, token: 'jwt', permissions: [], expiresIn: 3600 } });
  const ok = await auth.login('a@b.co', 'right-pass');
  assert.equal(ok.token, 'jwt');
  assert.equal(api.getToken(), 'jwt');
});

// ---------------- FE-004 (option a) ----------------
await check('reservation actions reject with the real ApiError (status + backend message); success returns true', async () => {
  fresh();
  fetchImpl = async () => json(409, { message: "Cannot check in from status 'checked-in'." });
  for (const action of ['checkIn', 'checkOut', 'cancel']) {
    await assert.rejects(
      () => reservations[action]('res-1'),
      (e) => e.status === 409 && api.apiErrorMessage(e, '') === "Cannot check in from status 'checked-in'.",
      action,
    );
  }
  fetchImpl = async () => json(200, { data: { id: 'res-1', status: 'checked-in' } });
  assert.equal(await reservations.checkIn('res-1'), true);
  assert.equal(handled, 0);
});
await check('fetchFullById: 404 -> undefined, other errors reject, success returns the row; getFullById keeps its contract', async () => {
  fresh();
  fetchImpl = async () => json(404, { message: 'Reservation not found' });
  assert.equal(await reservations.fetchFullById('x'), undefined);
  fetchImpl = async () => json(500, { message: 'Internal server error' });
  await assert.rejects(() => reservations.fetchFullById('x'), (e) => e.status === 500);
  assert.equal(await reservations.getFullById('x'), undefined);
  fetchImpl = async () => json(200, { data: { id: 'x' } });
  assert.deepEqual(await reservations.fetchFullById('x'), { id: 'x' });
});

console.log(`\n${passed} checks passed${process.exitCode ? ' (WITH FAILURES)' : ''}`);
