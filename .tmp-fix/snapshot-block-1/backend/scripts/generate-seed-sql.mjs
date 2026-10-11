// Generates idempotent D1 seed SQL from the frontend mock JSON.
// Usage: node scripts/generate-seed-sql.mjs [--out seed/seed.sql]
// - Passwords are hashed with bcrypt (cost 10) before embedding —
//   plaintext mock passwords never reach D1.
// - All writes use INSERT OR IGNORE / INSERT ... ON CONFLICT DO NOTHING so
//   repeated execution never duplicates rows and never overwrites production
//   users, passwords, or role assignments.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');

const here = dirname(fileURLToPath(import.meta.url));
const frontendMock = resolve(here, '../../frontend/src/data/mock');
const outArg = process.argv.find((a) => a.startsWith('--out='));
const outFile = resolve(here, '..', (outArg ? outArg.slice(6) : 'seed/seed.sql'));

const esc = (v) => `'${String(v).replace(/'/g, "''")}'`;

const permissions = JSON.parse(readFileSync(join(frontendMock, 'permissions.json'), 'utf8'));
const roles = JSON.parse(readFileSync(join(frontendMock, 'roles.json'), 'utf8'));
const users = JSON.parse(readFileSync(join(frontendMock, 'users.json'), 'utf8'));
const roomTypes = JSON.parse(readFileSync(join(frontendMock, 'roomTypes.json'), 'utf8'));
const rooms = JSON.parse(readFileSync(join(frontendMock, 'rooms.json'), 'utf8'));
const reservations = JSON.parse(readFileSync(join(frontendMock, 'reservations.json'), 'utf8'));
const reservationRooms = JSON.parse(readFileSync(join(frontendMock, 'reservationRooms.json'), 'utf8'));
const reservationPricing = JSON.parse(readFileSync(join(frontendMock, 'reservationPricing.json'), 'utf8'));
const activities = JSON.parse(readFileSync(join(frontendMock, 'activities.json'), 'utf8'));
const invoices = JSON.parse(readFileSync(join(frontendMock, 'invoices.json'), 'utf8'));
const expenses = JSON.parse(readFileSync(join(frontendMock, 'expenses.json'), 'utf8'));

const permIdByName = new Map(permissions.map((p) => [p.name, p.id]));
const lines = [];
lines.push('-- PMS seed (Phase 1 auth + Phase 2 reservations + Phase 3 rooms + Phase 6 finance) — generated from frontend/src/data/mock/*.json');
lines.push('-- Idempotent: safe to run repeatedly. Never overwrites existing rows.');
lines.push('');

for (const p of permissions) {
  lines.push(
    `INSERT INTO permissions (id, name, description, resource, action, "group") VALUES (${esc(p.id)}, ${esc(p.name)}, ${esc(p.description)}, ${esc(p.resource)}, ${esc(p.action)}, ${esc(p.group)}) ON CONFLICT(id) DO NOTHING;`,
  );
}
lines.push('');

for (const r of roles) {
  lines.push(
    `INSERT INTO roles (id, name, description, status, created_at, updated_at) VALUES (${esc(r.id)}, ${esc(r.name)}, ${esc(r.description)}, ${esc(r.status)}, ${esc(r.createdAt)}, ${esc(r.updatedAt)}) ON CONFLICT(id) DO NOTHING;`,
  );
}
lines.push('');

for (const r of roles) {
  for (const permName of r.permissions) {
    const permId = permIdByName.get(permName);
    if (!permId) {
      console.warn(`WARN: role ${r.id} references unknown permission ${permName} — skipped`);
      continue;
    }
    lines.push(
      `INSERT INTO role_permissions (role_id, permission_id) VALUES (${esc(r.id)}, ${esc(permId)}) ON CONFLICT(role_id, permission_id) DO NOTHING;`,
    );
  }
}
lines.push('');

for (const u of users) {
  const hash = bcrypt.hashSync(u.password, 10);
  const lastLogin = u.lastLoginAt ? esc(u.lastLoginAt) : 'NULL';
  lines.push(
    `INSERT INTO users (id, name, email, password_hash, status, token_version, last_login_at, created_at, updated_at) VALUES (${esc(u.id)}, ${esc(u.name)}, ${esc(u.email.toLowerCase())}, ${esc(hash)}, ${esc(u.status)}, 0, ${lastLogin}, ${esc(u.createdAt)}, ${esc(u.updatedAt)}) ON CONFLICT(id) DO NOTHING;`,
  );
}
lines.push('');

for (const u of users) {
  for (const roleId of u.roles) {
    lines.push(
      `INSERT INTO user_roles (user_id, role_id) VALUES (${esc(u.id)}, ${esc(roleId)}) ON CONFLICT(user_id, role_id) DO NOTHING;`,
    );
  }
}
lines.push('');

