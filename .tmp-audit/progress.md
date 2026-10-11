# Audit progress

## Block 1 — DONE (recon). No findings logged yet by design.
Done: 1.1 stack, 1.2 maps, 1.3 endpoints.md, 1.4 data model, 1.5 FE inventory, 1.6 env names, 1.7 tooling baseline, 1.8 plan (audit-plan.md).

Skipped for safety / policy:
- Playwright: webServer is `vite preview` on :5173 but needs a manually started backend on :8787 with seeded local D1; e2e specs mutate data; which API URL the FE build targets is unknown -> skipped.
- wrangler dev, any D1/KV/R2 command, any git command, reading .gitignore.

Tooling baseline (offline):
- BE typecheck: OK. BE vitest: 177 pass / 13 FAIL in 5 files (activities, dashboard, reservations, rooms, seed). BE npm audit (prod): 0 vulns.
- FE tsc --noEmit: OK. FE eslint: 197 errors / 319 warnings (316 no-explicit-any, 195 no-undef for console/__dirname = config gap). FE vite build: OK (output redirected to .tmp-audit/fe-dist; sourcemaps emitted; ReportPage chunk 733 kB). FE npm audit (prod): xlsx HIGH (prototype pollution + ReDoS, no fix), react-router 6.x moderate x2.

Missing inputs: frontend/frontend-design-audit.md is actually at frontend/docs/frontend-design-audit.md (to be read in Block 4/5). No root README; backend/README.md exists (not yet read). No OpenAPI doc.

Findings count after Block 1: Critical 0 / High 0 / Medium 0 / Low 0

## Block 2 — DONE (backend security & authorization) -> findings/be-security.md
Read: index, middleware (auth, rbac), 15 routes, authService/userService/roleService/identity, tokens/password/validation/errors/audit, holidayService fetch path, migrations, seed role/permission/user rows, README, FE permissionStore/UserForm (for SEC-001/SEC-002 cross-check).
IDs: BE-001..BE-014. Counts: Critical 1 (BE-001) / High 3 (BE-002, BE-003, BE-004) / Medium 5 (BE-005..BE-009) / Low 5 (BE-010..BE-014).
No SQL injection, no file upload/R2/KV, no cookie/CSRF surface found.
Cross-check notes: SEC-001 = UI-only (BE enforces); SEC-002 = dead code (unreachable fallback). X-001 (FE-only permission overrides) to be logged in Block 4.
Carried to Block 3: unaudited user/role mutations, client-settable invoice statuses, client-supplied room snapshots, bcrypt CPU on Workers free plan (Block 4 limits), 13 failing BE tests.
Escalation requests: none raised (all traces stayed within 3 files).

## Block 3 — DONE (business logic & data integrity) -> findings/be-logic.md
Read: reservationService, pricing, invoiceService, reportService, salesService, expenseService, dashboardService, roomService, roomTypeService, activityService, presenters, validation, schema/migrations; ran failing reservation test + Node Date probe.
IDs: BE-015..BE-031. Counts: Critical 0 / High 5 (BE-015, 016, 017, 019, 023) / Medium 9 (BE-018, 020, 021, 022, 024, 025, 026, 027, 028) / Low 3 (BE-029, 030, 031).
Root causes: no atomicity/DB-level invariant (015,016,018,029); no state guards (017,019,020); derived-vs-stored duplicate totals (016,030); missing audit hooks (023).
13 failing tests = stale fixtures vs regenerated seed (BE-028), not a production regression.
Running totals after Block 3: Critical 1 / High 8 / Medium 14 / Low 8.
Escalation requests: none.

## Block 4 — DONE (BE reliability/infra, frontend, FE<->BE contract) -> findings/be-infra.md, fe.md, contract.md
Read: wrangler/package scripts, errors/logging, FE api.ts/authStore/permissionStore/authService/reservationService + finance services, App routes, ProtectedRoute/PublicOnlyRoute, LoginPage, CheckInButton, InvoiceFormPage, ReportPage, Report/Sales/Dashboard pages (targeted), Input/Modal/Table, vite.config, index.html, agents_rules_mobile.md, a11y skill headings, build output sizes.
IDs: BE-032..BE-035, FE-001..FE-010, X-001..X-007.
Counts: Critical 0 / High 4 (FE-001, FE-002, X-002, X-003; X-002/X-003 duplicate FE-001/FE-002 root causes) / Medium 7 (BE-032 suspected, BE-035, FE-003, FE-004, FE-005, FE-007, X-001, X-004) / Low 11.
Dedup note: X-002 == FE-001, X-003 == FE-002 + BE-035 (merge in Block 5).
Audit cross-check so far: UX-001 not reproducible (static route `invoices/new`, `id` undefined; branch at InvoiceFormPage.tsx:30 is unreachable via router); UX-004 confirmed (silent failure); SEC-001 UI-only; SEC-002 dead code.
Skipped for safety: Playwright/browser checks for drawer/calendar/login regressions; BE CPU timing on Workers.
Escalation requests: none.

## Block 5 — DONE (verification + final report) -> audit-report.md, verification.md, poc/
Adversarial re-verification: all Critical/High confirmed (8 by in-memory PoC). BE-013 refuted (no FE sink). No severity downgraded; BE-016 considered Critical and kept High.
Dedup: X-002=FE-001; X-003+BE-035=FE-002; X-004=BE-001; X-007=BE-026; BE-013 merged into BE-009. 52 raw -> 46 unique.
FINAL counts: Critical 1 / High 10 / Medium 20 / Low 15.
Audit cross-check: 48 IDs mapped in audit-report.md §7.
AUDIT COMPLETE. No source/config/test/migration/dependency/lockfile modified; no git/gh/wrangler/DB-remote commands run.
