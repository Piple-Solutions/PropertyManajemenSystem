import { z } from 'zod';
import { badRequest, unprocessable } from './errors';
import { isRealCalendarDate } from './pricing';

/**
 * Request validation. Rules mirror `frontend/src/utils/validationUtils.ts`
 * and the inline page validators (RegisterPage, ResetPasswordPage):
 * - name: min 2 chars
 * - email: valid format, normalized (trim + lowercase) before storage/lookup
 * - password: min 6 chars (new passwords)
 */
/**
 * BE-009 limits. Generous on purpose: the longest seeded value is 53
 * characters (a room-type description) and the largest seeded array holds 26
 * permissions; the frontend forms enforce no length at all. They exist to
 * bound CPU, storage and D1's 100 bound parameters per statement.
 */
export const LIMITS = {
  name: 100,
  email: 254,
  password: 128,
  shortText: 100,
  description: 500,
  longDescription: 2000,
  notes: 1000,
  code: 30,
  id: 100,
  search: 100,
  filter: 50,
  imageRef: 2000,
  maxPage: 100_000,
  userRoles: 20,
  rolePermissions: 200,
  facilities: 50,
  images: 20,
  invoiceItems: 100,
  reservationRooms: 60,
  reportCategories: 20,
} as const;

const idField = z.string().min(1).max(LIMITS.id);

export const emailField = z.string().trim().toLowerCase().max(LIMITS.email, 'Email is too long').email('Invalid email address');

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required').max(LIMITS.password, 'Password is too long'),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(LIMITS.name, 'Name is too long'),
  email: emailField,
  password: z.string().min(6, 'Password must be at least 6 characters').max(LIMITS.password, 'Password is too long'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(LIMITS.password, 'Password is too long'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters').max(LIMITS.password, 'Password is too long'),
});

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required').max(200, 'Reset token is too long'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters').max(LIMITS.password, 'Password is too long'),
});

export const userStatusSchema = z.enum(['active', 'inactive']);
export const roleStatusSchema = z.enum(['active', 'inactive']);

export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(LIMITS.name, 'Name is too long'),
  email: emailField,
  password: z.string().min(6, 'Password must be at least 6 characters').max(LIMITS.password, 'Password is too long'),
  roles: z.array(idField).min(1, 'At least one role is required').max(LIMITS.userRoles, 'Too many roles'),
  status: userStatusSchema.optional(),
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(LIMITS.name, 'Name is too long').optional(),
    email: emailField.optional(),
    roles: z.array(idField).min(1, 'At least one role is required').max(LIMITS.userRoles, 'Too many roles').optional(),
    status: userStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const setUserRolesSchema = z.object({
  roles: z.array(idField).min(1, 'At least one role is required').max(LIMITS.userRoles, 'Too many roles'),
});

export const setUserStatusSchema = z.object({
  status: userStatusSchema,
});

export const createRoleSchema = z.object({
  name: z.string().trim().min(2, 'Role name must be at least 2 characters').max(LIMITS.name, 'Role name is too long'),
  description: z.string().trim().max(LIMITS.description, 'Description is too long').optional().default(''),
  permissions: z.array(idField).max(LIMITS.rolePermissions, 'Too many permissions').optional().default([]),
  status: roleStatusSchema.optional(),
});

