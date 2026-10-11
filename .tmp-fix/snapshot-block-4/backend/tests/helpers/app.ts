import { hashSync } from 'bcryptjs';
import type Database from 'better-sqlite3';
import { createApp } from '../../src/index';
import { createD1Db } from '../../src/db/client';
import type { AppEnv } from '../../src/env';
import { applyMigrationFile, backendRoot, createSqlite, fakeD1 } from './fake-d1';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const TEST_JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256-ok';

export interface TestContext {
  app: ReturnType<typeof createApp>;
  sqlite: Database.Database;
  env: AppEnv;
}

interface MockUser {
  id: string;
  name: string;
  email: string;
  password: string;
  roles: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}
interface MockRole {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
}
interface MockPermission {
  id: string;
  name: string;
  description: string;
  resource: string;
  action: string;
  group: string;
}

function loadMock(name: string) {
  const p = resolve(backendRoot, '..', 'frontend', 'src', 'data', 'mock', name);
  return JSON.parse(readFileSync(p, 'utf8'));
}

/**
 * Fresh app + migrated in-memory DB seeded from the REAL frontend mock JSON
 * (passwords hashed at setup). Every test file calls this in `beforeEach`
 * for full isolation.
 */
interface MockRoomType {
  id: string;
  name: string;
  description: string;
  capacity: number;
  facilities: string[];
  defaultRate: number;
  images: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
}
interface MockRoom {
  id: string;
  roomNumber: string;
  roomTypeId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}
interface MockReservation {
  id: string;
  reservationCode: string;
  guestName: string;
  source: string;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  notes: string;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
}
interface MockReservationRoom {
  id: string;
  reservationId: string;
  roomId: string;
  roomNumber: string;
  roomTypeName: string;
  rate: number;
  subtotal: number;
  createdAt: string;
}
interface MockPricing {
  reservationId: string;
  rateSource: string;
  mode: string;
  nightlyRates: Array<{ date: string; rate: number }>;
  paymentType: string;
  dpType: string;
  dpPercentage?: number;
  dpFixedAmount?: number;
}
interface MockActivity {
  id: string;
  category: string;
  action: string;
  description: string;
  userId: string;
  userName: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, string>;
  ipAddress?: string;
  createdAt: string;
}
interface MockInvoiceItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}
interface MockInvoice {
  id: string;
  invoiceNumber: string;
  reservationId?: string;
  guestName: string;
  source: string;
  invoiceDate: string;
  items: MockInvoiceItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentStatus: string;
  invoiceStatus: string;
  createdAt: string;
  updatedAt: string;
}
interface MockExpense {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  status?: string;
  createdAt: string;
  updatedAt: string;
}

/** Backend-required Phase 6 permissions (live in migration 0005, not the frontend mocks). */
export const FINANCE_PERMISSIONS = [
  { id: 'perm-027', name: 'finance.invoice.delete', description: 'Delete invoice', resource: 'finance', action: 'invoice.delete', group: 'Finance' },
  { id: 'perm-028', name: 'finance.expense.view', description: 'View expenses', resource: 'finance', action: 'expense.view', group: 'Finance' },
  { id: 'perm-029', name: 'finance.expense.create', description: 'Create expense', resource: 'finance', action: 'expense.create', group: 'Finance' },
  { id: 'perm-030', name: 'finance.expense.update', description: 'Update expense', resource: 'finance', action: 'expense.update', group: 'Finance' },
  { id: 'perm-031', name: 'finance.expense.delete', description: 'Delete expense', resource: 'finance', action: 'expense.delete', group: 'Finance' },
];
/** Roles mirroring the existing finance grants in roles.json. */
export const FINANCE_GRANT_ROLES = ['role-001', 'role-002'];