lines.push('');
lines.push('-- Phase 3 seed: room types + rooms (from roomTypes.json / rooms.json).');
lines.push('-- Facilities/images stored as JSON TEXT arrays; snapshots in');
lines.push('-- reservation_rooms are preserved verbatim (history, not FK).');
lines.push('');

for (const t of roomTypes) {
  const facilities = JSON.stringify(Array.isArray(t.facilities) ? t.facilities : []);
  const images = JSON.stringify(Array.isArray(t.images) ? t.images : []);
  lines.push(
    `INSERT INTO room_types (id, name, description, capacity, facilities, default_rate, images, status, created_at, updated_at) VALUES (${esc(t.id)}, ${esc(t.name)}, ${esc(t.description ?? '')}, ${Number(t.capacity)}, ${esc(facilities)}, ${Math.round(Number(t.defaultRate))}, ${esc(images)}, ${esc(t.status)}, ${esc(t.createdAt)}, ${esc(t.updatedAt)}) ON CONFLICT(id) DO NOTHING;`,
  );
}
lines.push('');

for (const r of rooms) {
  lines.push(
    `INSERT INTO rooms (id, room_number, room_type_id, status, created_at, updated_at) VALUES (${esc(r.id)}, ${esc(String(r.roomNumber).trim())}, ${esc(r.roomTypeId)}, ${esc(r.status)}, ${esc(r.createdAt)}, ${esc(r.updatedAt)}) ON CONFLICT(id) DO NOTHING;`,
  );
}
lines.push('');

lines.push('');
lines.push('-- Phase 2 seed: reservations + rooms + nightly rates + payment terms.');
lines.push('');

const pricingByReservation = new Map(reservationPricing.map((p) => [p.reservationId, p]));

for (const r of reservations) {
  const pricing = pricingByReservation.get(r.id);
  if (!pricing) {
    console.warn(`WARN: reservation ${r.id} has no pricing row — skipped`);
    continue;
  }
  // Store only the DP field matching dpType (mirrors the API write path).
  const dpPct =
    pricing.paymentType === 'dp' && pricing.dpType === 'percentage' ? Number(pricing.dpPercentage ?? 0) : 'NULL';
  const dpFixed =
    pricing.paymentType === 'dp' && pricing.dpType === 'fixed' ? Math.round(Number(pricing.dpFixedAmount ?? 0)) : 'NULL';
  lines.push(
    `INSERT INTO reservations (id, reservation_code, guest_name, source, check_in_date, check_out_date, status, notes, total_amount, pricing_mode, payment_type, dp_type, dp_percentage, dp_fixed_amount, created_at, updated_at) VALUES (${esc(r.id)}, ${esc(r.reservationCode)}, ${esc(r.guestName)}, ${esc(r.source)}, ${esc(r.checkInDate)}, ${esc(r.checkOutDate)}, ${esc(r.status)}, ${esc(r.notes ?? '')}, ${Number(r.totalAmount)}, ${esc(pricing.mode)}, ${esc(pricing.paymentType)}, ${esc(pricing.dpType)}, ${dpPct}, ${dpFixed}, ${esc(r.createdAt)}, ${esc(r.updatedAt)}) ON CONFLICT(id) DO NOTHING;`,
  );
}
lines.push('');

for (const p of reservationPricing) {
  for (const n of p.nightlyRates) {
    lines.push(
      `INSERT INTO reservation_nightly_rates (reservation_id, date, rate) VALUES (${esc(p.reservationId)}, ${esc(n.date)}, ${Math.round(Number(n.rate))}) ON CONFLICT(reservation_id, date) DO NOTHING;`,
    );
  }
}
lines.push('');

for (const rr of reservationRooms) {
  lines.push(
    `INSERT INTO reservation_rooms (id, reservation_id, room_id, room_number, room_type_name, rate, subtotal, created_at) VALUES (${esc(rr.id)}, ${esc(rr.reservationId)}, ${esc(rr.roomId)}, ${esc(rr.roomNumber)}, ${esc(rr.roomTypeName ?? '')}, ${Math.round(Number(rr.rate))}, ${Math.round(Number(rr.subtotal))}, ${esc(rr.createdAt)}) ON CONFLICT(id) DO NOTHING;`,
  );
}
lines.push('');

lines.push('');
lines.push('-- Phase 4 seed: activities / audit log (from activities.json, verbatim).');
lines.push('-- Append-only history: user names, entity refs, and string-valued metadata');
lines.push('-- are preserved exactly as the frontend mock defines them.');
lines.push('');

