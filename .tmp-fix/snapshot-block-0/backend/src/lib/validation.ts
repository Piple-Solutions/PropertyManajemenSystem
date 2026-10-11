import { z } from 'zod';
import { badRequest, unprocessable } from './errors';

/**
 * Request validation. Rules mirror `frontend/src/utils/validationUtils.ts`
 * and the inline page validators (RegisterPage, ResetPasswordPage):
 * - name: min 2 chars
 * - email: valid format, normalized (trim + lowercase) before storage/lookup
 * - password: min 6 chars (new passwords)
 */
export const emailField = z.string().trim().toLowerCase().email('Invalid email address');

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  email: emailField,
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

export const userStatusSchema = z.enum(['active', 'inactive']);
export const roleStatusSchema = z.enum(['active', 'inactive']);

export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  email: emailField,
  password: z.string().min(6, 'Password must be at least 6 characters'),
  roles: z.array(z.string().min(1)).min(1, 'At least one role is required'),
  status: userStatusSchema.optional(),
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').optional(),
    email: emailField.optional(),
    roles: z.array(z.string().min(1)).min(1, 'At least one role is required').optional(),
    status: userStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const setUserRolesSchema = z.object({
  roles: z.array(z.string().min(1)).min(1, 'At least one role is required'),
});

export const setUserStatusSchema = z.object({
  status: userStatusSchema,
});

export const createRoleSchema = z.object({
  name: z.string().trim().min(2, 'Role name must be at least 2 characters'),
  description: z.string().trim().optional().default(''),
  permissions: z.array(z.string().min(1)).optional().default([]),
  status: roleStatusSchema.optional(),
});

