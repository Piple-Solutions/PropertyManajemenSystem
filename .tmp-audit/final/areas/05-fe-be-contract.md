<!-- Kontrak FE-BE (Block 4). Salinan laporan detail per area dari .tmp-audit/findings/contract.md. Detail per temuan ada di ../findings/. -->

# Block 4 findings — FE <-> BE contract

Method: every `apiFetch` path in `frontend/src/services/*` compared with `.tmp-audit/endpoints.md`; enums, envelopes, dates and money formats compared with `lib/validation.ts` / `lib/presenters.ts`.

## Matches (no action)
Envelope `{data}` / `{data, pagination}` / 204 empty; error shape `{message, errors{field:[...]}}` consumed correctly by `apiErrorMessage`; dates `YYYY-MM-DD`; money integer IDR; reservation statuses and sources identical (`reservationStatuses`, `reservationSources` vs zod enums); permission names used by the FE router/nav (`user.view`, `role.view`, `permission.view`, `room.view`, `reservation.view`, `finance.sales.view`, `finance.invoice.view`, `finance.report.view`, `activity.view`, `user.update`) all exist in the backend catalogue (31 names, migrations 0001+0005); half-open calendar range (`to` = first of next month) matches `GET /calendar`.

## X-001 | Medium | High | Client-only permission overrides | stores/permissionStore.tsx:48-55, services/userPermissionService.ts:7,30-42, components/shared/UserForm.tsx:150-160
**What:** The permission UI lets an admin attach per-user grants/denies stored in the browser's `localStorage` and merged into `hasPermission` ("effective = roles ∪ grants − denies"). The API never sees or honours them.
**Trace:** admin "denies" `finance.invoice.update` for user U in the form -> saved in the admin's browser only -> U logs in elsewhere: no override applies; even in the same browser the API still authorises with the role permissions. A "grant" shows pages the API answers 403.
**Impact:** False sense of restriction (deny) — not a security boundary, and per-browser state that differs between devices.
**Minimal fix:** Remove the override feature or persist it server-side and enforce in `loadAuthContext`.
**Effort:** S (remove) / M (server-side) | **Related:** audit SEC-001

## X-002 | High | High | Finance endpoints unused by the UI | see FE-001
Backend routes `/api/invoices*`, `/api/expenses*`, `/api/sales*`, `/api/reports*` are implemented and tested, the FE finance pages call none of them. When wiring, note the known differences: FE invoice numbers are `INV-2026-${count+1}` client-side (BE allocates server-side and ignores colliding requests); FE form status literals are narrower (`'Draft' | 'Completed'`) than BE (`Draft/Sent/Completed/Cancelled`); FE report presets use a fixed 2026-09-15 date (FE-005); BE `reports/summary` counts Draft/Sent invoices as sales (BE-022) while the FE mock sums `sales.json`.

## X-003 | High | High | Pagination/ordering contract | see FE-002, BE-035
FE assumes `pageSize=100` page 1 is the full dataset; BE caps `pageSize` at 100, returns `pagination.total` (ignored by the FE) and has no deterministic order. Either FE must page through `total`/use server filters, or BE must raise/offer an "all" mode and order explicitly.

## X-004 | Medium | High | Register flow vs backend policy | pages/RegisterPage.tsx (route `/register`), stores/authStore.tsx:92-107, backend BE-001
FE exposes a public Sign Up button on the login page and `register()` logs the new user straight in (`REGISTER_SUCCESS` sets `isAuthenticated`); the backend grants working Staff permissions. If registration is closed (BE-001), the FE must hide `/register` and handle the new 403/pending response.

## X-005 | Low | High | Inactive user message | services/authService.ts:36-38, stores/authStore.tsx:62-66; backend authService.ts:31-33
BE returns 401 "User is inactive" for a correct password on a disabled account; the FE maps every 401 to `null` and shows "Invalid email or password", so disabled users cannot tell why they are rejected.

## X-006 | Low | High | Create actions gated by view permission | pages/DashboardPage.tsx:278-281 vs backend routes/reservations.ts:80, rooms.ts:41, invoices.ts:64
Quick-action links "Reservasi Baru", "Invoice", "Tambah Kamar" are shown with `*.view` permissions, while the API requires `reservation.create`, `finance.invoice.create`, `room.create`. A user with only view rights sees the shortcut and gets a 403 on save (same family as audit SEC-001).

## X-007 | Low | Medium | Dashboard `today` source | pages/DashboardPage.tsx:123 vs backend dashboardService.ts:68
FE uses the server's UTC `overview.today` (falls back to local `toISOString` on failure); WIB mismatch window described in BE-026.
