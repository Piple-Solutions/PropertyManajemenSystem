<!-- Backend: business logic dan data integrity (Block 3). Salinan laporan detail per area dari .tmp-audit/findings/be-logic.md. Detail per temuan ada di ../findings/. -->

# Block 3 findings — Backend business logic & data integrity

Format: ID | Severity | Confidence | Area | file:line | What | Trace | Impact | Minimal fix | Effort | Related

Scope read: services/reservationService, lib/pricing, services/invoiceService, reportService, salesService, expenseService, dashboardService, roomService, roomTypeService, activityService, lib/presenters (reservation), lib/validation (dates/money), routes/invoices|reservations|reports|sales, migrations 0002/0003/0005, DB client; ran `vitest` on the failing reservation test and a Date probe in Node (V8, same engine as Workers).
Platform fact used throughout: D1 is accessed through Drizzle `drizzle-orm/d1` (db/client.ts:15-17). Every `await db.*` below is a separate D1 round trip; there is no `db.batch()` or transaction anywhere in `src/` (grep: no `batch(`/`transaction(`).

---

## A. Reservations

### BE-015 | High | High | Double-booking (race) | services/reservationService.ts:146-160, 273-313, 393-401
**What:** The availability check and the writes are separate, non-atomic statements, and no DB constraint prevents two active reservations from holding the same room on the same night. `reservation_rooms` only has `UNIQUE(reservation_id, room_id)` (migrations/0002).
**Trace (two staff, same room/dates):** R1 `createReservation` -> `assertRoomsFree` (SELECT overlapping, :282) returns []. R2 does the same before R1 inserts. R1 INSERT reservations (:292) -> writeNightly -> writeRooms (:310-311). R2 then INSERT reservations (:292; reservation_code differs because `generateUniqueCode` re-counts rows at that moment, :224-236) -> succeeds. Both rows are `reserved` for the same room. Window is even wider: the header row is inserted before its `reservation_rooms` rows, and `getBookedRoomIds` finds rooms only through `reservation_rooms` (:137-141), so a third request arriving between :292 and :311 sees an overlapping header with no rooms and also passes. Same race in `updateReservation` (:394).
**Impact:** Two guests confirmed for one room. This is the core invariant of the product; it needs only two near-simultaneous requests (front desk + phone, or double click).
**Minimal fix:** Add a `room_nights(room_id, date, reservation_id, PRIMARY KEY(room_id, date))` table written in the same `db.batch([...])` as the reservation (cancel/edit deletes its rows); the PK makes the conflict a hard 409. Alternative: single `INSERT ... SELECT ... WHERE NOT EXISTS (overlap)` statement inside a batch.
**Effort:** M | **Related:** BE-018, BE-028 (no concurrency test)

### BE-016 | High | High | Data corruption on failed edit | services/reservationService.ts:352-364 vs 393-401, 403-408, 417
**What:** `updateReservation` replaces the nightly rates (DELETE+INSERT, :364 -> :239-248) BEFORE it runs the room-availability check (:394) and before the header UPDATE (:417). If the check throws, the nightly rates stay replaced while `reservations` keeps the old dates/total. `reservations.total_amount` and `reservation_nightly_rates` are two stored sources of truth for the same number.
**Trace:** Reservation A: 2026-09-10..09-12, rooms [R1], rates [100k,100k]. Staff edits to 2026-09-20..09-22 with new rates [150k,150k] while R1 is booked by B on those dates -> `assertNightlyCoverRange` ok -> `writeNightly` commits new rows (09-20, 09-21) -> `assertRoomsFree` throws 409 -> header never updated. Now: header dates 09-10..09-12, `total_amount` 200000, nightly rows for 09-20/09-21 = 300000. `loadFull` computes `calc` from nightly (:174-182) so the API returns `totalAmount: 200000` and `calc.roomTotal: 300000`; the later `assertNightlyCoverRange` on any date-only edit fails with 422 forever until rates are re-sent.
**Impact:** Silent price/date corruption of an existing booking on an ordinary "move dates" failure. Any report or print that reads one source disagrees with the other.
**Minimal fix:** Validate everything (rooms exist, rooms free, coverage, caps) first, then perform all writes in one `db.batch` (header + nightly + rooms). Drop the stored `total_amount` or recompute it inside the same batch.
**Effort:** M | **Related:** BE-018, BE-015

