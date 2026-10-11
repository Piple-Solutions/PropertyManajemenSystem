# Block 2 findings — Backend security & authorization

Format: ID | Severity | Confidence | Area | file:line | What | Trace | Impact | Minimal fix | Effort | Related

Scope read: index.ts, middleware/auth.ts, middleware/rbac.ts, all 15 route files, authService, userService, roleService, identity, tokens, password, validation, errors, audit, holidayService (fetch part), migrations 0001-0006, seed/seed.sql (role/permission/user rows), README §4-8, wrangler.jsonc, env files (names only).
No SQL injection found: every query uses Drizzle builders or `sql` tagged templates with bound values (grep of `sql\``, no `sql.raw`, no string concatenation, no dynamic ORDER BY / column names). No file upload, R2, KV, or cookie handling exists. No object-level (IDOR) scoping exists by design (single-tenant internal app; access is role-based only).

---

## BE-001 | Critical | High | Auth / Authorization | routes/auth.ts:43-56, services/authService.ts:13,46-77, seed/seed.sql (role-003 rows)
**What:** `POST /api/auth/register` is unauthenticated and immediately returns a working JWT for an active user holding the Staff role (`role-003`), whose seeded permissions are `room.view, reservation.view, reservation.create, reservation.update, reservation.checkin, reservation.checkout`.
**Trace:** anyone on the internet -> POST /api/auth/register {name,email,password>=6} -> `register()` inserts `users` row status `active` (authService.ts:59-68), inserts `user_roles(role-003)` (:70), issues token (:75) -> `Authorization: Bearer` passes `authenticate` (user active, tv=0) -> `loadAuthContext` returns role-003 permissions -> `GET /api/reservations`, `POST /api/reservations`, `POST /api/reservations/:id/check-in` all succeed (requirePermissions passes).
**Impact:** Guest PII, pricing and booking data readable by anyone; anonymous parties can create/alter reservations, block rooms, and check guests in/out in an *internal* PMS. Effectively an authentication bypass. Also couples any later edit of role-003 (e.g. an admin adding finance rights to "Staff") to anonymous signups.
**Minimal fix:** Remove/disable the public route (or gate by a `ALLOW_PUBLIC_REGISTRATION` env defaulting to false), or create self-registered users as `inactive`/role-less pending admin approval. Remove the FE `/register` route accordingly.
**Effort:** S | **Related:** BE-006 (no rate limit), BE-010 (email enumeration via 409), README §4 documents this as intended.

## BE-002 | High | High | Authorization (vertical hierarchy) | services/userService.ts:119-185, routes/users.ts:53-69
**What:** `user.update` lets the caller change roles, status and email of ANY user, including users with more privilege than the caller. The only guards are "cannot deactivate/delete yourself" and "cannot assign a role carrying `permission.assign`". There is no check on the target user's privilege and no "last Super Admin" protection.
**Trace:** Manager (role-002 holds `user.update`) -> `PUT /api/users/user-001/roles {roles:["role-004"]}` -> requirePermissions('user.update') passes (users.ts:65) -> `setUserRoles` (userService.ts:173): `assertRolesExist` ok; `assertNoPrivilegeEscalation` passes because role-004 lacks `permission.assign` (:36-48); `delete userRoles` + insert (:179-182) -> Super Admin is demoted; next request loads the new roles from D1 (middleware/auth.ts:55). Same via `PATCH /users/:id/status {inactive}` (id !== actorId passes, :167) -> Super Admin locked out; `PATCH /users/:id {email}` rewrites the admin's login email.
**Impact:** A mid-level role can lock out or demote the owner/Super Admin, or hijack identity fields. Recovery requires direct DB access if no other admin exists.
**Minimal fix:** In userService, before any mutation of a target, load the target's permissions and require target permissions ⊆ actor permissions (or require `permission.assign` to touch a target whose roles carry it); also block removing/deactivating/deleting the last active holder of `permission.assign`.
**Effort:** M | **Related:** BE-003 (same missing subset check).

