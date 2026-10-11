# Blok 4 — Frontend Review (logic and security, not design)

## 4.1 api.ts and authStore

### Correct
- 401 handler fires once per session (`unauthorizedFired` flag)
- Login call (`auth: false`) never triggers handler
- Network/5xx errors do NOT trigger logout (only 401 with sent token)
- Token cleared on 401
- `setToken` resets `unauthorizedFired`
- `restoreSession` only clears token on 401 (not on network error/5xx)
- `getMyPermissions` throws errors (store keeps last known set)
- `safeReturnTo` blocks `//`, backslashes, and auth pages
- `fetchAllPages` capped at 20 pages (activities 10)

### Bug (finding)
- **R2-FE-001** (Low): `navigate(0)` in InvoiceDetailPage reloads page after action — UX issue, not functional bug

### Unverified
- None

## 4.2 fetchAllPages and list services

### Correct
- `fetchAllPages` follows `pagination.total` and concatenates pages
- Cap 20 pages (2000 rows), activities 10 pages (1000 rows)
- Backend orders deterministically (rowid), so pages don't overlap
- Error in page N propagates (no silent truncation)
- `getAllIfPermitted` returns `[]` on 403 (for dashboard, reservation list, sales/report)

### Bug (finding)
- None found

### Unverified
- Behavior when total changes mid-fetch (edge case, low impact)

## 4.3 useAsyncData and finance pages

### Correct
- `useAsyncData` has cancellation flag (stale response ignored)
- `reload` is stable (`useCallback`)
- Race conditions handled by cancellation
- Error handling on every mutation (create/update/delete)
- Failed save keeps form open with error message
- Status-to-action mapping (`statusActionFor`) covers all combinations:
  - Draft+Pending → none (no action)
  - Draft+Sent → send
  - Draft/Sent+Completed+Paid → pay
  - Draft/Sent+Cancelled → cancel
  - Other → unsupported (sent to backend for 422)
- Delete flow: confirm dialog → delete → reload
- Partial failure between "save" and "action": invoice saved as Draft, error shown

### Bug (finding)
- None found

### Unverified
- None

## 4.4 Dates and numbers

### Correct
- `todayLocalISO` uses local time methods (correct for WIB browser)
- `toLocalISODate` uses local time methods
- `shiftISODate` uses UTC arithmetic (correct for pure calendar math)
- `formatDate` with 'iso' uses `toLocalISODate`
- `formatCurrency` uses `Intl.NumberFormat('id-ID')`
- Money parsing: FE sends integers, BE computes totals server-side
- Rounding: BE uses `Math.round`, FE uses `toLocaleString` (display only)

### Bug (finding)
- **R2-FE-007** (Medium): `toLocalISODate` uses local time methods — jika browser timezone bukan WIB, tanggal akan salah. Critical untuk bisnis (check-in date, invoice date).

### Unverified
- None

## 4.5 FE-BE Contract

### Correct
- Invoice create/update: field names match (`invoiceNumber`, `reservationId`, `guestName`, `source`, `invoiceDate`, `items`, `discount`)
- Invoice actions: POST `/:id/send|pay|cancel` — match
- Invoice delete: DELETE `/:id` — match
- Reservation create/update: field names match
- Reservation actions: POST `/:id/{cancel,check-in,check-out}` — match
- Finance list: `fetchAllPages('/api/invoices')`, `/api/expenses`, `/api/sales` — match
- Error handling: `ApiError(status, message, errors)` → `apiErrorMessage(err, fallback)` — match
- 401 handling: `handleUnauthorized()` → clearToken + LOGOUT — match
- 403 handling: `getAllIfPermitted()` → `[]` — match
- Pagination: `{ page, pageSize, total }` — match
- Date format: `YYYY-MM-DD` — match
- Money: integer IDR — match

### Bug (finding)
- None found

### Unverified
- None

## 4.6 Security

### Correct
- No `dangerouslySetInnerHTML` in changed files
- No secrets in bundle (`VITE_API_URL` is public URL)
- Token only in `localStorage['pms_token']`
- Token not in URL or console
- Source maps: `sourcemap: 'hidden'` (not referenced from bundle)
- Permission checks exist in backend (UI-only checks are acceptable)

### Bug (finding)
- None found

### Unverified
- None

## 4.7 UI-neutrality Spot Check

### Correct
- 30 files changed, 3 added, 0 removed (hash comparison)
- Changes are logic-only (api, auth, services, formatUtils)
- ErrorState/Loading conditionals only (approved by owner)
- 7 div wrappers with style removed in Blok 10
- No new JSX/className/style that is not ErrorState/Loading conditional or disabled attribute

### Bug (finding)
- None found

### Unverified
- None

---

## Summary

| Area | Correct | Bug | Unverified |
|---|---|---|---|
| api.ts / authStore | 9 | 1 | 0 |
| fetchAllPages | 5 | 0 | 1 |
| useAsyncData / finance | 9 | 0 | 0 |
| Dates and numbers | 7 | 1 | 0 |
| FE-BE Contract | 13 | 0 | 0 |
| Security | 6 | 0 | 0 |
| UI-neutrality | 3 | 0 | 0 |
| **Total** | **52** | **2** | **1** |

**Findings:** 0 Critical, 0 High, 1 Medium (R2-FE-007), 2 Low (R2-FE-001, R2-FE-005), 7 N/A.

**Top findings:**
1. **R2-FE-007** (Medium): `toLocalISODate` timezone-dependent — tanggal bisa salah jika browser bukan WIB
2. **R2-FE-001** (Low): `navigate(0)` reload halaman setelah aksi invoice — UX issue
3. **R2-FE-005** (Low): komentar stale di DashboardPage

**FE-BE Contract:** Semua match. Tidak ada mismatch yang menyebabkan bug.

**Security:** Safe. Tidak ada XSS, secret, atau token leak.

**UI-Neutrality:** Verified. Tidak ada perubahan markup tidak disetujui.
