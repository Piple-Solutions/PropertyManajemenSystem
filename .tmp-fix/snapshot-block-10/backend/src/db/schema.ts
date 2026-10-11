import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Phase 1 schema — Cloudflare D1 (SQLite).
 *
 * Conventions:
 * - TEXT primary keys. Seed rows keep the frontend mock ids
 *   (`user-001`, `role-001`, `perm-001`) for stable lookups; new rows use
 *   `crypto.randomUUID()`. The frontend treats ids as opaque strings.
 * - Timestamps are TEXT ISO-8601 strings (matches `createdAt`/`updatedAt`
 *   shapes the frontend already consumes).
 * - Emails are stored normalized (trimmed + lowercased) with a UNIQUE index.
 * - No PostgreSQL-specific types or syntax anywhere.
 */

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  status: text('status').notNull().default('active'),
  /**
   * Incremented on password change/reset. Embedded in the JWT as `tv` and
   * re-checked per request so old tokens stop working after a password change.
   */
  tokenVersion: integer('token_version').notNull().default(0),
  lastLoginAt: text('last_login_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const permissions = sqliteTable('permissions', {
  id: text('id').primaryKey(),
  /** `{resource}.{action}`, e.g. `reservation.checkin`. Preserved from mock data. */
  name: text('name').notNull().unique(),
  description: text('description').notNull().default(''),
  resource: text('resource').notNull(),
  action: text('action').notNull(),
  /** Quoted `"group"` — GROUP is a reserved word in SQLite. */
  group: text('group').notNull(),
});

