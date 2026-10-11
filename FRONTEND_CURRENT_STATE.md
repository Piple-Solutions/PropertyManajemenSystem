# FRONTEND_CURRENT_STATE.md — Authoritative Frontend Baseline

> **Purpose:** snapshot of the CURRENT frontend implementation that all upcoming
> backend phases must treat as the source of truth (with the actual code).
> **Status:** current baseline, not a freeze — if the frontend changes
> significantly, update this document BEFORE implementing a backend phase that
> depends on those changes. Do not rely on the Phase 0 audit alone.
> **Scope rules:** no backend implementation, no frontend redesign, no deploys
> in this task. Finance backend stays deferred until the Finance frontend is
> finalized. Homepage/public pages are excluded from backend work.

## A. Repository State

- **Branch:** `main` (up to date with `origin/main`,
  `github.com/zulfikarajie/PropertyManajemenSystem`).
- **HEAD commit:** `a42d040` — Merge PR #1
  (`feat/frontend-reservation-pricing-payment` → `main`).
  Previous: `ca25a27 feat: update reservation, pricing, payment`,
  `5ad02fb feat: Initial Project`.
- **Uncommitted work on top of HEAD (Phases 1 + 2, not yet committed):**
  backend implementation (`backend/`: Hono + D1 + Drizzle, migrations
  `0001`/`0002`, 104 vitest tests) + frontend service migrations
  (auth/users/roles/permissions in Phase 1; reservations/pricing in Phase 2).
- **Frontend stack** (`frontend/package.json`): React 18.3 + Vite 5 +
  TypeScript 5.6 (strict) + Tailwind 4 + React Router 6 + React Hook Form +
  Zod + date-fns + lucide-react + jspdf/xlsx. Scripts: `dev`, `build`
  (`tsc -b && vite build`), `typecheck` (`tsc --noEmit`), `lint`, `format`.
- **Env:** `frontend/.env.example` → `VITE_API_URL` (default
  `http://localhost:8787` in `src/services/api.ts`). No committed `.env`.
- **Routing** (`src/App.tsx`): public `/`, `/about`, `/rooms`, `/gallery`,
  `/contact`, `/login`, `/register`, `/forgot-password`, `/reset-password`;
  protected `/dashboard` (+ `users`, `roles`, `permissions`, `management`,
  `room-types`, `rooms`, `reservations` incl. `new/:id/:id/edit/calendar`,
  `finance/sales|invoices|reports|expenses`, `activity`), `/change-password`.
  Route guards check **only `*.view`** (Phase 1) — backend enforces actions.
- **Reservation calendar** (`/dashboard/reservations/calendar`): reads live
  data from `GET /api/reservations/calendar` (month range, half-open) and
  overlays Indonesian public holidays from `GET /api/public/holidays`. Month is
  deep-linkable via `?month=YYYY-MM`; defaults to real "now".

## B. Module Status