## BE-003 | High | High | Authorization (privilege escalation) | services/userService.ts:36-48, routes/roles.ts:45-48, services/roleService.ts:56-86
**What:** The role-assignment guard only checks whether the role contains the single permission `permission.assign`; it never checks that the role's permissions are a subset of the actor's. Separately, `POST /api/roles` accepts a `permissions[]` array and attaches it with only `role.create` (the guarded endpoint for assigning permissions is `PUT /roles/:id/permissions` = `permission.assign`).
**Trace:** actor holds `role.create` + `user.update` (or `user.create`), but not `permission.assign` -> `POST /api/roles {name:"x", permissions:["user.delete","role.delete","finance.invoice.delete", ...]}` (roles.ts:45 -> createRole inserts role_permissions, roleService.ts:78-81, no permission.assign check) -> `PUT /api/users/<self>/roles {roles:[<existing>, "<new role id>"]}` -> assertNoPrivilegeEscalation only looks for `permission.assign` in the new role (userService.ts:44) -> passes -> actor now holds every permission except `permission.assign`.
**Impact:** The intended boundary "only permission.assign can grant permissions" is bypassed; any custom role granting `role.create`+`user.update` is a de-facto admin. In the default seed only Super Admin has `role.create`, so this is latent until roles are customized (frontend has a role editor).
**Minimal fix:** (a) require `permission.assign` when `createRole` receives a non-empty `permissions`; (b) in `assertNoPrivilegeEscalation` require every permission of the assigned role to be in `actor.permissions`.
**Effort:** S | **Related:** BE-002.

## BE-004 | High | Medium | Credentials / seed data | frontend/src/data/mock/users.json (plaintext passwords), backend/scripts/generate-seed-sql.mjs:70, README §4 (lists dev logins)
**What:** Known default logins (`admin@hotel.com`, `manager@hotel.com`, `staff@hotel.com`; passwords `ad***`/`ma***`/`st***`-style, e.g. admin = "ad*****" 8 chars) live in plaintext in a committed frontend mock file and are documented in README; the seed generator hashes and inserts them with status `active`, Super Admin included. Nothing forces rotation or blocks these accounts in production.
**Trace:** `npm run db:seed:sql` -> `generate-seed-sql.mjs:70 bcrypt.hashSync(u.password,10)` -> `seed.sql` INSERT users/user_roles -> if applied to the remote D1 (README §5 does not forbid it), login with the documented credentials returns a Super Admin token.
**Impact:** Full admin takeover if production is seeded from this script. Confidence Medium because whether prod was seeded is unknown (no remote DB configured: `database_id` is a placeholder).
**Minimal fix:** Separate production bootstrap (single admin from env/CLI-prompted password, `must_change_password`), keep mock accounts local-only; delete plaintext passwords from `src/data/mock/users.json` (the file is not imported by the FE bundle per grep, only consumed by the seed script).
**Effort:** M | **Related:** BE-006; audit SEC-002 (see note below).

## BE-005 | Medium | High | Secrets / JWT | env.ts:13, lib/tokens.ts:18-26, backend/.dev.vars vs .dev.vars.example
**What:** `JWT_SECRET` has no runtime strength/placeholder check. The local `.dev.vars` value is byte-identical (47 chars) to the placeholder published in `.dev.vars.example`.
**Trace:** deploy with the example/dev value (README says copy `.dev.vars.example` -> `.dev.vars`) -> anyone reading the example can mint `{sub:"user-001",tv:0,exp:...}` HS256 tokens -> `authenticate` accepts (signature valid, DB user exists, tv matches 0 unless password changed) -> Super Admin access.
**Impact:** Total authentication bypass in the misconfiguration case; no fail-closed guard. Whether `.dev.vars` is committed could not be determined (git forbidden, `.gitignore` not read).
**Minimal fix:** At startup/first request reject when `JWT_SECRET` is missing, shorter than 32 chars, or equals a known placeholder; keep example value obviously invalid (e.g. `CHANGE_ME`).
**Effort:** S | **Related:** BE-004.

## BE-006 | Medium | High | Brute force / abuse | routes/auth.ts:28,43,98,111 (no limiter anywhere; index.ts)
**What:** No rate limiting, lockout or delay on login, register, forgot-password, reset-password. README §8 acknowledges it.
**Trace:** unlimited POST /api/auth/login with known email (README lists admin@hotel.com) and 6-char-minimum passwords; each attempt costs only one bcrypt cost-10 compare.
**Impact:** Online password guessing and signup spam (BE-001) are unthrottled; also CPU burn on the Worker.
**Minimal fix:** Cloudflare Rate Limiting rule / `rate_limit` binding on `/api/auth/*`; add failed-login audit rows.
**Effort:** S | **Related:** BE-001, BE-004.

