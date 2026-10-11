# agents_rules_fix.md — PMS Remediation Rules (backend code + non-UI frontend logic; no config, no UI)

Place this file at `E:\Project\Web\pms-internal\agents_rules_fix.md` (project root, because it governs both `backend\` and `frontend\`). It is binding for every remediation session. If a prompt conflicts with this file, this file wins.

## 1. Mission and sources of truth
- Fix the audited defects of the PMS so the system is **fast and reliable**, WITHOUT reconfiguring Cloudflare, WITHOUT changing any UI, and WITHOUT changing behavior that currently works.
- Backend: Cloudflare Workers + Hono 4 + D1 + Drizzle + zod 3. Frontend: React 18 + TypeScript + Vite 5 + React Router 6.
- Sources of truth (read-only, never edit):
  - `.tmp-audit\final\AUDIT-PMS-REPORT.md` (if not there, search `.tmp-audit`)
  - `.tmp-audit\final\findings\<ID>.md` (detail, trace, PoC, minimal fix per finding)
  - `.tmp-audit\final\areas\*.md` (area reports, endpoint inventory, verification log)
  - `.tmp-audit\poc\` (in-memory PoC tests; convert them into real tests)
- The audit is a set of verified hypotheses. If the current code contradicts a finding (already fixed, line numbers moved), say so and skip it; never apply a fix blindly.
- UI problems are handled in a SEPARATE workstream. Do not interfere with it.

## 2. Hard constraints (NEVER)
1. **No Cloudflare/config changes.** Do not edit `wrangler.jsonc`/`wrangler.toml`, `.dev.vars*`, `.env*`, bindings, environments, routes, compatibility settings, cron/queue/KV/R2/DO configuration, drizzle config, or any `package.json` (scripts/dependencies) or lockfile. No new dependencies. No new environment variables or secrets (use in-code constants instead).
2. **No Cloudflare commands at all.** No `wrangler` command of any kind, no deploy, no migrate (local or remote), no seed, no script that writes to a real database. Never log in, never use tokens, never call live URLs. The owner deploys.
3. **No schema changes.** Do not edit or delete migrations 0001-0006. Do not add files to `backend\migrations\`. If a fix truly needs a schema change, STOP and ask (S1); a draft may be written only to `.tmp-fix\proposed-migrations\` (never applied).
4. **Frontend: logic only, NEVER UI** (see section 3). Frontend files are READ-ONLY in Blocks 0-7; they may be edited only in Blocks 8 and 9B, and only within the allowed scope.
5. **No git or GitHub commands, not even read-only.** Do not touch `.gitignore` or `.git`. Track changes with snapshots (section 7).
6. Never print secrets or default passwords found in files; refer to them by file:line and mask values.
7. Never weaken, delete, or skip an existing test to make it pass. Never edit a golden/contract test to match new behavior.
8. Do not touch `.tmp-audit\` (read-only inputs). Do not run formatters or `eslint --fix` over files (they create noisy diffs that collide with the UI workstream). Make minimal, targeted edits; preserve existing formatting and line endings.
9. Allowed write locations: `backend\src`, `backend\tests`, `backend\scripts\generate-seed-sql.mjs` (guard only), `backend\README.md` (docs only), the frontend allowed scope in section 3, and `.tmp-fix\`.

## 3. Frontend scope: non-UI only
### ALLOWED (logic layer)
- `frontend\src\services\**` (including `api.ts`), stores/state (`authStore`, `permissionStore`), utilities/hooks/types, date/number helpers.
- Logic-only edits inside page/component files for the specific findings listed in section 4D (event handlers, state, data fetching, date computation). Discover the real folder names; the principle governs.
- `frontend\vite.config.ts`: the production sourcemap setting only (FE-008).
- ESLint configuration: `globals` only (FE-010).
### FORBIDDEN (UI)
JSX structure/markup, `className`, inline `style`, any CSS (`src\styles\**`, `index.css`, `globals.css`), design tokens, rendered text/copy, icons/images/assets, layout and responsive code, animations, shared component appearance (Button/Input/Modal/Card/Table etc.), PMS layout and sidebar, all public pages and their components and content, accessibility markup (FE-007), visible route/menu structure (links, menu items), and any new UI element (toast, banner, skeleton, spinner).
### UI-neutrality guard (mandatory for every frontend edit)
- Before the first frontend edit of a block, snapshot the allowed frontend files (section 7).
- After each edit, produce a hunk-level diff against the snapshot and classify EVERY hunk as `logic-only` or `UI`. Any `UI` hunk must be reverted or, if the fix cannot work without it, S5 (STOP-AND-ASK).
- Rendered output must stay identical in structure and look: reuse the app's existing error/loading mechanisms and components; never add new ones. User-facing text may only change when it is passed through from an API error `message`.
- Frontend changes must work with BOTH the currently deployed backend and the fixed backend (deploy-order independence). State this explicitly in the block report.

## 4. Classification of the findings
### A. FIX NOW: backend code (no config/schema), by block
| Block | IDs | Notes |
|---|---|---|
| 0 | BE-028 | Fix stale test fixtures only. Build safety nets (contract, golden, query-count, seed role matrix). |
| 1 | BE-001, BE-005, BE-008, BE-006, BE-011, BE-012, BE-014 (headers only), BE-004 (seed-script guard + docs only) | BE-001: public register returns 403 with a clear message via an in-code constant (no env var). BE-005: reject only known placeholder/empty secrets and only when the request origin is not localhost; warn (never fail) on merely short secrets so production cannot be bricked. BE-008: expose the reset token only for a localhost origin. BE-006: best-effort per-isolate limiter (key = IP + identifier, generous thresholds, no D1 writes, no lockout of shared-NAT users); strong protection is owner action (4C). BE-011: `UPDATE ... WHERE used_at IS NULL` and check changes. BE-012: ignore `force` and do not echo upstream URLs, only if the frontend does not use them (verify). BE-014: security-headers middleware in Hono only. BE-004: the seed script refuses default credentials unless an explicit CLI flag is passed; document. |
| 2 | BE-002, BE-003, BE-007 | Permission-superset hierarchy; last-admin protection; role `inactive` stops granting permissions with Super Admin immune. Prove with the seed role matrix that every legitimate operation still works. |
| 3 | BE-023, BE-033 (code part) | Audit rows for user/role/permission/finance mutations and failed logins with before/after, via the existing activity mechanism; structured PII-masked error logging. If the existing table cannot hold this without schema change: S1. |
| 4 | BE-017, BE-024, BE-025 | Block financial/date/room changes by status (derive from the frontend which fields are edited per status; block only unsafe ones); room must be `active` for new booking or room/date change; server-side room snapshot; strict calendar-date validation; reject over-limit stays instead of truncating pricing. |
| 5 | BE-015, BE-016, BE-018, BE-029 | Atomicity WITHOUT new tables: single-statement conditional writes (`INSERT ... SELECT ... WHERE NOT EXISTS (overlap)`), `db.batch` for multi-row writes, validate-before-write, conditional `UPDATE ... WHERE status = ?` with changes check, retry on reservation-code UNIQUE conflict. See section 5. |
| 6 | BE-019, BE-020, BE-022, BE-031 | Invoice delete only for Draft; status changes only via action endpoints; no status in create/PATCH; reports gain explicit billed vs paid figures additively with legacy fields unchanged; upper bounds on money/quantity. |
| 7 | BE-009, BE-026, BE-027, BE-035 | Generous `.max()` limits derived from schema/forms/seed data, zod on `sales/breakdown`, LIKE escaping, bound-parameter cap; Asia/Jakarta "today" helper; N+1 elimination and per-request permission memo; explicit deterministic `ORDER BY` equal to the current effective order plus a tiebreaker. |

### B. Decisions with defaults (apply the default, record in `.tmp-fix\decisions.md`, flag at the block gate)
- Report revenue semantics (BE-022): additive billed/paid fields; legacy fields unchanged.
- Invoice deletion (BE-019): Draft only; others return 409 with an instruction to cancel.
- Over-limit stays (BE-025): reject with 422.
- List ordering (BE-035): preserve the current effective order explicitly; do NOT switch to newest-first (visible change). Mention as an owner option.
- Logout revocation (BE-014): unchanged (it would sign users out of all devices).
- Timing-based enumeration (BE-010): unchanged (CPU budget decision, see 4C).

### C. DEFERRED: owner action (config / schema / plan). Do not implement; list in the handover with exact steps.
BE-014 `workers_dev: false`; BE-033 enable observability; BE-034 environment separation and `--env` in scripts; real rate limiting for `/api/auth/*` (Cloudflare rate-limiting/WAF rule); verify and rotate the production `JWT_SECRET`; rotate/remove default users in production D1 and create the real admin (BE-004); BE-032 bcryptjs vs Workers CPU limit (confirm the plan; PBKDF2 with dual-verify only after the plan is known); BE-010; BE-021 payments/reconciliation tables; BE-030 cancel total semantics (needs a column or a semantic decision); a `room_nights` table/constraint only if section 5 proves conditional writes insufficient (S1); email delivery for password reset; verify `backend/.dev.vars` is not tracked; run the Playwright e2e in an isolated environment.

### D. Frontend
**D1. FIX NOW, Block 8 (logic only, UI-neutral):**
- FE-002 (+BE-035): fix the 100-row truncation in the SERVICE layer by fetching all pages (page size as today, bounded by a safety cap, deterministic order from BE-035), returning the same shape so pages/components stay untouched. Inventory every list service with this problem. Report the trade-off (more requests) and the cap.
- FE-003: 401 handling (clear session, redirect to login with returnTo, once, no loops; the login call's own 401 is excluded); network errors must NOT log the user out or wipe permissions.
- FE-004: services propagate real errors instead of converting them to "not found"; the components surface the error using the app's EXISTING error mechanism; if none exists, S5.
- FE-005: replace the hardcoded "today" (2026-09-15) and `toISOString()` day-shift with local WIB-safe date logic everywhere it occurs (grep all pages/services).
- FE-006: stop the login form from unmounting on submit (local submitting state instead of the global flag that flips `PublicOnlyRoute`).
- X-005: pass through the backend `message` for a 401 inactive account; no new copy.
- FE-008: production sourcemap `hidden` only; do NOT make the API base-URL fallback throw (it could break builds).
- FE-010: ESLint `globals` for `console`/`__dirname` (removes the 195 false `no-undef` errors); type `any` only in api/auth service/store files already touched; no mass cleanup.

**D2. Block 9 (design note first, owner approval, then implementation):** FE-001 finance modules from mock data to the real API, data-layer swap only, reusing existing loading/error components. Any page that would visibly change beyond real data replacing mock data: S5.

**D3. DEFERRED (UI or product decision; list in the handover):** FE-007 (a11y markup), X-001 (per-user permission override feature), X-006 (dashboard shortcut visibility), hiding the `/register` page and its link, FE-009 (dependency bumps), removing default credentials from the frontend mock JSON (the seed script depends on it), and every item of the older frontend design audit (UI-*, A11Y-*, UX-* not listed above, ARC-*, RWD-*).

## 5. Technical rules for the fixes
- **D1 limits:** at most 100 bound parameters per statement (chunk multi-row inserts such as per-night rates); limited query count per invocation (50 Free / 1000 Paid), so never add per-row queries.
- **Atomicity:** rely only on documented D1 guarantees (a single statement is atomic; `db.batch` runs as a transaction). Never "check, then insert" across `await`s for an invariant. Use conditional single statements and check the changed-row count. Verify how drizzle surfaces batch results. If unsure about a guarantee, say so and test it in the shim, including rollback on failure.
- **Validate before write:** compute and validate everything first, then write in one batch.
- **Speed:** keep or reduce D1 statements on hot paths. List endpoints use bounded batched queries (`inArray`), not per-row queries. Permission loading may be memoized per request only (no global caches). No new middleware doing D1 work on every request. No CPU-heavy work in new paths.
- **Audit writes:** await audit writes for security-sensitive mutations; failed-login auditing may use `executionCtx.waitUntil` when available. Never log secrets, tokens, passwords.
- **Time:** day-boundary logic uses an Asia/Jakarta helper (UTC+7, no DST). Stored formats unchanged.
- **Security helpers:** constant-time comparison where secrets are compared; do not change token claims, algorithm, or expiry (it would invalidate sessions).
- **Reversibility:** each block must be revertable independently from its snapshot.

## 6. Compatibility contract ("no logic chaos")
- **Happy-path invariance:** every request that succeeds today returns the same status, JSON shape, field names/types, ordering, and data effects after the fix. Only unsafe/invalid/inconsistent requests may change (rejected, atomic, or audited).
- **Additive API only:** never remove, rename, or retype a response field; never change a success status code. New fields are allowed only if additive and documented.
- **Error shape:** reuse the existing error classes/shape and the Indonesian message style; use the existing codes 401/403/404/409/422. Check how the frontend reads errors (status + `message`) before choosing a rejection so the UI shows a readable message.
- **Frontend contract lock:** build a contract snapshot from the frontend service layer (`services\*`, `api.ts`): endpoints, methods, request bodies, response fields read, error handling, page sizes, which statuses each reservation edit UI allows. Contract tests assert these keep working. The finance modules are NOT called by the frontend today (FE-001); still document their new contract.
- **Data safety:** no change may corrupt or reinterpret existing rows. Restrictions on existing data (e.g., editing a checked-out reservation) only block the action. Check the seed/migration data to prove no legitimate record/role becomes unusable.
- **Lockout safety:** no change may lock out Super Admin or the last admin, or break login for existing users.

## 7. Testing and process rules
### Testing (test-first, zero regressions)
1. **Block 0 safety net, before any fix:** fix BE-028 fixtures (fixtures only); golden/characterization tests for current happy paths (auth, users, roles, rooms, reservations, invoices, expenses, sales, reports, dashboard, activities, public) that stay unchanged for the whole project; contract tests from the frontend service layer; a query-count helper in the shim with per-endpoint budgets (may only go down); a seed role matrix (actor role x action x target role).
2. **Per fix:** failing test first (convert the `.tmp-audit\poc` PoC where available), then the fix, then the targeted test, then the FULL backend suite (golden + contract + query budgets + role matrix) and backend `tsc --noEmit`.
3. A regression test for every fixed finding.
4. Concurrency tests use artificial latency/interleaving in the shim and prove exactly one winner. If the shim does not faithfully emulate `db.batch` rollback or conditional inserts, extend the shim in `tests\` only and test the emulation.
5. **Frontend checks (Blocks 8-9B):** `tsc --noEmit`; ESLint error count in touched files not higher than before (total should drop); production build into `.tmp-fix\fe-dist\` (NEVER into the real `dist`); bundle size not larger beyond trivial; pure-logic checks for helpers (date logic, paging loop with a mocked fetch) using the frontend's existing test runner if any, otherwise a script using already-installed tooling. Install nothing.
6. Playwright e2e is NOT run by the agent (needs a seeded backend and mutates data). The owner runs it in an isolated environment; the handover lists the flows to cover.

### Process
- **Snapshots instead of git:** before the first edit of each block copy the allowed write locations that the block will touch to `.tmp-fix\snapshot-block-N\` (backend: `src`, `tests`, `scripts`, `README.md`; frontend: `src` and the two config files, excluding `node_modules` and `dist`). Compare with file hashes to list changes. Each block report includes a one-line restore instruction.
- **Per-finding protocol:** (1) read the finding file and the current code; confirm it still applies (else record `skipped: evidence`); (2) failing test; (3) minimal fix per the classification and defaults; (4) targeted + full tests; (5) append to `.tmp-fix\reports\block-N.md`: files, before/after behavior, proof that happy paths are unchanged, residual risk.
- **Block order and prerequisites:** blocks run in numeric order. Block N may start only if `progress.md` marks Block N-1 complete; otherwise STOP and tell the owner. (Blocks 9B and 10 also require the owner's reply.)
- **STOP-AND-ASK triggers** (stop editing, print the question, wait): S1 the fix needs a schema, migration, config, env var, dependency, or non-allowed frontend change; S2 a frontend call site contradicts a planned behavior change; S3 the seed role matrix shows a legitimate operation would be blocked or a lockout is possible; S4 a golden or contract test fails and the difference is not clearly the bug being fixed; S5 a frontend fix would require a UI change.
- **Effort escalation** (stop and request higher effort): E1 the same fix fails twice; E2 reasoning about atomicity/concurrency or a trace across 4+ files is unclear; E3 about to change the shape of an existing response.
- Keep `.tmp-fix\progress.md` (append-only; per block: status, snapshot name, test counts) and `.tmp-fix\decisions.md` up to date so a new session can resume.
- Reports are written in Indonesian (technical terms in English); code and comments in English.

## 8. Definition of Done (whole project)
- [ ] Every finding in classes A, B, and D1 is fixed with a regression test or a logic check, or explicitly skipped with evidence (already fixed / contradicted by code). FE-001 is either implemented UI-neutrally or explicitly deferred by the owner.
- [ ] Backend `vitest` fully green (golden, contract, query-budget, role-matrix included); backend `tsc --noEmit` clean; frontend `tsc --noEmit` clean; frontend production build succeeds.
- [ ] No file changed outside the allowed locations (verified by hash comparison); no config, dependency, schema, or migration change.
- [ ] UI-neutrality: every frontend hunk classified `logic-only`; zero `UI` hunks remain.
- [ ] Happy paths unchanged; no Super Admin/last-admin lockout; frontend works with both the old and the fixed backend.
- [ ] Hot-path query counts equal or lower than baseline; list endpoints free of N+1.
- [ ] All Critical/High fixes re-attacked with their PoC tests in the final verification.
- [ ] Handover delivered (section 9).

## 9. Handover document (`.tmp-fix\handover.md`, Indonesian)
1. Per-finding status table for all findings: fixed / skipped with reason / deferred (class C or D3).
2. User-visible behavior changes (only previously unsafe actions are rejected; real dates instead of the hardcoded one; real error messages; etc.).
3. Frontend change list with the UI-neutrality evidence.
4. Contract notes for the finance API.
5. Owner checklist in order: pre-deploy checks, deploy order (backend first, then frontend, noting both work in either order), post-deploy smoke tests that are read-only and safe, the Playwright e2e flows to run in an isolated environment, rollback steps per block.
6. Deferred items with exact instructions: class C (Cloudflare/config/schema/plan) and class D3 (UI/product).
7. Residual risks and what was not verified (real D1 concurrency, plan limits, e2e).
