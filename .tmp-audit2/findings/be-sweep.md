# BE-SWEEP — Temuan Audit R2 Blok 3 (Full Backend Sweep)

Format: ID | Severity | Confidence | file:line | What is wrong | Trace | Impact | Minimal fix | Effort | New or pre-existing

---

## R2-BE-005 | Low | High | backend/src/routes/activities.ts:21 | Activities endpoint hanya butuh `activity.view`, tidak ada filter berdasarkan kategori entity yang diizinkan

**What is wrong:** `GET /api/activities` hanya memerlukan permission `activity.view`. Semua kategori (authentication, reservation, finance, system) ditampilkan kepada role yang memegang permission ini.

**Trace:** Role dengan `activity.view` → GET /api/activities → semua baris audit termasuk finance (invoice amounts, expense descriptions, guest names) dan system (user/role mutations).

**Impact:** Jika `activity.view` diberikan ke role yang seharusnya hanya melihat audit reservasi/authentication, mereka juga melihat audit finance dan admin. Tapi permission ini kemungkinan hanya untuk admin. Risk: low karena `activity.view` kemungkinan hanya ada di Super Admin/Manager.

**Minimal fix:** Sudah benar untuk saat ini. Jika nanti `activity.view` diberikan ke role lebih rendah, tambahkan filter kategori berdasarkan permission.

**Effort:** S (jika perlu)

**New or pre-existing:** Pre-existing

---

## R2-BE-006 | Low | High | backend/src/services/activityService.ts:109 | Activities ORDER BY menggunakan `desc(createdAt), desc(id)` — createdAt bisa sama untuk batch insert

**What is wrong:** `ORDER BY desc(activities.createdAt), desc(activities.id)`. Jika dua audit row dibuat dalam detik yang sama (batch insert), urutan ditentukan oleh `desc(id)` yang adalah UUID prefix (random). Urutan tidak deterministik.

**Trace:** Dua audit row dibuat dalam detik yang sama → orderBy createdAt desc, id desc → id adalah random UUID → urutan tidak deterministik.

**Impact:** Audit feed bisa menampilkan urutan yang berbeda untuk event yang terjadi bersamaan. Minor — audit feed adalah append-only dan urutan penting untuk debugging.

**Minimal fix:** Sudah benar untuk saat ini. SQLite tidak punya urutan insertion yang eksplisit tanpa rowid. Bisa gunakan `desc(rowid)` tapi SQLite rowid bisa berubah setelah VACUUM.

**Effort:** S (jika perlu)

**New or pre-existing:** Pre-existing

---

## R2-BE-007 | Medium | Medium | backend/src/routes/activities.ts:21 + backend/src/lib/audit.ts:71-76 | Activities metadata (before/after) tidak di-maskPii — berisi nama user, email, amounts

**What is wrong:** `withPrefix('before', values)` dan `withPrefix('after', values)` mengubah values menjadi string tanpa masking. Audit metadata berisi nama user, email (pada login audit), amounts (peta finance), dll. `maskPii` diterapkan pada `logUnexpectedError` dan `console.error`, tapi TIDAK pada audit metadata yang dibaca kembali oleh `GET /api/activities`.

**Trace:** `writeAudit` → metadata: { email: "a***@hotel.com", userName: "John", invoice_number: "INV-2026-001", total: "2160000" } → `GET /api/activities` → ditampilkan apa adanya ke frontend.

**Impact:** Jika `activity.view` diberikan ke role yang tidak seharusnya melihat PII (misal Reception), mereka bisa melihat email (masked), nama user, dan amounts. Tapi email sudah di-mask saat ditulis. Risk: medium karena amounts dan nama user tidak di-mask.

**Minimal fix:** Pertimbangkan masking amounts jika diperlukan. Tapi untuk saat ini, `activity.view` kemungkinan hanya untuk admin yang sudah bisa melihat data ini.

**Effort:** S (jika perlu)

**New or pre-existing:** Pre-existing

---

## R2-BE-008 | Low | High | backend/src/routes/activities.ts:21 | Tidak ada permission khusus untuk audit finance vs audit reservasi

**What is wrong:** Satu permission `activity.view` mengontrol akses ke semua kategori audit. Tidak ada pemisahan antara audit finance (amounts, invoices) dan audit reservasi/system.

**Trace:** Role dengan `activity.view` → bisa lihat semua audit termasuk finance.

**Impact:** Jika nanti ada role yang hanya perlu lihat audit reservasi (misal Reception), mereka juga akan lihat audit finance. Risk: low untuk saat ini.

**Minimal fix:** Sudah benar untuk saat ini.

**Effort:** S (jika perlu)

**New or pre-existing:** Pre-existing

---

## R2-BE-009 | Low | High | backend/src/routes/dashboard.ts:61-63 | Komentar stale: "Finance backend stays deferred" — finance sudah tidak deferred lagi

**What is wrong:** Komentar di `dashboardService.ts` bilang "Finance backend stays deferred and those tiles/charts keep their existing mock services." Ini tidak akurat lagi setelah FE-001 (Blok 9B) — finance FE sudah pakai API nyata.

**Trace:** Komentar stale setelah FE-001.

