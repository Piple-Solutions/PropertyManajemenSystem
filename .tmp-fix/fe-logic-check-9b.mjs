// Block 9B pure-logic checks for the API-backed finance services (FE-001).
// Same approach as fe-logic-check.mjs: transpile with the installed
// TypeScript, run with a mocked fetch. Run: node .tmp-fix/fe-logic-check-9b.mjs
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', 'frontend');
const require = createRequire(join(root, 'package.json'));
const ts = require('typescript');
const outDir = join(here, 'fe-logic-build-9b');
mkdirSync(outDir, { recursive: true });

function build(rel) {
  const src = readFileSync(join(root, rel), 'utf8');
  let js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  js = js
    .replaceAll('import.meta.env', '({})')
    .replace(/from '\.\/(\w+)'/g, "from './$1.mjs'")
    .replace(/import \{[^}]*\} from '@\/constants\/reservationStatuses';/g, 'const reservationSourceLabels = {}; const reservationSourceColors = {};');
  const name = rel.split('/').pop().replace(/\.ts$/, '.mjs');
  writeFileSync(join(outDir, name), js);
  return pathToFileURL(join(outDir, name)).href;
}

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
};
let calls = [];
let responder = () => ({ status: 200, body: {} });
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  const call = { method: init.method ?? 'GET', path: u.pathname + u.search, body: init.body ? JSON.parse(init.body) : undefined };
  calls.push(call);
  const r = responder(call);
  return new Response(r.status === 204 ? null : JSON.stringify(r.body), { status: r.status });
};

const api = await import(build('src/services/api.ts'));
const { invoiceService, statusActionFor } = await import(build('src/services/invoiceService.ts'));
const { expenseService } = await import(build('src/services/expenseService.ts'));
const { salesService } = await import(build('src/services/salesService.ts'));
api.setToken('tok');

let passed = 0;
const check = (name, fn) => {
  calls = [];
  return Promise.resolve()
    .then(fn)
    .then(
      () => { passed += 1; console.log('ok   ', name); },
      (e) => { console.log('FAIL ', name, '\n     ', e.message); process.exitCode = 1; },
    );
};
const inv = (over = {}) => ({ id: 'inv-x', invoiceNumber: 'INV-2026-900', invoiceStatus: 'Draft', paymentStatus: 'Pending', items: [], ...over });
const form = (over = {}) => ({
  invoiceNumber: 'INV-2026-900', reservationId: '', guestName: 'Guest', source: 'direct', invoiceDate: '2026-09-20',
  items: [{ description: 'Room', quantity: 2, unitPrice: 500000, id: 'tmp-1', invoiceId: '', subtotal: 1000000 }],
  discount: 10, subtotal: 1000000, total: 900000, invoiceStatus: 'Draft', paymentStatus: 'Pending', ...over,
});

await check('statusActionFor: the form choice maps to exactly one action, or is unsupported', () => {
  const draft = { invoiceStatus: 'Draft', paymentStatus: 'Pending' };
  const sent = { invoiceStatus: 'Sent', paymentStatus: 'Pending' };
  assert.equal(statusActionFor(draft, {}), 'none');
  assert.equal(statusActionFor(draft, draft), 'none');
  assert.equal(statusActionFor(draft, { invoiceStatus: 'Sent', paymentStatus: 'Pending' }), 'send');
  assert.equal(statusActionFor(draft, { invoiceStatus: 'Completed', paymentStatus: 'Paid' }), 'pay');
  assert.equal(statusActionFor(sent, { invoiceStatus: 'Completed', paymentStatus: 'Paid' }), 'pay');
  assert.equal(statusActionFor(draft, { invoiceStatus: 'Cancelled', paymentStatus: 'Pending' }), 'cancel');
  assert.equal(statusActionFor(sent, { invoiceStatus: 'Cancelled' }), 'cancel');
  for (const bad of [
    [draft, { paymentStatus: 'Partial' }], [draft, { paymentStatus: 'Overdue' }], [draft, { paymentStatus: 'Paid' }],
    [sent, { invoiceStatus: 'Draft' }], [sent, { invoiceStatus: 'Sent', paymentStatus: 'Paid' }],
    [{ invoiceStatus: 'Completed', paymentStatus: 'Paid' }, { invoiceStatus: 'Cancelled' }],
    [{ invoiceStatus: 'Cancelled', paymentStatus: 'Pending' }, { invoiceStatus: 'Draft' }],
    [draft, { invoiceStatus: 'Completed', paymentStatus: 'Pending' }],
  ]) assert.equal(statusActionFor(bad[0], bad[1]), 'unsupported', JSON.stringify(bad));
});