export const updateRoleSchema = z
  .object({
    name: z.string().trim().min(2, 'Role name must be at least 2 characters').max(LIMITS.name, 'Role name is too long').optional(),
    description: z.string().trim().max(LIMITS.description, 'Description is too long').optional(),
    status: roleStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const setRolePermissionsSchema = z.object({
  permissions: z.array(idField).max(LIMITS.rolePermissions, 'Too many permissions'),
});

/** `?search=&status=&page=&pageSize=` — mirrors UserListPage/RoleListPage controls. */
export const listQuerySchema = z.object({
  search: z.string().trim().max(LIMITS.search, 'Search is too long').optional().default(''),
  status: z.string().trim().max(LIMITS.filter).optional().default('all'),
  page: z.coerce.number().int().min(1).max(LIMITS.maxPage).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(10),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

/**
 * Reservation validation. Rules mirror the wizard draft validators
 * (`types/reservationDraft.types.ts`) and `utils/pricingUtils.ts`
 * (`validatePricing`):
 * - guestName min 2, source required, checkOut > checkIn
 * - >= 1 room, notes <= 1000 chars
 * - nightly rates: integers >= 0; DP % 0-100; fixed DP >= 0
 * Fixed-vs-total cap is enforced in the service (needs the computed total).
 */
export const reservationSourceSchema = z.enum(['direct', 'phone', 'whatsapp', 'website', 'ota', 'other']);
export const reservationStatusSchema = z.enum(['reserved', 'checked-in', 'checked-out', 'cancelled']);
export const pricingModeSchema = z.enum(['same', 'different']);
export const paymentTypeSchema = z.enum(['no_dp', 'dp']);
export const dpTypeSchema = z.enum(['percentage', 'fixed']);

/**
 * BE-031: upper bounds. Generous (Rp10 miliar per unit price / expense /
 * nightly rate, 10.000 per quantity) yet far below 2^53, so every sum the
 * server computes stays an exact integer. The largest seeded values are
 * Rp45 juta (expense) and 28 x Rp1,2 juta (invoice line).
 */
export const MAX_MONEY = 10_000_000_000;
export const MAX_QUANTITY = 10_000;
/** A whole invoice (sum of lines, before discount) may not exceed Rp1 triliun. */
export const MAX_INVOICE_SUBTOTAL = 1_000_000_000_000;

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  // BE-025: 2027-02-31 matches the shape but is not a day on any calendar.
  .refine(isRealCalendarDate, 'Date must be a real calendar date');

export const nightlyRateSchema = z.object({
  date: dateString,
  rate: z.number().int('Rate must be an integer').min(0, 'Rate must be >= Rp0.').max(MAX_MONEY, `Rate cannot exceed ${MAX_MONEY}.`),
});

export const reservationPricingSchema = z
  .object({
    mode: pricingModeSchema,
    nightlyRates: z.array(nightlyRateSchema).min(1, 'At least one night is required').max(60, 'At most 60 nights allowed'),
    paymentType: paymentTypeSchema,
    dpType: dpTypeSchema,
    dpPercentage: z
      .number({ invalid_type_error: 'DP percentage must be numeric.' })
      .min(0, 'DP percentage must be between 0 and 100.')
      .max(100, 'DP percentage must be between 0 and 100.')
      .optional(),
    dpFixedAmount: z
      .number({ invalid_type_error: 'DP amount must be numeric.' })
      .int()
      .min(0, 'DP amount must be >= Rp0.')
      .max(MAX_MONEY, `DP amount cannot exceed ${MAX_MONEY}.`)
      .optional(),
  })
  .superRefine((v, ctx) => {
    // Mirrors frontend validatePricing: the DP value matching dpType is
    // required whenever a down payment term is chosen.
    if (v.paymentType === 'dp' && v.dpType === 'percentage' && v.dpPercentage === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'DP percentage is required.', path: ['dpPercentage'] });
    }
    if (v.paymentType === 'dp' && v.dpType === 'fixed' && v.dpFixedAmount === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'DP amount is required.', path: ['dpFixedAmount'] });
    }
  });

/**
 * Rooms are sent with client-resolved snapshots (`roomNumber`,
 * `roomTypeName`) because the rooms inventory table lands in Phase 3.
 * The snapshots are display history; `roomId` stays the stable key.
 */
export const reservationRoomInputSchema = z.object({
  roomId: z.string().min(1, 'Room id is required.').max(LIMITS.id),
  roomNumber: z.string().trim().min(1, 'Room number is required.').max(LIMITS.code),
  roomTypeName: z.string().trim().max(LIMITS.shortText).optional().default(''),
});

export const createReservationSchema = z
  .object({
    guestName: z.string().trim().min(2, 'Guest name must be at least 2 characters.').max(LIMITS.name, 'Guest name is too long.'),
    source: reservationSourceSchema,
    checkInDate: dateString,
    checkOutDate: dateString,
    notes: z.string().max(1000, 'Notes must be at most 1000 characters.').optional().default(''),
    rooms: z.array(reservationRoomInputSchema).min(1, 'Select at least one room to continue.').max(LIMITS.reservationRooms, 'Too many rooms.'),
    pricing: reservationPricingSchema,
  })
  .refine((v) => v.checkOutDate > v.checkInDate, {
    message: 'Check-out must be after check-in.',
    path: ['checkOutDate'],
  });