### BE-017 | High | High | Status machine bypass | services/reservationService.ts:315-419 (no status check), routes/reservations.ts:102-118
**What:** `PATCH /api/reservations/:id` has no status guard. `transitionReservation` enforces reserved -> checked-in -> checked-out and reserved -> cancelled, but `updateReservation` edits any reservation in any state.
**Trace:** `reservation.update` holder (Staff role-003 has it) -> PATCH a `checked-out` reservation with `{pricing:{...lower rates...}}` -> no status test -> rates and `total_amount` rewritten (:352-364, :408); dates/rooms/guest name also editable. For a `cancelled` reservation the same PATCH recomputes `total_amount` from nightly rates (:408), undoing the "cancel => total 0" rule, and moving dates/rooms of a cancelled booking is accepted (cancelled rows are excluded from overlap so no conflict arises).
**Impact:** Completed stays can be silently re-priced or re-dated after the fact; no state/period lock. With the stored total feeding the dashboard "recent" list and invoices created from it, financial history is not trustworthy.
**Minimal fix:** Reject edits unless status is `reserved` (allow notes-only on `checked-in`); never edit `checked-out`/`cancelled`.
**Effort:** S | **Related:** BE-030

### BE-024 | Medium | High | Room state vs availability / snapshots | services/reservationService.ts:100-111, 250-271, 118-144
**What:** (a) `assertRoomsExist` selects only `rooms.id`; rooms with status `maintenance` or `inactive` are bookable and are not reported as unavailable by `/api/reservations/availability`. (b) `roomNumber`/`roomTypeName` stored on `reservation_rooms` come straight from the request body (`RoomInput`), not from the `rooms` table.
**Trace:** `POST /api/reservations` with `roomId` of a `maintenance` room and `roomNumber:"999"` -> :275 passes (id exists) -> row saved with room_number "999" (:264).
**Impact:** Bookings into out-of-order rooms; wrong room numbers on confirmations/calendar for direct API callers (the FE sends the right values today).
**Minimal fix:** Load the room rows once; reject non-`active` rooms; set `roomNumber`/`roomTypeName` from `rooms`/`room_types` server-side.
**Effort:** S

### BE-025 | Medium | High | Date handling | lib/validation.ts:110, lib/pricing.ts:34-51, services/reservationService.ts:64-74
**What:** (a) Dates are validated by regex only (`^\d{4}-\d{2}-\d{2}$`); impossible days are accepted and JS silently normalizes them (verified: `new Date("2026-02-31T00:00:00")` -> 3 March 2026; `2026-13-01` -> Invalid). (b) `enumerateNights` stops after `MAX_NIGHTS = 60` without error, and `assertNightlyCoverRange` compares against that truncated list.
**Trace (a):** checkIn `2026-02-31`, checkOut `2026-03-05` -> `enumerateNights` yields [03-03, 03-04] -> client sends those two rates -> coverage ok -> row stores `check_in_date = '2026-02-31'` (DB CHECK only compares strings). **Trace (b):** checkIn 2026-01-01, checkOut 2026-04-01 (90 nights), `nightlyRates` = first 60 nights -> expected list is also the first 60 -> passes (:64-74); `total_amount` prices 60 nights, availability blocks 90.
**Impact:** Garbage dates in storage and string-vs-calendar mismatches in overlap/calendar; under-priced long stays (30 nights unpaid).
**Minimal fix:** zod `.refine` that round-trips the date (`toISOString().slice(0,10) === value`); in `enumerateNights` throw/return null when the range exceeds 60 nights and reject such reservations explicitly (or raise the cap in both zod and pricing).
**Effort:** S

