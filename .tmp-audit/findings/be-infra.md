# Block 4 findings — Backend reliability / infrastructure (Cloudflare)

Format: ID | Severity | Confidence | Area | file:line | What | Trace | Impact | Minimal fix | Effort | Related

## BE-032 | Medium | Low (Suspected) | Workers CPU limit vs bcrypt | lib/password.ts:14-27, services/authService.ts:28,63,94, userService.ts:107
**What:** Password hashing/verification uses pure-JS `bcryptjs` with `hashSync/compareSync` cost 10 on the request thread (README states ~80 ms per hash). Cloudflare's CPU-time limit per invocation is plan-dependent (the free plan's limit is ~10 ms; paid defaults far higher). I did not run it on Workers.
**Trace:** POST /api/auth/login -> `verifyPassword` -> `compareSync` (~tens-hundreds of ms CPU) -> on the free plan the invocation can be terminated (error 1102) before responding; same for register, change-password, create-user, reset-password.
**Impact:** If the account is on the free plan, every password operation can fail in production while passing locally and in vitest (Node has no such limit).
**Needs to confirm:** Workers plan + a measured CPU time on `wrangler dev --remote`-free staging (not run here). **Minimal fix:** move to WebCrypto PBKDF2/scrypt-free approach (PBKDF2-SHA256 >= 600k via `crypto.subtle`, which runs natively) or keep bcryptjs only on a paid plan.
**Effort:** M | **Related:** BE-027

## BE-035 | Medium | High | Non-deterministic pagination | services/userService.ts:71, roleService.ts:40, roomService.ts:44, roomTypeService.ts:53, reservationService.ts:210, invoiceService.ts:151-156, expenseService.ts:44, salesService.ts:27
**What:** All paged list queries use `LIMIT/OFFSET` without `ORDER BY` (only `activities` is ordered). SQLite gives no ordering guarantee without it; D1 may return rows in rowid order today but any index choice/`WHERE` plan can change it.
**Trace:** `GET /api/reservations?page=2&pageSize=10` with a search/status filter -> planner picks an index scan -> rows returned in index order that differs from page 1's rowid order -> items duplicated/skipped across pages. Also the FE fetches `page=1&pageSize=100` and treats it as "all" (see X-003).
**Impact:** Missing/duplicated rows in lists; newest-vs-oldest undefined.
**Minimal fix:** Add explicit `ORDER BY created_at DESC, id DESC` (reservations: check_in_date, id) to every list query.
**Effort:** S | **Related:** X-003, FE-002

## BE-033 | Low | High | Observability / logging | lib/errors.ts:39-40, wrangler.jsonc (no `observability` block), routes/auth.ts:28-40
**What:** Unexpected errors are logged with `console.error('Unexpected error:', err)` (raw error objects can carry D1 statement text and bound values: emails, guest names); no request id, no structured fields; `observability`/logs persistence is not enabled in `wrangler.jsonc`; failed logins, 403s and money events are not recorded anywhere except the partial activity log (BE-023).
**Impact:** Hard to investigate incidents; potential PII in log lines; brute force (BE-006) invisible.
**Minimal fix:** `"observability": {"enabled": true}`, log `{requestId, route, status, code}` only; strip bound params.
**Effort:** S

## BE-034 | Low | High | Environments / deploy safety | wrangler.jsonc:19-31, package.json scripts `db:migrate:remote`, `deploy`
**What:** A single worker environment with placeholder `database_id`, `FRONTEND_ORIGIN` = localhost committed in `[vars]`, `workers_dev: true`; scripts `db:migrate:remote` and `deploy` have no environment selector or confirmation. Dev/staging/prod separation does not exist yet; whoever fills in the id and runs `npm run deploy` publishes production directly. `compatibility_date` 2025-06-01 and no flags (none required: bcryptjs/hono/drizzle are runtime-neutral). No cron/queue/service bindings exist, so duplicate-execution concerns do not apply.
**Impact:** Process risk; seed/migration (BE-004) can hit the only DB by mistake.
**Minimal fix:** Add `[env.staging]`/`[env.production]` blocks with separate D1 ids and vars; keep `--remote` scripts out of default npm scripts or add `--env`.
**Effort:** S | **Related:** BE-004, BE-005

## Workers limits checked (no separate finding)
- No large in-memory report/export on the server (exports are client-side); aggregates use SQL SUM/COUNT. Holiday upstream document is small and cached per isolate (6 h). No unbounded loops except N+1 (BE-027). Request body size is not capped by the app (BE-009).

## Top 10 missing tests (by risk; not written)
1. Concurrent `POST /api/reservations` for the same room/dates must yield exactly one 201 (BE-015).
2. `PATCH /api/reservations/:id` with changed rates + conflicting dates must leave rates/header/total unchanged (BE-016).
3. PATCH on `checked-out`/`cancelled` reservations must be rejected (BE-017).
4. Manager cannot demote/deactivate/re-email Super Admin; last-admin protection (BE-002).
5. Role with `role.create` cannot grant permissions it does not hold; assignment of a role whose permissions exceed the actor's is rejected (BE-003).
6. Public `POST /auth/register` disabled or yields a role-less pending user (BE-001).
7. Invoice create/PATCH cannot set status/payment directly; DELETE rejected for Sent/Completed; invoice numbers never reused (BE-019/BE-020).
8. Report/sales totals count only paid/completed (or labelled billed) invoices; date-range boundaries inclusive on both ends (BE-022).
9. Date validation rejects `2026-02-31`; >60-night stays rejected not truncated (BE-025).
10. Inactive role grants no permissions; audit rows exist for user/role/permission changes and failed logins (BE-007/BE-023).
Also: dashboard `today` in Asia/Jakarta (BE-026).