## BE-007 | Medium | High | Authorization / RBAC | services/identity.ts:17-29, services/userService.ts:17-24 (no status filter)
**What:** A role's `status` is never consulted for access: `loadAuthContext` joins `user_roles -> roles` with no `roles.status = 'active'` filter, and `assertRolesExist` accepts inactive roles.
**Trace:** admin sets role-002 inactive (`PATCH /api/roles/role-002 {status:"inactive"}`) -> manager's next request: `authenticate` -> `loadAuthContext` still returns all role-002 permissions (roles.status unused) -> access unchanged.
**Impact:** "Deactivate role" gives false assurance of revocation (seed even ships an inactive role-004 that is still assigned to user-004).
**Minimal fix:** Filter `roles.status='active'` in loadAuthContext (and reject inactive roles in assertRolesExist for new assignments).
**Effort:** S

## BE-008 | Medium | High | Config footgun / account takeover | env.ts:24-29, services/authService.ts:132-135, routes/auth.ts:104-107
**What:** When `DEV_EXPOSE_RESET_TOKEN === 'true'`, the unauthenticated `POST /api/auth/forgot-password` returns the raw reset token in the response body. The only protection is a README note ("Production must NOT enable this"); the local `.dev.vars` has it set to true.
**Trace:** attacker -> POST /api/auth/forgot-password {email:"admin@hotel.com"} -> `forgotPassword` inserts token and returns it (:132-133) -> POST /api/auth/reset-password {token,newPassword} -> admin password replaced, tv bumped.
**Impact:** Full account takeover of any active user if the flag leaks into a deployed environment (e.g. copying `.dev.vars` to dashboard vars). No second line of defense.
**Minimal fix:** Honor the flag only when every `FRONTEND_ORIGIN` entry is localhost/127.0.0.1 (or when an explicit `ENVIRONMENT=development` is set); log a warning otherwise.
**Effort:** S | **Related:** BE-011.

## BE-009 | Medium | Medium | Input validation | lib/validation.ts:19-26,41-63,69,82,251,262,399; routes/reports.ts:24-27; routes/sales.ts:30-33
**What:** Missing upper bounds and format checks: password has no max (bcryptjs silently truncates at 72 bytes and processes the whole string first); `roles[]`, `permissions[]`, invoice `items[]`, `facilities[]`, `images[]`, `categories` (comma list) are unbounded; invoice `description`, room-type `description`, expense `description`, `guestName` have no max length; `GET /api/sales/breakdown` bypasses zod entirely (raw `start`/`end` strings compared lexicographically, salesService.ts:46-47); LIKE patterns do not escape `%`/`_`.
**Trace (concrete):** `GET /api/reports/summary?...&categories=a,b,...(>100 values)` -> `inArray(expenses.category, categories)` (reportService.ts:48) -> exceeds D1's 100 bound-parameter limit -> unhandled error -> 500.
**Impact:** Reliability/DoS-ish edge cases and inconsistent data; no injection (parameterized).
**Minimal fix:** `.max()` on strings/arrays (e.g. password 128, items 100, categories 8 from the enum), run `sales/breakdown` through a zod schema, escape LIKE wildcards.
**Effort:** S

## BE-010 | Low | High | Enumeration | services/authService.ts:28 (login), :53-55 (register 409), :119 (forgot)
**What:** (1) `register` returns 409 "Email already registered" to anonymous callers. (2) `login` skips bcrypt when the email does not exist (`!row ||` short-circuits before verifyPassword) -> measurable response-time gap. (3) forgot-password returns early without DB insert for unknown/inactive emails.
**Impact:** Account/email discovery for targeted guessing (the 409 is definite; the timing channels are probabilistic).
**Minimal fix:** Always run a dummy bcrypt compare; with register disabled/approval-based (BE-001) the 409 disappears.
**Effort:** S | **Related:** BE-001