await check('create (Draft/Pending): ONE request, body has only the editable fields (no ids, totals or status)', async () => {
  responder = () => ({ status: 201, body: { data: inv() } });
  const out = await invoiceService.create(form());
  assert.equal(out.id, 'inv-x');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    method: 'POST', path: '/api/invoices',
    body: { invoiceNumber: 'INV-2026-900', guestName: 'Guest', source: 'direct', invoiceDate: '2026-09-20', items: [{ description: 'Room', quantity: 2, unitPrice: 500000 }], discount: 10 },
  });
});

await check('create with Completed + Paid: POST (no status) then /pay', async () => {
  responder = (c) => (c.path.endsWith('/pay') ? { status: 200, body: { data: inv({ invoiceStatus: 'Completed', paymentStatus: 'Paid' }) } } : { status: 201, body: { data: inv() } });
  const out = await invoiceService.create(form({ invoiceStatus: 'Completed', paymentStatus: 'Paid' }));
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ['POST /api/invoices', 'POST /api/invoices/inv-x/pay']);
  assert.equal(calls[0].body.invoiceStatus, undefined);
  assert.equal(out.invoiceStatus, 'Completed');
});

await check('create with Sent / Cancelled: POST then /send or /cancel', async () => {
  responder = () => ({ status: 201, body: { data: inv() } });
  await invoiceService.create(form({ invoiceStatus: 'Sent' }));
  assert.deepEqual(calls.map((c) => c.path), ['/api/invoices', '/api/invoices/inv-x/send']);
  calls = [];
  await invoiceService.create(form({ invoiceStatus: 'Cancelled' }));
  assert.deepEqual(calls.map((c) => c.path), ['/api/invoices', '/api/invoices/inv-x/cancel']);
});

await check('create with an unsupported status: sent WITH the status, the API message reaches the caller, no action call', async () => {
  responder = () => ({ status: 422, body: { message: 'Validation failed', errors: { paymentStatus: ['Status invoice tidak dapat diatur lewat create/update. Gunakan endpoint send, pay, atau cancel.'] } } });
  await assert.rejects(
    () => invoiceService.create(form({ paymentStatus: 'Partial' })),
    (e) => e.status === 422 && /send, pay, atau cancel/.test(api.apiErrorMessage(e, '')),
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.paymentStatus, 'Partial');
});

await check('update without a status change: GET current, then ONE PATCH without status', async () => {
  responder = (c) => ({ status: 200, body: { data: inv({ guestName: c.method === 'PATCH' ? 'Edited' : 'Guest' }) } });
  const out = await invoiceService.update('inv-x', form({ guestName: 'Edited' }));
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ['GET /api/invoices/inv-x', 'PATCH /api/invoices/inv-x']);
  assert.equal(calls[1].body.invoiceStatus, undefined);
  assert.equal(calls[1].body.paymentStatus, undefined);
  assert.equal(out.guestName, 'Edited');
});

await check('update Draft -> Completed + Paid: PATCH then /pay; unknown id -> null without a write', async () => {
  responder = () => ({ status: 200, body: { data: inv() } });
  await invoiceService.update('inv-x', form({ invoiceStatus: 'Completed', paymentStatus: 'Paid' }));
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ['GET /api/invoices/inv-x', 'PATCH /api/invoices/inv-x', 'POST /api/invoices/inv-x/pay']);
  calls = [];
  responder = () => ({ status: 404, body: { message: 'Invoice not found' } });
  assert.equal(await invoiceService.update('nope', form()), null);
  assert.equal(calls.length, 1);
});

await check('update Sent -> Draft (no action): PATCH carries the status and the 422 is thrown', async () => {
  responder = (c) => (c.method === 'GET' ? { status: 200, body: { data: inv({ invoiceStatus: 'Sent' }) } } : { status: 422, body: { message: 'Status invoice tidak dapat diatur lewat create/update. Gunakan endpoint send, pay, atau cancel.' } });
  await assert.rejects(() => invoiceService.update('inv-x', form({ invoiceStatus: 'Draft' })), (e) => e.status === 422);
  assert.equal(calls[1].body.invoiceStatus, 'Draft');
});

