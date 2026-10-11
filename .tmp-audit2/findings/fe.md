# FE — Temuan Audit R2 Blok 4 (Frontend Review)

Format: ID | Severity | Confidence | file:line | What is wrong | Trace | Impact | Minimal fix | Effort | New or pre-existing

---

## R2-FE-001 | Low | High | frontend/src/pages/finance/InvoiceDetailPage.tsx:37 | `navigate(0)` me-reload halaman setelah aksi invoice — flickering dan kehilangan state

**What is wrong:** `runAction` memanggil `navigate(0)` setelah sukses. Ini me-reload seluruh halaman, menyebabkan flickering dan kehilangan scroll position.

**Trace:** User klik "Mark as Sent" → sukses → `navigate(0)` → full page reload → flickering.

**Impact:** UX degradation, bukan bug fungsional. Data akan benar setelah reload.

**Minimal fix:** Ganti `navigate(0)` dengan `reload()` dari `useAsyncData`.

**Effort:** S

**New or pre-existing:** Pre-existing (FE-001 implementation)

---

## R2-FE-002 | Low | High | frontend/src/services/api.ts:160 | `fetchAllPages` bisa berhenti terlalu awal jika `total` berubah mid-fetch

**What is wrong:** Loop `fetchAllPages` berhenti ketika `rows.length >= total`. Jika row baru ditambah selama fetch, `total` dari page terakhir mungkin lebih kecil dari total aktual, menyebabkan data terpotong.

**Trace:** Page 1: total=150, ambil 100. Selama fetch page 2, row baru ditambah. Page 2: total=155, ambil 50. Loop berhenti karena rows.length (150) >= total (155) = false, lanjut. Page 3: total=155, ambil 5. Selesai. Sebenarnya correct karena total dari page terakhir.

**Impact:** Minor — edge case yang rare dan impact kecil.

**Minimal fix:** Sudah benar. Total dari page terakhir adalah yang terbaik.

**Effort:** N/A

**New or pre-existing:** N/A (verified correct)

---

## R2-FE-003 | Low | High | frontend/src/hooks/useAsyncData.ts:28-46 | Race condition antar reload bisa menyebabkan stale response overwrite newer data

**What is wrong:** Jika user cepat-navigate antara halaman atau trigger reload sebelumnya selesai, response dari reload sebelumnya bisa overwrite data dari reload terbaru.

**Trace:** User di halaman A → reload() → response lambat → user navigate ke halaman B → reload() → response cepat → overwrite. Tapi cancellation flag mencegah ini karena effect cleanup.

**Impact:** Minor — cancellation flag sudah ada dan mencegah stale response.

**Minimal fix:** Sudah benar. Cancellation flag bekerja.

**Effort:** N/A

**New or pre-existing:** N/A (verified correct)

---

## R2-FE-004 | Low | High | frontend/src/services/invoiceService.ts:40-52 | `statusActionFor` mengirim unsupported combination ke backend — by design (D-049)

**What is wrong:** Kombinasi tanpa aksi (misal Completed+Pending) dikirim dengan status ke backend. Backend akan tolak 422 dengan pesan sendiri.

**Trace:** User pilih Completed + Pending → `statusActionFor` return 'unsupported' → body dikirim dengan status → backend 422 → pesan error ditampilkan.

**Impact:** By design (D-049). User mendapat pesan error yang jelas dari backend.

**Minimal fix:** Tidak perlu — ini keputusan design.

**Effort:** N/A

**New or pre-existing:** N/A (by design D-049)

---

## R2-FE-005 | Low | High | frontend/src/pages/DashboardPage.tsx:76 | Komentar stale: "Finance backend stays deferred" — finance sudah tidak deferred lagi

**What is wrong:** Komentar bilang "Revenue/sales/invoice/expense sections intentionally stay on their existing mock services (Finance backend deferred)." Ini tidak akurat setelah FE-001.

**Trace:** Komentar stale setelah FE-001 (Blok 9B).

**Impact:** Cosmetic only — kode tetap berfungsi benar.

**Minimal fix:** Update komentar.

**Effort:** S

**New or pre-existing:** Pre-existing (stale komentar)

---