## BE-011 | Low | Medium | Reset-token handling | services/authService.ts:138-173
**What:** `resetPassword` does select-then-update without a conditional `used_at IS NULL` update, so two concurrent requests with the same token can both succeed; issuing a new token or completing a reset does not invalidate other outstanding tokens for that user.
**Impact:** Low (needs token possession; 15-minute window; reset is currently undeliverable without email).
**Minimal fix:** `UPDATE ... SET used_at=? WHERE id=? AND used_at IS NULL` and check changes; mark all user tokens used on success.
**Effort:** S | **Related:** BE-008

## BE-012 | Low | High | Public endpoint abuse / disclosure | routes/public.ts:37-48, lib/validation.ts:225-229, services/holidayService.ts:150-155,197-212
**What:** Unauthenticated `GET /api/public/holidays?force=true` bypasses the in-memory cache and triggers an outbound fetch + JSON parse per request; responses echo the configured upstream URL (`source`) and the upstream/network error text (`error`).
**Impact:** Outbound-request amplification against a third-party host and Worker CPU; discloses `HOLIDAY_SOURCE_URL` (would expose embedded tokens if one is ever used). SSRF is not reachable by clients: the URL is env-only.
**Minimal fix:** Remove `force` from the public route (or require auth), do not echo `source`/raw error text.
**Effort:** S

## BE-013 | Low | Low (Suspected) | Stored content | lib/validation.ts:251,262 (images), public.ts:22-25
**What:** Room-type `images` accepts arbitrary strings (no URL/scheme/length validation) and is served unauthenticated to the public site.
**Needs to confirm:** how the public pages render each entry (img src vs CSS `url()` vs link). Marked for Block 4 FE check; no BE-side exploit by itself.
**Minimal fix:** Validate as https URL or `/assets/...` path, cap length/count.
**Effort:** S

## BE-014 | Low | High | Hardening | wrangler.jsonc:18, index.ts:37-51, routes/auth.ts:58-75
**What:** `workers_dev: true` leaves the worker reachable at `*.workers.dev` beside any custom domain/WAF rules; no security headers (`X-Content-Type-Options`, `Cache-Control: no-store` on authenticated JSON); logout does not revoke (documented): a stolen token stays valid up to `JWT_EXPIRES_IN` (3600 s) and there is no `jti`; deactivation and password change do revoke immediately (verified in middleware/auth.ts:50-53).
**Impact:** Defense-in-depth gaps only.
**Minimal fix:** `workers_dev:false` in prod config, add secure-headers middleware, optional token denylist/`jti` if needed.
**Effort:** S

---

## Verified OK (no finding)
- JWT: HS256 pinned in `verify(token, secret, 'HS256')` (tokens.ts:29) so `alg:none`/alg-confusion fail; `exp` enforced; `sub` and numeric `tv` re-checked; user status and token_version re-validated per request; roles/permissions never taken from the token.
- Password change requires the current password and bumps `token_version` (other sessions die); reset bumps it too.
- Every non-public route sits behind `authenticate` via `router.use('*')`; every write handler has `requirePermissions(...)`; zod strips unknown keys (no mass assignment of role/status via users/roles/rooms bodies).
- CORS: allowlist from `FRONTEND_ORIGIN`, `credentials:false`, Bearer-only auth, so no CSRF surface; no wildcard.
- Errors: unknown errors return generic 500 body (errors.ts:39-40).

## Cross-check with earlier audit (frontend-design-audit.md)
- SEC-001 (mutations not gated in UI): confirmed as UI/UX only. Backend DOES enforce a permission on every mutation, so this is not an authorization hole. FE-only "user permission overrides" (stores/permissionStore.tsx:48-55, services/userPermissionService.ts) are client-side and not honored by the API (deny overrides give false assurance; grants show UI the API will 403) -> carried to Block 4 as an FE/contract finding (X-001).
- SEC-002 (`'password123'` fallback, components/shared/UserForm.tsx:158): the line exists, but line 136 blocks submit when `password` is empty or <6 chars on create, so the fallback is unreachable dead code (Low, FE cleanup). Not a live default-password path. Backend has no default password on create (createUserSchema requires `password`, validation.ts:44).

## Carried to Block 3 (not duplicated here)
User/role/permission mutations are not written to the audit log at all (routes/users.ts, routes/roles.ts have no `recordActivity`), failed logins are not logged; invoice status fields (`paymentStatus`/`invoiceStatus`) can be set directly on create/PATCH bypassing `/pay`; client-supplied room snapshots on reservations.
