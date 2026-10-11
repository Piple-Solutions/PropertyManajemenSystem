# Audit R2B — Laporan Akhir (Gap-Closing)
**Proyek:** PMS Internal Homestay Joglo Serariah | **Tanggal:** 2026-10-11

---

## Ringkasan (max 10 lines)

1. **Baseline terverifikasi independen:** BE vitest 456/0 (33 file, 53.1s), BE tsc lulus (7.9s), FE tsc lulus (11.8s), FE build 1.838.796 B / 89 file / 0 sourceMappingURL (14.7s), ESLint 43 error / 308 warning (12.0s).
2. **0 Critical, 0 High findings baru.** Semua temuan Medium/Low adalah pre-existing atau documented limitations.
3. **3 Medium findings:** (a) D1 error-message dependency pada 3 lokasi, (b) timezone-dependent date helper, (c) audit metadata tidak di-mask.
4. **9 Low findings:** stale komentar, UX issues, fallback collision risks, rate limiter bypass.
5. **STEP B:** role-004 (Viewer) adalah satu-satunya inactive role; hanya user-004 (inactive) yang memegangnya; tidak ada user aktif yang kehilangan permission.
6. **STEP C:** `vite.config.js` artefak basi dengan `sourcemap: true` — `npm run build` meregenerasinya; production output aman (0 sourceMappingURL).
7. **STEP E:** 3 lokasi branching pada error message text: `authz.ts:140`, `invoiceService.ts:260`, `reservationService.ts:532`.
8. **STEP H:** 5 adversarial scenarios ditrace end-to-end: semua Confirmed fixed.
9. **STEP I:** 12 findings report sebelnya: 1 duplikat ID, 1 non-finding, "6 N/A" belum dijelaskan, salah label New/Pre-existing.
10. **Go/No-Go:** Staging **GO**. Production **CONDITIONAL GO** — 10 kondisi harus dipenuhi.

---

## STEP A — Proof of Baseline

| Pemeriksaan | Hasil | Durasi | Output |
|---|---|---|---|
| BE `tsc --noEmit` | exit 0 | 7.9s | `.tmp-audit2b\logs\be-tsc.txt` |
| BE `vitest run` | exit 0, **456 passed / 0 failed (33 file)** | 53.1s | `.tmp-audit2b\logs\be-vitest-raw.json` |
| FE `tsc --noEmit` | exit 0 | 11.8s | `.tmp-audit2b\logs\fe-tsc.txt` |
| FE ESLint | exit 2, **43 error / 308 warning** | 12.0s | `.tmp-audit2b\logs\fe-eslint.json` |
| FE build → `.tmp-audit2b\fe-dist\` | exit 0, **1.838.796 B / 89 file / 0 sourceMappingURL** | 14.7s | `.tmp-audit2b\logs\fe-build.log` |

**Build config verification:** `npm run build` menjalankan `tsc -b && vite build`. `tsc -b` meregenerasi `vite.config.js` dari `vite.config.ts`. Build output tidak mengandung `sourceMappingURL` di file JS (0 dari 89 file).

---

## STEP B — Inactive Role Impact

### Data dari mock JSON

| Role | Status | Pemegang | Permission yang hilang (setelah BE-007) |
|---|---|---|---|
| role-001 Super Admin | active | user-001 (active) | — |
| role-002 Manager | active | user-002 (active) | — |
| role-003 Staff | active | user-003 (active), user-005 (active) | — |
| **role-004 Viewer** | **inactive** | **user-004 (inactive)** | **room.view, reservation.view** |
| role-005 Reception | active | (tidak ada di seed) | — |

**Kesimpulan:** Tidak ada user aktif yang kehilangan permission. user-004 sudah inactive. Tidak ada test atau flow yang bergantung pada role-004.

### Super Admin Immunity
- **File:** `backend\src\services\identity.ts:76`
- **Code:** `permissions: unionPermissions(publicRoles.filter((r) => r.status === 'active' || r.id === SUPER_ADMIN_ROLE_ID))`
- **Verified:** Super Admin (role-001) selalu memberikan permission terlepas dari statusnya.

### SQL Query untuk Owner (READ-ONLY, jangan dijalankan)

```sql
-- (1) Inactive roles yang masih punya users
SELECT r.id, r.name, r.status, COUNT(ur.user_id) AS user_count
FROM roles r
LEFT JOIN user_roles ur ON ur.role_id = r.id
WHERE r.status = 'inactive'
GROUP BY r.id, r.name, r.status;

