# progress.md — Audit R2 (append-only)

## Blok 1 — Orientasi & Baseline — SELESAI (2026-10-11)
- Dibaca: handover.md, decisions.md (D-001–D-056), progress.md (Blok 0–10), contract.md (§1–8), headings reports/block-*.md.
- Struktur terdeteksi: BE entry src/index.ts; 15 routes; 16 services (+authz baru); lib baru atomic/security/sql/time; 6 migrasi; 33 file tes; FE 30 changed + 3 added vs snapshot-block-8.
- Baseline: BE tsc lulus; vitest **456/0 (33 file)**; FE tsc lulus; ESLint **43/308** (murni source: 5/96; sisanya dari frontend/.tmp-responsive milik workstream lain); build `.tmp-audit2/fe-dist` **1.838.796 B / 89 file / 0 map-ref** — semua SAMA dengan handover.
- Temuan penting Blok 1: build default (`npx vite build`) memakai artefak basi vite.config.js → +4.438 B sourceMappingURL; konfirmasi peringatan handover §5.1. Bukan temuan kode (build artifact), dicatat untuk Blok 5.
- Inventaris hash vs snapshot-block-0 = identik dengan b10-hash-compare.txt; config/env/dep/migrasi tak berubah (kecuali yang diungkap: vite.config.ts, eslint.config.js, generate-seed-sql.mjs guard, README).
- Claims C-01–C-15 ditulis di block-1.md (C-04 selesai).
- Skipped for safety: git, wrangler, migrasi/seed, e2e, npm install, network produksi.
- Finding counts: 0 (Blok 1 tidak mencari bug; baseline + inventaris saja).
- Gerbang berikutnya: "Lanjut ke Blok 2".

## Blok 2 — Backend Remediation Review — SELESAI (2026-10-11)
- Dibaca: authz.ts, userService.ts, roleService.ts, reservationService.ts, invoiceService.ts, expenseService.ts, salesService.ts, reportService.ts, authService.ts, security.ts, atomic.ts, audit.ts, time.ts, sql.ts, validation.ts, pricing.ts, errors.ts, presenters.ts, identity.ts, dashboardService.ts, holidayService.ts, schema.ts, semua file routes.
- Verifikasi: role-matrix test (3 sel berubah sesuai harapan), query-budget test (semua budget dipatuhi), seed data.
- Temuan: 4 total — 1 Medium (R2-BE-001, pre-existing), 3 Low (R2-BE-002/003/004, pre-existing atau risiko sangat rendah). Tidak ada bug baru dari remediasi.
- Unverified: 7 item (terutama D1 error message format, D1 batch atomicity, Hono URL parsing).
- Finding counts: Critical 0, High 0, Medium 1, Low 3.
- Gerbang berikutnya: "Lanjut ke Blok 3".

## Blok 3 — Full Backend Sweep — SELESAI (2026-10-11)
- Dibaca: semua routes (15 file), migrations (6 file), schema.ts, env.ts, db/client.ts, tokens.ts, seed.sql (grep).
- Endpoint inventory: 3 endpoint baru (reports/revenue, sales/summary, auth/logout), 2 berubah (register→403, sales/breakdown pakai zod), 1 fixed (role mutations di-audit).
- Access control: IDOR pre-existing (low), mass assignment dicegah, privilege escalation dicegah.
- Input handling: semua SQL parameterized, tidak ada dynamic ORDER BY, zod coverage lengkap.
- Data layer: schema match, indexes cukup (32 index), statements per request dalam budget (max 13, free plan 50).
- Config: workers_dev=true (known), observability off (known), CORS allowlist, JWT_SECRET placeholder (expected).
- Reliability: swallowed errors di-log, waitUntil untuk audit, PII di-mask.
- Temuan: 6 total — 0 Critical, 0 High, 1 Medium (R2-BE-007 pre-existing), 4 Low (pre-existing), 1 N/A (verified correct).
- Finding counts: Critical 0, High 0, Medium 1, Low 4.
- Gerbang berikutnya: "Lanjut ke Blok 4".

## Blok 3 — Full Backend Sweep — SELESAI (2026-10-11, verifikasi tambahan)
- Seed role matrix terverifikasi: role-001 (Super Admin, active, 26 perms), role-002 (Manager, active, 16 perms), role-003 (Staff, active, 6 perms), role-004 (Viewer, INACTIVE, 2 perms), role-005 (Reception, active, 5 perms).
- user-004 (Inactive User) memegang role-004 (inactive) — satu-satunya pemegang role inactive; user-nya sendiri inactive jadi tidak ada lockout.
- finance.expense.* (perm-028–031) hanya di-grant ke role-001 dan role-002 (bukan Staff/Reception) — jika production roles tidak follow seed, Expenses page akan 403.
- role-004 bisa di-delete jika tidak assigned ke user aktif.
- Temuan Blok 3 final: 0 Critical, 0 High, 1 Medium (pre-existing), 4 Low (pre-existing).
- Gerbang berikutnya: "Lanjut ke Blok 4".

## Blok 4 — Frontend Review — SELESAI (2026-10-11)
- Dibaca: api.ts, returnTo.ts, authStore.tsx, useAsyncData.ts, localDate.ts, formatUtils.ts, authService.ts, invoiceService.ts, expenseService.ts, salesService.ts, reportService.ts, InvoiceFormPage, InvoiceDetailPage, InvoiceListPage, LoginPage, RegisterPage, DashboardPage, ExpensesPage, SalesPage, ReportPage, ProtectedRoute, PublicOnlyRoute, ReservationDetailPage.
- FE-BE contract: semua match (invoice, reservation, finance, error handling, 401/403, pagination, date format, money).
- Security: safe (no XSS, no secrets in bundle, token only di localStorage, sourcemap hidden).
- UI-neutrality: verified (30 changed + 3 added, logic-only + ErrorState/Loading conditionals).
- Temuan: 10 total — 0 Critical, 0 High, 1 Medium (R2-FE-007 timezone-dependent date), 2 Low (R2-FE-001 navigate(0), R2-FE-005 stale komentar), 7 N/A.
- Finding counts: Critical 0, High 0, Medium 1, Low 2.
- Gerbang berikutnya: "Lanjut ke Blok 5".

## Blok 5 — Production Readiness & Final Report — SELESAI (2026-10-11)
- Adversarial re-check: 0 Critical, 0 High findings. 3 Medium (semua pre-existing), 9 Low (semua pre-existing).
- Deployment risk checklist: 10 item (JWT_SECRET, Super Admin, finance.expense.*, akun default, workers_dev, observability, env separation).
- Go/No-go: Staging GO dengan 3 fix batch. Production GO dengan 10 kondisi terpenuhi.
- Final report: `.tmp-audit2/audit2-report.md` (Bahasa Indonesia).
- Finding counts final: Critical 0, High 0, Medium 3, Low 9, N/A 6.
- Audit R2 SELESAI.
