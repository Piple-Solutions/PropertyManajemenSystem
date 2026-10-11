# Blok 3 — Full Backend Sweep

## 3.1 Endpoint Inventory vs Audit Pertama

### Endpoint Baru
| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| GET | /api/reports/revenue | yes | finance.report.view | BE-022: billed vs paid |
| GET | /api/sales/summary | yes | finance.sales.view | BE-022: billed vs paid |
| POST | /api/auth/logout | yes | none | Stateless logout + audit |

### Endpoint Berubah
| Endpoint | Before | After |
|---|---|---|
| POST /api/auth/register | Public self-signup | Selalu 403 (BE-001) |
| GET /api/sales/breakdown | Tanpa zod | salesBreakdownQuerySchema |
| Role mutations | Tanpa audit | Di-audit (BE-023) |
| POST /api/invoices | Bisa set status | Status only via actions (BE-020) |
| DELETE /api/invoices/:id | Bisa hapus semua | Hanya Draft (BE-019) |
| GET /users, /roles, dll | N+1 queries | Query budget diturunkan (BE-027) |

### Route Registration Order
Semua route di-register di src/index.ts. Tidak ada wildcard/OPTIONS/health/public/debug route yang tidak seharusnya. `app.notFound` dan `app.onError` ada. `OPTIONS` ditangani oleh CORS middleware.

### Public Endpoints (tanpa auth)
- GET /api/health
- GET /api/public/room-types
- GET /api/public/holidays

Semua sisanya butuh `authenticate` middleware.

## 3.2 Access Control Sweep

### IDOR
- Semua GET by id hanya butuh permission dasar (user.view, reservation.view, dll). Tidak ada scope check — semua user dengan permission bisa lihat semua record. **Pre-existing, low** — internal PMS, semua staff dengan permission seharusnya bisa lihat daftar.

### Mass Assignment
- Semua write endpoint menggunakan zod schema yang membatasi field. `total`, `subtotal`, `discount` dihitung server-side. `invoiceStatus`/`paymentStatus` tidak bisa di-set lewat create/PATCH. `roles`/`status` hanya bisa di-set oleh actor yang memegang permission terkait. **Correct**.

### Privilege Escalation
- `assertNoPrivilegeEscalation`: actor tidak bisa memberi role dengan izin yang tidak mereka miliki. **Correct**.
- `assertCovers`: actor tidak bisa mengubah role/permission dengan izin yang tidak mereka miliki. **Correct**.
- `assertNotLastSuperAdmin`: Super Admin terakhir tidak bisa dihapus/diturunkan. **Correct**.

### Data Leakage ke Low Roles
- `GET /api/users` — hanya butuh `user.view`. Semua user field (name, email, roles, status) ditampilkan. Tidak ada password hash. **Correct**.
- `GET /api/roles` — hanya butuh `role.view`. Semua role field ditampilkan. **Correct**.
- `GET /api/activities` — hanya butuh `activity.view`. Semua audit metadata ditampilkan. **Pre-existing** (R2-BE-007).

## 3.3 Input Handling Sweep

### Zod Coverage
Semua write endpoint menggunakan zod validation. `GET /api/sales/breakdown` sekarang pakai `salesBreakdownQuerySchema`. **Correct**.

### SQL Injection
Semua SQL menggunakan parameterized queries (drizzle `sql` template). Tidak ada string concatenation. **Correct**.

### Dynamic ORDER BY
Tidak ada. Semua ORDER BY menggunakan column name dari kode. **Correct**.

### JSON Body Size
Tidak ada body size limit di application code. Cloudflare Workers punya limit 10MB. **Acceptable**.

### Error Responses
`toErrorBody` mengembalikan generic "Internal server error" untuk non-ApiError. Stack trace tidak di-expose. **Correct**.

## 3.4 Data Layer

### Schema vs Code
Semua constraint (CHECK, UNIQUE, REFERENCES) ada di migrations. Schema match dengan code. **Correct**.

### Indexes
Semua kolom yang digunakan di WHERE/JOIN/ORDER BY punya index:
- users(email), users(status)
- roles(status)
- permissions(resource)
- user_roles(role_id)
- role_permissions(permission_id)
- password_reset_tokens(user_id)
- reservations(status), reservations(source), reservations(check_in_date, check_out_date), reservations(reservation_code)
- reservation_rooms(reservation_id), reservation_rooms(room_id)
- reservation_nightly_rates(reservation_id)
- room_types(status), room_types(name)
- rooms(room_type_id), rooms(status), rooms(room_number)
- activities(created_at DESC, id DESC), activities(category), activities(user_id), activities(entity_type, entity_id)
- invoices(invoice_number), invoices(invoice_date), invoices(status), invoices(payment_status), invoices(reservation_id)
- invoice_items(invoice_id)
- expenses(date), expenses(category), expenses(status)

**Correct**. Index cukup untuk query patterns saat ini.

### Statements per Request
Query budget test memastikan semua endpoint dalam budget:
- Tertinggi: POST /reservations = 13 statements
- Free plan: 50 statements per invocation
- Paid plan: 1000 statements per invocation

**Safe** untuk kedua plan.

### Unbounded Queries
- `GET /api/activities` — pagination, default pageSize=10, max 100. **Correct**.
- `GET /api/reservations/calendar` — unbounded date range (D-042, accepted by owner). **Known item**.
- Semua list endpoint punya pagination. **Correct**.

## 3.5 Config Review

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

## 3.6 Reliability

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

## Kesimpulan Blok 3

**Tidak ada temuan Critical atau High baru.**

- 1 Medium (R2-BE-007): audit metadata tidak di-maskPii saat dibaca — pre-existing
- 4 Low: semua pre-existing atau stale komentar
- 1 N/A: verified correct

**Endpoint inventory:** 3 endpoint baru, 2 berubah, 1 fixed. Tidak ada endpoint tanpa auth yang tidak seharusnya.

**Access control:** Semua write endpoint punya permission check. Mass assignment dicegah. Privilege escalation dicegah.

**Input handling:** Semua SQL parameterized. Tidak ada SQL injection. Error responses tidak leak stack trace.

**Data layer:** Schema match dengan code. Indexes cukup. Statements per request dalam budget.

**Config:** workers_dev=true (known), observability off (known), CORS allowlist, JWT_SECRET placeholder di .dev.vars (expected).

**Reliability:** Swallowed errors di-log. waitUntil untuk audit. PII di-mask di error log.