| Module       | Frontend Status | Backend Status   | Current Reference |
| ------------ | --------------- | ---------------- | ----------------- |
| Auth         | Integrated (API) | Phase 1 done    | `services/api.ts`, `services/authService.ts`, `stores/authStore.tsx` |
| Users        | Integrated (API) | Phase 1 done    | `services/userService.ts`, `pages/users/*`, `components/shared/UserForm.tsx`, `UserRoleForm.tsx` |
| Roles        | Integrated (API) | Phase 1 done    | `services/roleService.ts`, `pages/roles/*`, `components/shared/RoleForm.tsx` |
| Permissions  | Integrated, read-only catalog | Phase 1 done | `services/permissionService.ts`, `pages/permissions/PermissionListPage.tsx` |
| Reservations | Integrated (API + wizard + pricing) | Phase 2 done | `services/reservationService.ts`, `services/reservationPricingService.ts` (adapter), `utils/reservationDraft.ts`, `ReservationWizard*.tsx`, `ReservationPricingPanel.tsx`, `pages/reservations/*` |
| Room Types   | Mock (sync), full CRUD UI | Phase 3 pending | `services/roomTypeService.ts`, `data/mock/roomTypes.json` (5), `pages/room-types/*`, `components/shared/RoomTypeForm.tsx` |
| Rooms        | Mock (sync), full CRUD UI | Phase 3 pending | `services/roomService.ts`, `data/mock/rooms.json` (8), `pages/rooms/*`, `components/shared/RoomForm.tsx`, `RoomSelector.tsx` |
| Activities   | Mock (sync), read-only feed | Phase 4 pending | `services/activityService.ts`, `data/mock/activities.json` (10), `pages/activity/*`, `components/shared/ActivityFeed.tsx` |
| Dashboard    | Mock-backed aggregates, complete UI | Phase 5 pending | `pages/DashboardPage.tsx`, `services/reportService.ts`, `salesService.ts` |
| Finance      | Mock, CRUD UI complete, **not final** | Phase 6 deferred | `pages/finance/*`, `services/invoice|expense|sales|reportService.ts`, `components/shared/InvoiceForm.tsx` |
| Homepage     | Excluded | Excluded | `pages/HomePage.tsx` (static + WhatsApp `wa.me/6200000000000`) |

"Integrated (API)" = async `apiFetch` client, Bearer JWT, `{ data }` envelope.

## C. Current API Contracts

### Cross-cutting
- Base `${VITE_API_URL}/api`, `Authorization: Bearer <JWT>` (`pms_token` in
  localStorage; documented non-HttpOnly limitation), envelope `{ data }` /
  `{ data, pagination }`, `204` empty, errors `{ message, errors? }`.
- Lists: frontend calls `?page=1&pageSize=100` and filters/slices
  client-side; server `search/status/pagination` params exist but are
  **not yet consumed** (diverges beyond 100 rows).

### Auth (`services/authService.ts` → `POST|GET /api/auth/*`)
`login{email,password}→{user,token}|null(401)` ·
`register{name,email,password}→AuthResult{user,permissions,token,expiresIn}|null(409)` ·
`logout()` best-effort + clear ·
`restoreSession()` = `GET /me` or null ·
`changePassword(userId*,current,new)→bool` (*id ignored, identity from token) ·
`forgotPassword(email)→{message,resetToken?}` (dev-only token → reset link shown) ·
`resetPassword(token,new)→bool` ·
`getMyPermissions()` (PermissionContext source).
Validation mirror: name min2, email format (backend lowercases), password min6.

### Users / Roles / Permissions
- `userService`: `getAll/getById/create/update/delete/toggleStatus(→PATCH :id/status)/getUserPermissions(union via roles)`.
  `user.roles` = **IDs**; single-role UX (forms) vs multi-role API.
- `roleService`: `getAll/getById/create/update(PATCH base + PUT permissions)/setPermissions/delete`.
  `role.permissions` = **names** (`{resource}.{action}`). Forms always send
  `status:'active'` (no inactive control in UI).
- `permissionService`: `getAll/getById/getByName` only (read-only, correct).
- Guards: `user.view / role.view / permission.view` (+ `management` anyOf).

### Reservations (`services/reservationService.ts` → `/api/reservations`)
- `getAll()` (embedded `rooms/pricing/payment/calc`) ·
  `getById/getFullById` (undefined on miss) ·
  client-side `getByStatus/getByDateRange/getAllReservationRooms` ·
  `getReservationRooms/getRoomsByReservationId` (from detail) ·
  `create(payload)/update(id,payload)` (update **throws** ApiError) ·
  `cancel/checkIn/checkOut→bool` ·
  `getAvailability(checkIn,checkOut,exclude?)→string[]`.