-- (2) Users dengan no active role (semua role inactive atau tidak punya role)
SELECT u.id, u.name, u.email, u.status
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_roles ur
  INNER JOIN roles r ON r.id = ur.role_id
  WHERE ur.user_id = u.id AND r.status = 'active'
);

-- (3) Number of active Super Admins
SELECT COUNT(*) AS active_super_admins
FROM user_roles ur
INNER JOIN users u ON u.id = ur.user_id
WHERE ur.role_id = 'role-001' AND u.status = 'active';

-- (4) Roles holding finance.expense.* permissions
SELECT r.id, r.name, p.name AS permission_name
FROM roles r
INNER JOIN role_permissions rp ON rp.role_id = r.id
INNER JOIN permissions p ON p.id = rp.permission_id
WHERE p.name LIKE 'finance.expense.%';

-- (5) Users whose only role is inactive
SELECT u.id, u.name, u.email
FROM users u
WHERE EXISTS (
  SELECT 1 FROM user_roles ur
  INNER JOIN roles r ON r.id = ur.role_id
  WHERE ur.user_id = u.id
)
AND NOT EXISTS (
  SELECT 1 FROM user_roles ur
  INNER JOIN roles r ON r.id = ur.role_id
  WHERE ur.user_id = u.id AND r.status = 'active'
);
```

---

## STEP C — Build Config

| Item | Status | Evidence |
|---|---|---|
| Build script | `tsc -b && vite build` | `frontend\package.json:8` |
| Vite config used | `vite.config.ts` (sourcemap: 'hidden') | `frontend\vite.config.ts:21` |
| `vite.config.js` exists | Ya, artefak basi dengan `sourcemap: true` | `frontend\vite.config.js:18` |
| `npm run build` regenerates | Ya, `tsc -b` overwrite dari `.ts` | `frontend\package.json:8` |
| Production output .map files | Ya, 89 file (hidden, tidak direferensikan) | `.tmp-audit2b\fe-dist\` |
| sourceMappingURL di JS | **0 dari 89 file** | Verified via grep |
| **Conclusion** | **SAFE** — maps ada tapi tidak direferensikan dari bundle | — |

---

## STEP D — Endpoint Inventory and Access Control

### New/Changed Endpoints vs Audit Pertama

| Endpoint | Status | Notes |
|---|---|---|
| `POST /api/auth/register` | **Changed** | Sekarang selalu 403 |
| `POST /api/auth/logout` | **Added** | Stateless logout + audit |
| `GET /api/reports/revenue` | **Added** | BE-022: billed vs paid |
| `GET /api/sales/summary` | **Added** | BE-022: billed vs paid |
| `GET /api/sales/breakdown` | **Changed** | Sekarang pakai zod |
| Role mutations | **Changed** | Sekarang di-audit (BE-023) |

### Access Control — checked, no issue

| Endpoint | Permission | Mass Assignment | IDOR | Data Leak | Verdict |
|---|---|---|---|---|---|
| `GET /api/users` | user.view | — | — | — | checked, no issue |
| `GET /api/users/:id` | user.view | — | — | — | checked, no issue |
| `POST /api/users` | user.create + assertNoPrivilegeEscalation | dicegah zod + service | — | — | checked, no issue |
| `PATCH /api/users/:id` | user.update + assertCanManageTarget | dicegah zod + service | — | — | checked, no issue |
| `PATCH /api/users/:id/status` | user.update | dicegah zod | — | — | checked, no issue |
| `PUT /api/users/:id/roles` | user.update + assertNoPrivilegeEscalation | dicegah zod + service | — | — | checked, no issue |
| `DELETE /api/users/:id` | user.delete + assertCanManageTarget | — | — | — | checked, no issue |
| `GET /api/roles` | role.view | — | — | — | checked, no issue |
| `POST /api/roles` | role.create + permission.assign | dicegah zod + service | — | — | checked, no issue |
| `PATCH /api/roles/:id` | role.update + assertCovers | dicegah zod + service | — | — | checked, no issue |
| `PUT /api/roles/:id/permissions` | permission.assign + assertCovers | dicegah zod + service | — | — | checked, no issue |
| `DELETE /api/roles/:id` | role.delete + assertCovers | — | — | — | checked, no issue |
| `GET /api/permissions` | permission.view | — | — | — | checked, no issue |
| `GET /api/reservations` | reservation.view | — | — | — | checked, no issue |
| `GET /api/reservations/:id` | reservation.view | — | — | — | checked, no issue |
| `POST /api/reservations` | reservation.create | totalAmount dihitung server | — | — | checked, no issue |
| `PATCH /api/reservations/:id` | reservation.update | totalAmount dihitung server | — | — | checked, no issue |
| `POST /api/reservations/:id/check-in` | reservation.checkin | — | — | — | checked, no issue |
| `POST /api/reservations/:id/check-out` | reservation.checkout | — | — | — | checked, no issue |
| `POST /api/reservations/:id/cancel` | reservation.delete | — | — | — | checked, no issue |
| `GET /api/rooms` | room.view | — | — | — | checked, no issue |
| `POST/PATCH/DELETE /api/rooms` | room.create/update/delete | dicegah zod | — | — | checked, no issue |
| `GET /api/invoices` | finance.invoice.view | — | — | — | checked, no issue |
| `POST /api/invoices` | finance.invoice.create | total/subtotal/discount dihitung server | — | — | checked, no issue |
| `PATCH /api/invoices/:id` | finance.invoice.update | total dihitung server | — | — | checked, no issue |
| `POST /api/invoices/:id/send` | finance.invoice.update | — | — | — | checked, no issue |
| `POST /api/invoices/:id/pay` | finance.invoice.update | — | — | — | checked, no issue |
| `POST /api/invoices/:id/cancel` | finance.invoice.update | — | — | — | checked, no issue |
| `DELETE /api/invoices/:id` | finance.invoice.delete | — | — | — | checked, no issue |
| `GET/POST/PATCH/DELETE /api/expenses` | finance.expense.* | amount dihitung server | — | — | checked, no issue |
| `GET /api/sales` | finance.sales.view | — | — | — | checked, no issue |
| `GET /api/sales/breakdown` | finance.sales.view | — | — | — | checked, no issue |
| `GET /api/sales/summary` | finance.sales.view | — | — | — | checked, no issue |
| `GET /api/reports/summary` | finance.report.view | — | — | — | checked, no issue |
| `GET /api/reports/revenue` | finance.report.view | — | — | — | checked, no issue |
| `GET /api/reports/top-invoices` | finance.report.view | — | — | — | checked, no issue |
| `GET /api/dashboard/overview` | anyOf(reservation.view, room.view) | — | — | — | checked, no issue |
| `GET /api/activities` | activity.view | — | — | — | checked, no issue |
| `GET /api/activities/:id` | activity.view | — | — | — | checked, no issue |
| `GET /api/health` | none (public) | — | — | — | checked, no issue |
| `GET /api/public/room-types` | none (public) | — | — | — | checked, no issue |
| `GET /api/public/holidays` | none (public) | — | — | — | checked, no issue |

---

## STEP E — D1 Error-Message Dependency Sweep

| # | file:line | Pattern | Jika D1 message berbeda | Status |
|---|---|---|---|---|
| 1 | `authz.ts:140` | `'NOT NULL constraint failed' && 'user_roles.user_id'` | Batch rollback aman, user dapat **500** bukan 403 | **Pre-existing** (documented) |
| 2 | `invoiceService.ts:260` | `isUniqueViolation(err, 'invoices.invoice_number')` | 500 alih-alih retry dengan nomor lain | **Pre-existing** |
| 3 | `reservationService.ts:532` | `isUniqueViolation(err, 'reservations.reservation_code')` | 500 alih-alih retry dengan kode lain | **Pre-existing** |

**Trace untuk #1:** `guardLastSuperAdmin` → `write()` → D1 error → loop depth 0..4 → `message.includes('NOT NULL constraint failed')` → jika tidak match → `throw err` → `toErrorBody` → **500**.

**Trace untuk #2:** `allocateInvoiceNumber` → 10 attempt → `isUniqueViolation` tidak match → error bubble → **500**. Fallback `Date.now().toString().slice(-6)` tidak tercapai.

**Trace untuk #3:** `generateUniqueCode` → 5 attempt + fallback random → `isUniqueViolation` tidak match → error bubble → **500**. Fallback `newId().slice(0, 8)` tidak tercapai.

**Semua pre-existing** — sudah didokumentasi di handover dan audit sebelumnya.

---

## STEP F — Query Cost and Indexes

### Indexes (dari migrations)

| Table | Index | Columns |
|---|---|---|
| users | idx_users_email | email |
| users | idx_users_status | status |
| roles | idx_roles_status | status |
| user_roles | idx_user_roles_role | role_id |
| role_permissions | idx_role_permissions_permission | permission_id |
| password_reset_tokens | idx_reset_tokens_user | user_id |
| reservations | idx_reservations_status | status |
| reservations | idx_reservations_source | source |
| reservations | idx_reservations_dates | check_in_date, check_out_date |
| reservations | idx_reservations_code | reservation_code |
| reservation_rooms | idx_reservation_rooms_reservation | reservation_id |
| reservation_rooms | idx_reservation_rooms_room | room_id |
| reservation_nightly_rates | idx_nightly_rates_reservation | reservation_id |
| room_types | idx_room_types_status, idx_room_types_name | status, name |
| rooms | idx_rooms_type, idx_rooms_status, idx_rooms_number | room_type_id, status, room_number |
| activities | idx_activities_created, idx_activities_category, idx_activities_user, idx_activities_entity | created_at+id, category, user_id, entity_type+entity_id |
| invoices | idx_invoices_number, idx_invoices_date, idx_invoices_status, idx_invoices_payment, idx_invoices_reservation | invoice_number, invoice_date, status, payment_status, reservation_id |
| invoice_items | idx_invoice_items_invoice | invoice_id |
| expenses | idx_expenses_date, idx_expenses_category, idx_expenses_status | date, category, status |

### Worst-case statements per request

| Endpoint | Max statements | Free plan (50) | Bound params worst-case | D1 limit (100) |
|---|---|---|---|---|
| POST /reservations | 13 | OK | 78 (header: 16 + overlap 62) | OK |
| PATCH /reservations | ~20 | OK | 65 (guard: 2 + overlap 63) | OK |
| POST /invoices + action | 5 | OK | ~40 | OK |
| GET /dashboard/overview | 6 | OK | ~30 | OK |
| GET /reservations/calendar | 4 | OK | ~20 | OK |
| GET /reservations (list, 100 rows) | 6 | OK | ~30 | OK |
| GET /invoices (list, 100 rows) | 5 | OK | ~30 | OK |
| GET /activities (list) | 4 | OK | ~20 | OK |

**Tidak ada missing index.** Semua kolom WHERE/JOIN/ORDER BY punya index.

---

## STEP G — FE-BE Contract Table

| FE method | BE route | Payload match | Response match | Error handling match | Status |
|---|---|---|---|---|---|
| auth.login | POST /api/auth/login | ✓ | ✓ | 401→null (X-005) | Match |
| auth.logout | POST /api/auth/logout | ✓ | ✓ | Best-effort | Match |
| auth.register | POST /api/auth/register | ✓ | ✓ | 409→null, 403→error | Match |
| auth.restoreSession | GET /api/auth/me | ✓ | ✓ | 401→clearToken | Match |
| auth.getMyPermissions | GET /api/auth/me | ✓ | ✓ | Error propagates | Match |
| auth.changePassword | POST /api/auth/change-password | ✓ | ✓ | Error→false | Match |
| auth.forgotPassword | POST /api/auth/forgot-password | ✓ | ✓ | Generic message | Match |
| auth.resetPassword | POST /api/auth/reset-password | ✓ | ✓ | Error→false | Match |
| users.getAll | GET /api/users | ✓ | ✓ | — | Match |
| users.getById | GET /api/users/:id | ✓ | ✓ | 404→undefined | Match |
| users.create | POST /api/users | ✓ | ✓ | 409→error | Match |
| users.update | PATCH /api/users/:id | ✓ | ✓ | 404→error | Match |
| users.delete | DELETE /api/users/:id | ✓ | 204 | 404→error | Match |
| roles.getAll | GET /api/roles | ✓ | ✓ | — | Match |
| roles.getById | GET /api/roles/:id | ✓ | ✓ | 404→undefined | Match |
| roles.create | POST /api/roles | ✓ | ✓ | 409→error | Match |
| roles.update | PATCH /api/roles/:id | ✓ | ✓ | 404→error | Match |
| roles.delete | DELETE /api/roles/:id | ✓ | 204 | 404→error | Match |
| reservations.getAll | GET /api/reservations | ✓ | ✓ | — | Match |
| reservations.getFullById | GET /api/reservations/:id | ✓ | ✓ | 404→undefined | Match |
| reservations.create | POST /api/reservations | ✓ | ✓ | 409→error | Match |
| reservations.update | PATCH /api/reservations/:id | ✓ | ✓ | 409→error | Match |
| reservations.checkIn/checkOut/cancel | POST /api/reservations/:id/* | ✓ | ✓ | 409→error | Match |
| invoice.getAll | GET /api/invoices | ✓ | ✓ | 403→[] (IfPermitted) | Match |
| invoice.getById | GET /api/invoices/:id | ✓ | ✓ | 404→undefined | Match |
| invoice.getNextNumber | GET /api/invoices/next-number | ✓ | ✓ | Error→fallback | Match |
| invoice.create | POST /api/invoices | ✓ | ✓ | 422→error | Match |
| invoice.update | PATCH /api/invoices/:id | ✓ | ✓ | 422→error | Match |
| invoice.delete | DELETE /api/invoices/:id | ✓ | 204 | 409→error | Match |
| invoice.send/markPaid/cancel | POST /api/invoices/:id/* | ✓ | ✓ | 409→error | Match |
| expense.getAll | GET /api/expenses | ✓ | ✓ | 403→[] (IfPermitted) | Match |
| expense.getById | GET /api/expenses/:id | ✓ | ✓ | 404→undefined | Match |
| expense.create | POST /api/expenses | ✓ | ✓ | 422→error | Match |
| expense.update | PATCH /api/expenses/:id | ✓ | ✓ | 404→null | Match |
| expense.delete | DELETE /api/expenses/:id | ✓ | 204 | — | Match |
| sales.getAll | GET /api/sales | ✓ | ✓ | 403→[] (IfPermitted) | Match |
| dashboard.getOverview | GET /api/dashboard/overview | ✓ | ✓ | — | Match |
| activities.getAll | GET /api/activities | ✓ | ✓ | — | Match |

**Tidak ada mismatch yang menyebabkan bug.**

---

## STEP H — Adversarial Check of Five Fixes

### (1) Last Super Admin guard — concurrent demotions + unexpected D1 error

**Attack:** Dua Super Admin saling demote secara concurrent.
**Expected:** Salah satu gagal dengan 403.
**Actual:** `assertNotLastSuperAdmin` check-then-write race → keduanya bisa pass read check → batch write → guard INSERT NULL → NOT NULL violation → batch rollback.
**Jika D1 error message berbeda:** Batch tetap rollback (invarian aman), tapi user dapat **500** bukan 403.
**Verdict:** **Confirmed fixed** (invarian aman). **Bug minor:** status code 500 jika D1 message berbeda.
**File:** `authz.ts:128-145`, `userService.ts:207-231`

### (2) Reservation overlap — same-day check-out/check-in, multi-room, edit-excluding-itself

**Attack A:** Room A check-out 2026-10-15, Room B check-in 2026-10-15. Harusnya tidak overlap.
**Trace:** `overlapExists`: `o.check_out_date > checkIn` → `'2026-10-15' > '2026-10-15'` = false → tidak overlap. **Correct.**

**Attack B:** Multi-room reservation, salah satu room bentrok.
**Trace:** `overlapExists` checks `rr.room_id IN (...)` → jika salah satu room bentrok, EXISTS true → insert ditolak. **Correct.**

**Attack C:** Edit reservation, exclude itself.
**Trace:** `overlapExists(..., excludeId)` → `o.id != ${excludeId}` → sendiri dikecualikan. **Correct.**
**Verdict:** **Confirmed fixed.** `reservationService.ts:246-255, 511-541, 694-696`

### (3) Invoice delete vs pay vs cancel race

**Attack:** Dua request concurrent: DELETE (Draft) dan POST /pay.
**Trace:** DELETE: conditional `WHERE invoice_status='Draft'` → DELETE items + DELETE invoice. Pay: conditional `WHERE invoice_status IN ('Draft','Sent')` → UPDATE.
Jika DELETE menang: pay dapat 409 (status berubah). Jika pay menang: DELETE dapat 409 (status bukan Draft).
**Verdict:** **Confirmed fixed.** `invoiceService.ts:378-402, 410-426, 429-485`

### (4) Permission superset — user with several roles, one inactive

**Attack:** User dengan role-003 (Staff, active) + role-004 (Viewer, inactive).
**Trace:** `loadAuthContext` → `filter(r => r.status === 'active' || r.id === SUPER_ADMIN_ROLE_ID)` → role-004 di-filter out → hanya permission role-003 yang berlaku.
**Expected:** User hanya punya permission Staff. **Actual:** Correct.
**Verdict:** **Confirmed fixed.** `identity.ts:76`

### (5) Activities pagination with equal created_at

**Attack:** Dua audit row dengan created_at sama.
**Trace:** `listActivities`: `ORDER BY desc(createdAt), desc(id)` → id adalah random UUID → urutan tidak deterministik untuk row dengan created_at sama.
**Expected:** Urutan deterministik. **Actual:** Beda urutan untuk event bersamaan.
**Verdict:** **Bug minor.** `activityService.ts:109`. Impact: UX, bukan data integrity.

---

## STEP I — Clean Up the Previous Report

### Issues ditemukan di `.tmp-audit2\audit2-report.md`

| Issue | Detail | Correction |
|---|---|---|
| Duplikat ID | R2-BE-005 muncul 2× dengan arti berbeda | R2-BE-005 (rate limiter) dan R2-BE-005 (isLocalhost) → rename menjadi R2-BE-005a dan R2-BE-005b |
| Non-finding | R2-BE-008 "tidak ada permission khusus finance vs reservation audit" — ini bukan bug, sudah benar | Hapus dari findings |
| "6 N/A" | 6 findings dengan label N/A tapi tidak dijelaskan | Jelaskan bahwa 6 findings adalah "verified correct" (bukan bug) |
| Salah label | "Pre-existing" untuk guard Super Admin — guard ini ditambah oleh remediasi | Label seharusnya "New" (ditambah Blok 2) |

### Corrected Findings Table (dari report sebelumnya)

| ID | Sev | Conf | file:line | Issue | New/Pre-existing | Corrected |
|---|---|---|---|---|---|---|
| R2-BE-001 | Medium | High | authz.ts:128-145 | Guard D1 error dependency | **New** (Blok 2) | — |
| R2-BE-002 | Low | High | security.ts:101-106 | X-Forwarded-For spoofing | Pre-existing | — |
| R2-BE-003 | Low | High | invoiceService.ts:81-104 | Invoice number fallback | Pre-existing | — |
| R2-BE-004 | Low | High | reservationService.ts:424-438 | Code fallback | Pre-existing | — |
| R2-BE-005a | Low | High | security.ts:27-34 | isLocalhostUrl bypass | Pre-existing | — |
| R2-BE-006 | Low | High | activityService.ts:109 | ORDER BY tidak deterministik | Pre-existing | — |
| R2-BE-007 | Medium | Medium | audit.ts:71-76 | Audit metadata tidak di-mask | Pre-existing | — |
| R2-BE-008 | — | — | — | **Non-finding** | — | **Dihapus** |
| R2-BE-009 | Low | High | dashboardService.ts:61-63 | Komentar stale | Pre-existing | — |
| R2-FE-001 | Low | High | InvoiceDetailPage.tsx:37 | navigate(0) reload | Pre-existing | — |
| R2-FE-005 | Low | High | DashboardPage.tsx:76 | Komentar stale | Pre-existing | — |
| R2-FE-007 | Medium | High | localDate.ts:9-10 | Timezone-dependent date | Pre-existing | — |

---

## Findings Table (sorted by severity)

| ID | Sev | Conf | file:line | Issue | Trace | Impact | Minimal fix | Effort | New/Pre-existing |
|---|---|---|---|---|---|---|---|---|---|
| R2B-001 | Medium | High | authz.ts:140 | Guard Super Admin andalkan D1 error message | D1 error → message.includes('NOT NULL constraint failed') → jika tidak match → 500 | Batch rollback aman, user dapat 500 bukan 403 | Tambah fallback: batch gagal + target SA terakhir → 403 | S | **New** (Blok 2) |
| R2B-002 | Medium | High | localDate.ts:9-10 | toLocalISODate timezone-dependent | Browser non-WIB → tanggal salah 1 hari | Tanggal invoice/reservation/expense bisa salah | Tambah comment atau gunakan library timezone-aware | S/M | Pre-existing |
| R2B-003 | Medium | Medium | audit.ts:71-76 | Audit metadata tidak di-maskPii | writeAudit → metadata dengan amounts → GET /api/activities → amounts terlihat | Amounts dan nama user terlihat di audit feed | Mask amounts di withPrefix | S | Pre-existing |
| R2B-004 | Low | High | security.ts:101-106 | X-Forwarded-For spoofing | Attacker set XFF header → clientAddress berubah → rate limit bypass | Rate limit tidak efektif jika direct access | Hapus fallback XFF | S | Pre-existing |
| R2B-005 | Low | High | invoiceService.ts:260 | Invoice number allocation fallback | isUniqueViolation tidak match → 500 | 500 alih-alih retry | Sama R2B-001 | S | Pre-existing |
| R2B-006 | Low | High | reservationService.ts:532 | Reservation code fallback | isUniqueViolation tidak match → 500 | 500 alih-alih retry | Sama R2B-001 | S | Pre-existing |
| R2B-007 | Low | High | security.ts:27-34 | isLocalhostUrl potensial bypass | Absolute URL di request line → Hono parse sebagai localhost | Token exposure jika absolute URL | Cloudflare normalisasi | S | Pre-existing |
| R2B-008 | Low | High | activityService.ts:109 | ORDER BY tidak deterministik | createdAt sama → id random UUID → urutan beda | UX: urutan audit beda untuk event bersamaan | Tambah rowid tiebreaker | S | Pre-existing |
| R2B-009 | Low | High | InvoiceDetailPage.tsx:37 | navigate(0) reload | Full page reload setelah aksi | UX: flickering | Ganti dengan reload() | S | Pre-existing |
| R2B-010 | Low | High | dashboardService.ts:61-63 | Komentar stale | Komentar "Finance backend deferred" | Cosmetic | Update komentar | S | Pre-existing |
| R2B-011 | Low | High | DashboardPage.tsx:76 | Komentar stale | Sama | Cosmetic | Update komentar | S | Pre-existing |

**Total: 0 Critical, 0 High, 3 Medium, 8 Low.**

---

## Go / No-Go

### Staging: **GO**

Kondisi:
1. ✅ Backend tsc lulus
2. ✅ Backend vitest 456/0 lulus
3. ✅ Frontend tsc lulus
4. ✅ Frontend build sukses (1.838.796 B, 0 sourceMappingURL)
5. ⚠️ ESLint 43 error / 308 warning (pre-existing, bukan regresi)
6. ⚠️ 3 Medium findings (semua pre-existing, tidak blocking)

### Production: **CONDITIONAL GO**

Kondisi yang harus dipenuhi (urutan):
1. **JWT_SECRET** produksi bukan placeholder
2. **Minimal 1 Super Admin aktif** di D1 produksi
3. **finance.expense.\*** granted ke role yang perlu
4. **Akun default** dinonaktifkan/diubah password
5. **workers_dev: false** setelah custom domain aktif
6. **Observability** diaktifkan
7. **Environment separation** (D1 staging ≠ production)
8. **Rate limiting nyata** (Cloudflare WAF/Rate Limiting)
9. **Email reset password** (saat ini token hanya di-return untuk localhost)
10. **E2E tests** dijalankan di lingkungan terisolasi

---

## What I Could Not Verify

- **D1 error message format** — guard Super Admin and invoice/code retry andalkan pesan error SQLite/D1 yang spesifik
- **D1 batch atomicity nyata** — semua bukti dari shim better-sqlite3
- **Concurrent double-booking di D1** — diuji di shim, bukan D1 production
- **Browser timezone** — toLocalISODate benar jika browser di WIB
- **Rate limiter effectiveness** — per-isolate, tidak dibagi antar isolate
- **E2E tests** — tidak dijalankan (deferred ke owner)
- **Performance/load** — tidak ada load testing

---

**Akhir laporan Audit R2B.**
