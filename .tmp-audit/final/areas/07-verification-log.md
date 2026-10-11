# Block 5.1 — Adversarial re-verification log

Method: re-read cited code looking for guards (middleware, DB constraints, framework defaults), then reproduce with PoCs against the project's own in-memory D1 shim (`.tmp-audit/poc/verify.poc.test.ts`, 16 tests, raw output `.tmp-audit/poc/out.txt`). PoCs touch nothing outside `.tmp-audit`.

| ID | Verdict | What I tried to refute it with | Evidence |
|---|---|---|---|
| BE-001 | **Confirmed** (Critical) | Feature flag, approval step, role status, rate limit, edge protection | None in repo. PoC: register 201 -> perms [room.view, reservation.view/create/update/checkin/checkout]; list 200 (5 rows); create reservation 201. Precondition: `role-003` exists with those perms (default seed; migrations create no roles). |
| BE-002 | **Confirmed** | Target-user check elsewhere (route, service, DB trigger) | PoC: manager PUT /users/user-001/roles -> 200, admin perms become [room.view, reservation.view]; PATCH status inactive -> 200, admin token -> 401. |
| BE-003 | **Confirmed** (conditional on a custom role with role.create+user.update) | permission.assign gate on createRole; subset check | PoC: create role 201, self-grant 200, perms now include user.delete, role.delete, user.create, finance.*.delete; role with permission.assign created 201 but assignment 403 (only the single named check works). |
| BE-004 | **Confirmed in code; exposure ops-dependent** (stays High, confidence Medium) | Production-only seed path, forced rotation | `generate-seed-sql.mjs` header says it is safe against production users (implies prod use); migrations seed no users/roles; README lists the default logins. No evidence prod was seeded. |
| BE-015 | **Confirmed** | Accidental protection: UNIQUE reservation_code | With D1-like latency (5 ms/query): offset 0-3 ms -> one 201 and one 500 (code collision, not overlap guard); offset 6-30 ms -> **201 + 201 and two bookings for the same room/nights**. Sequential or zero-latency runs give 201 + 409. |
| BE-016 | **Confirmed** (kept High, considered Critical) | Rollback/transaction | PoC: PATCH to occupied dates -> 409; afterwards header 2027-07-01..03 total 200000, nightly dates 07-20/07-21, calc.roomTotal 300000. Recoverable by re-saving; single record, so High. |
| BE-017 | **Confirmed** | Status check in route/service | PoC: checked-out total 1,500,000 -> 2; cancelled total 0 -> 2, both 200. |
| BE-019 | **Confirmed** | Soft delete / status guard | PoC: DELETE of Completed/Paid INV-2026-009 -> 204; next created invoice received INV-2026-009. |
| BE-023 | **Confirmed** | Audit written in service layer | PoC: role assign, role permissions set, role create, user delete -> 0 new `activities` rows. |
| FE-001 | **Confirmed** | Alternative API-backed finance service; flag | Repo-wide grep finds no `/api/invoices|expenses|sales|reports`; all finance pages import mock-backed services; dashboardService comment says finance "stays deferred". |
| FE-002 | **Confirmed** | Server pagination/total used by list page | ReservationListPage.tsx:230 `service.getAll()` (page=1,pageSize=100), client-side filter/slice; BE has no `ORDER BY`. |

## Medium findings with Low/Medium confidence — resolved
- BE-013 (room-type `images` sink): **Refuted as exploitable** — FE public site never renders `images` (kit.tsx maps only name/description/capacity/facilities/price). Residual validation gap folded into BE-009.
- BE-032 (bcrypt CPU): bcryptjs cost 10 measured at ~58 ms/op in Node; Cloudflare documents Workers Free CPU at 10 ms -> failure on Free plan. Plan unknown -> kept Medium.
- BE-027 (N+1): D1 limits confirmed from Cloudflare docs (50 queries/invocation Free, 1000 Paid; 100 bound parameters). Plan unknown -> kept Medium.
- BE-009: 100-bound-parameter limit confirmed -> the `categories` trace is High confidence.
- BE-021: remains **Suspected** (may be accepted scope).
- BE-005: secret equality with placeholder confirmed (47 chars); whether the file is committed cannot be checked without git -> Medium confidence.
- BE-018 / BE-029: confirmed by PoC (pay and cancel both 200 with final Completed/Paid; concurrent creates for different rooms -> 201 + 500).
- BE-020/022/024/025/007: confirmed by PoC.