- **Write payload** (`utils/reservationDraft.ts#toCreatePayload`):
  `{guestName trimmed, source, checkInDate, checkOutDate (YYYY-MM-DD),
  notes, rooms[{roomId,roomNumber(||roomId),roomTypeName}], pricing{mode,
  nightlyRates[{date,rate rounded}], paymentType, dpType,
  dpPercentage|dpFixedAmount}}`.
- **Read shape** (`ApiReservation`): header fields + `pricing{mode,nightlyRates}`
  + `payment{type,dpType,dpPercentage?,dpFixedAmount?}` +
  `calc{nights,nightDates,roomTotal,dpAmount,remainingBalance}` + `rooms[]`.
- Wizard (`ReservationWizardModal/ReservationFormPanel`): async draft load,
  async save, server errors surfaced via `apiErrorMessage`.
- Availability: `GET /availability` params `{checkIn,checkOut,excludeId?}`;
  client pre-validates `co>ci`, fail-open `[]` (server re-enforces 409).
- **Calendar (adopted):** `getCalendar(from, to, {roomId?, status?})` →
  `GET /api/reservations/calendar`, returning the slim `ApiCalendarEntry`
  (id/code/guest/source/dates/status/total + room snapshots; no pricing/calc).
  Requires `to > from` (400 otherwise). `CalendarView` passes
  `from = 1st of month`, `to = 1st of NEXT month` and refetches on month change;
  `DayReservationsPopup` passes `from = day`, `to = day + 1`.
  **Interval is half-open `[checkIn, checkOut)`** — checkout day is NOT painted.
- Transitions: `reserved→Check In / Cancel`, `checked-in→Check Out`
  (ConfirmDialog + `navigate(0)`); edit via wizard modal (ungated by
  `reservation.update` in UI — server enforces).

### Public Holidays (`services/holidayService.ts` → `GET /api/public/holidays`)
- **No auth** (like `/api/public/room-types`). `?year=YYYY[&force=true]`;
  `year` validated 2000–2100 (422 otherwise), `force` bypasses the TTL cache.
- Backend proxies + normalizes the upstream feed
  `guangrei/APIHariLibur_V2` `calendar.json` and caches the **parsed document**
  for 6h, so any number of years/months cost one upstream request.
  `HOLIDAY_SOURCE_URL` env var overrides the upstream.
- **Upstream is date-keyed and has a non-date `info` key.** The service
  validates every key against `^\d{4}-\d{2}-\d{2}$` before use; without that
  guard `info` becomes a phantom holiday. Upstream publishes only some years
  (2026 + 2027 at time of writing).
- Shape: `{ year, days[{date,name,kind,isCutiBersama,isTentative}], available,
  source, sourceUpdated?, fetchedAt, error? }`. `kind: 'holiday'` = national day
  off; `kind: 'observance'` = `holiday:false` upstream (NOT a day off, e.g.
  "1 Ramadan"). `isCutiBersama` and `isTentative` are **derived server-side**
  from the name (`"Cuti_shared"` prefix / `"(belum pasti)"`) because this feed
  has no boolean for them.