await check('delete / send / markPaid / cancel reject with the API error (409 message), resolve true on success', async () => {
  responder = () => ({ status: 409, body: { message: 'Hanya invoice Draft yang dapat dihapus. Invoice INV-2026-001 berstatus Completed; batalkan (cancel) invoice ini bila tidak berlaku.' } });
  await assert.rejects(() => invoiceService.delete('inv-001'), (e) => e.status === 409 && /Hanya invoice Draft/.test(e.message));
  for (const m of ['send', 'markPaid', 'cancel']) await assert.rejects(() => invoiceService[m]('inv-001'), (e) => e.status === 409);
  responder = (c) => (c.method === 'DELETE' ? { status: 204, body: null } : { status: 200, body: { data: inv() } });
  assert.equal(await invoiceService.delete('inv-x'), true);
  assert.equal(await invoiceService.markPaid('inv-x'), true);
  assert.equal(calls.at(-1).path, '/api/invoices/inv-x/pay');
});

await check('getById: 404 -> undefined, 500 rejects; getNextNumber passes the date', async () => {
  responder = () => ({ status: 404, body: { message: 'Invoice not found' } });
  assert.equal(await invoiceService.getById('nope'), undefined);
  responder = () => ({ status: 500, body: { message: 'Internal server error' } });
  await assert.rejects(() => invoiceService.getById('x'), (e) => e.status === 500);
  responder = () => ({ status: 200, body: { data: { invoiceNumber: 'INV-2026-010' } } });
  assert.equal(await invoiceService.getNextNumber('2026-09-20'), 'INV-2026-010');
  assert.equal(calls.at(-1).path, '/api/invoices/next-number?date=2026-09-20');
});

await check('getAllIfPermitted: 403 -> [] for invoices, expenses and sales; other errors still reject', async () => {
  responder = () => ({ status: 403, body: { message: 'Missing required permission(s): finance.invoice.view' } });
  assert.deepEqual(await invoiceService.getAllIfPermitted(), []);
  assert.deepEqual(await expenseService.getAllIfPermitted(), []);
  assert.deepEqual(await salesService.getAllIfPermitted(), []);
  await assert.rejects(() => invoiceService.getAll(), (e) => e.status === 403);
  responder = () => ({ status: 500, body: { message: 'down' } });
  await assert.rejects(() => salesService.getAllIfPermitted(), (e) => e.status === 500);
});

await check('getAll pages through every list endpoint (250 rows = 3 requests) and returns plain arrays', async () => {
  responder = (c) => {
    const u = new URL(`http://x${c.path}`);
    const page = Number(u.searchParams.get('page'));
    const size = Number(u.searchParams.get('pageSize'));
    const start = (page - 1) * size;
    return { status: 200, body: { data: Array.from({ length: Math.max(0, Math.min(size, 250 - start)) }, (_, i) => ({ id: `r${start + i}`, date: '2026-09-01', amount: 1, source: 'direct' })), pagination: { page, pageSize: size, total: 250 } } };
  };
  for (const [svc, path] of [[invoiceService, '/api/invoices'], [expenseService, '/api/expenses'], [salesService, '/api/sales']]) {
    calls = [];
    const rows = await svc.getAll();
    assert.equal(rows.length, 250, path);
    assert.deepEqual(calls.map((c) => c.path), [`${path}?page=1&pageSize=100`, `${path}?page=2&pageSize=100`, `${path}?page=3&pageSize=100`]);
  }
});

await check('expense create sends exactly the form fields; a 422 reaches the caller with field messages', async () => {
  responder = () => ({ status: 201, body: { data: { id: 'exp-x' } } });
  await expenseService.create({ category: 'Supplies', description: 'Soap', amount: 50000, date: '2026-09-21', status: 'Pending' });
  assert.deepEqual(calls[0], { method: 'POST', path: '/api/expenses', body: { date: '2026-09-21', category: 'Supplies', description: 'Soap', amount: 50000, status: 'Pending' } });
  responder = () => ({ status: 422, body: { message: 'Validation failed', errors: { amount: ['Amount must be a positive number'] } } });
  await assert.rejects(() => expenseService.create({ category: 'Supplies', description: 'x', amount: 0, date: '2026-09-21' }), (e) => api.apiErrorMessage(e, '') === 'Amount must be a positive number');
});

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} checks passed${process.exitCode ? ' (WITH FAILURES)' : ''}`);