export const updateReservationSchema = z
  .object({
    guestName: z.string().trim().min(2, 'Guest name must be at least 2 characters.').max(LIMITS.name, 'Guest name is too long.').optional(),
    source: reservationSourceSchema.optional(),
    checkInDate: dateString.optional(),
    checkOutDate: dateString.optional(),
    notes: z.string().max(1000, 'Notes must be at most 1000 characters.').optional(),
    rooms: z.array(reservationRoomInputSchema).min(1, 'Select at least one room to continue.').max(LIMITS.reservationRooms, 'Too many rooms.').optional(),
    pricing: reservationPricingSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' })
  .refine(
    (v) => !(v.checkInDate && v.checkOutDate) || v.checkOutDate > v.checkInDate,
    { message: 'Check-out must be after check-in.', path: ['checkOutDate'] },
  );

/** List filters mirror ReservationListPage controls. */
export const reservationListQuerySchema = z.object({
  search: z.string().trim().max(LIMITS.search, 'Search is too long').optional().default(''),
  status: z.string().trim().max(LIMITS.filter).optional().default('all'),
  source: z.string().trim().max(LIMITS.filter).optional().default('all'),
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .optional(),
  page: z.coerce.number().int().min(1).max(LIMITS.maxPage).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(10),
  include: z.string().trim().max(LIMITS.filter).optional().default(''),
});

export type ReservationListQuery = z.infer<typeof reservationListQuerySchema>;

export const calendarQuerySchema = z.object({
  from: dateString,
  to: dateString,
  roomId: z.string().trim().max(LIMITS.id).optional(),
  status: z.string().trim().max(LIMITS.filter).optional().default('all'),
});

export const availabilityQuerySchema = z.object({
  checkIn: dateString,
  checkOut: dateString,
  excludeId: z.string().trim().max(LIMITS.id).optional(),
});

/**
 * `?year=YYYY[&force=true]` — Indonesian public holidays proxied from upstream.
 * `force` bypasses the in-memory TTL cache (used by the "refresh" affordance
 * and by tests). Upstream publishes a subset of years, so an unpublished year
 * is a normal empty result — NOT an error.
 */
export const holidaysQuerySchema = z.object({
  year: z.coerce.number().int().min(2000, 'Year must be 2000 or later').max(2100, 'Year must be 2100 or earlier'),
  force: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
});

/**
 * Phase 3 — room inventory validation. Rules mirror the frontend form schemas
 * (`RoomTypeForm.tsx` / `RoomForm.tsx`, stricter than `validationUtils.ts`):
 * - type name min 2, description min 1, capacity int >= 1,
 *   defaultRate int > 0, facilities string[] (empty allowed), images string[],
 *   type status active|inactive
 * - roomNumber required (trimmed, unique), roomTypeId required (must exist),
 *   room status active|inactive|maintenance
 * `defaultRate` is reference-only for pricing, never a persisted price.
 */
export const roomTypeStatusSchema = z.enum(['active', 'inactive']);
export const roomStatusSchema = z.enum(['active', 'inactive', 'maintenance']);

export const createRoomTypeSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(LIMITS.name, 'Name is too long'),
  description: z.string().trim().min(1, 'Description is required').max(LIMITS.longDescription, 'Description is too long'),
  capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1').max(1000),
  facilities: z.array(z.string().trim().min(1).max(LIMITS.shortText)).max(LIMITS.facilities, 'Too many facilities').optional().default([]),
  defaultRate: z.coerce.number().int().min(1, 'Default rate must be a positive number').max(MAX_MONEY),
  images: z.array(z.string().trim().max(LIMITS.imageRef)).max(LIMITS.images, 'Too many images').optional().default([]),
  status: roomTypeStatusSchema.optional(),
});

