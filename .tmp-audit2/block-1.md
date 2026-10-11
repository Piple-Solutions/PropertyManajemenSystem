# Blok 1 — Orientasi & Baseline Independen (Audit R2, second-pass)

Tanggal: 2026-10-11. Shell: PowerShell Windows (echo/ls OK).

## 1.1 Ringkasan handover (15 baris)
1. Remediasi Blok 0–10: BE-001 register→403, auth hardening (BE-005/006/008/011/012/014-header/BE-004-guard), otorisasi superset+Super Admin (BE-002/003/007).
2. Audit trail (BE-023) + log terstruktur PII-mask (BE-033-kode); reservation guards (BE-017/024/025); atomicity double-booking tanpa tabel baru (BE-015/016/018/029).
3. Invoice lifecycle (BE-019/020/031) + endpoint aditif billed/paid (BE-022); validasi/waktu/performansi (BE-009/026/027/035).
4. Frontend: 401 global+returnTo (FE-003), ErrorState inline (FE-004-a), localDate (FE-005), submit lokal (FE-006), fetchAllPages cap 20/10 (FE-002), X-005, sourcemap hidden (FE-008), finance ke API nyata (FE-001/9B).
5. Klaim akhir: BE tsc lulus; vitest 456/0 (33 file); FE tsc lulus; ESLint 43/308; build 1.838.796 B / 89 file; logika FE 31/31.
6. Re-attack Blok 10: 9 temuan Critical/High "Confirmed fixed" di shim; 6 PoC "failed" = assert perilaku rentan lama (diharapkan).
7. Blok 10 menemukan+menutup celah baru: mutual-demote konkuren 2 Super Admin → 0 (guard NOT NULL dalam batch).
8. Netralitas UI: 7 div pembungkus ber-style dicabut; sisa hanya ErrorState/Loading kondisional + disabled.
9. Klaim "tanpa perubahan config/skema/dependency/env" — dengan pengecualian yang diungkap: vite.config.ts, eslint.config.js, generate-seed-sql.mjs (guard), README.
10. Ditunda kelas C: workers_dev, observability, env separation, rate-limit nyata, rotasi JWT_SECRET, akun default produksi, BE-032/010/021/030, counter nomor invoice, email reset, e2e.
11. Ditunda D3/UI: FE-007, X-001, X-006, sembunyikan /register, bump dep, mock credentials, label billed/paid, jarak ErrorState.
12. Diterima pemilik: checked-in bisa diedit (D-021), Sent bisa diedit (D-033), Super Admin terakhir boleh ubah email sendiri (D-013), cap 20/10 halaman, calendar unbounded, create+aksi tidak atomik, atomicity hanya di shim, e2e tidak diupdate.
13. Risiko diketahui: pesan error D1 nyata untuk guard bisa 500-bukan-403; limiter per-isolate; fetchAllPages terpotong diam-diam; role report-only lihat laporan kosong.
14. Urutan deploy: backend dulu lalu frontend (keduanya toleran urutan apa pun); rollback = deploy ulang versi lama.
15. Smoke test: /health 200, register 403, header nosniff/DENY; e2e diperkirakan gagal di registrasi+finance mock.

