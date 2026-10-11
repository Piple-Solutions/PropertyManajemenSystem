import type {
  ActivityRow,
  ExpenseRow,
  InvoiceItemRow,
  InvoiceRow,
  NightlyRateRow,
  PermissionRow,
  ReservationRoomRow,
  ReservationRow,
  RoleRow,
  RoomRow,
  RoomTypeRow,
  UserRow,
} from '../db/schema';
import type { PricingCalculation } from './pricing';

/**
 * Response presenters. Shapes intentionally match the frontend contracts
 * (`MockUser` / `MockRole` / `MockPermission` in `services/authService.ts`):
 * - user.roles: string[] of ROLE IDS
 * - role.permissions: string[] of PERMISSION NAMES (`{resource}.{action}`)
 * Password hashes are never serialized.
 */

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface PublicRole {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface PublicPermission {
  id: string;
  name: string;
  description: string;
  resource: string;
  action: string;
  group: string;
}

export function toPublicUser(row: UserRow, roleIds: string[]): PublicUser {
  const user: PublicUser = {
    id: row.id,
    name: row.name,
    email: row.email,
    roles: [...roleIds],
    status: row.status as 'active' | 'inactive',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (row.lastLoginAt) user.lastLoginAt = row.lastLoginAt;
  return user;
}

export function toPublicRole(row: RoleRow, permissionNames: string[]): PublicRole {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    permissions: [...permissionNames],
    status: row.status as 'active' | 'inactive',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toPublicPermission(row: PermissionRow): PublicPermission {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    resource: row.resource,
    action: row.action,
    group: row.group,
  };
}

/** Effective permissions = UNION of names across all assigned roles. */
export function unionPermissions(roles: { permissions: string[] }[]): string[] {
  const set = new Set<string>();
  for (const r of roles) for (const p of r.permissions) set.add(p);
  return [...set];
}

/**
 * Reservation shapes match the frontend contracts
 * (`Reservation` in `types/auth.types.ts`, `ReservationRoom`, plus the
 * pricing payload from `services/reservationPricingService.ts`
 * `toApiPayload`/`fromApiPayload`):
 * - header fields use the mock camelCase names
 * - `pricing: { mode, nightlyRates[] }`, `payment: { type, dpType?, ... }`
 * - `calc` carries the derived values (nights/roomTotal/dpAmount/remaining)
 */
export interface PublicReservationRoom {
  id: string;
  reservationId: string;
  roomId: string;
  roomNumber: string;
  roomTypeName: string;
  rate: number;
  subtotal: number;
  createdAt: string;
}

export interface PublicReservationPricing {
  mode: 'same' | 'different';
  nightlyRates: Array<{ date: string; rate: number }>;
}

export interface PublicReservationPayment {
  type: 'no_dp' | 'dp';
  dpType: 'percentage' | 'fixed';
  dpPercentage?: number;
  dpFixedAmount?: number;
}

export interface PublicReservation {
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
  pricing: PublicReservationPricing;
  payment: PublicReservationPayment;
  calc: PricingCalculation;
  rooms?: PublicReservationRoom[];
}

export function toPublicReservationRoom(row: ReservationRoomRow): PublicReservationRoom {
  return {
    id: row.id,
    reservationId: row.reservationId,
    roomId: row.roomId,
    roomNumber: row.roomNumber,
    roomTypeName: row.roomTypeName,
    rate: row.rate,
    subtotal: row.subtotal,
    createdAt: row.createdAt,
  };
}

export function toPublicReservation(
  row: ReservationRow,
  nightly: NightlyRateRow[],
  rooms: ReservationRoomRow[] | undefined,
  calc: PricingCalculation,
): PublicReservation {
  const payment: PublicReservationPayment =
    row.paymentType === 'dp'
      ? row.dpType === 'fixed'
        ? { type: 'dp', dpType: 'fixed', dpFixedAmount: row.dpFixedAmount ?? 0 }
        : { type: 'dp', dpType: 'percentage', dpPercentage: row.dpPercentage ?? 0 }
      : { type: 'no_dp', dpType: row.dpType as 'percentage' | 'fixed' };
  const out: PublicReservation = {
    id: row.id,
    reservationCode: row.reservationCode,
    guestName: row.guestName,
    source: row.source,
    checkInDate: row.checkInDate,
    checkOutDate: row.checkOutDate,
    status: row.status,
    notes: row.notes,
    totalAmount: row.totalAmount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    pricing: {
      mode: row.pricingMode as 'same' | 'different',
      nightlyRates: nightly.map((n) => ({ date: n.date, rate: n.rate })),
    },
    payment,
    calc,
  };
  if (rooms !== undefined) out.rooms = rooms.map(toPublicReservationRoom);
  return out;
}

/**
 * Room inventory shapes match the frontend contracts
 * (`RoomType` / `Room` in `types/auth.types.ts`):
 * - facilities/images are string[] (stored as JSON TEXT)
 * - roomTypeColors are frontend-derived, never stored
 * - defaultRate is reference-only for pricing, never a persisted price
 */
export interface PublicRoomType {
  id: string;
  name: string;
  description: string;
  capacity: number;
  facilities: string[];
  defaultRate: number;
  images: string[];
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface PublicRoom {
  id: string;
  roomNumber: string;
  roomTypeId: string;
  status: 'active' | 'inactive' | 'maintenance';
  createdAt: string;
  updatedAt: string;
}

function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.map((s) => String(s)) : [];
  } catch {
    return [];
  }
}

export function toPublicRoomType(row: RoomTypeRow): PublicRoomType {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    capacity: row.capacity,
    facilities: parseStringArray(row.facilities),
    defaultRate: row.defaultRate,
    images: parseStringArray(row.images),
    status: row.status as 'active' | 'inactive',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toPublicRoom(row: RoomRow): PublicRoom {
  return {
    id: row.id,
    roomNumber: row.roomNumber,
    roomTypeId: row.roomTypeId,
    status: row.status as 'active' | 'inactive' | 'maintenance',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Activity shape matches the frontend contract (`Activity` in
 * `types/auth.types.ts`): camelCase names, `metadata` as a string-valued
 * object, optional `entityType`/`entityId`/`ipAddress`, and NO `updatedAt`
 * (append-only / immutable).
 */
export interface PublicActivity {
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

function parseMetadata(raw: string | null | undefined): Record<string, string> | undefined {
  if (!raw) return undefined;
  try {
    const v: unknown = JSON.parse(raw);
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return undefined;
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = String(val);
    }
    return out;
  } catch {
    return undefined;
  }
}

export function toPublicActivity(row: ActivityRow): PublicActivity {
  const activity: PublicActivity = {
    id: row.id,
    category: row.category,
    action: row.action,
    description: row.description,
    userId: row.userId,
    userName: row.userName,
    createdAt: row.createdAt,
  };
  if (row.entityType) activity.entityType = row.entityType;
  if (row.entityId) activity.entityId = row.entityId;
  const metadata = parseMetadata(row.metadata);
  if (metadata && Object.keys(metadata).length > 0) activity.metadata = metadata;
  if (row.ipAddress) activity.ipAddress = row.ipAddress;
  return activity;
}

/**
 * Finance shapes match the frontend contracts
 * (`Invoice` / `InvoiceItem` / `Expense` / `Sale` in
 * `frontend/src/types/auth.types.ts`):
 * - camelCase names, integer IDR money, discount as PERCENT 0-100
 * - `Sale` is DERIVED from invoices (no sales table): date = invoiceDate,
 *   amount = total, description mirrors the mock pattern
 *   `Room charge - <guestName>`
 */
export interface PublicInvoiceItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface PublicInvoice {
  id: string;
  invoiceNumber: string;
  reservationId?: string;
  guestName: string;
  source: string;
  invoiceDate: string;
  items: PublicInvoiceItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentStatus: string;
  invoiceStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicExpense {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  status?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicSale {
  id: string;
  reservationId?: string;
  invoiceId?: string;
  date: string;
  amount: number;
  source: string;
  description: string;
}

export function toPublicInvoiceItem(row: InvoiceItemRow): PublicInvoiceItem {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    description: row.description,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    subtotal: row.subtotal,
  };
}

export function toPublicInvoice(row: InvoiceRow, items: InvoiceItemRow[]): PublicInvoice {
  const invoice: PublicInvoice = {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    guestName: row.guestName,
    source: row.source,
    invoiceDate: row.invoiceDate,
    items: items.map(toPublicInvoiceItem),
    subtotal: row.subtotal,
    discount: row.discount,
    total: row.total,
    paymentStatus: row.paymentStatus,
    invoiceStatus: row.invoiceStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (row.reservationId) invoice.reservationId = row.reservationId;
  return invoice;
}

export function toPublicExpense(row: ExpenseRow): PublicExpense {
  const expense: PublicExpense = {
    id: row.id,
    date: row.date,
    category: row.category,
    description: row.description,
    amount: row.amount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (row.status) expense.status = row.status;
  return expense;
}

/** Derived sale: non-cancelled invoices only (see sales service). */
export function toDerivedSale(row: InvoiceRow): PublicSale {
  const sale: PublicSale = {
    id: `sale-${row.id}`,
    date: row.invoiceDate,
    amount: row.total,
    source: row.source,
    description: `Room charge - ${row.guestName}`,
    invoiceId: row.id,
  };
  if (row.reservationId) sale.reservationId = row.reservationId;
  return sale;
}