export const updateRoomTypeSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(LIMITS.name, 'Name is too long').optional(),
    description: z.string().trim().min(1, 'Description is required').max(LIMITS.longDescription, 'Description is too long').optional(),
    capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1').max(1000).optional(),
    facilities: z.array(z.string().trim().min(1).max(LIMITS.shortText)).max(LIMITS.facilities, 'Too many facilities').optional(),
    defaultRate: z.coerce.number().int().min(1, 'Default rate must be a positive number').max(MAX_MONEY).optional(),
    images: z.array(z.string().trim().max(LIMITS.imageRef)).max(LIMITS.images, 'Too many images').optional(),
    status: roomTypeStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const setRoomTypeStatusSchema = z.object({
  status: roomTypeStatusSchema,
});

export const createRoomSchema = z.object({
  roomNumber: z.string().trim().min(1, 'Room number is required').max(LIMITS.code, 'Room number is too long'),
  roomTypeId: z.string().trim().min(1, 'Room type is required').max(LIMITS.id),
  status: roomStatusSchema.optional(),
});

export const updateRoomSchema = z
  .object({
    roomNumber: z.string().trim().min(1, 'Room number is required').max(LIMITS.code, 'Room number is too long').optional(),
    roomTypeId: z.string().trim().min(1, 'Room type is required').max(LIMITS.id).optional(),
    status: roomStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const setRoomStatusSchema = z.object({
  status: roomStatusSchema,
});

/** `?search=&status=&page=&pageSize=` — mirrors RoomTypeListPage controls. */
export const roomTypeListQuerySchema = z.object({
  search: z.string().trim().max(LIMITS.search, 'Search is too long').optional().default(''),
  status: z.string().trim().max(LIMITS.filter).optional().default('all'),
  page: z.coerce.number().int().min(1).max(LIMITS.maxPage).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(10),
});

export type RoomTypeListQuery = z.infer<typeof roomTypeListQuerySchema>;

/** `?search=&status=&roomTypeId=&page=&pageSize=` — mirrors RoomListPage controls. */
export const roomListQuerySchema = z.object({
  search: z.string().trim().max(LIMITS.search, 'Search is too long').optional().default(''),
  status: z.string().trim().max(LIMITS.filter).optional().default('all'),
  roomTypeId: z.string().trim().max(LIMITS.id).optional().default('all'),
  page: z.coerce.number().int().min(1).max(LIMITS.maxPage).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(10),
});

export type RoomListQuery = z.infer<typeof roomListQuerySchema>;

/**
 * Phase 4 — activity list filters mirror ActivityLogPage controls:
 * - search matches description + userName (client did both case-insensitively)
 * - category exact match (`all` disables), mirroring the category filter
 * - userId exact match (backs the old `getByUser` service method)
 * - newest-first ordering is fixed server-side; pageSize 8 mirrors the UI
 *   default (options [8, 16]).
 */
export const activityCategorySchema = z.enum(['authentication', 'reservation', 'finance', 'system']);

export const activityListQuerySchema = z.object({
  search: z.string().trim().max(LIMITS.search, 'Search is too long').optional().default(''),
  category: z.string().trim().max(LIMITS.filter).optional().default('all'),
  userId: z.string().trim().max(LIMITS.id).optional().default(''),
  page: z.coerce.number().int().min(1).max(LIMITS.maxPage).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(10),
});

export type ActivityListQuery = z.infer<typeof activityListQuerySchema>;

/**
 * Parse with Zod and raise a 422 ApiError shaped as
 * `{ message, errors: { field: [messages] } }`.
 */
export function parseOr422<Out>(schema: z.ZodType<Out, z.ZodTypeDef, unknown>, input: unknown): Out {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : '_';
    (errors[key] ??= []).push(issue.message);
  }
  throw unprocessable('Validation failed', errors);
}

/** Read a `:param` segment; Hono types it optional once routers compose. */
export function pathParam(c: { req: { param: (name: string) => string | undefined } }, name: string): string {
  const value = c.req.param(name);
  if (!value) throw badRequest(`Missing path parameter: ${name}`);
  return value;
}

/**
 * Phase 6 — finance validation. Rules mirror the LIVE frontend schema
 * (`InvoiceForm.tsx` `createInvoiceSchema`, stricter than the dead
 * `validationUtils.invoiceSchema` which wrongly requires `dueDate`):
 * - invoiceNumber required (format `INV-YYYY-NNN`; uniqueness enforced in
 *   the service with server-side allocation on conflict)
 * - guestName min 2, source required (free string — reservation sources),
 *   invoiceDate valid YYYY-MM-DD
 * - items min 1 (description required, quantity int >= 1, unitPrice int >= 0)
 * - discount PERCENT 0-100 (matches form zod + `%` rendering + seed math)
 * - statuses accept the WIDE frontend literal set (types/zod in the
 *   frontend are narrower than what the UI actually assigns/renders)
 * - Completed => Paid (mirrors the form submit gate)
 */
export const INVOICE_STATUS_VIA_ACTIONS =
  'Status invoice tidak dapat diatur lewat create/update. Gunakan endpoint send, pay, atau cancel.';

export const invoiceStatusSchema = z.enum(['Draft', 'Sent', 'Completed', 'Cancelled']);
export const paymentStatusSchema = z.enum(['Pending', 'Paid', 'Overdue', 'Partial']);
export const expenseCategorySchema = z.enum([
  'Utilities',
  'Staff',
  'Maintenance',
  'Supplies',
  'Marketing',
  'Food & Beverage',
  'Laundry',
  'Other',
]);
export const expenseStatusSchema = z.enum(['Paid', 'Pending']);

export const invoiceNumberSchema = z
  .string()
  .trim()
  .min(1, 'Invoice number is required')
  .max(LIMITS.code)
  .regex(/^INV-\d{4}-\d{3,}$/, 'Invoice number must look like INV-YYYY-NNN');

export const invoiceItemInputSchema = z.object({
  description: z.string().trim().min(1, 'Description is required').max(200, 'Description is too long'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(MAX_QUANTITY, `Quantity cannot exceed ${MAX_QUANTITY}`),
  unitPrice: z.coerce.number().int().min(0, 'Unit price must be at least 0').max(MAX_MONEY, `Unit price cannot exceed ${MAX_MONEY}`),
});

export const createInvoiceSchema = z
  .object({
    invoiceNumber: invoiceNumberSchema.optional(),
    reservationId: z.string().trim().min(1).max(LIMITS.id).optional(),
    guestName: z.string().trim().min(2, 'Guest name must be at least 2 characters').max(LIMITS.name, 'Guest name is too long'),
    source: z.string().trim().min(1, 'Source is required').max(LIMITS.filter),
    invoiceDate: dateString,
    items: z.array(invoiceItemInputSchema).min(1, 'At least one item is required').max(LIMITS.invoiceItems, 'Too many items'),
    discount: z.coerce.number().min(0, 'Discount must be at least 0').max(100, 'Discount cannot exceed 100').optional().default(0),
    invoiceStatus: invoiceStatusSchema.optional().default('Draft'),
    paymentStatus: paymentStatusSchema.optional().default('Pending'),
  })
  .refine((v) => v.invoiceStatus !== 'Completed' || v.paymentStatus === 'Paid', {
    message: 'Completed invoices must be Paid.',
    path: ['paymentStatus'],
  })
  // BE-020: a new invoice is always Draft/Pending; status moves only through
  // POST /:id/send, /:id/pay and /:id/cancel (each with its own permission
  // and conditional update). The defaults may still be sent explicitly.
  .refine((v) => v.invoiceStatus === 'Draft', {
    message: INVOICE_STATUS_VIA_ACTIONS,
    path: ['invoiceStatus'],
  })
  .refine((v) => v.paymentStatus === 'Pending', {
    message: INVOICE_STATUS_VIA_ACTIONS,
    path: ['paymentStatus'],
  });

export const updateInvoiceSchema = z
  .object({
    invoiceNumber: invoiceNumberSchema.optional(),
    reservationId: z.string().trim().min(1).max(LIMITS.id).optional(),
    guestName: z.string().trim().min(2, 'Guest name must be at least 2 characters').max(LIMITS.name, 'Guest name is too long').optional(),
    source: z.string().trim().min(1, 'Source is required').max(LIMITS.filter).optional(),
    invoiceDate: dateString.optional(),
    items: z.array(invoiceItemInputSchema).min(1, 'At least one item is required').max(LIMITS.invoiceItems, 'Too many items').optional(),
    discount: z.coerce.number().min(0, 'Discount must be at least 0').max(100, 'Discount cannot exceed 100').optional(),
    invoiceStatus: invoiceStatusSchema.optional(),
    paymentStatus: paymentStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' })
  .refine((v) => !(v.invoiceStatus === 'Completed' && v.paymentStatus !== undefined && v.paymentStatus !== 'Paid'), {
    message: 'Completed invoices must be Paid.',
    path: ['paymentStatus'],
  });

/** `?search=&status=&payment=&source=&start=&end=&page=&pageSize=` — mirrors InvoiceListPage controls. */
export const invoiceListQuerySchema = z.object({
  search: z.string().trim().max(LIMITS.search, 'Search is too long').optional().default(''),
  status: z.string().trim().max(LIMITS.filter).optional().default('all'),
  payment: z.string().trim().max(LIMITS.filter).optional().default('all'),
  source: z.string().trim().max(LIMITS.filter).optional().default('all'),
  start: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start must be YYYY-MM-DD').optional(),
  end: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'End must be YYYY-MM-DD').optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(10),
});

export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

export const createExpenseSchema = z.object({
  date: dateString,
  category: expenseCategorySchema,
  description: z.string().trim().min(1, 'Description is required').max(LIMITS.description, 'Description is too long'),
  amount: z.coerce.number().int().min(1, 'Amount must be a positive number').max(MAX_MONEY, `Amount cannot exceed ${MAX_MONEY}`),
  status: expenseStatusSchema.optional().default('Pending'),
});

export const updateExpenseSchema = z
  .object({
    date: dateString.optional(),
    category: expenseCategorySchema.optional(),
    description: z.string().trim().min(1, 'Description is required').max(LIMITS.description, 'Description is too long').optional(),
    amount: z.coerce.number().int().min(1, 'Amount must be a positive number').max(MAX_MONEY, `Amount cannot exceed ${MAX_MONEY}`).optional(),
    status: expenseStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

/** `?search=&category=&status=&start=&end=&page=&pageSize=` — mirrors ExpensesPage controls. */
export const expenseListQuerySchema = z.object({
  search: z.string().trim().max(LIMITS.search, 'Search is too long').optional().default(''),
  category: z.string().trim().max(LIMITS.filter).optional().default('all'),
  status: z.string().trim().max(LIMITS.filter).optional().default('all'),
  start: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start must be YYYY-MM-DD').optional(),
  end: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'End must be YYYY-MM-DD').optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(10),
});

export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>;

/** `?start=&end=&source=&page=&pageSize=` — mirrors SalesPage period + source controls. */
export const salesListQuerySchema = z.object({
  start: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start must be YYYY-MM-DD').optional(),
  end: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'End must be YYYY-MM-DD').optional(),
  source: z.string().trim().max(LIMITS.filter).optional().default('all'),
  page: z.coerce.number().int().min(1).max(LIMITS.maxPage).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(10),
});

/** `GET /sales/breakdown` used to bypass zod (raw strings, lexicographic compare). Missing = no bound. */
export const salesBreakdownQuerySchema = z.object({
  start: dateString.optional(),
  end: dateString.optional(),
});

export type SalesListQuery = z.infer<typeof salesListQuerySchema>;

/** `?start=&end=&categories=a,b` — mirrors ReportPage preset/custom range + category checkboxes. */
export const reportSummaryQuerySchema = z.object({
  start: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start must be YYYY-MM-DD').refine(isRealCalendarDate, 'Start must be a real calendar date'),
  end: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'End must be YYYY-MM-DD').refine(isRealCalendarDate, 'End must be a real calendar date'),
  categories: z.string().trim().max(500, 'Categories list is too long').optional().default(''),
});

/** Split `a,b,c`; at most LIMITS.reportCategories entries so `IN (...)` stays far below 100 bound parameters. */
export function parseCategoryList(raw: string): string[] {
  const list = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
  if (list.length > LIMITS.reportCategories) {
    throw unprocessable('Validation failed', { categories: [`At most ${LIMITS.reportCategories} categories are allowed.`] });
  }
  return list;
}

export type ReportSummaryQuery = z.infer<typeof reportSummaryQuerySchema>;