export const updateRoleSchema = z
  .object({
    name: z.string().trim().min(2, 'Role name must be at least 2 characters').optional(),
    description: z.string().trim().optional(),
    status: roleStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const setRolePermissionsSchema = z.object({
  permissions: z.array(z.string().min(1)),
});

/** `?search=&status=&page=&pageSize=` — mirrors UserListPage/RoleListPage controls. */
export const listQuerySchema = z.object({
  search: z.string().trim().optional().default(''),
  status: z.string().trim().optional().default('all'),
  page: z.coerce.number().int().min(1).optional().default(1),
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

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

export const nightlyRateSchema = z.object({
  date: dateString,
  rate: z.number().int('Rate must be an integer').min(0, 'Rate must be >= Rp0.'),
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
  roomId: z.string().min(1, 'Room id is required.'),
  roomNumber: z.string().trim().min(1, 'Room number is required.'),
  roomTypeName: z.string().trim().optional().default(''),
});

export const createReservationSchema = z
  .object({
    guestName: z.string().trim().min(2, 'Guest name must be at least 2 characters.'),
    source: reservationSourceSchema,
    checkInDate: dateString,
    checkOutDate: dateString,
    notes: z.string().max(1000, 'Notes must be at most 1000 characters.').optional().default(''),
    rooms: z.array(reservationRoomInputSchema).min(1, 'Select at least one room to continue.'),
    pricing: reservationPricingSchema,
  })
  .refine((v) => v.checkOutDate > v.checkInDate, {
    message: 'Check-out must be after check-in.',
    path: ['checkOutDate'],
  });

export const updateReservationSchema = z
  .object({
    guestName: z.string().trim().min(2, 'Guest name must be at least 2 characters.').optional(),
    source: reservationSourceSchema.optional(),
    checkInDate: dateString.optional(),
    checkOutDate: dateString.optional(),
    notes: z.string().max(1000, 'Notes must be at most 1000 characters.').optional(),
    rooms: z.array(reservationRoomInputSchema).min(1, 'Select at least one room to continue.').optional(),
    pricing: reservationPricingSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' })
  .refine(
    (v) => !(v.checkInDate && v.checkOutDate) || v.checkOutDate > v.checkInDate,
    { message: 'Check-out must be after check-in.', path: ['checkOutDate'] },
  );

/** List filters mirror ReservationListPage controls. */
export const reservationListQuerySchema = z.object({
  search: z.string().trim().optional().default(''),
  status: z.string().trim().optional().default('all'),
  source: z.string().trim().optional().default('all'),
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(10),
  include: z.string().trim().optional().default(''),
});

export type ReservationListQuery = z.infer<typeof reservationListQuerySchema>;

export const calendarQuerySchema = z.object({
  from: dateString,
  to: dateString,
  roomId: z.string().trim().optional(),
  status: z.string().trim().optional().default('all'),
});

export const availabilityQuerySchema = z.object({
  checkIn: dateString,
  checkOut: dateString,
  excludeId: z.string().trim().optional(),
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
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  description: z.string().trim().min(1, 'Description is required'),
  capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1'),
  facilities: z.array(z.string().trim().min(1)).optional().default([]),
  defaultRate: z.coerce.number().int().min(1, 'Default rate must be a positive number'),
  images: z.array(z.string().trim()).optional().default([]),
  status: roomTypeStatusSchema.optional(),
});

export const updateRoomTypeSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').optional(),
    description: z.string().trim().min(1, 'Description is required').optional(),
    capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1').optional(),
    facilities: z.array(z.string().trim().min(1)).optional(),
    defaultRate: z.coerce.number().int().min(1, 'Default rate must be a positive number').optional(),
    images: z.array(z.string().trim()).optional(),
    status: roomTypeStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const setRoomTypeStatusSchema = z.object({
  status: roomTypeStatusSchema,
});

export const createRoomSchema = z.object({
  roomNumber: z.string().trim().min(1, 'Room number is required'),
  roomTypeId: z.string().trim().min(1, 'Room type is required'),
  status: roomStatusSchema.optional(),
});

export const updateRoomSchema = z
  .object({
    roomNumber: z.string().trim().min(1, 'Room number is required').optional(),
    roomTypeId: z.string().trim().min(1, 'Room type is required').optional(),
    status: roomStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const setRoomStatusSchema = z.object({
  status: roomStatusSchema,
});

/** `?search=&status=&page=&pageSize=` — mirrors RoomTypeListPage controls. */
export const roomTypeListQuerySchema = z.object({
  search: z.string().trim().optional().default(''),
  status: z.string().trim().optional().default('all'),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(10),
});

export type RoomTypeListQuery = z.infer<typeof roomTypeListQuerySchema>;

/** `?search=&status=&roomTypeId=&page=&pageSize=` — mirrors RoomListPage controls. */
export const roomListQuerySchema = z.object({
  search: z.string().trim().optional().default(''),
  status: z.string().trim().optional().default('all'),
  roomTypeId: z.string().trim().optional().default('all'),
  page: z.coerce.number().int().min(1).optional().default(1),
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
  search: z.string().trim().optional().default(''),
  category: z.string().trim().optional().default('all'),
  userId: z.string().trim().optional().default(''),
  page: z.coerce.number().int().min(1).optional().default(1),
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
  .regex(/^INV-\d{4}-\d{3,}$/, 'Invoice number must look like INV-YYYY-NNN');

export const invoiceItemInputSchema = z.object({
  description: z.string().trim().min(1, 'Description is required'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  unitPrice: z.coerce.number().int().min(0, 'Unit price must be at least 0'),
});

export const createInvoiceSchema = z
  .object({
    invoiceNumber: invoiceNumberSchema.optional(),
    reservationId: z.string().trim().min(1).optional(),
    guestName: z.string().trim().min(2, 'Guest name must be at least 2 characters'),
    source: z.string().trim().min(1, 'Source is required'),
    invoiceDate: dateString,
    items: z.array(invoiceItemInputSchema).min(1, 'At least one item is required'),
    discount: z.coerce.number().min(0, 'Discount must be at least 0').max(100, 'Discount cannot exceed 100').optional().default(0),
    invoiceStatus: invoiceStatusSchema.optional().default('Draft'),
    paymentStatus: paymentStatusSchema.optional().default('Pending'),
  })
  .refine((v) => v.invoiceStatus !== 'Completed' || v.paymentStatus === 'Paid', {
    message: 'Completed invoices must be Paid.',
    path: ['paymentStatus'],
  });

export const updateInvoiceSchema = z
  .object({
    invoiceNumber: invoiceNumberSchema.optional(),
    reservationId: z.string().trim().min(1).optional(),
    guestName: z.string().trim().min(2, 'Guest name must be at least 2 characters').optional(),
    source: z.string().trim().min(1, 'Source is required').optional(),
    invoiceDate: dateString.optional(),
    items: z.array(invoiceItemInputSchema).min(1, 'At least one item is required').optional(),
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
  search: z.string().trim().optional().default(''),
  status: z.string().trim().optional().default('all'),
  payment: z.string().trim().optional().default('all'),
  source: z.string().trim().optional().default('all'),
  start: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start must be YYYY-MM-DD').optional(),
  end: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'End must be YYYY-MM-DD').optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(10),
});

export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

export const createExpenseSchema = z.object({
  date: dateString,
  category: expenseCategorySchema,
  description: z.string().trim().min(1, 'Description is required'),
  amount: z.coerce.number().int().min(1, 'Amount must be a positive number'),
  status: expenseStatusSchema.optional().default('Pending'),
});

export const updateExpenseSchema = z
  .object({
    date: dateString.optional(),
    category: expenseCategorySchema.optional(),
    description: z.string().trim().min(1, 'Description is required').optional(),
    amount: z.coerce.number().int().min(1, 'Amount must be a positive number').optional(),
    status: expenseStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

/** `?search=&category=&status=&start=&end=&page=&pageSize=` — mirrors ExpensesPage controls. */
export const expenseListQuerySchema = z.object({
  search: z.string().trim().optional().default(''),
  category: z.string().trim().optional().default('all'),
  status: z.string().trim().optional().default('all'),
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
  source: z.string().trim().optional().default('all'),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(10),
});

export type SalesListQuery = z.infer<typeof salesListQuerySchema>;

/** `?start=&end=&categories=a,b` — mirrors ReportPage preset/custom range + category checkboxes. */
export const reportSummaryQuerySchema = z.object({
  start: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start must be YYYY-MM-DD'),
  end: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'End must be YYYY-MM-DD'),
  categories: z.string().trim().optional().default(''),
});

export type ReportSummaryQuery = z.infer<typeof reportSummaryQuerySchema>;