export const userRoles = sqliteTable(
  'user_roles',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

export const rolePermissions = sqliteTable(
  'role_permissions',
  {
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: text('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

/**
 * Password-reset tokens. Stores ONLY the SHA-256 hash of the random token
 * (never the token itself), with expiry and single-use marking.
 */
export const passwordResetTokens = sqliteTable('password_reset_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  usedAt: text('used_at'),
  createdAt: text('created_at').notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type RoleRow = typeof roles.$inferSelect;
export type PermissionRow = typeof permissions.$inferSelect;

/**
 * Phase 2 — reservations. Conventions follow Phase 1 (TEXT ids, ISO TEXT
 * timestamps). `source` is the single guest-source/rate-source column.
 * Derived totals are never stored; see `src/lib/pricing.ts`.
 */
export const reservations = sqliteTable('reservations', {
  id: text('id').primaryKey(),
  reservationCode: text('reservation_code').notNull().unique(),
  guestName: text('guest_name').notNull(),
  source: text('source').notNull(),
  checkInDate: text('check_in_date').notNull(),
  checkOutDate: text('check_out_date').notNull(),
  status: text('status').notNull().default('reserved'),
  notes: text('notes').notNull().default(''),
  totalAmount: integer('total_amount').notNull().default(0),
  pricingMode: text('pricing_mode').notNull().default('same'),
  paymentType: text('payment_type').notNull().default('no_dp'),
  dpType: text('dp_type').notNull().default('percentage'),
  dpPercentage: real('dp_percentage'),
  dpFixedAmount: integer('dp_fixed_amount'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/**
 * Rooms attached to a reservation, with per-room rate/subtotal snapshots.
 * `roomId` is plain TEXT until Phase 3 adds the rooms inventory table + FK.
 */
export const reservationRooms = sqliteTable('reservation_rooms', {
  id: text('id').primaryKey(),
  reservationId: text('reservation_id')
    .notNull()
    .references(() => reservations.id, { onDelete: 'cascade' }),
  roomId: text('room_id').notNull(),
  roomNumber: text('room_number').notNull(),
  roomTypeName: text('room_type_name').notNull().default(''),
  rate: integer('rate').notNull().default(0),
  subtotal: integer('subtotal').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

/** Per-night rates: the sole source of truth for the reservation total. */
export const reservationNightlyRates = sqliteTable(
  'reservation_nightly_rates',
  {
    reservationId: text('reservation_id')
      .notNull()
      .references(() => reservations.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    rate: integer('rate').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.reservationId, t.date] })],
);

export type ReservationRow = typeof reservations.$inferSelect;
export type ReservationRoomRow = typeof reservationRooms.$inferSelect;
export type NightlyRateRow = typeof reservationNightlyRates.$inferSelect;

/**
 * Phase 3 — room inventory. Conventions follow Phases 1 + 2 (TEXT ids, ISO
 * TEXT timestamps). `facilities` / `images` are stored as JSON TEXT arrays
 * and parsed in presenters; `defaultRate` is reference-only for pricing.
 */
export const roomTypes = sqliteTable('room_types', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description').notNull().default(''),
  capacity: integer('capacity').notNull(),
  facilities: text('facilities').notNull().default('[]'),
  defaultRate: integer('default_rate').notNull(),
  images: text('images').notNull().default('[]'),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(),
  roomNumber: text('room_number').notNull().unique(),
  roomTypeId: text('room_type_id')
    .notNull()
    .references(() => roomTypes.id, { onDelete: 'restrict' }),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type RoomTypeRow = typeof roomTypes.$inferSelect;
export type RoomRow = typeof rooms.$inferSelect;

/**
 * Phase 4 — activities / audit log. Append-only: rows are written once by
 * server-side audit hooks and never updated or deleted through the API.
 * `userId` / `userName` are point-in-time snapshots (no FK to users);
 * `entityType` / `entityId` are plain references (no FK); `metadata` is a
 * JSON TEXT object with string values only.
 */
export const activities = sqliteTable('activities', {
  id: text('id').primaryKey(),
  category: text('category').notNull(),
  action: text('action').notNull(),
  description: text('description').notNull().default(''),
  userId: text('user_id').notNull(),
  userName: text('user_name').notNull().default(''),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  metadata: text('metadata').notNull().default('{}'),
  ipAddress: text('ip_address'),
  createdAt: text('created_at').notNull(),
});

export type ActivityRow = typeof activities.$inferSelect;

/**
 * Phase 6 — finance. Conventions follow Phases 1-4 (TEXT ids, ISO TEXT
 * timestamps, INTEGER IDR money). Frontend source of truth:
 * `frontend/src/types/auth.types.ts` (`Invoice` / `InvoiceItem` / `Expense`).
 *
 * - `discount` is a PERCENT 0-100; `total` is always recomputed server-side.
 * - Status columns accept the WIDE frontend literal set (Draft/Sent/
 *   Completed/Cancelled, Pending/Paid/Overdue/Partial). Overdue/Partial are
 *   stored display literals only — never auto-assigned (no due_date column).
 * - `reservationId` is FK-less plain TEXT: Finance reads reservations but
 *   never mutates them.
 * - No sales table (derived from invoices), no payments table (markPaid is
 *   an atomic status flip; the frontend has no payment history/method UI),
 *   no due_date / tax / service-charge columns.
 */
export const invoices = sqliteTable('invoices', {
  id: text('id').primaryKey(),
  invoiceNumber: text('invoice_number').notNull().unique(),
  reservationId: text('reservation_id'),
  guestName: text('guest_name').notNull(),
  source: text('source').notNull().default(''),
  invoiceDate: text('invoice_date').notNull(),
  subtotal: integer('subtotal').notNull().default(0),
  discount: real('discount').notNull().default(0),
  total: integer('total').notNull().default(0),
  paymentStatus: text('payment_status').notNull().default('Pending'),
  invoiceStatus: text('invoice_status').notNull().default('Draft'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const invoiceItems = sqliteTable('invoice_items', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  quantity: integer('quantity').notNull().default(1),
  unitPrice: integer('unit_price').notNull().default(0),
  subtotal: integer('subtotal').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const expenses = sqliteTable('expenses', {
  id: text('id').primaryKey(),
  date: text('date').notNull(),
  category: text('category').notNull(),
  description: text('description').notNull().default(''),
  amount: integer('amount').notNull(),
  status: text('status').notNull().default('Pending'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type InvoiceRow = typeof invoices.$inferSelect;
export type InvoiceItemRow = typeof invoiceItems.$inferSelect;
export type ExpenseRow = typeof expenses.$inferSelect;
