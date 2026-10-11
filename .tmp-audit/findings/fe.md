# Block 4 findings — Frontend (bugs & defects)

Format: ID | Severity | Confidence | Area | file:line | What | Trace | Impact | Minimal fix | Effort | Related
Evidence base: static reading (stores, services, pages, shared components, vite config, build output), `tsc --noEmit` OK, `vite build` OK, `eslint` 197 errors/319 warnings. No browser/Playwright run (skipped for safety, see progress.md).

## FE-001 | High | High | Finance module not integrated with the backend | services/invoiceService.ts:1-6, services/expenseService.ts:1-5, services/salesService.ts:1-24, services/reportService.ts:1-4; pages/DashboardPage.tsx:19-21,86-88; pages/finance/*.tsx
**What:** Invoices, expenses, sales and reports (and the dashboard's revenue/invoice tiles) are served by in-memory services seeded from bundled `data/mock/*.json`. A repo-wide grep finds no reference to `/api/invoices`, `/api/expenses`, `/api/sales` or `/api/reports`; every backend finance endpoint is unused.
**Trace:** user creates an invoice -> `invoiceService.create()` pushes into a module array (services/invoiceService.ts:43-53) -> reload -> array re-initialised from the JSON -> invoice gone. "Omzet Hari Ini" on the dashboard sums `salesService` mock rows (DashboardPage.tsx:86-88,243), unrelated to the D1 data.
**Impact:** Money data entered through the UI is never persisted and the figures staff see are fabricated sample data; backend finance fixes (BE-019..022) have no effect until wired. Possibly intentional staging, but there is no flag or warning in the UI.
**Minimal fix:** Replace the four services with `apiFetch` clients (paged, server filters) and delete the mock imports; show a banner until done.
**Effort:** L | **Related:** X-002

## FE-002 | High | High | Lists silently truncated to first 100 unordered rows | services/reservationService.ts:92-95, pages/reservations/ReservationListPage.tsx:226-232, pages/reservations/ReservationCalendarPage.tsx:132-138,176-181, pages/finance/InvoiceListPage.tsx:127-129, services/userService.ts:18, roleService.ts:17, roomService.ts:18
**What:** `getAll()` requests `page=1&pageSize=100` and the pages filter/paginate/count client-side as if that were the whole table; the backend has no `ORDER BY` (BE-035).
**Trace:** property has 130 reservations -> `/api/reservations?page=1&pageSize=100` returns an arbitrary 100 -> list shows "Showing 1–8 of 100 result(s)", status counters on the calendar page (`reservations.length`, :176-181) and invoice-code lookup (InvoiceListPage:127) are computed from that subset; newer bookings are missing with no indicator.
**Impact:** Staff cannot find or act on reservations beyond 100; wrong counts. Reached in months of normal use.
**Minimal fix:** Use server-side pagination/filters with explicit ordering (the API already supports `page`, `pageSize`, `search`, `status`, `source`, `date`); or loop through pages.
**Effort:** M | **Related:** BE-035, X-003

## FE-003 | Medium | High | No session-expiry / 401 handling; permissions blank out | services/api.ts:70-100, services/authService.ts:68-88, stores/permissionStore.tsx:42-46, components/ProtectedRoute.tsx
**What:** `apiFetch` has no global 401 handling. After the 1 h token expires the app stays "authenticated"; `getMyPermissions()` swallows the error and returns `[]` (authService.ts:86), so the `.catch(() => null)` + `if (serverPermissions === null) return` guard in permissionStore (:42-45) never triggers and permissions are replaced by `[]`. Also `restoreSession` clears the token on any failure including a network error (authService.ts:74-77).
**Trace:** token expires -> next `refreshPermissions()`/navigation -> `/api/auth/me` 401 -> `[]` -> every `RequirePermission` renders "Akses Ditolak" while the user is still shown as logged in; data fetches return `undefined`/`[]` (FE-004). A transient network failure at page load logs the user out.
**Impact:** Confusing dead UI after an hour; spurious logouts.
**Minimal fix:** In `apiFetch`, on 401 (non-login) clear token + dispatch logout/redirect with `returnTo`; make `getMyPermissions` rethrow so the store keeps the last good set; only clear the token on 401 in `restoreSession`.
**Effort:** S

## FE-004 | Medium | High | Mutation failures are silent | components/pms/CheckInButton.tsx:19-23 (same pattern CheckOut/cancel), services/reservationService.ts:97-113,165-190,209-223
**What:** `reservationService.checkIn/checkOut/cancel` return `false` on any error, but callers ignore the result, close the dialog and call `navigate(0)` (full reload). `getById`/`getFullById` return `undefined` on any error (401, 500, network) which pages render as "not found"; `getCalendar` returns `[]` on error.
**Trace:** check-in blocked by BE 409 (status already changed) -> `checkIn()` returns false -> dialog closes, page reloads, no message. Audit UX-004 confirmed in spirit (no unhandled rejection because errors are swallowed in the service, so the symptom is silent failure + full reload).
**Impact:** Staff believe an action succeeded; "not found" shown for server errors.
**Minimal fix:** Return the error (or throw), show `apiErrorMessage` via toast/inline, replace `navigate(0)` with state refetch.
**Effort:** S | **Related:** audit UX-004

## FE-005 | Medium | High | Hard-coded "today" and timezone-shifted dates | pages/finance/ReportPage.tsx:36-47, pages/finance/SalesPage.tsx:30, pages/DashboardPage.tsx:157, pages/finance/InvoiceFormPage.tsx:60,70
**What:** (a) `ReportPage.getDateRange` anchors every preset on `new Date('2026-09-15')` and the default range ends `2026-09-15`; invoice numbers are generated as `INV-2026-NNN` from the in-memory count. (b) Local-midnight `Date` objects are serialised with `toISOString().split('T')[0]` (UTC), which moves the day back by one in WIB.
**Trace (b):** WIB machine, preset "Bulan Ini": `start = new Date(2026, 8, 1)` = 2026-08-31T17:00Z -> `formatDate` -> `"2026-08-31"` -> report range starts one day early. Invoice form default date between 00:00-07:00 WIB shows yesterday.
**Impact:** Wrong report periods and default dates; wrong after 15 Sep 2026 (the app date today is later), and invoice numbers stuck on 2026.
**Minimal fix:** Use the already present local `format(d,'yyyy-MM-dd')` (date-fns) and real `new Date()`; take invoice number from `GET /api/invoices/next-number`.
**Effort:** S | **Related:** BE-026

## FE-006 | Low | High | Login form is unmounted while submitting | stores/authStore.tsx:73-77, components/PublicOnlyRoute.tsx:8-14, pages/LoginPage.tsx:15-23
**What:** `login()` dispatches `SET_LOADING true`; `PublicOnlyRoute` renders a full-screen spinner while `isLoading`, unmounting `LoginPage` and discarding its state. On a failed login the form reappears with an empty password and (unless "remember me" was on) an empty email; `error` is shown only after remount.
**Impact:** Retype everything after one typo; spinner flash.
**Minimal fix:** Keep a separate `isRestoring` flag for the initial session check and a per-form `submitting` state.
**Effort:** S

## FE-007 | Medium | High | Accessibility defects that block use | components/shared/Input.tsx:40-49,52-75, components/shared/Modal.tsx:29-37,60-64
**What:** (1) `Input` renders `<label>` without `htmlFor` and the input without an `id`, so labels are not programmatically associated; errors are plain `<span>`s with no `aria-invalid`/`aria-describedby` (`role="alert"` only on the login error). (2) `Modal` has `role="dialog" aria-modal` but no accessible name (`aria-labelledby`), no initial focus, no focus trap and no focus restore on close; Escape is bound on `window`, so stacked dialogs close together. Status colours use hex literals; contrast was not measured.
**Impact:** Screen-reader users hear unlabeled fields; keyboard users can tab behind an open modal and lose position after closing (WCAG 1.3.1, 2.4.3, 4.1.2).
**Minimal fix:** `useId()` for `id`/`htmlFor`/`aria-describedby`; `aria-labelledby` on the dialog and a small focus-trap/restore hook (or native `<dialog>`).
**Effort:** M

## FE-008 | Low | High | Build configuration | vite.config.ts:15, services/api.ts:16-18
**What:** `build.sourcemap: true` ships full source maps with the production bundle; `VITE_API_URL` falls back silently to `http://localhost:8787`, so a production build without the variable points every visitor's browser at localhost (and blocked as mixed content).
**Minimal fix:** `sourcemap: false` (or `'hidden'`) for production; fail the build when `VITE_API_URL` is missing in `mode=production`.
**Effort:** S

## FE-009 | Low | Medium | Dependencies | package.json (`xlsx@0.18.5`, `react-router-dom@6`), utils/reportExport.ts:1,49-75
**What:** `npm audit` (prod): `xlsx` HIGH (prototype pollution, ReDoS; no npm fix) and `react-router` moderate (open redirect via backslash in `<Link>`/`useNavigate`, SSR error deserialisation). The app uses `xlsx` only to write workbooks (no `XLSX.read` of user files) and never passes user input to `navigate`/`Link`, so the advisories are not reachable today.
**Minimal fix:** Replace `xlsx` with a maintained writer (e.g. `exceljs`/SheetJS CDN build) when touched; bump react-router-dom within 6.x/7.
**Effort:** S

## FE-010 | Low | High | Type safety hides API drift | stores/authStore.tsx:6-12, services/userService.ts:18-62, roleService.ts:17-67, eslint output (316 `no-explicit-any`)
**What:** Auth state is `user: any`; user/role/permission services return `any`; API responses are cast, never validated; eslint's `no-undef` fails 195 times (`console`, `__dirname` globals not configured) so the lint gate cannot be used to find real issues.
**Impact:** Field renames in the API surface only at runtime; lint is noise.
**Minimal fix:** Type responses with the existing `types/auth.types.ts`, add zod parsing at the `apiFetch` boundary for critical shapes, fix eslint globals (`globals.node/browser`).
**Effort:** M

## Checked and OK / refuted
- XSS: no `dangerouslySetInnerHTML`, `innerHTML`, `eval`; external links use `rel="noreferrer"`/`noopener`; the JWT in `localStorage` is a documented trade-off (api.ts:9-14) — exploitable only with an XSS, none found. Post-login redirect is the constant `/dashboard` (no open redirect). Only third-party origin is Google Fonts.
- No secrets in the bundle (`VITE_API_URL` only); `data/mock/users.json` (plaintext sample passwords) is not imported by any `src` file (only `config/permissions.ts` imports `permissions.json`).
- Route code splitting is in place (all pages `lazy`); entry `index-*.js` 250 kB (80 kB gzip); heavy `ReportPage` chunk 733 kB (jspdf/xlsx/html2canvas) loads only on the reports route; public styles are imported by the public pages only. No leak of `public.css` into the PMS entry was found; drawer/calendar behaviour could not be verified without a browser (not run).
- Effects use `cancelled` flags on unmount in the pages inspected (Calendar, InvoiceList, InvoiceForm); wizard has a `saving` guard against double submit.