- **Never fabricated, never fatal.** Upstream failure → HTTP **200** with
  `available:false` + `days:[]`; unpublished year → `available:true` +
  `days:[]`. The UI distinguishes all three states ("Holiday data unavailable
  for YYYY" / "No holiday data published for YYYY" / "No holidays this month")
  and always renders a usable grid.

## D. Current Data Models

Single type home: `types/auth.types.ts` (others re-export).
- `User{id,name,email,password,roles:AppRole[]/*mock shape*/,status,createdAt,updatedAt,lastLoginAt?}` —
  API shape uses `roles:string[]`; `ApiUser` in `services/authService.ts`.
- `Role{id,name,description,permissions:AppPermission[]/*mock*/,status,…}` —
  API shape uses `permissions:string[]`.
- `Permission{id,name,description,resource,action,group}` (26 seeded).
- `RoomType{id,name,description,capacity:int,facilities:string[],defaultRate,images:string[],status active|inactive}`.
- `Room{id,roomNumber:string,roomTypeId,status active|inactive|maintenance}`.
- `Reservation{id,reservationCode,guestName,source,checkIn/outDate YYYY-MM-DD,status,notes,totalAmount,…}` +
  `ReservationRoom{id,reservationId,roomId,roomNumber,roomTypeName,rate,subtotal}`.
- Pricing (`types/pricing.types.ts`): `PricingMode same|different`,
  `PaymentTermType no_dp|dp`, `DpType percentage|fixed`, `NightlyRate{date,rate}`,
  `ReservationPricingState/…Persisted`, `PricingCalculation`, `PricingValidation`.
- Draft (`types/reservationDraft.types.ts`): `ReservationDraft{guestName,notes,source,checkIn/outDate,roomIds,pricing}`,
  `WizardStep 0|1|2`, step validators, `toReservationApiPayload` (**dead** —
  actual wire shape is `toCreatePayload`).
- `Invoice{id,invoiceNumber,reservationId?,guestName,source,invoiceDate,items[{id,invoiceId,description,quantity,unitPrice,subtotal}],subtotal,discount,total,paymentStatus,invoiceStatus,…}` —
  **type says** `Pending|Paid` + `Draft|Completed` but mock/UI/service also use
  `Overdue/Partial/Sent/Cancelled` (source of the TS errors; Finance not final).
- `Expense{id,date,category,description,amount,status?,…}`,
  `Sale{id,reservationId?,invoiceId?,date,amount,source,description}`,
  `Activity{id,category,action,description,userId,userName,snapshots,entityType?,entityId?,metadata?:Record<string,string>,ipAddress?,createdAt}` (no updatedAt — immutable).
- Mocks: users 5, roles 5, permissions 26, roomTypes 5, rooms 8,
  reservations 15, reservationRooms 16, reservationPricing 15,
  invoices 8, expenses 10, sales (via sales.json), activities 10.

## E. Business Rules (backend must respect)

- Auth: inactive users rejected; email normalized server-side; register →
  Staff `role-003` only; password change bumps `token_version` (old JWTs die;
  **frontend does not force re-login** — gap, see §G); logout stateless.
- Users: email unique; roles ≥ 1; no self-deactivate/delete; granting a
  `permission.assign`-carrying role requires `permission.assign`.
- Roles: name unique; delete → 409 when assigned; permissions assigned only
  via `PUT :id/permissions` (`permission.assign`).
- Reservations: guest ≥ 2; `checkOut > checkIn`; ≥ 1 room, unique rooms;
  notes ≤ 1000; nightly dates must exactly cover `[checkIn,checkOut)`,
  ≤ 60 nights; overlap = half-open intervals, skip cancelled + self (409);
  metadata-only PATCH skips overlap check; status machine
  `reserved→checked-in→checked-out`, `reserved→cancelled` (total→0);
  terminal states reject transitions (409).
- Rooms (pending): `roomNumber` required string; `roomTypeId` required;
  status `active|inactive|maintenance`; type status `active|inactive`;
  `capacity ≥ 1 int`; `defaultRate > 0`; facilities comma-input → `string[]`;
  `defaultRate` is reference-only for pricing, never a persisted price.
- Activities (pending): append-only, server-generated; category/action
  vocabularies in `constants/activityTypes.ts`; `metadata` string values;
  read-only UI (`activity.view`).

## F. Pricing / Payment Rules (latest, authoritative)

- Source of truth: `nightlyRates[{date,rate:int≥0}]` only; derived
  `{nights,roomTotal=Σ,dpAmount,remaining=total−dp}` recomputed everywhere.
- `no_dp→0`; `%→round(total×clamp(pct,0,100)/100)` (0/absent→0);
  `fixed→min(round(fixed),total)`; `total≤0→dp=0`; fixed requires ≤ total.
- Modes: `same` (one rate fanned out) / `different` (per-night + bulk apply);
  `different→same` collapses to first-night rate.
- Fallback for new dates: `sameRate>0 → first-night → referenceRate → 0`.
- Multi-room split: `round(total/count)` per room, remainder on last;
  `rate = round(subtotal/nights)`.
- **Two distinct "payment" concepts:** reservation payment *terms*
  (`no_dp/dp`, no money movement, no method) vs invoice `paymentStatus`
  (Finance, deferred). Never conflate.
- Single `source` field = guest source **and** rate source.

## G. Known Issues

### 1. Frontend TypeScript status
`npx tsc --noEmit` → **0 errors** (verified this task). The previously recorded
"39 pre-existing errors" no longer reproduce and that claim is retired.
`npm run build` (`tsc -b && vite build`) therefore succeeds.
`npm run lint` still reports **19 errors + 96 warnings**, all pre-existing and
none in calendar/holiday code: `'React' is not defined` (`no-undef`) in legacy
files that rely on the classic JSX runtime, and `'__dirname' is not defined` in
`vite.config.js` / `vite.config.ts`. Not touched by this task.

### 2. Frontend/backend contract mismatches (do not auto-fix)
- **M1.** Lists ignore server filtering/pagination (`?search&status&source&date`,
  `{pagination}`) — all client-side, capped at 100 rows (users, roles,
  reservations).
- **M2.** Service error swallowing: `user/role/reservation` services map
  403/404/409/422 → `null/false/[]`; server field-errors rarely surface.
- **M3.** Action buttons largely ungated beyond `*.view`
  (user/role/reservation create-update-delete, check-in/out) — server 403s,
  UI doesn't pre-hide.
- **M4. RESOLVED.** `GET /calendar` is now consumed by `CalendarView` /
  `DayReservationsPopup`, and the checkout-day semantic gap is closed in favour
  of the server: the interval is half-open `[checkIn, checkOut)`, matching the
  overlap rule used by `GET /availability` and the pricing nightly window.
  Single-day queries are expressed as `[day, day+1)` so `to > from` always holds.
- **M5.** Detail page shows recomputed `calc.roomTotal` after cancel instead
  of stored `0`.
- **M6.** `login()` drops `permissions/expiresIn`; expiry never proactively
  handled; `RegisterPage` navigates to login unconditionally (duplicate-email
  error never seen); password change doesn't clear token/force re-login
  despite server invalidating old JWTs.
- **M7.** `PermissionListPage` text "Each user gets one role" contradicts
  multi-role API + union permissions.
- **M8.** `RoleForm` always sends `status:'active'` (inactive roles
  uncreatable/uneditable); PATCH+PUT partial-failure surface is lossy.
- **M9.** `UserForm` sends `password123` fallback and unvalidated `roles:['']`.
- **M10.** `types/reservationDraft.types.ts#toReservationApiPayload` is dead
  (wire shape is `toCreatePayload`).

### 3. Intentionally deferred
- Finance backend (Phase 6) until Finance frontend final — invoice statuses
  (`Sent/Cancelled/Overdue/Partial`) vs type, discount semantics, sales
  derivation (independent `sales.json` vs derived), expense CRUD UI gaps.
- Room inventory FK + `roomId` existence validation (Phase 3).
- Server-driven search/pagination adoption (all lists).
- Activity server-side audit hooks (Phase 4); activity taxonomy overlaps
  (`system/login` vs `authentication/login`, `payment` vs `invoice_pay`),
  `metadata` string-vs-number, `ipAddress` include/drop, deep-link routes.
- Persisting holidays to D1 (currently proxy + in-memory 6h cache, so the
  calendar depends on the upstream at request time) — revisit only if the
  upstream needs history or SLO guarantees.
- Richer holiday flags (`is_civic` / `is_religious` / `is_cuti_bersama`):
  the SKB-3-Menteri feed carries real booleans where the current one only has
  `holiday` + a name prefix. Only `holidayService` would change.

### 4. Known technical limitations
- localStorage JWT (XSS ≠ HttpOnly; mitigated by 1h expiry + server checks).
- Stateless logout (documented). No auth rate limiting yet.
- `wrangler.jsonc database_id` placeholder; no remote D1/secrets/deployment.
- Legacy mock inconsistencies preserved verbatim in seed (res-001/res-002
  share room-001; `reservationRooms` roomNumber vs roomId mismatches;
  multi-room subtotals ≠ pricing totals) — server recomputes going forward.
- Homepage WhatsApp `6200000000000` hardcoded; homepage excluded.
- Holiday data is third-party and community-sourced; `isCutiBersama`/
  `isTentative` are name-based heuristics until a structured feed is adopted.
- E2E requires a running backend (`wrangler dev` on 8787, after
  `d1 migrations apply --local` + `db:seed:local`) and, for `SCN-02-08/09`,
  `DEV_EXPOSE_RESET_TOKEN=true` in `.dev.vars`. Playwright serves the
  **production build** via `vite preview` on 5173.
- `SCN-06-09` is flaky: it reads `body.innerText()` without waiting for the
  lazy route chunk (passes 4/4 in isolation). Not fixed by this task.

## H. Backend Development Guidance (per upcoming phase)

- **Phase 3 (rooms):** source of truth =
  `services/roomService.ts` + `roomTypeService.ts` (method list),
  `RoomForm.tsx`/`RoomTypeForm.tsx` zod schemas (stricter than
  `validationUtils.ts`), list pages (search: number / name+desc; filters:
  type+status / status; no pagination in UI → still offer server
  `?search&status&roomTypeId&page&pageSize`), `RoomSelector.tsx` props
  (needs full rooms + type names + injected `bookedRoomIds`), mock JSON
  (5 types / 8 rooms / statuses), `roomTypeColors.ts` (frontend-derived,
  don't store). Decide: `roomNumber` uniqueness/trim, `roomTypeId`
  existence + inactive-type rule, delete guards vs reservations, `images`
  handling (create sends `[]`), facilities empty-allowed, `toggleStatus`
  vs `maintenance`, and the `RoomTypeForm` create-path facilities bug
  (expect array, not string).
- **Phase 4 (activities):** source of truth = `Activity` type,
  `activityService.ts` method/query surface, `ActivityLogPage`
  (category filter + description/userName search + pageSize 8/[8,16]),
  `ActivityFeed` display, `activityTypes.ts` vocabularies. Server must
  generate entries via audit hooks (frontend never creates them); resolve
  taxonomy overlaps, metadata value types, `ipAddress`, deep links.
- **Phase 5 (dashboard):** source of truth = `DashboardPage.tsx` formulas
  verbatim (§E-adjacent metrics: today/upcoming/checked-in counts, sales
  day/month sums, invoice Draft/Overdue/Completed counts, occupancy =
  `checked-in count / total rooms`, weekly/monthly/quarterly/custom revenue
  buckets, status donut, recent-5). Hardcoded `today='2026-09-15'` and
  `'2026-09'` month prefix must become real "now" semantics — confirm with
  user. Decide single `GET /dashboard/overview` vs reuse of list endpoints.
- **Phase 6 (finance):** DO NOT START until frontend final. Recorded truth:
  `Invoice/InvoiceItem/Expense/Sale` shapes, `InvoiceForm` zod schema
  (discount 0–100, Completed⇒Paid rule), status machines in
  `invoiceService` (Draft→Sent→Completed/Cancelled), `SalesPage` periods
  (today/week/month/6months/1year), `reportService` aggregations,
  expense categories/statuses. Re-audit finance UI before designing.

---

*Generated from working tree at HEAD `a42d040` + uncommitted Phases 1–2
(audit date per session). Companion evidence: Phase 0 audit (historical),
Phase 1 & Phase 2 final reports. Last updated for the real-time calendar +
public-holidays integration.*