## 1.2 Deteksi struktur (.tmp-audit2\)
- Backend entry: `backend/src/index.ts` (createApp; guard `/api/*` kecuali /api/health + /api/public/*; 15 route groups).
- Routes (15): activities, auth, dashboard, expenses, health, invoices, permissions, public, reports, reservations, roles, rooms, roomTypes, sales, users.
- Services (16): activity, auth, authz (BARU), dashboard, expense, holiday, identity, invoice, permission, report, reservation, role, room, roomType, sales, user. Lib baru: atomic.ts, security.ts, sql.ts, time.ts.
- Schema/migrasi: 6 file 0001–0006 (tidak berubah, lihat 1.4). Tests: 33 file (50 berkas inkl. snapshot/budget, lihat 1.4).
- Frontend berubah vs snapshot-block-8: 30 file + 3 baru (hooks/useAsyncData.ts, utils/localDate.ts, utils/returnTo.ts); service: api/auth/reservation/room/roomType/user/role/activity/invoice/expense/sales/report; stores/authStore.tsx; utils/formatUtils.ts; komponen/halaman sesuai handover §3 (terkonfirmasi identik via hash, lihat 1.4).

## 1.3 Baseline independen vs handover
| Pemeriksaan | Handover | Hasil audit R2 | Selisih |
|---|---|---|---|
| BE `tsc --noEmit` | lulus | lulus (exit 0) | tidak ada |
| BE `vitest run` | 456 lulus / 0 gagal (33 file) | 456 lulus / 0 gagal (33 file) | tidak ada |
| FE `tsc --noEmit` | lulus | lulus (exit 0) | tidak ada |
| FE ESLint | 43 error / 308 warning | 43 error / 308 warning (557 file) | tidak ada |
| FE build → .tmp-audit2/fe-dist | 1.838.796 B JS, 89 file | 1.838.796 B JS, 89 file, 0 map-ref | tidak ada |
| Logika FE | 31/31 | tidak dijalankan ulang di Blok 1 (tugas Blok 4) | ditunda |

Catatan penting:
- ESLint 43/308 INKLUSIF `frontend/.tmp-responsive\` (workstream lain). Eksklusif folder itu: **5 error / 96 warning** di source nyata (5× `no-undef`: React UMD di BaseLayout/ChangePasswordPage + `__dirname` di vite.config.ts; 94× no-explicit-any + 2 unused-vars). Lihat `.tmp-audit2/fe-eslint.json`.
- Build PERTAMA saya (`npx vite build` default) menghasilkan 1.843.234 B (+4.438) dengan `//# sourceMappingURL` di semua 89 file — karena Vite mendahulukan artefak basi `frontend/vite.config.js` (sourcemap:true) dibanding `vite.config.ts` (hidden). Ini mengkonfirmasi peringatan handover §5.1-butir-3. Build ULANG dengan `--config vite.config.ts` → 1.838.796 B persis, 0 map-ref.
- Durasi vitest tidak dicatat presisi (background run); hasil JSON disalin ke `.tmp-audit2/be-vitest.json` (sumber: `backend/.vitest/json/output.json`, artefak reporter; file tersebut DIBIARKAN — penghapusan akan melanggar aturan read-only).
- Koreksi path: dua run latar pertama gagal (path `.tmp-audit2` relatif terhadap workdir backend\/frontend); diulang dengan `../.tmp-audit2` — sukses.

## 1.4 Inventaris perubahan vs snapshot-block-0 (hash SHA-256)
- backend/src: **27 changed, 5 added, 0 removed** — persis sama dengan `.tmp-fix\b10-hash-compare.txt`. Added: lib/atomic.ts, lib/security.ts, lib/sql.ts, lib/time.ts, services/authz.ts.
- backend/tests: **35 added, 9 changed (activities/auth/dashboard/finance/helpers-fake-d1/rbac/reservations/rooms/seed), 0 removed** — sama dengan hash-compare.
- backend/scripts: hanya `generate-seed-sql.mjs` berubah (guard BE-004 `--allow-default-credentials`, 21 baris aditif; `seed-local.mjs` identik) — diungkap di handover.
- backend/README.md berubah (dok; diungkap di hash-compare).
- frontend/src vs snapshot-block-8: **30 changed + 3 added, 0 removed** — identik dengan handover §3 dan hash-compare.
- vs snapshot-block-10 (pre-Blok-10-src): hanya edit Blok 10 yang dijelaskan (BE services/authz.ts+userService.ts; FE 3 file div-removal; final-reattack.test.ts) — tidak ada perubahan tak-tercatat.
- KONFIRMASI tak-berubah: wrangler.jsonc, .dev.vars, .dev.vars.example, .env.example (BE+FE), package.json + lockfiles (BE+FE), drizzle.config.ts, vitest.config.ts, SEMUA 6 migrasi, seed.sql. (`frontend/vite.config.js` adalah artefak tsc yang diregenerasi tiap build — perilakunya didokumentasikan, bukan perubahan sumber.)
- Satu-satunya file di bawah `.tmp-audit\` yang lebih baru dari Blok 0: `.tmp-audit\poc\.cache\vitest\…\results.json` (diungkap di handover §7-penyimpangan-1; tidak diverifikasi isinya di Blok 1).
- Variabel (nama saja): .dev.vars = JWT_SECRET (placeholder-terdeteksi, "de***"), JWT_EXPIRES_IN, RESET_TOKEN_TTL_MIN, FRONTEND_ORIGIN, DEV_EXPOSE_RESET_TOKEN. Wrangler vars = JWT_EXPIRES_IN, RESET_TOKEN_TTL_MIN, FRONTEND_ORIGIN; database_id = placeholder ("REPLACE_WITH_REAL_D1..."); workers_dev = true.

## 1.5 Claims to verify (15 klaim → blok verifikasi)
| # | Klaim handover | Cara verifikasi | Blok |
|---|---|---|---|
| C-01 | register selalu 403 (8 varian) | baca routes/auth.ts + lib/security.ts; uji varian via tes yang ada (haram: tes baru menulis DB? baca saja + jalankan suite) | 2.4 |
| C-02 | Tabel query-count §7 (mis. reservations 51→6) | baca tests/budgets/query-budget.test.ts + spot-check service | 2.6/3.4 |
| C-03 | Golden happy-path tak berubah (12 snapshot) | diff tests/golden/snapshots vs snapshot-block-2 | 2.1/2.6 |
| C-04 | Tidak ada perubahan config/env/dep/migrasi | SELESAI di 1.4 (confirmed, kecuali file yang diungkap) | 1 ✓ |
| C-05 | Role inactive tak memberi izin (Super Admin kebal) | baca services/authz.ts + identity/loadAuthContext + role-matrix test | 2.1 |
| C-06 | Guard Super Admin terakhir; risiko pesan D1 → 500 | baca guard di authz/userService; cek mapping error NOT NULL | 2.1 |
| C-07 | Overlap predicate + INSERT bersyarat + batch atomik | baca reservationService.ts + lib/atomic.ts + atomicity tests | 2.2 |
| C-08 | Invoice: hapus Draft saja; status via aksi; total server-side | baca invoiceService.ts + routes + lifecycle tests | 2.3 |
| C-09 | jwtSecretGuard tak blokir localhost/health/public; isLocalhost tak bisa di-spoof Host header | baca lib/security.ts + index.ts guard wiring | 2.4 |
| C-10 | Limiter per IP+email; tak bisa kunci akun korban dari IP lain | baca limiter (lib/security.ts?) + hardening tests | 2.4 |
| C-11 | Audit untuk mutasi; email dimasker; token/reset tak bocor | baca lib/audit.ts + services + audit-trail tests | 2.5 |
| C-12 | Batas .max() > data seed; LIKE escape; WIB today; ORDER BY = urutan lama; N+1 identik | baca validation/time/sql + seed + golden | 2.6 |
| C-13 | 401 global sekali + returnTo aman (no open redirect) | baca FE api.ts/authStore/returnTo/ProtectedRoute | 4.1 |
| C-14 | fetchAllPages aman (cap, error page-N) + kontrak FE-BE cocok | baca FE api.ts/services + contract tests | 4.2/4.5 |
| C-15 | Netralitas UI (tanpa JSX/className/style baru) | diff FE vs snapshot-block-8/9b/10 fokus markup | 4.7 |

## Skipped for safety (Blok 1)
- Tidak ada git/wrangler/migrasi/seed; tidak ada e2e Playwright; tidak ada npm install; tidak ada network ke produksi.
- Build FE dialihkan ke `.tmp-audit2\fe-dist` (bukan dist asli). Artefak `backend/.vitest/json/output.json` dari reporter dibiarkan di tempat.
