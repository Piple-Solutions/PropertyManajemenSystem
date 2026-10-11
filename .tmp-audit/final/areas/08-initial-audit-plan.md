# Audit plan — riskiest areas (hypotheses only, no findings)

1. Public `POST /api/auth/register` (routes/auth.ts:43): unauthenticated self-signup grants the Staff role (role-003) to anyone; no rate limit, approval or CAPTCHA.
2. JWT_SECRET: local `.dev.vars` value equals the placeholder in `.dev.vars.example` (47 chars); confirm nothing in the deploy path keeps a default; HS256 only, no jti, logout does not revoke.
3. User/role/permission escalation: `user.update` + `PUT /users/:id/roles` + `role.update` / `permission.assign` — verify service-level guards in userService/roleService and self-edit.
4. Reservation double-booking: availability check then multi-statement insert on D1; `reservation_rooms.room_id` has no FK or per-date uniqueness.
5. Money: invoice pay/cancel/delete state machine, hard delete of paid invoices, `discount REAL`, idempotency, reports vs invoice source of truth.
6. 13 failing BE tests: reservation create returns 422 in tests; seed drift (6 room types / 21 rooms vs expected 5 / 8) — decide code bug vs stale tests.
7. Auth hardening: login timing enumeration (bcrypt skipped when user missing), no brute-force limit, sync bcrypt cost 10 in Workers CPU budget.
8. Exposure: `workers_dev: true`, no security headers, unauthenticated `/api/public/holidays?force=true` outbound fetch, `HOLIDAY_SOURCE_URL` SSRF surface (env-controlled).
9. FE: JWT in localStorage, no global 401 handling in api.ts, sourcemaps shipped, `xlsx` HIGH advisory, 733 kB ReportPage chunk, `userPermissionService` localStorage overrides.
10. FE-BE contract: lists fetched with `pageSize=100` (silent truncation beyond 100), permission-name drift, legacy mock-era permission catalog.
