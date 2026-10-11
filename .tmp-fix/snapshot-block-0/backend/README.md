# PMS Internal Backend — Phases 1 + 2

Cloudflare Workers + Hono + D1 (SQLite) + Drizzle ORM.
Phase 1 scope: **auth, users, roles, permissions, RBAC, seed, tests**.
Phase 2 scope: **reservations + nightly pricing + payment terms,
availability, calendar** (per locked blueprint; current frontend logic is
the reference).
Still out of scope: room inventory (Phase 3), activities, dashboard,
finance, public pages. No production deployment performed.

## 1. Architecture (and why it is Workers-compatible)

```
React frontend → REST /api → Cloudflare Worker (Hono)
  → CORS → db provider → auth middleware (Bearer JWT)
  → RBAC middleware → services → Drizzle ORM → D1 (SQLite)
```

| Choice | Reason / compatibility |
|---|---|
| `hono` 4.x | Workers-native router; `hono/cors`, `hono/jwt` included. |
| `drizzle-orm` + `drizzle-orm/d1` | Documented D1 path; zero Node natives at runtime. |
| `hono/jwt` (HS256, WebCrypto) | `jsonwebtoken` needs Node `crypto` — unusable in Workers. |
| `bcryptjs` (pure JS, `hashSync`/`compareSync`) | Native bcrypt / scrypt / argon2 are unavailable in Workers; Sync variants avoid timer/`nextTick` shims so behavior is identical in Workers, Node, and Vitest. Cost 10. |
| `zod` | Pure JS validation, shared rule shapes with the frontend. |
| Prisma | **Rejected**: needs Node runtime pieces / external DB or Accelerate for migrations; heavier and less mature on Workers than Drizzle+D1. One consistent stack: Drizzle only. |

JWT payload is `{ sub, tv, iat, exp }` — roles/permissions are **never**
embedded. Every request reloads user + union permissions from D1, so
deactivation, role changes, and password changes (`tv` vs
`users.token_version`) take effect immediately.

## 2. Project layout

```
src/
  index.ts            app factory (createApp) + CORS + error handling + routes
  env.ts              AppEnv bindings + helpers
  db/schema.ts        Drizzle SQLite tables (D1)
  db/client.ts        createD1Db (D1 driver only — no Node imports in src/)
  lib/errors.ts       ApiError + { message, errors? } contract
  lib/validation.ts   Zod schemas (mirror frontend rules) + parseOr422 + pathParam
  lib/password.ts     bcryptjs wrapper (why Sync: see above)
  lib/tokens.ts       JWT issue/verify, reset-token gen/hash, ids, timestamps
  lib/presenters.ts   DB row → frontend-compatible shapes (roles as ids,
                      role.permissions as names; never password hashes)
  middleware/auth.ts  Bearer verification + active-user + token_version check
  middleware/rbac.ts  requirePermissions (all-of) / requireAnyPermission (any-of)
  lib/pricing.ts      pricing formulas — exact server mirror of frontend
                      pricingUtils (roomTotal/dpAmount/remaining, nightly
                      enumeration, per-room split); keep the two in sync
  services/           authService, userService, roleService,
                      permissionService, identity (auth-context loader),
                      reservationService (CRUD, transitions, overlap,
                      calendar, availability)
  routes/             health, auth, users, roles, permissions, reservations
migrations/0001_phase1_auth.sql   D1 migration (SQLite only, no PG syntax)
migrations/0002_phase2_reservations.sql   reservations, reservation_rooms,
                      reservation_nightly_rates
scripts/
  generate-seed-sql.mjs  mock JSON → idempotent SQL (hashes passwords)
  seed-local.mjs         migrate + seed local D1 in one step
tests/  vitest suite (67 tests) + helpers (fake-d1 shim, app fixture)
seed/seed.sql            generated (gitignored) — never commit
```

## 3. API endpoints (all under `/api`)