### BE-026 | Medium | High | Timezone | services/dashboardService.ts:68, routes/invoices.ts:55, lib/pricing.ts:111-113
**What:** "Today" is computed in UTC (`nowIso().slice(0,10)`, `new Date().toISOString().slice(0,10)`, `new Date().getFullYear()`), while the property and its users are in WIB (UTC+7). Stored dates are plain `YYYY-MM-DD` strings, so only "now"-based logic is affected.
**Trace:** 2026-09-16 03:00 WIB = 2026-09-15T20:00Z -> dashboard `today = '2026-09-15'` -> reservations checking in on 09-16 are counted as `upcoming` instead of `todayCheckins`; `/invoices/next-number` defaults to the previous day (and previous year around 1 Jan).
**Impact:** Wrong dashboard tiles and default invoice dates between 00:00 and 07:00 WIB every day.
**Minimal fix:** One `todayInZone('Asia/Jakarta')` helper (Intl) used by dashboard, next-number, code year.
**Effort:** S

### BE-029 | Low | High | Reservation code generation | services/reservationService.ts:224-237, lib/pricing.ts:111-114
**What:** Code = `RSV-<year>-<count+1>` from a row count (not a sequence); two concurrent creates compute the same code; the pre-check does not close the race, so the UNIQUE index raises an unhandled 500. Counting across years makes numbers continue across years (RSV-2027-016).
**Impact:** Sporadic 500s under concurrency, cosmetic numbering.
**Minimal fix:** Retry on UNIQUE violation, or per-year counter table.
**Effort:** S | **Related:** BE-015

### BE-030 | Low | High | Cancel semantics | services/reservationService.ts:441-442, lib/presenters.ts:174-192
**What:** Cancel overwrites `total_amount` with 0 but leaves nightly rates; the API then returns `totalAmount: 0` and `calc.roomTotal > 0` for the same reservation, and the original value is lost for lost-revenue analysis.
**Minimal fix:** Keep the amount, expose derived `effectiveTotal` by status.
**Effort:** S | **Related:** BE-016, BE-017

---

## B/E. Atomicity, data layer, tests

### BE-018 | Medium | High | Non-atomic multi-step writes | services/reservationService.ts:239-271,310-312,410-418; invoiceService.ts:178-203,264-281,285-290; userService.ts:113-115,150-156,179-182; roleService.ts:78-81,124-128; routes/*.ts (recordActivity after mutation)
**What:** Every multi-row operation is a series of independent awaited statements. Failure midway leaves partial state; the audit insert happens after the mutation commits and its failure turns a successful write into a 500; transitions/pay/cancel use `UPDATE ... WHERE id=?` without a status predicate.
**Examples:** `writeRooms` deletes all `reservation_rooms` then inserts one by one (:257-269): an error after the delete leaves a booking with no rooms (invisible to availability). `setUserRoles` deletes all roles then inserts (:179-182): failure leaves a user with zero roles. `payInvoice` and `cancelInvoice` race: both read `Sent`, both update; result `Cancelled` + `Paid` or `Completed` after cancel.
**Impact:** Inconsistent records; retries get confusing 409s because the first attempt actually committed.
**Minimal fix:** Use `db.batch([...])` (atomic in D1) for each service operation; add `AND invoice_status IN (...)` / `AND status = ?` predicates and check changed rows.
**Effort:** M