export function setupTestApp(): TestContext {
  const sqlite = createSqlite();
  applyMigrationFile(sqlite, '0001_phase1_auth.sql');
  applyMigrationFile(sqlite, '0002_phase2_reservations.sql');
  applyMigrationFile(sqlite, '0003_phase3_rooms.sql');
  applyMigrationFile(sqlite, '0004_phase4_activities.sql');
  applyMigrationFile(sqlite, '0005_phase6_finance.sql');

  const permissions = loadMock('permissions.json') as MockPermission[];
  const roles = loadMock('roles.json') as MockRole[];
  const users = loadMock('users.json') as MockUser[];
  const roomTypes = loadMock('roomTypes.json') as MockRoomType[];
  const rooms = loadMock('rooms.json') as MockRoom[];
  const reservations = loadMock('reservations.json') as MockReservation[];
  const reservationRooms = loadMock('reservationRooms.json') as MockReservationRoom[];
  const pricing = loadMock('reservationPricing.json') as MockPricing[];
  const activities = loadMock('activities.json') as MockActivity[];
  const invoices = loadMock('invoices.json') as MockInvoice[];
  const expenses = loadMock('expenses.json') as MockExpense[];

  const permIdByName = new Map(permissions.map((p) => [p.name, p.id]));
  const insPerm = sqlite.prepare(
    'INSERT INTO permissions (id, name, description, resource, action, "group") VALUES (?, ?, ?, ?, ?, ?)',
  );
  for (const p of permissions) insPerm.run(p.id, p.name, p.description, p.resource, p.action, p.group);
  for (const p of FINANCE_PERMISSIONS) {
    sqlite
      .prepare('INSERT OR IGNORE INTO permissions (id, name, description, resource, action, "group") VALUES (?, ?, ?, ?, ?, ?)')
      .run(p.id, p.name, p.description, p.resource, p.action, p.group);
    permIdByName.set(p.name, p.id);
  }

  const insRole = sqlite.prepare(
    'INSERT INTO roles (id, name, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  for (const r of roles) insRole.run(r.id, r.name, r.description, r.status, r.createdAt, r.updatedAt);

  const insRP = sqlite.prepare('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
  for (const r of roles) {
    for (const permName of r.permissions) {
      const pid = permIdByName.get(permName);
      if (pid) insRP.run(r.id, pid);
    }
  }
  const insGrant = sqlite.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
  for (const roleId of FINANCE_GRANT_ROLES) {
    for (const p of FINANCE_PERMISSIONS) insGrant.run(roleId, p.id);
  }

  const insUser = sqlite.prepare(
    'INSERT INTO users (id, name, email, password_hash, status, token_version, last_login_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)',
  );
  const insUR = sqlite.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)');
  for (const u of users) {
    insUser.run(u.id, u.name, u.email.toLowerCase(), hashSync(u.password, 4), u.status, u.lastLoginAt ?? null, u.createdAt, u.updatedAt);
    for (const roleId of u.roles) insUR.run(u.id, roleId);
  }

  const pricingByReservation = new Map(pricing.map((p) => [p.reservationId, p]));
  const insType = sqlite.prepare(
    'INSERT INTO room_types (id, name, description, capacity, facilities, default_rate, images, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const t of roomTypes) {
    insType.run(
      t.id,
      t.name,
      t.description ?? '',
      t.capacity,
      JSON.stringify(t.facilities ?? []),
      Math.round(t.defaultRate),
      JSON.stringify(t.images ?? []),
      t.status,
      t.createdAt,
      t.updatedAt,
    );
  }
  const insRoomInv = sqlite.prepare(
    'INSERT INTO rooms (id, room_number, room_type_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  for (const r of rooms) {
    insRoomInv.run(r.id, String(r.roomNumber).trim(), r.roomTypeId, r.status, r.createdAt, r.updatedAt);
  }
  const insRes = sqlite.prepare(
    'INSERT INTO reservations (id, reservation_code, guest_name, source, check_in_date, check_out_date, status, notes, total_amount, pricing_mode, payment_type, dp_type, dp_percentage, dp_fixed_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const r of reservations) {
    const p = pricingByReservation.get(r.id);
    if (!p) throw new Error(`Fixture missing pricing for ${r.id}`);
    insRes.run(
      r.id,
      r.reservationCode,
      r.guestName,
      r.source,
      r.checkInDate,
      r.checkOutDate,
      r.status,
      r.notes ?? '',
      r.totalAmount,
      p.mode,
      p.paymentType,
      p.dpType,
      p.paymentType === 'dp' && p.dpType === 'percentage' ? (p.dpPercentage ?? 0) : null,
      p.paymentType === 'dp' && p.dpType === 'fixed' ? Math.round(p.dpFixedAmount ?? 0) : null,
      r.createdAt,
      r.updatedAt,
    );
  }
  const insNight = sqlite.prepare('INSERT INTO reservation_nightly_rates (reservation_id, date, rate) VALUES (?, ?, ?)');
  for (const p of pricing) {
    for (const n of p.nightlyRates) insNight.run(p.reservationId, n.date, Math.round(n.rate));
  }
  const insRoom = sqlite.prepare(
    'INSERT INTO reservation_rooms (id, reservation_id, room_id, room_number, room_type_name, rate, subtotal, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const rr of reservationRooms) {
    insRoom.run(rr.id, rr.reservationId, rr.roomId, rr.roomNumber, rr.roomTypeName ?? '', rr.rate, rr.subtotal, rr.createdAt);
  }
  const insActivity = sqlite.prepare(
    'INSERT INTO activities (id, category, action, description, user_id, user_name, entity_type, entity_id, metadata, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const a of activities) {
    insActivity.run(
      a.id,
      a.category,
      a.action,
      a.description ?? '',
      a.userId,
      a.userName ?? '',
      a.entityType ?? null,
      a.entityId ?? null,
      JSON.stringify(Object.fromEntries(Object.entries(a.metadata ?? {}).map(([k, v]) => [k, String(v)]))),
      a.ipAddress ?? null,
      a.createdAt,
    );
  }

  const insInvoice = sqlite.prepare(
    'INSERT INTO invoices (id, invoice_number, reservation_id, guest_name, source, invoice_date, subtotal, discount, total, payment_status, invoice_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const insInvoiceItem = sqlite.prepare(
    'INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, subtotal, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  for (const inv of invoices) {
    insInvoice.run(
      inv.id,
      inv.invoiceNumber,
      inv.reservationId ?? null,
      inv.guestName,
      inv.source ?? '',
      inv.invoiceDate,
      Math.round(inv.subtotal),
      Number(inv.discount ?? 0),
      Math.round(inv.total),
      inv.paymentStatus,
      inv.invoiceStatus,
      inv.createdAt,
      inv.updatedAt,
    );
    for (const it of inv.items ?? []) {
      insInvoiceItem.run(it.id, inv.id, it.description, Math.round(it.quantity), Math.round(it.unitPrice), Math.round(it.subtotal), inv.createdAt);
    }
  }
  const insExpense = sqlite.prepare(
    'INSERT INTO expenses (id, date, category, description, amount, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const e of expenses) {
    insExpense.run(e.id, e.date, e.category, e.description ?? '', Math.round(e.amount), e.status ?? 'Pending', e.createdAt, e.updatedAt);
  }

  const env = {
    DB: fakeD1(sqlite) as unknown as D1Database,
    JWT_SECRET: TEST_JWT_SECRET,
    JWT_EXPIRES_IN: '3600',
    RESET_TOKEN_TTL_MIN: '15',
    FRONTEND_ORIGIN: 'http://localhost:5173',
    DEV_EXPOSE_RESET_TOKEN: 'true',
  } satisfies AppEnv;

  const app = createApp(() => createD1Db(env.DB));
  return { app, sqlite, env };
}

export async function loginAs(
  app: ReturnType<typeof createApp>,
  env: AppEnv,
  email: string,
  password: string,
): Promise<string> {
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }, env);
  if (res.status !== 200) throw new Error(`loginAs failed for ${email}: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { data: { token: string } };
  return json.data.token;
}

export const ADMIN = { email: 'admin@hotel.com', password: 'admin123' };
export const STAFF = { email: 'staff@hotel.com', password: 'staff123' };
export const INACTIVE = { email: 'inactive@hotel.com', password: 'inactive123' };

export function authHeaders(token: string, extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

export function jsonHeaders(token?: string) {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
