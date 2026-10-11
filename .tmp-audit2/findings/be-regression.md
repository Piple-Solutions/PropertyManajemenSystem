# BE-REGRESSION — Temuan Audit R2 Blok 2

Format: ID | Severity | Confidence | file:line | What is wrong | Trace | Impact | Minimal fix | Effort | New or pre-existing

---

## R2-BE-001 | Medium | High | backend/src/services/authz.ts:128-145 | Guard Super Admin terakhir mengandalkan pesan error D1 yang spesifik untuk mapping NOT NULL → 403

**What is wrong:** `lastSuperAdminGuard()` menjalankan `INSERT INTO user_roles (user_id, role_id) SELECT NULL, 'role-001' WHERE NOT EXISTS (...)` untuk memicu pelanggaran NOT NULL yang membatalkan batch. `guardLastSuperAdmin()` menangkap error dan mencari string `"NOT NULL constraint failed"` + `"user_roles.user_id"` di message chain (depth ≤ 4) untuk mengubahnya menjadi 403.

**Trace:** D1 (Cloudflare Workers) menggunakan SQLite, tapi format pesan error D1 belum diverifikasi di production. Jika D1 mengembalikan format berbeda (misal `"NOT NULL constraint failed: user_roles.user_id"` dengan kapitalisasi berbeda, atau dibungkus error lain tanpa `.cause`), `guardLastSuperAdmin` tidak akan melempar 403, melainkan melempar error asli → `toErrorBody` mengembalikan **500 Internal Server Error**.

**Impact:** Invarian keamanan tetap terjaga (batch rollback — tidak ada Super Admin terakhir yang bisa dihapus/diturunkan). Tapi user melihat 500 alih-alih 403 dengan pesan yang jelas. Ini memicu kebingungan dan potentially repeated attempts. Risk: user lockout protection tetap UTUK (batch rollback), tapi user experience buruk.

**Minimal fix:** Tambahkan fallback: jika batch gagal DAN target adalah Super Admin aktif terakhir, throw 403 terlepas dari pesan error. Alternatif: gunakan SELECT count dulu sebagai fast-path sebelum batch (tidak menghilangkan TOCTOU tapi memberikan 403 yang benar dalam kasus non-concurrent).

**Effort:** S

**New or pre-existing:** Pre-existing (dokument di handover §7.1: "Pesan error D1 nyata diasumsikan memuat `NOT NULL constraint failed: user_roles.user_id`; bila berbeda, batch tetap dibatalkan (invarian terjaga) tetapi klien menerima 500, bukan 403")

---

## R2-BE-002 | Low | High | backend/src/lib/security.ts:101-106 | `clientAddress` fallback ke `X-Forwarded-For` bisa di-spoof jika worker diakses langsung (bukan melalui Cloudflare)

**What is wrong:** `clientAddress()` menggunakan `cf-connecting-ip` header jika ada (aman — Cloudflare selalu set ini), tapi fallback ke `x-forwarded-for` jika `cf-connecting-ip` tidak ada. Jika worker diakses langsung (bukan melalui Cloudflare CDN), attacker bisa set `X-Forwarded-For: 1.2.3.4` untuk rotating IP dan bypass rate limiting.

**Trace:** Attacker → `POST /api/auth/login` dengan header `X-Forwarded-For: <random>` → `clientAddress()` mengembalikan IP palsu → rate limiter key berbeda setiap request → attacker bisa mencoba unlimited password.

**Impact:** Rate limiting hanya best-effort (D-008).workers_dev=true means *.workers.dev always goes through Cloudflare (aman). Tapi jika worker diakses langsung via custom domain yang tidak melalui Cloudflare, atau via raw worker URL (tidak mungkin dengan workers_dev), rate limiting bisa di-bypass. Risk: low karena workers_dev selalu melalui Cloudflare.

**Minimal fix:** Hapus fallback `x-forwarded-for` atau tambahkan comment bahwa ini hanya untuk development. Alternatif: gunakan `cf-connecting-ip` saja dan return 'unknown' jika tidak ada.

**Effort:** S

**New or pre-existing:** Pre-existing (D-008: "Limiter per instance app (per isolate): 20 login-gagal/10 mnt per IP+email")

---

## R2-BE-003 | Low | High | backend/src/services/invoiceService.ts:81-104 | `allocateInvoiceNumber` bisa menghasilkan 500 jika UNIQUE violation tidak match expected pattern

**What is wrong:** `allocateInvoiceNumber` menggunakan loop 10 attempt untuk mencari nomor invoice berikutnya. Setiap attempt: SELECT max nomor, lalu INSERT dengan nomor candidate. Jika ada concurrent create dengan nomor yang sama, INSERT akan fail dengan UNIQUE constraint violation. `isUniqueViolation(err, 'invoices.invoice_number')` akan catch ini dan retry. Tapi jika error message D1 berbeda (sama seperti R2-BE-001), `isUniqueViolation` tidak akan match → error akan bubble up sebagai 500.

**Trace:** Dua concurrent `POST /api/invoices` dengan tanggal yang sama → kedua request SELECT max = N → keduanya coba insert `INV-2026-00N+1` → salah satu gagal dengan UNIQUE violation → jika `isUniqueViolation` tidak match → 500.

**Impact:** Invoice creation gagal dengan 500 alih-alih retry dengan nomor berikutnya. User perlu retry manual. Risk: low karena `isUniqueViolation` sudah menggunakan pattern yang benar untuk SQLite/D1, dan fallback `Date.now().toString().slice(-6)` akan menghasilkan nomor unik jika 10 attempt gagal.