### BE-027 | Medium | Medium | N+1 queries vs D1 invocation limit | middleware/auth.ts:46-55 + services/identity.ts:12-49; reservationService.ts:118-144,162-184,186-218,459-492; userService.ts:73-77; roleService.ts:42-46; invoiceService.ts:158-162
**What:** Per-row queries in loops. Auth alone is 3 + (1 per role) queries on every request. `listReservations` with `pageSize=100` (what the FE sends) is ~2 + 100x3 ≈ 300 queries; `getCalendar` has no row cap and 1 query per reservation; `getBookedRoomIds` loops per overlapping reservation.
**Why it matters:** Cloudflare documents a per-invocation query/subrequest cap for D1 (50 on the free plan, 1000 on paid — verify against the account's plan). On the free plan a normal list/auth+list request exceeds it.
**Impact:** Failing list pages and latency growth with data volume; plan-dependent hard failures.
**Minimal fix:** Fetch children with one `inArray` query per page (or join), cache role permissions per request, bound calendar range (max 62 days).
**Effort:** M | **Related:** carried to Block 4 (Workers limits)

### BE-028 | Medium | High | Test suite red / stale fixtures | tests/reservations.test.ts:21,96-97,128; tests/rooms.test.ts, seed.test.ts, dashboard.test.ts, activities.test.ts (13 failures)
**What:** `vitest run` fails 13 tests. Cause (verified by running the failing case): tests reference `room-006`/`room-008` and expect 5 room types / 8 rooms / 15 reservations, while the regenerated seed (from the modified `frontend/src/data/mock/*.json`) now has 6 types and 21 rooms with ids `room-01...`. `POST /api/reservations` returns 422 `Room(s) not found` in tests. These are stale fixtures, not a production-code regression.
**Impact:** The only automated checks of overlap rejection, split rooms, status machine and room-delete guard are currently failing/not asserting, so BE-015..BE-017 type regressions would not be caught; red CI is normalized.
**Minimal fix:** Update fixtures/expectations (or freeze a dedicated test seed independent of the frontend mock JSON).
**Effort:** S

---

## D. Money & invoices

### BE-019 | High | High | Hard delete of financial records / number reuse | services/invoiceService.ts:285-290, 79-102; routes/invoices.ts:151-168
**What:** `DELETE /api/invoices/:id` physically deletes the invoice and its items in any status, including `Completed`/`Paid` or already `Sent`; there is no soft-delete or void state. The audit row stores only the number. Invoice numbers are allocated as `max(existing)+1`, so deleting the highest-numbered invoice makes its number available again.
**Trace:** Manager (has `finance.invoice.delete`) -> DELETE a Paid invoice INV-2026-020 -> rows gone; sales/report totals drop (they are derived from invoices, services/salesService.ts:14, reportService.ts:34-44); next `POST /api/invoices` allocates INV-2026-020 for a different guest. Also `allocateInvoiceNumber` race (:79-102): two creates choose the same number; UNIQUE index raises an unhandled 500; fallback `Date.now().toString().slice(-6)` can itself collide.
**Impact:** Revenue history can be erased with no recoverable record; duplicate invoice numbers across documents already sent/printed.
**Minimal fix:** Only allow delete on `Draft` (never Paid/Completed/Sent); otherwise cancel (void) and keep the row; allocate numbers from a counter table (never reused) and retry on UNIQUE.
**Effort:** M | **Related:** BE-023

### BE-020 | Medium | High | Invoice lifecycle bypass | lib/validation.ts:392-425, services/invoiceService.ts:170-205, 207-283
**What:** `/pay`, `/send`, `/cancel` implement a clean state machine, but `POST /invoices` and `PATCH /invoices/:id` accept arbitrary `invoiceStatus`/`paymentStatus` (only "Completed => Paid" is checked). So: (a) a user with only `finance.invoice.create` can create a `Completed`/`Paid` invoice (revenue) without `finance.invoice.update`, which `/pay` requires; (b) PATCH can move `Sent` -> `Draft`, set `Paid` on a Draft, set `Cancelled` bypassing `/cancel`; (c) `invoiceNumber`, guest, items and amounts of a `Sent` invoice remain editable (only Completed/Cancelled are locked, :211-216) with the audit row holding only the new total.
**Trace (a):** POST /api/invoices {..., invoiceStatus:"Completed", paymentStatus:"Paid", items:[{unitPrice:5000000,quantity:1}]} -> createInvoiceSchema passes (:404) -> inserted as Completed/Paid (:188-189) -> counted in `reportService.getReportSummary` paidInvoices/totalSales.
**Impact:** Revenue can be created or altered without the intended permission/transition, and Sent invoices change after the customer received them without a before-value trail.
**Minimal fix:** Ignore/forbid status fields on create/PATCH (force Draft/Pending; status only through the action endpoints); lock all fields once `Sent`.
**Effort:** S | **Related:** BE-018, BE-023

### BE-021 | Medium | Medium | Invoice/reservation/payment reconciliation | db/schema.ts:225-239 (comment :210-224), services/invoiceService.ts:170-205
**What:** All invoice amounts, items, guest name and `source` are client-supplied. `reservationId` is optional, only existence-checked; nothing ties invoice totals to the reservation total or DP, multiple invoices per reservation are allowed, and there is no payments table (no amount paid, method, date, partials). `Partial`/`Overdue` are free labels; `source` is free text independent of `reservations.source`, yet it drives `salesSourceBreakdown` (salesService.ts:50-58).
**Impact:** Cannot reconcile what a guest owes/paid per reservation; reports by source depend on typed text; no refund/partial workflows. Treated as design gap rather than a code bug (mirrors the FE mock model); confidence Medium because it may be an accepted scope limit.
**Minimal fix:** At minimum derive `guestName`/`source` from the linked reservation and block duplicate active invoices per reservation; add a `payments` table before taking partial payments.
**Effort:** L

### BE-022 | Medium | High | Report semantics | services/reportService.ts:34-44,88-91; services/salesService.ts:14-18
**What:** `totalSales`, `totalIncome` and `netRevenue` include every non-Cancelled invoice, i.e. `Draft` and `Sent` (unpaid) ones; `paymentStatus` is never consulted.
**Trace:** create an invoice for 5,000,000 as Draft -> immediately appears in `/api/sales` and `/api/reports/summary` totalSales/netRevenue.
**Impact:** Reported "income" overstates cash; a draft that is later deleted (BE-019) retroactively changes past totals.
**Minimal fix:** Either label the figure "billed" and add a separate paid total (`paymentStatus='Paid'`), or count only Completed/Paid for income.
**Effort:** S

### BE-031 | Low | High | Money bounds | lib/validation.ts:386-390,441-447,114
**What:** No upper bound on `quantity`, `unitPrice`, `amount`, nightly `rate`; `quantity*unitPrice` and sums can exceed 2^53 (precision loss) and silently coerce through `z.coerce.number()` (e.g. `"1e21"`).
**Minimal fix:** `.max(10_000_000_000)` style caps and `Number.isSafeInteger` checks.
**Effort:** S | **Related:** BE-009

---

## F. Audit trail

### BE-023 | High | High | Audit completeness | routes/users.ts:47-75, routes/roles.ts:45-63, routes/auth.ts:28-40, routes/invoices.ts:82-98, routes/expenses.ts:61-77
**What:** `recordActivity` is called for reservations, rooms, room types, invoices, expenses and some auth events, but NOT for any user or role/permission mutation (create/update/status/roles/delete user; create/update/permissions/delete role) and not for failed logins. For money edits the row stores only the new value (`total`, `amount`), never the old one.
**Trace:** admin or manager `PUT /api/users/user-003/roles` or `PUT /api/roles/role-002/permissions` -> handler returns without any audit write (routes/users.ts:65-69, routes/roles.ts:55-58) -> `GET /api/activities` has no record of who changed access.
**Impact:** Privilege changes (see BE-002/BE-003) and role-permission edits are untraceable; invoice/expense tampering cannot be reconstructed.
**Minimal fix:** Add audit hooks (actor, target id, before/after role ids / permission names / amounts) to the user and role routes and to invoice/expense updates; log failed logins with email hash and IP.
**Effort:** M | **Related:** BE-002, BE-003, BE-019, BE-020

---

## Checked and OK
- Overlap predicate is correct for half-open stays: `check_in < :out AND check_out > :in`, cancelled excluded, `excludeId` honoured; same-day turnover works (reservationService.ts:124-133).
- Night counting `[checkIn, checkOut)` is consistent between `enumerateNights`, availability and calendar; `reservations` CHECK `check_out_date > check_in_date` exists.
- DP math: percent clamped 0-100, fixed capped at total, rounding via `Math.round`, room split puts the remainder on the last room (pricing.ts:57-108); invoice totals integer IDR with a single final `Math.round` (invoiceService.ts:46-59).
- Report/sales date ranges are inclusive on both ends with date-only strings (`>= start AND <= end`); expense and invoice amounts are CHECK-constrained non-negative/positive in SQLite.
- Terminal invoice states (Completed/Cancelled) reject further edits; `pay` twice returns 409 (not double-applied).
- Room/room-type delete guards exist; FKs RESTRICT/CASCADE as designed. Guests are plain text on reservations (no guest table, so no duplicate/merge handling — design scope, not reviewed further).