## R2-FE-006 | Low | High | frontend/src/utils/formatUtils.ts:3 | `formatDate` menggunakan `toLocaleDateString` — timezone-dependent

**What is wrong:** `formatDate` menggunakan `date.toLocaleDateString('id-ID', ...)`. Ini timezone-dependent. Jika browser di timezone berbeda dari WIB, tanggal bisa berbeda.

**Trace:** Browser di UTC → `new Date('2026-10-11T17:00:00Z')` → `toLocaleDateString('id-ID')` → "11 Okt 2026" (UTC). Tapi di WIB, ini "12 Okt 2026".

**Impact:** Minor — hanya memengaruhi display, bukan logic. Consistency dengan backend (WIB) tidak guaranteed.

**Minimal fix:** Sudah acceptable untuk internal PMS. Staff di WIB akan melihat tanggal yang benar.

**Effort:** N/A

**New or pre-existing:** N/A (acceptable)

---

## R2-FE-007 | Medium | High | frontend/src/utils/localDate.ts:9-10 | `toLocalISODate` menggunakan local time methods — salah jika browser timezone bukan WIB

**What is wrong:** `toLocalISODate` menggunakan `d.getFullYear()`, `d.getMonth()`, `d.getDate()` yang local time. Jika browser di timezone bukan WIB (misal UTC), tanggal akan berbeda dari yang diharapkan.

**Trace:** Browser di UTC, jam 02:00 → `new Date()` → `toLocalISODate()` → "2026-10-11" (UTC). Tapi hari ini di WIB adalah "2026-10-12".

**Impact:** **Medium** — tanggal invoice, reservation, dan expense bisa salah jika staff tidak set browser ke WIB. Ini critical untuk bisnis (check-in date, invoice date).

**Minimal fix:** Tambahkan comment bahwa browser harus di WIB timezone. Atau gunakan timezone-aware date library.

**Effort:** S (untuk comment) / M (untuk library)

**New or pre-existing:** Pre-existing (FE-005 implementation)

---

## R2-FE-008 | Low | High | frontend/src/services/api.ts:9-13 | Token storage di localStorage — documented limitation

**What is wrong:** JWT disimpan di localStorage. XSS bisa expose token.

**Trace:** XSS attack → `localStorage.getItem('pms_token')` → token stolen → attacker bisa impersonate user.

**Impact:** Low — XSS sudah di-mitigate oleh React escaping dan CSP. Token expiry 1 jam.

**Minimal fix:** Sudah didokumentasi. HttpOnly cookie tidak feasible di Workers static hosting.

**Effort:** N/A

**New or pre-existing:** N/A (documented limitation)

---

## R2-FE-009 | Low | High | frontend/src/pages/finance/InvoiceFormPage.tsx:66 | Fallback invoice number `INV-${year}-001` bisa collision

**What is wrong:** Jika `getNextNumber` gagal (network error, no permission), fallback ke `INV-${new Date().getFullYear()}-001`. Ini bisa collision dengan existing invoice.

**Trace:** `getNextNumber` gagal → fallback `INV-2026-001` → jika sudah ada, backend akan allocate nomor lain → invoice tersimpan dengan nomor berbeda dari yang ditampilkan.

**Impact:** Minor — backend akan allocate nomor lain, tapi user mungkin bingung jika nomor berubah.

**Minimal fix:** Sudah acceptable. Backend allocate nomor lain jika collision.

**Effort:** N/A

**New or pre-existing:** N/A (acceptable)

---

## R2-FE-010 | Low | High | frontend/src/pages/finance/InvoiceListPage.tsx:70-72 | `refreshKey` memicu reload, tapi `reload` dari `useAsyncData` tidak auto-reload pada initial mount

**What is wrong:** `useEffect` memanggil `reload()` ketika `refreshKey > 0`. Tapi `reload` menggunakan `setTick` yang memicu effect di `useAsyncData`. Ini berarti reload hanya terjadi jika `refreshKey` berubah, bukan pada mount.

**Trace:** Mount → `refreshKey=0` → tidak reload. Setelah create → `refreshKey=1` → reload. Correct.

**Impact:** Tidak ada bug. Flow sudah benar.

**Minimal fix:** Tidak perlu.

**Effort:** N/A

**New or pre-existing:** N/A (verified correct)

---