| Method + path | Auth | Permission |
|---|---|---|
| `GET /health` | public | — |
| `POST /auth/login {email,password}` | public | — |
| `POST /auth/register {name,email,password}` | public | — (assigns Staff `role-003` only) |
| `POST /auth/logout` | Bearer | — (stateless: client discards token) |
| `GET /auth/me` | Bearer | — |
| `POST /auth/change-password {currentPassword,newPassword}` | Bearer | — (bumps `token_version`) |
| `POST /auth/forgot-password {email}` | public | — (always generic 200) |
| `POST /auth/reset-password {token,newPassword}` | public | — (single-use, expiring) |
| `GET /users?search&status&page&pageSize` | Bearer | `user.view` |
| `GET /users/:id` | Bearer | `user.view` |
| `POST /users {name,email,password,roles,status?}` | Bearer | `user.create` |
| `PATCH /users/:id {name?,email?,roles?,status?}` | Bearer | `user.update` |
| `PATCH /users/:id/status {status}` | Bearer | `user.update` |
| `PUT /users/:id/roles {roles}` | Bearer | `user.update` |
| `DELETE /users/:id` | Bearer | `user.delete` |
| `GET /roles?...` / `GET /roles/:id` | Bearer | `role.view` |
| `POST /roles {name,description?,permissions?,status?}` | Bearer | `role.create` |
| `PATCH /roles/:id` | Bearer | `role.update` |
| `PUT /roles/:id/permissions {permissions}` | Bearer | `permission.assign` |
| `DELETE /roles/:id` | Bearer | `role.delete` (409 if assigned) |
| `GET /permissions` | Bearer | `permission.view` (read-only) |
| `GET /reservations?search&status&source&date&page&pageSize&include` | Bearer | `reservation.view` |
| `GET /reservations/calendar?from&to&roomId?&status?` | Bearer | `reservation.view` |
| `GET /reservations/availability?checkIn&checkOut&excludeId?` | Bearer | `reservation.view` |
| `GET /reservations/:id` | Bearer | `reservation.view` |
| `POST /reservations {guestName,source,checkInDate,checkOutDate,notes?,rooms[],pricing}` | Bearer | `reservation.create` |
| `PATCH /reservations/:id` (same fields, all optional) | Bearer | `reservation.update` |
| `POST /reservations/:id/check-in` | Bearer | `reservation.checkin` |
| `POST /reservations/:id/check-out` | Bearer | `reservation.checkout` |
| `POST /reservations/:id/cancel` | Bearer | `reservation.delete` |

Reservation notes: single `source` column = guest source + rate source;
derived `calc {nights,roomTotal,dpAmount,remainingBalance}` is computed
server-side on every read/write and never stored; `rooms[]` write payload
carries client-resolved `{roomId,roomNumber,roomTypeName}` snapshots
(room inventory + FK land in Phase 3); nightly dates must exactly cover
`[checkIn, checkOut)`; overlap uses half-open intervals excluding
cancelled + self; metadata-only PATCHes skip the overlap check; cancel
requires `reserved` and zeroes the total (frontend parity).

Response contract: success `{ data }` (+ `{ pagination }` for lists);
`201` on create; `204` on delete; errors `{ message, errors? }` with
`400/401/403/404/409/422/500`.

Extra guards beyond the permission matrix: no self-deactivation, no
self-deletion, and assigning a role that carries `permission.assign`
requires `permission.assign` (stops `user.update` holders from
self-promoting to Super Admin while preserving Manager UX).

## 4. Local development

Prerequisites: Node 18+, npm. No Cloudflare account needed for local work.

```powershell
cd backend
npm install

# .dev.vars holds LOCAL-ONLY secrets (already created; never commit):
#   JWT_SECRET, JWT_EXPIRES_IN, RESET_TOKEN_TTL_MIN,
#   FRONTEND_ORIGIN, DEV_EXPOSE_RESET_TOKEN=true

# Migrate + seed local D1 (repeatable, idempotent):
npm run db:seed:local
# …or step by step:
npm run db:seed:sql                                   # regenerates seed/seed.sql
npm run db:migrate:local                              # wrangler d1 migrations apply --local
npx wrangler d1 execute pms-internal-db --local --file=seed/seed.sql

# Run the Worker locally (default http://127.0.0.1:8787):
npm run dev

# Frontend points at it via frontend/.env:
#   VITE_API_URL=http://localhost:8787
```

Seeded dev logins (from `frontend/src/data/mock/users.json`, hashed):
`admin@hotel.com/admin123`, `manager@hotel.com/manager123`,
`staff@hotel.com/staff123` (+ inactive `inactive@hotel.com`).

## 5. D1 + production deployment

```powershell
# One time: create the remote database and paste the id into wrangler.jsonc
npm run db:create            # wrangler d1 create pms-internal-db

# Secrets (never in source):
npx wrangler secret put JWT_SECRET
# Optional vars via wrangler.jsonc `vars` or dashboard:
#   JWT_EXPIRES_IN=3600, RESET_TOKEN_TTL_MIN=15,
#   FRONTEND_ORIGIN=https://your-frontend.pages.dev
# Do NOT set DEV_EXPOSE_RESET_TOKEN in production.

# Migrate remote, then deploy:
npm run db:migrate:remote    # wrangler d1 migrations apply --remote
npm run deploy               # wrangler deploy
```