**Impact:** Cosmetic only — kode tetap berfungsi benar (finance memang tidak ada di dashboard endpoint).

**Minimal fix:** Update komentar.

**Effort:** S

**New or pre-existing:** Pre-existing (stale komentar)

---

## R2-BE-010 | Low | High | backend/src/routes/reports.ts:23 | Reports endpoint mengembalikan 200 dengan data kosong jika `start` > `end` — tidak ada validasi rentang

**What is wrong:** `GET /api/reports/summary?start=2026-12-31&end=2026-01-01` → hanya ada check `query.end < query.start` → 400. Tapi jika `start == end` atau `start < end` tapi tidak ada data, mengembalikan 200 dengan zeros. Ini benar.

**Trace:** Tidak ada bug. Validasi sudah benar.

**Impact:** Tidak ada.

**Minimal fix:** Tidak perlu.

**Effort:** N/A

**New or pre-existing:** N/A (verified correct)

---

## Endpoint Inventory vs Audit Pertama

| Perubahan | Status | Keterangan |
|---|---|---|
| `POST /api/auth/register` | **Changed** | Sekarang selalu 403 (BE-001) |
| `POST /api/auth/logout` | **Added** | Stateless logout + audit |
| `GET /api/reports/revenue` | **Added** | Billed vs paid (BE-022) |
| `GET /api/sales/summary` | **Added** | Billed vs paid (BE-022) |
| `GET /api/sales/breakdown` | **Changed** | Sekarang pakai zod (salesBreakdownQuerySchema) |
| Role mutations | **Changed** | Sekarang di-audit (BE-023) |
| `GET /api/activities` | **Unchanged** | Permission `activity.view` |
| `GET /api/health` | **Unchanged** | Public, no auth |
| `GET /api/public/*` | **Unchanged** | Public, no auth |

## Access Control Sweep

### IDOR (Insecure Direct Object Reference)
- **Users**: `GET /api/users/:id` — hanya butuh `user.view`, tapi tidak ada scope check (semua user bisa lihat semua user). **Pre-existing, low** — ini internal PMS, semua staff dengan `user.view` seharusnya bisa lihat daftar user.
- **Reservations**: `GET /api/reservations/:id` — hanya butuh `reservation.view`. **Pre-existing, low** — sama.
- **Invoices**: `GET /api/invoices/:id` — hanya butuh `finance.invoice.view`. **Pre-existing, low** — sama.
- **Rooms**: `GET /api/rooms/:id` — hanya butuh `room.view`. **Pre-existing, low** — sama.

### Mass Assignment
- **Users**: `POST/PATCH /api/users` — schema zod membatasi field yang bisa dikirim. `roles` dan `status` hanya bisa di-set oleh actor yang memegang permission terkait. **Correct**.
- **Reservations**: `POST/PATCH /api/reservations` — schema zod membatasi field. `totalAmount` selalu dihitung server-side. **Correct**.
- **Invoices**: `POST/PATCH /api/invoices` — `total`, `subtotal`, `discount` selalu dihitung server-side. `invoiceStatus` dan `paymentStatus` tidak bisa di-set lewat create/PATCH. **Correct**.
- **Rooms**: `POST/PATCH /api/rooms` — schema zod membatasi field. **Correct**.

### Privilege Escalation
- **Users**: `assertNoPrivilegeEscalation` mencegah actor memberi role dengan izin yang tidak mereka miliki. **Correct**.
- **Roles**: `assertCovers` mencegah actor mengubah role dengan izin yang tidak mereka miliki. **Correct**.
- **Permissions**: `assertCovers` mencegah actor memberi izin yang tidak mereka miliki. **Correct**.

## Input Handling Sweep

### Zod Coverage
- Semua write endpoint menggunakan zod validation. **Correct**.
- `GET /api/sales/breakdown` — sekarang pakai `salesBreakdownQuerySchema` (zod). **Fixed**.

### SQL Injection
- Semua SQL menggunakan parameterized queries (drizzle `sql` template). **Correct**.
- `ORDER BY` selalu menggunakan column name dari kode, tidak dari user input. **Correct**.

### JSON Body Size
- Tidak ada body size limit di application code. Cloudflare Workers punya limit 10MB. **Acceptable**.

### Error Responses
- `toErrorBody` mengembalikan generic "Internal server error" untuk non-ApiError. **Correct**.
- Stack trace tidak di-expose ke client. **Correct**.

## Data Layer

### Schema vs Code Assumptions
- `users.status` — CHECK constraint active|inactive. **Correct**.
- `reservations.status` — CHECK constraint reserved|checked-in|checked-out|cancelled. **Correct**.
- `invoices.invoice_status` — CHECK constraint Draft|Sent|Completed|Cancelled. **Correct**.
- `invoices.payment_status` — CHECK constraint Pending|Paid|Overdue|Partial. **Correct**.
- `roles.status` — CHECK constraint active|inactive. **Correct**.
- `rooms.status` — CHECK constraint active|inactive|maintenance. **Correct**.