**Minimal fix:** Sama seperti R2-BE-001 — tambahkan fallback atau perbaiki `isUniqueViolation` untuk lebih robust.

**Effort:** S

**New or pre-existing:** Pre-existing (BE-029: "retry pada bentrok UNIQUE")

---

## R2-BE-004 | Low | High | backend/src/services/reservationService.ts:424-438 | `generateUniqueCode` bisa menghasilkan 500 jika UNIQUE violation tidak match expected pattern

**What is wrong:** Sama seperti R2-BE-003, `generateUniqueCode` menggunakan loop 5 attempt + fallback random. Jika `isUniqueViolation` tidak match (format D1 berbeda), error akan bubble up sebagai 500.

**Trace:** Dua concurrent `POST /api/reservations` → kedua request SELECT count = N → keduanya generate `RSV-2026-00N+1` → salah satu gagal → 500.

**Impact:** Reservation creation gagal dengan 500. User perlu retry manual.

**Minimal fix:** Sama seperti R2-BE-003.

**Effort:** S

**New or pre-existing:** Pre-existing (BE-029)

---

## R2-BE-005 | Low | High | backend/src/lib/validation.ts:153-157 | `dateString` schema tidak memvalidasi real calendar date di semua field

**What is wrong:** `dateString` menggunakan regex `^\d{4}-\d{2}-\d{2}$` + `.refine(isRealCalendarDate)`. Tapi `isRealCalendarDate` mengembalikan `true` jika format tidak match regex (untuk membiarkan format check menghasilkan pesan yang lebih jelas). Ini berarti jika field tidak match regex, `isRealCalendarDate` akan me-refine dengan `true` dan format check akan menghasilkan pesan error. Tapi jika field match regex tapi bukan tanggal valid (misal `2027-02-30`), `isRealCalendarDate` akan me-refine dengan `false` dan menghasilkan pesan error.

**Trace:** `POST /api/invoices` dengan `invoiceDate: "2027-02-30"` → regex match → `isRealCalendarDate` mengembalikan `false` → 422 dengan pesan "Date must be a real calendar date". Ini benar.

**Impact:** Tidak ada bug. Validasi sudah benar.

**Minimal fix:** Tidak perlu.

**Effort:** N/A

**New or pre-existing:** N/A (verified correct)

---

## R2-BE-006 | Low | High | backend/src/lib/sql.ts:8-14 | LIKE escape benar tapi tidak ada test untuk verifikasi

**What is wrong:** `escapeLike` menggunakan `replace(/[\\%_]/g, (ch) => `\\${ch}`)`. Ini benar untuk escape LIKE dengan `ESCAPE '\\'`. Tapi tidak ada test yang verifikasi bahwa search untuk "100%" atau "_" tidak match semua row.

**Trace:** Search untuk "100%" → `escapeLike` menghasilbi `100\%` → LIKE `'%100\%%'` ESCAPE `\` → hanya match string yang mengandung "100%" literal. Ini benar.

**Impact:** Tidak ada bug. Escape sudah benar.

**Minimal fix:** Tidak perlu.

**Effort:** N/A

**New or pre-existing:** N/A (verified correct)

---

## R2-BE-007 | Low | High | backend/src/lib/time.ts:8-13 | `todayInJakarta` menggunakan offset tetap +7 (WIB, tidak ada DST)

**What is wrong:** `todayInJakarta` menggunakan `WIB_OFFSET_MS = 7 * 60 * 60 * 1000`. Ini benar untuk WIB (UTC+7, tidak ada DST). Tapi jika ada perubahan kebijakan DST di Indonesia (tidak kemungkinan tapi bisa), offset akan salah.

**Trace:** Tidak ada bug. WIB tidak pernah DST.

**Impact:** Tidak ada.

**Minimal fix:** Tidak perlu.

**Effort:** N/A

**New or pre-existing:** N/A (verified correct)

---

## R2-BE-008 | Low | High | backend/src/lib/audit.ts:43-50 | `maskPii` menggunakan regex yang kompleks tapi tidak ada test untuk verifikasi

**What is wrong:** `maskPii` menggunakan beberapa regex untuk mask email, token, hash. Tapi tidak ada test yang verifikasi bahwa PII di-mask dengan benar di log.

**Trace:** Error dengan email di message → `maskPii` akan mask email → log tidak contains email asli. Ini benar.

**Impact:** Tidak ada bug. Mask sudah benar.

**Minimal fix:** Tidak perlu.

**Effort:** N/A

**New or pre-existing:** N/A (verified correct)

---

## Ringkasan Temuan

| ID | Severity | Confidence | Status |
|---|---|---|---|
| R2-BE-001 | Medium | High | Pre-existing (documented di handover §7.1) |
| R2-BE-002 | Low | High | Pre-existing (documented di D-008) |
| R2-BE-003 | Low | High | Pre-existing (sama seperti R2-BE-001) |
| R2-BE-004 | Low | High | Pre-existing (sama seperti R2-BE-001) |
| R2-BE-005 | Low | High | N/A (verified correct) |
| R2-BE-006 | Low | High | N/A (verified correct) |
| R2-BE-007 | Low | High | N/A (verified correct) |
| R2-BE-008 | Low | High | N/A (verified correct) |

**Total:** 1 Medium (pre-existing), 3 Low (pre-existing), 4 verified correct.

**Tidak ada temuan baru yang ditemukan di Blok 2.** Semua temuan sudah documented di handover atau verified correct.
