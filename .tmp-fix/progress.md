# progress.md (append-only)

## Blok 0 — Safety Net — SELESAI
- Model/effort: Sonnet 5.5, Medium. Snapshot: `snapshot-block-0\` (backend: src, tests, scripts, README.md).
- Backend `tsc --noEmit`: lulus. `vitest run`: baseline 177 lulus / 13 gagal -> **282 lulus / 0 gagal (24 file)**.
- BE-028 diperbaiki (fixture saja). Ditambah: shim query-log + batch transaksional (+6 tes), golden (12 tes, 12 snapshot), known-unsafe (13 tes), role matrix (1 tes, 160 sel), contract (34 tes), query budgets (26 tes).
- Frontend baseline (read-only): `tsc --noEmit` lulus; ESLint **197 error / 319 warning**; `vite build` ke `.tmp-fix\fe-dist` lulus, 85 file JS = 1,845,006 byte; entry 249.97 kB; ReportPage 732.92 kB.
- Perubahan di luar `backend\tests\` dan `.tmp-fix\`: tidak ada.
- Laporan: `reports\block-0.md`. Kontrak: `contract.md`. Matriks: `role-matrix-notes.md`.
- Gerbang berikutnya: "Lanjut ke Blok 1".

## Blok 1 — Auth Hardening — SELESAI
- Model/effort: Sonnet 5.5, Medium. Snapshot: `snapshot-block-1\` (dibuat setelah edit dimulai; lihat NOTE.txt dan laporan).
- Temuan: BE-001, BE-005, BE-006, BE-008, BE-011, BE-012, BE-014 (header), BE-004 (guard + docs) = FIXED. Skipped/deferred: 0 (workers_dev & rate limit nyata = owner).
- Backend tsc lulus; vitest 304 lulus / 0 gagal (25 file). Golden/contract/role-matrix/budget tidak diubah dan lulus.
- Query count: tidak ada perubahan di jalur panas. Frontend: tidak diubah.
- Gerbang: Blok 2 ada di prompt Opus. Blok 3 butuh Blok 2 selesai.

## Blok 2 — Authorization Hierarchy — SELESAI
- Model/effort: Opus 5.5, High. Snapshot: `snapshot-block-2\` (sebelum edit pertama).
- Temuan: BE-002, BE-003, BE-007 = FIXED. Skipped/deferred: 0.
- Backend tsc lulus; vitest 322 lulus / 0 gagal (26 file). Golden happy-path, contract, budget tidak diubah. Matriks role: 3 sel berubah (Manager x demote/deactivate/changeEmail x role-001 -> 403), dijaga tes selisih terhadap `role-matrix.block0.json`.
- Query count: jalur baca tidak berubah; mutasi user/role +0..2 statement (lihat laporan).
- Frontend: tidak diubah.
- Perlu diketahui pemilik: role user-admin murni tak bisa membagikan role di luar izinnya; role inactive (termasuk Viewer seed) tak lagi memberi izin.
- Gerbang: "Lanjut ke Blok 3 (pakai prompt Sonnet)".

## Blok 3 — Audit Trail dan Logging — SELESAI
- Model/effort: Sonnet 5.5, Medium. Snapshot: `snapshot-block-3\` (sebelum edit pertama).
- Temuan: BE-023 FIXED; BE-033 (bagian kode) FIXED. Tanpa perubahan skema (S1 tidak terpicu). Observability = owner.
- Backend tsc lulus; vitest 340 lulus / 0 gagal (27 file). Golden/contract/budget/role-matrix tidak diubah dan lulus.
- Query count: +1 (create) / +3 (update, status, roles, delete user & role) per mutasi; finance +0; login gagal +2; jalur panas tidak berubah.
- Frontend: tidak diubah.
- Gerbang: "Lanjut ke Blok 4".

## Blok 4 — Reservation Guards — SELESAI
- Model/effort: Sonnet 5.5, Medium. Snapshot: `snapshot-block-4\` (sebelum edit pertama).
- Temuan: BE-017 (status terminal), BE-024, BE-025 = FIXED. Skipped/deferred: 0. Keputusan D-021 ditandai untuk pemilik (checked-in tidak dikunci).
- Backend tsc lulus; vitest 356 lulus / 0 gagal (28 file). Golden/contract/budget/role-matrix tidak diubah dan lulus.
- Query count: POST 2 kamar 21 -> 20; lainnya sama. Frontend: tidak diubah.
- Gerbang: Blok 5 ada di prompt Opus ("Lanjut ke Blok 5 (pakai prompt Opus)").

## Blok 5 — Atomicity dan Double-Booking — SELESAI
- Model/effort: Opus 5.5, High. Snapshot: `snapshot-block-5\` (sebelum edit pertama).
- Temuan: BE-015, BE-016, BE-018, BE-029 = FIXED tanpa tabel/constraint baru (S1 tidak terpicu). BE-030 tetap deferred.
- Backend tsc lulus; vitest 379 lulus / 0 gagal (29 file). Golden/contract/role-matrix tidak diubah. Tes atomicity gagal 18/23 pada kode lama, 23/23 sesudah, stabil 3x.
- Query count: POST /reservations 19 -> 15 (anggaran diturunkan); PATCH lengkap 23 -> 18; jalur penolakan create 7 -> 11.
- Catatan: drizzle `db.batch` tidak bisa mem-batch SQL mentah berparameter; dipakai `D1Database.batch` langsung via `db.$client` (`src/lib/atomic.ts`).
- Frontend: tidak diubah. Belum diuji di D1 nyata.
- Gerbang: "Lanjut ke Blok 6 (pakai prompt Sonnet)".

## Blok 6 — Invoice Lifecycle, Reports, Money — SELESAI
- Model/effort: Sonnet 5.5, Medium. Snapshot: `snapshot-block-6\` (sebelum edit pertama).
- Temuan: BE-019, BE-020, BE-022 (angka billed/paid lewat endpoint baru), BE-031 = FIXED. Skipped/deferred: 0 (nomor invoice Draft terhapus bisa dipakai ulang; counter = skema, owner).
- Backend tsc lulus; vitest 397 lulus / 0 gagal (30 file). Golden (12 snapshot), contract (34), role matrix, query budget tidak diubah dan lulus.
- Query count: tidak berubah pada endpoint yang ada; endpoint baru 1-2 statement (+ auth).
- Frontend: tidak diubah. Kontrak finance baru: `contract.md` bagian 7.
- Gerbang: "Lanjut ke Blok 7".

## Blok 7 — Validasi, Waktu, Performa — SELESAI
- Model/effort: Sonnet 5.5, High. Snapshot: `snapshot-block-7\` (sebelum edit pertama).
- Temuan: BE-009, BE-026, BE-027, BE-035 = FIXED. Skipped/deferred: 0 (rentang calendar tak dibatasi: dicatat).
- Backend tsc lulus; vitest 421 lulus / 0 gagal (31 file). Golden (12 snapshot), contract (34), role matrix tidak diubah dan lulus: keluaran identik.
- Query count: reservasi list 51 -> 6, calendar 19 -> 4, invoices 15 -> 5, users/roles 11 -> 5, auth context 4 -> 2, dashboard 11 -> 6, POST reservasi 19 -> 13.
- Frontend: tidak diubah.
- Gerbang: "Lanjut ke Blok 8".

## Blok 8 — Frontend Logic Fixes (non-UI) — SELESAI (FE-004 dikerjakan setelah pemilik memilih opsi a)
- Model/effort: Sonnet 5.5, Medium. Snapshot: `snapshot-block-8\` (sebelum edit pertama).
- FIXED: FE-003, FE-005, FE-006, FE-002, X-005, FE-008, FE-010 (terbatas), FE-004 (opsi a: ErrorState yang sudah ada, inline).
- Frontend tsc lulus; ESLint 197/319 -> 43/316 (tidak ada file memburuk); build produksi 1.845.006 -> 1.843.955 B; 18/18 pemeriksaan logika; backend 421 lulus / 0 gagal.
- Netralitas UI: 0 hunk UI tidak disetujui (satu ErrorState kondisional disetujui pemilik). Catatan: `vite.config.js` (artefak tsc) masih sourcemap true; `npm run build` meregenerasinya.
- Gerbang: "Lanjut ke Blok 9 (pakai prompt Opus)".

## Blok 9A — Catatan Desain FE-001 — SELESAI (tanpa edit kode)
- Model/effort: Opus 5.5, High. Keluaran: `reports\block-9a.md`.
- Rekomendasi: kerjakan sebagian/bersyarat; butuh keputusan pemilik U1 (tampilan error), U2 (Select status invoice), U3 (loading), U4 (banner feedback).
- Gerbang: "Lanjut ke Blok 9B" (dengan pilihan atau "sesuai rekomendasi") atau "Lewati Blok 9B".

## Blok 9B — Implementasi FE-001 (finance FE ke API) — SELESAI
- Model/effort: Opus 5.5, High. Snapshot: `snapshot-block-9b\` (sebelum edit pertama). Keputusan pemilik: U1=a, U2=A1, U3=b, U4=a.
- 4 layanan finance kini async ke API; 9 berkas pemakai diubah; hook baru `useAsyncData`. Mock JSON tidak disentuh.
- Frontend tsc lulus; ESLint 43/308 (baseline 197/319); build 1.839.257 B (baseline 1.845.006); logika 13/13 (+18/18 Blok 8).
- Backend: +18 tes kontrak finance (payload persis FE); suite 439 lulus / 0 gagal (32 file); tidak ada perubahan `backend\src`.
- Netralitas UI: hanya `Loading`/`ErrorState` kondisional yang disetujui (+3 div pembungkus jarak, 2 atribut disabled).
- Belum diuji di browser; izin `finance.expense.*` produksi = tindakan pemilik.
- Gerbang: "Lanjut ke Blok 10".

## Blok 10 — Verifikasi akhir dan handover — SELESAI
- Model/effort: Opus 5.5, High. Snapshot: `snapshot-block-10\` (setelah perubahan tes/shim, sebelum edit src).
- Backend tsc lulus; vitest 456 lulus / 0 gagal (33 file). Frontend tsc lulus; ESLint 43/308; build 1.838.796 B; logika 31/31.
- Re-attack: 9 temuan Critical/High Confirmed fixed (di shim). Celah baru BE-002 (mutual-demote konkuren) ditemukan dan ditutup (guard dalam batch).
- Netralitas UI: 7 div pembungkus ber-style dicabut.
- Penyimpangan: cache vitest tertulis di `.tmp-audit\poc\.cache`.
- Keluaran: `handover.md`, `reports\block-10.md`, `b10-hash-compare.txt`, `b10-fe-diff.txt`, `poc-rerun.txt`.
- Tidak ada gerbang berikutnya.