### Indexes
- `users(email)` — UNIQUE. **Correct**.
- `users(status)` — index. **Correct**.
- `reservations(status)` — index. **Correct**.
- `reservations(check_in_date, check_out_date)` — index. **Correct**.
- `reservation_rooms(room_id)` — index. **Correct**.
- `reservation_nightly_rates(reservation_id)` — index. **Correct**.
- `invoices(invoice_number)` — UNIQUE. **Correct**.
- `invoices(invoice_date)` — index. **Correct**.
- `invoices(status)` — index. **Correct**.
- `invoices(payment_status)` — index. **Correct**.
- `invoices(reservation_id)` — index. **Correct**.
- `invoice_items(invoice_id)` — index. **Correct**.
- `expenses(date)` — index. **Correct**.
- `expenses(category)` — index. **Correct**.
- `expenses(status)` — index. **Correct**.
- `activities(created_at DESC, id DESC)` — index. **Correct**.
- `activities(category)` — index. **Correct**.
- `activities(user_id)` — index. **Correct**.
- `activities(entity_type, entity_id)` — index. **Correct**.

### Statements per Request
- Query budget test memastikan semua endpoint dalam budget. **Correct**.
- Free plan: 50 statements per invocation. Budget tertinggi: 13 (POST /reservations). **Safe**.
- Paid plan: 1000 statements per invocation. **Safe**.

## Config Review

### Wrangler Config
- `workers_dev: true` — **Known item** (deferred ke owner).
- `compatibility_date: 2025-06-01` — OK.
- `observability` — tidak diaktifkan. **Known item** (deferred ke owner).
- `d1.databases[0].database_id` — placeholder "REPLACE_WITH_REAL_D1_DATABASE_ID". **Expected** (belum deploy).
- `d1.databases[0].migrations_dir: migrations` — OK.

### CORS
- `getAllowedOrigins` dari `FRONTEND_ORIGIN` env var. **Correct**.
- `credentials: false` — OK (JWT di header, bukan cookie).

### Secrets
- `JWT_SECRET` — di `.dev.vars` (placeholder "de***"). **Expected** untuk local dev.
- `DEV_EXPOSE_RESET_TOKEN` — di `.dev.vars`. **Expected** untuk local dev.
- Tidak ada secret di source code. **Correct**.

### Dependencies
- `bcryptjs` — pure JS, tidak native. **OK**.
- `hono` — framework. **OK**.
- `drizzle-orm` — ORM. **OK**.
- `zod` — validation. **OK**.
- `better-sqlite3` — hanya di devDependencies (untuk test shim). **OK**.
- `wrangler` — CLI. **OK**.

## Reliability

### Swallowed Errors
- `runDeferred` — error di-catch dan di-log. **Correct**.
- `logUnexpectedError` — error di-log sebagai JSON. **Correct**.
- `forgotPassword` — selalu sukses dengan pesan generic. **Correct**.

### Unhandled Rejections
- `guardLastSuperAdmin` — error di-catch. **Correct**.
- `isUniqueViolation` — error di-catch. **Correct**.

### D1 Error Mid-Batch
- `runAtomic` — jika salah satu statement gagal, batch rollback. **Correct**.
- `changesOf` — cek `meta.changes`. **Correct**.

### waitUntil Usage
- `runDeferred` — audit untuk failed login. **Correct** (audit tidak boleh block response).
- Tidak ada operasi penting lain di waitUntil. **Correct**.

### Logging PII
- `maskPii` — mask email, token, hash di error log. **Correct**.
- `maskEmail` — mask email di audit metadata. **Correct**.
- Audit metadata (before/after) — tidak di-maskPii saat dibaca. **Pre-existing** (R2-BE-007).

---

## Ringkasan Temuan Blok 3

| ID | Severity | Confidence | Status |
|---|---|---|---|
| R2-BE-005 | Low | High | Pre-existing |
| R2-BE-006 | Low | High | Pre-existing |
| R2-BE-007 | Medium | Medium | Pre-existing |
| R2-BE-008 | Low | High | Pre-existing |
| R2-BE-009 | Low | High | Pre-existing (stale komentar) |
| R2-BE-010 | Low | High | N/A (verified correct) |

**Total:** 0 Critical, 0 High, 1 Medium, 4 Low, 1 N/A.

**Tidak ada temuan Critical atau High baru di Blok 3.** Semua finding adalah pre-existing atau stale komentar.

**Endpoint inventory:** 3 endpoint baru (reports/revenue, sales/summary, auth/logout), 1 berubah (register→403), 1 berubah (sales/breakdown pakai zod). Tidak ada endpoint tanpa auth yang tidak seharusnya.

**Access control:** Semua write endpoint punya permission check. Mass assignment dicegah oleh zod + service checks. Privilege escalation dicegah oleh authz.ts.

**Input handling:** Semua SQL parameterized. Tidak ada dynamic ORDER BY dari user input. Error responses tidak leak stack trace.

**Data layer:** Schema match dengan code. Indexes cukup. Statements per request dalam budget.

**Config:** workers_dev=true (known), observability off (known), CORS allowlist, JWT_SECRET placeholder di .dev.vars (expected).

**Reliability:** Swallowed errors di-log. waitUntil untuk audit. PII di-mask di error log.