## FE-BE Contract Verification

### Invoice Create
- FE kirim: `invoiceNumber?, reservationId?, guestName, source, invoiceDate, items, discount, paymentStatus?, invoiceStatus?`
- BE terima: sama
- **Match** ✓

### Invoice Update
- FE kirim: field sama dengan create
- BE terima: sama, + status validation
- **Match** ✓

### Invoice Actions
- FE: POST `/api/invoices/:id/send|pay|cancel`
- BE: sama
- **Match** ✓

### Invoice Delete
- FE: DELETE `/api/invoices/:id`
- BE: sama, hanya Draft
- **Match** ✓

### Reservation Create/Update
- FE kirim: `guestName, source, checkInDate, checkOutDate, notes?, rooms[{roomId, roomNumber, roomTypeName?}], pricing{mode, nightlyRates[], paymentType, dpType, dpPercentage?, dpFixedAmount?}`
- BE terima: sama
- **Match** ✓

### Reservation Actions
- FE: POST `/api/reservations/:id/{cancel,check-in,check-out}`
- BE: sama
- **Match** ✓

### Finance List
- FE: `fetchAllPages('/api/invoices')`, `fetchAllPages('/api/expenses')`, `fetchAllPages('/api/sales')`
- BE: sama, pagination `{ page, pageSize, total }`
- **Match** ✓

### Error Handling
- FE: `ApiError(status, message, errors)` → `apiErrorMessage(err, fallback)`
- BE: `{ message, errors? }`
- **Match** ✓

### 401 Handling
- FE: `handleUnauthorized()` → clearToken + LOGOUT dispatch
- BE: 401 response
- **Match** ✓

### 403 Handling (Finance)
- FE: `getAllIfPermitted()` → 403 → `[]`
- BE: 403 response
- **Match** ✓

---

## Security Sweep

### XSS
- Tidak ada `dangerouslySetInnerHTML` di file yang diubah.
- React auto-escapes output.
- **Safe** ✓

### Secrets in Bundle
- `VITE_API_URL` di `.env.example` — public URL, bukan secret.
- Tidak ada `VITE_` secret.
- **Safe** ✓

### Token in URL/Console
- Token hanya di `localStorage['pms_token']`.
- Tidak di URL atau console.
- **Safe** ✓

### Source Maps
- `vite.config.ts`: `sourcemap: 'hidden'` — maps tidak direferensikan dari bundle.
- **Safe** ✓

### Permission Checks (UI-only)
- `getAllIfPermitted` — 403 → `[]`, tapi UI tidak hide menu berdasarkan permission.
- **Acceptable** — backend tetap enforce permissions.

---

## UI-Neutrality Spot Check

Diff vs snapshot-block-8/9b/10:
- 30 file changed, 3 added, 0 removed (hash comparison di Blok 1).
- Perubahan: logic-only (api, auth, services, formatUtils) + ErrorState/Loading conditionals.
- Tidak ada JSX/className/style baru yang tidak disetujui.
- 7 div pembungkus ber-style dicabut di Blok 10.
- **Verified** ✓

---

## Ringkasan Temuan Blok 4

| ID | Severity | Confidence | Status |
|---|---|---|---|
| R2-FE-001 | Low | High | Pre-existing — `navigate(0)` reload |
| R2-FE-002 | Low | High | N/A — verified correct |
| R2-FE-003 | Low | High | N/A — verified correct |
| R2-FE-004 | Low | High | N/A — by design D-049 |
| R2-FE-005 | Low | High | Pre-existing — stale komentar |
| R2-FE-006 | Low | High | N/A — acceptable |
| R2-FE-007 | Medium | High | Pre-existing — timezone-dependent date |
| R2-FE-008 | Low | High | N/A — documented limitation |
| R2-FE-009 | Low | High | N/A — acceptable |
| R2-FE-010 | Low | High | N/A — verified correct |

**Total:** 0 Critical, 0 High, 1 Medium, 2 Low, 7 N/A.

**FE-BE Contract:** Semua match. Tidak ada mismatch yang menyebabkan bug.

**Security:** Safe. Tidak ada XSS, secret, atau token leak.

**UI-Neutrality:** Verified. Tidak ada perubahan markup tidak disetujui.