for (const a of activities) {
  const metadata = JSON.stringify(
    Object.fromEntries(Object.entries(a.metadata ?? {}).map(([k, v]) => [k, String(v)])),
  );
  const entityType = a.entityType ? esc(a.entityType) : 'NULL';
  const entityId = a.entityId ? esc(a.entityId) : 'NULL';
  const ipAddress = a.ipAddress ? esc(a.ipAddress) : 'NULL';
  lines.push(
    `INSERT INTO activities (id, category, action, description, user_id, user_name, entity_type, entity_id, metadata, ip_address, created_at) VALUES (${esc(a.id)}, ${esc(a.category)}, ${esc(a.action)}, ${esc(a.description ?? '')}, ${esc(a.userId)}, ${esc(a.userName ?? '')}, ${entityType}, ${entityId}, ${esc(metadata)}, ${ipAddress}, ${esc(a.createdAt)}) ON CONFLICT(id) DO NOTHING;`,
  );
}
lines.push('');

lines.push('-- Phase 6 seed: backend-required Finance permissions (perm-027..031,');
lines.push('-- also created idempotently by migration 0005) + grants to role-001/002.');
lines.push('');

const financePermissions = [
  ['perm-027', 'finance.invoice.delete', 'Delete invoice', 'finance', 'invoice.delete', 'Finance'],
  ['perm-028', 'finance.expense.view', 'View expenses', 'finance', 'expense.view', 'Finance'],
  ['perm-029', 'finance.expense.create', 'Create expense', 'finance', 'expense.create', 'Finance'],
  ['perm-030', 'finance.expense.update', 'Update expense', 'finance', 'expense.update', 'Finance'],
  ['perm-031', 'finance.expense.delete', 'Delete expense', 'finance', 'expense.delete', 'Finance'],
];
for (const [id, name, desc, resource, action, group] of financePermissions) {
  lines.push(
    `INSERT INTO permissions (id, name, description, resource, action, "group") VALUES (${esc(id)}, ${esc(name)}, ${esc(desc)}, ${esc(resource)}, ${esc(action)}, ${esc(group)}) ON CONFLICT(id) DO NOTHING;`,
  );
}
lines.push('');
for (const roleId of ['role-001', 'role-002']) {
  for (const [id] of financePermissions) {
    lines.push(
      `INSERT INTO role_permissions (role_id, permission_id) VALUES (${esc(roleId)}, ${esc(id)}) ON CONFLICT(role_id, permission_id) DO NOTHING;`,
    );
  }
}
lines.push('');

lines.push('');
lines.push('-- Phase 6 seed: invoices + items + expenses (from invoices.json / expenses.json, verbatim).');
lines.push('-- Discounts are percents (e.g. 2400000 - 10% = 2160000); reservation_id is FK-less.');
lines.push('-- No sales rows: sales are derived from non-cancelled invoices at read time.');
lines.push('');

for (const inv of invoices) {
  const reservationId = inv.reservationId ? esc(inv.reservationId) : 'NULL';
  lines.push(
    `INSERT INTO invoices (id, invoice_number, reservation_id, guest_name, source, invoice_date, subtotal, discount, total, payment_status, invoice_status, created_at, updated_at) VALUES (${esc(inv.id)}, ${esc(inv.invoiceNumber)}, ${reservationId}, ${esc(inv.guestName)}, ${esc(inv.source ?? '')}, ${esc(inv.invoiceDate)}, ${Math.round(Number(inv.subtotal))}, ${Number(inv.discount ?? 0)}, ${Math.round(Number(inv.total))}, ${esc(inv.paymentStatus)}, ${esc(inv.invoiceStatus)}, ${esc(inv.createdAt)}, ${esc(inv.updatedAt)}) ON CONFLICT(id) DO NOTHING;`,
  );
  for (const it of inv.items ?? []) {
    lines.push(
      `INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, subtotal, created_at) VALUES (${esc(it.id)}, ${esc(inv.id)}, ${esc(it.description)}, ${Math.round(Number(it.quantity))}, ${Math.round(Number(it.unitPrice))}, ${Math.round(Number(it.subtotal))}, ${esc(inv.createdAt)}) ON CONFLICT(id) DO NOTHING;`,
    );
  }
}
lines.push('');

for (const e of expenses) {
  lines.push(
    `INSERT INTO expenses (id, date, category, description, amount, status, created_at, updated_at) VALUES (${esc(e.id)}, ${esc(e.date)}, ${esc(e.category)}, ${esc(e.description ?? '')}, ${Math.round(Number(e.amount))}, ${esc(e.status ?? 'Pending')}, ${esc(e.createdAt)}, ${esc(e.updatedAt)}) ON CONFLICT(id) DO NOTHING;`,
  );
}
lines.push('');

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, lines.join('\n'));
console.log(`Wrote ${lines.length} statements to ${outFile}`);