Still TODO before production (see §8): create DB, set `database_id`,
set secrets, set `FRONTEND_ORIGIN`.

## 6. Password reset without an email provider

There is no SMTP/email integration in Phase 1. The flow is fully
implemented except delivery:

1. `POST /auth/forgot-password` stores a **SHA-256 hash** (never the token)
   with 15-minute expiry; response is always the generic message
   (anti-enumeration).
2. Locally, `DEV_EXPOSE_RESET_TOKEN=true` also returns `resetToken`, and the
   frontend shows a dev-only reset link. **Production must NOT enable this.**
3. `POST /auth/reset-password` consumes the token (single-use), updates the
   hash, bumps `token_version`, and marks the token used.

To go live: wire step 1 to an email sender (Resend/MailChannels-Workers) and
send `https://<frontend>/reset-password?token=<token>`. No schema change needed.

## 7. Tests

```powershell
npm test        # vitest run — full suite (auth/users/roles/permissions/
                # rooms/reservations/dashboard/activities/finance), no
                # Cloudflare account needed
npm run typecheck
```

How: `tests/helpers/fake-d1.ts` is a minimal D1-API shim over
better-sqlite3 (dev-only). Tests run the **real `drizzle-orm/d1` driver**
against genuine SQL (migration file applied per test), plus the real
generated seed script. Covered: login/validation/inactive/expired/malformed
JWTs, session restore, logout semantics, password change + token
invalidation, register policy + email normalization, forgot/reset
(single-use/expiry/hash-only/dev-flag), users CRUD + search/filter/pagination
+ dup email + self-guards, roles CRUD + dup names + invalid perms +
protected delete, permission union, full RBAC matrix (401/403), privilege
 escalation attempts, health/CORS/error contract, migration constraints,
 seed idempotency + no-plaintext-passwords, pricing formula parity with the
 frontend (incl. all 15 seeded rows), per-room split remainder, overlap
 matrix incl. boundary touches, status-machine transitions, reservation
 RBAC (incl. view-only user), availability/calendar endpoints.

## 8. Required values still missing / known limitations

- `wrangler.jsonc`: `database_id` is a placeholder; `FRONTEND_ORIGIN` is localhost.
- No remote D1 created, no secrets set, no deployment performed (not authorized).
- Logout is stateless (documented on the route + in tests): old tokens stay
  valid until expiry; password change/reset DO invalidate via `token_version`.
- localStorage JWT (documented in `frontend/src/services/api.ts`): not
  HttpOnly-cookie equivalent; accepted for the current architecture.
- No rate limiting on auth endpoints yet — add (e.g. Cloudflare Rate Limiting
  rules) before public exposure.
- `GET /users` / `GET /roles` fetch `pageSize=100` from the frontend; fine for
  Phase-1 scale, revisit with server-driven tables later.
- SQLite notes: `token_version INTEGER`, timestamps as ISO TEXT, `"group"`
  quoted (reserved word), FKs declared (`CASCADE` user cleanup, `RESTRICT`
  role/permission guards) with service-layer existence checks as the primary
  enforcement.
- Finance (Phase 6): `invoices` / `invoice_items` / `expenses` only — no
  sales/payments tables, no `due_date`/tax columns; `reservation_id` is
  FK-less by design. Discount is percent 0–100; totals recomputed
  server-side. Wide status literals accepted; `Overdue`/`Partial` never
  auto-assigned.

## 9. Backup runbook (design-only — NOT activated)

Production backup is a FINAL DEPLOYMENT / INFRASTRUCTURE-stage activity.
Nothing below is deployed or scheduled during Phase 6 (no remote D1, no
R2 bucket, no Workflow, no secrets — local verification only).

1. **Export**: scheduled `wrangler d1 export pms-internal-db --remote
   --output backup-<date>.sql` (logical SQL dump, restorable via
   `wrangler d1 execute --remote --file=`).
2. **Store**: upload dumps to an R2 bucket (`pms-backups`), keyed
   `d1/<YYYY-MM-DD>/backup-<ts>.sql`, with checksum sidecar.
3. **Schedule**: Cloudflare Workflow (cron) — daily (retain 7),
   weekly Sunday (retain 4–5), monthly 1st (retain 6–12); prune older.
4. **Verify**: monthly trial restore into a scratch local D1 +
   `SELECT COUNT(*)` spot checks on core tables; log results.
5. **Restore**: create/replace target DB → apply `migrations/` in order →
   execute chosen dump → re-run smoke checks. Never restore over
   production without a fresh pre-restore export.
