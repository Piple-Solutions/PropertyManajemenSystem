# Laporan Audit Sistem PMS (read-only) — Homestay Joglo Seruni Syariah

Cakupan: backend (Cloudflare Workers + Hono + D1 + Drizzle) dan frontend (React 18 + Vite). Metode: pembacaan kode, tooling offline (typecheck, lint, build, vitest in-memory, npm audit), dan PoC in-memory (`.tmp-audit/poc/`). Tidak ada kode/konfigurasi proyek yang diubah; tidak ada perintah git/GitHub/Cloudflare/DB-remote yang dijalankan.

---

## 1. Ringkasan eksekutif

| Area | Penilaian |
|---|---|
| Security | **Poor** |
| Business logic | **Poor** |
| Data integrity | **Poor** |
| Reliability | **Needs work** |
| Frontend quality | **Needs work** |
| FE-BE contract | **Poor** |

46 temuan unik setelah deduplikasi: **1 Critical, 10 High, 20 Medium, 15 Low**. Semua Critical/High dibaca ulang secara adversarial; 8 di antaranya (BE-001, 002, 003, 015, 016, 017, 019, 023) dibuktikan dengan PoC in-memory, sisanya (BE-004, FE-001, FE-002) terkonfirmasi dari kode.

Top 5 risiko dalam bahasa sederhana:
1. **Siapa pun di internet bisa mendaftar dan langsung masuk** dengan hak Staff: melihat data tamu, membuat/mengubah reservasi, check-in/out (BE-001).
2. **Kontrol akses bisa dilewati dan tidak berjejak**: Manager bisa menurunkan atau mengunci Super Admin; pemegang `role.create`+`user.update` bisa memberi dirinya hampir semua hak; semua perubahan user/role tidak masuk audit log (BE-002, BE-003, BE-023).
3. **Double-booking dan data reservasi rusak**: dua request hampir bersamaan memesan kamar yang sama; edit yang gagal meninggalkan harga/tanggal tidak konsisten; reservasi checked-out/cancelled masih bisa diubah harganya (BE-015, BE-016, BE-017).
4. **Data keuangan bisa hilang atau salah**: invoice Paid bisa dihapus dan nomornya dipakai ulang; invoice Completed/Paid bisa dibuat langsung; laporan menghitung draft belum bayar sebagai omzet (BE-019, BE-020, BE-022).
5. **Frontend keuangan masih data mock dan daftar terpotong 100 baris**: invoice yang dibuat di UI hilang saat reload; reservasi ke-101 dan seterusnya tidak terlihat; akun default `admin@hotel.com` ikut di-seed (FE-001, FE-002, BE-004).

---

## 2. Stack dan arsitektur

- **Backend:** Cloudflare Workers (satu environment, `workers_dev: true`, `compatibility_date 2025-06-01`, tanpa cron/queue/KV/R2/DO), Hono 4, D1 (SQLite) lewat Drizzle `drizzle-orm/d1`, zod 3, JWT HS256 (`hono/jwt`, claim `sub`+`tv`), bcryptjs cost 10 (sync), 6 migrasi SQL manual, vitest 5 dengan shim D1 di atas better-sqlite3.
- **Frontend:** React 18, TypeScript strict, Vite 5, React Router 6, Tailwind 4 + CSS kustom; state lewat React Context; JWT di `localStorage`; halaman lazy-loaded; build entry ±250 kB (80 kB gzip), chunk Report 733 kB.
- **Alur:** Browser -> `apiFetch` (Bearer) -> Hono -> `authenticate` (muat user + role + permission dari D1 tiap request) -> `requirePermissions` -> service -> D1. Audit log ditulis setelah mutasi, terpisah.
- **Catatan struktural:** migrasi tidak membuat role/user (hanya seed dari JSON mock frontend); modul finance di UI belum terhubung ke backend; tidak ada transaksi/`db.batch` di mana pun.

---

## 3. Tabel temuan (urut severity)

Conf = confidence. **PoC** = dibuktikan in-memory (`.tmp-audit/poc`).

| ID | Sev | Conf | Area | file:line | Masalah | Dampak | Fix | Effort |
|---|---|---|---|---|---|---|---|---|
| BE-001 (+X-004) | **Critical** | High (PoC) | Auth | routes/auth.ts:43; services/authService.ts:46-77 | `POST /api/auth/register` publik langsung memberi JWT dengan role Staff (`role-003`: reservation.view/create/update/checkin/checkout, room.view) | Akses data tamu dan mutasi reservasi tanpa autentikasi nyata | Nonaktifkan/flag env default false atau status pending+approval; sembunyikan `/register` di FE | S |
| BE-002 | High | High (PoC) | Authorization | services/userService.ts:119-185; routes/users.ts:53-69 | `user.update` bisa mengubah role/status/email user mana pun termasuk Super Admin; tanpa pengecekan hirarki/last-admin | Owner bisa dikunci atau diturunkan oleh Manager | Wajibkan perm target ⊆ perm aktor; blokir last admin | M |
| BE-003 | High | High (PoC, kondisional) | Authorization | services/userService.ts:36-48; services/roleService.ts:56-86; routes/roles.ts:45 | Guard hanya cek `permission.assign`; `POST /roles` menempelkan permission hanya dengan `role.create` | Eskalasi hak ke hampir semua permission | Wajib `permission.assign` pada createRole dengan permissions; subset check | S |
| BE-004 | High | Medium | Credentials | frontend/src/data/mock/users.json; backend/scripts/generate-seed-sql.mjs:70; README §4 | Akun default (admin/manager/staff) dengan password plaintext di repo, di-seed sebagai Super Admin aktif; migrasi tidak membuat user sehingga produksi wajib di-seed | Takeover admin jika seed dijalankan ke D1 produksi | Bootstrap produksi terpisah (admin dari env, wajib ganti), hapus password dari JSON | M |
| BE-015 | High | High (PoC) | Reservasi | services/reservationService.ts:146-160,273-313 | Cek ketersediaan dan insert tidak atomik; tanpa constraint DB | Dua pemesanan untuk kamar+tanggal sama | Tabel `room_nights(room_id,date)` PK + `db.batch` | M |
| BE-016 | High | High (PoC) | Reservasi | services/reservationService.ts:352-364,393-401,417 | `writeNightly` menimpa rates sebelum cek kamar; jika 409, rates baru tertinggal | Total/tanggal/nights tidak konsisten (header 200k vs calc 300k) | Validasi dulu, tulis semua dalam satu batch | M |
| BE-017 | High | High (PoC) | Reservasi | services/reservationService.ts:315-419 | PATCH tanpa guard status | Reservasi checked-out/cancelled bisa di-reprice (1,5 jt -> 2) | Tolak edit selain `reserved` | S |
| BE-019 | High | High (PoC) | Finance | services/invoiceService.ts:285-290,79-102 | Hard delete invoice di status apa pun; nomor = max+1 dipakai ulang | Riwayat pendapatan hilang, nomor ganda | Delete hanya Draft; void; counter nomor | M |
| BE-023 | High | High (PoC) | Audit | routes/users.ts:47-75; routes/roles.ts:45-63; routes/auth.ts:28-40 | Mutasi user/role/permission dan login gagal tidak dicatat; nilai lama tidak disimpan | Eskalasi tak berjejak, tampering finansial tak bisa direkonstruksi | Audit hook before/after | M |
| FE-001 (+X-002) | High | High | FE integrasi | frontend/src/services/{invoice,expense,sales,report}Service.ts:1-6; DashboardPage.tsx:86-88 | Seluruh finance UI memakai mock in-memory; nol panggilan ke `/api/invoices|expenses|sales|reports` | Data uang tidak persisten, angka dashboard fiktif | Ganti dengan `apiFetch` | L |
| FE-002 (+X-003, BE-035) | High | High | FE/BE kontrak | ReservationListPage.tsx:226-232; reservationService.ts:92-95; semua `*Service.ts` list tanpa `ORDER BY` | FE hanya mengambil 100 baris pertama tanpa urutan dan memfilter di klien | Reservasi ke-101+ tak terlihat, hitungan salah | Pagination server + `ORDER BY` eksplisit | M |
| BE-005 | Medium | Medium | Secrets | src/env.ts:13; backend/.dev.vars | `JWT_SECRET` lokal = placeholder di `.dev.vars.example`, tanpa guard runtime | Auth bypass bila terdeploy dengan nilai itu | Tolak secret pendek/placeholder | S |
| BE-006 | Medium | High | Brute force | routes/auth.ts:28,43,98,111 | Tanpa rate limit/lockout | Tebak password, spam daftar | Rate-limit `/api/auth/*` | S |
| BE-007 (+X-001 sebagian) | Medium | High (PoC) | RBAC | services/identity.ts:17-29 | Status role tidak dicek; role `inactive` tetap memberi izin | Revokasi palsu | Filter `roles.status='active'` | S |
| BE-008 | Medium | High | Config | env.ts:24-29; authService.ts:132-135 | `DEV_EXPOSE_RESET_TOKEN=true` membocorkan token reset ke anonim | Takeover akun jika flag terbawa | Aktifkan hanya bila origin localhost | S |
| BE-009 (+BE-013) | Medium | High | Validasi | lib/validation.ts:19-26,41-63,251,262,399; reportService.ts:48; routes/sales.ts:30 | Tanpa batas string/array/jumlah; `sales/breakdown` tanpa zod; `categories`>~98 melampaui 100 bound param D1 | 500, data tak terkontrol | `.max()`, zod semua, escape LIKE | S |
| BE-018 (+BE-029) | Medium | High (PoC) | Atomicity | reservationService.ts:239-271; invoiceService.ts:178-203; userService.ts:179-182 | Operasi multi-baris non-atomik; pay vs cancel sama-sama 200 dengan hasil Completed/Paid; kode reservasi bentrok -> 500 | Status tak konsisten | `db.batch`, UPDATE bersyarat | M |
| BE-020 | Medium | High (PoC) | Finance | lib/validation.ts:392-425; invoiceService.ts:170-283 | Status invoice dapat diset langsung (create Completed/Paid, Sent->Draft+Paid) | Bypass state machine dan izin update | Status hanya via endpoint aksi | S |
| BE-021 | Medium | Medium (Suspected) | Finance | db/schema.ts:225-239 | Nominal invoice dari klien; tak ada payments/rekonsiliasi dengan reservasi/DP | Tak bisa rekonsiliasi bayar/hutang | Tabel payments + turunan dari reservasi | L |
| BE-022 | Medium | High (PoC) | Laporan | reportService.ts:34-44,88-91; salesService.ts:14-18 | Draft/Sent (belum bayar) dihitung sebagai sales/income | Omzet terlalu tinggi | Pisahkan billed vs paid | S |
| BE-024 | Medium | High (PoC) | Reservasi | reservationService.ts:100-111,250-271 | Kamar maintenance/inactive bisa dibooking; roomNumber snapshot dari klien | Overbooking kamar rusak, nomor salah | Muat room server-side, wajib `active` | S |
| BE-025 | Medium | High (PoC) | Tanggal | lib/validation.ts:110; lib/pricing.ts:34-51 | `2026-02-31` diterima (jadi 3 Mar); stay 90 malam dihargai 60 malam (MAX_NIGHTS memotong) | Tanggal sampah, pendapatan kurang | Validasi round-trip; tolak >60 malam | S |
| BE-026 (+X-007) | Medium | High | Timezone | dashboardService.ts:68; routes/invoices.ts:55; lib/pricing.ts:111 | "Hari ini" dihitung UTC, bukan WIB | Tile dashboard salah 00:00-07:00 WIB | Helper Asia/Jakarta | S |
| BE-027 | Medium | High (limit terdokumentasi) | Reliability | middleware/auth.ts:46-55; services/identity.ts:12-49; reservationService.ts:186-218,459-492 | N+1; list `pageSize=100` ≈ 300 query vs batas D1 50 (Free)/1000 (Paid) per invocation | List gagal di plan Free; latency | Satu query per halaman (`inArray`), cache izin | M |
| BE-028 | Medium | High | Tests | backend/tests/*.test.ts (13 gagal) | Fixture basi vs seed baru (room-008, 5/8 vs 6/21) | Tes overlap/state machine tak berjalan | Perbarui fixture | S |
| BE-032 | Medium | Medium | Workers CPU | lib/password.ts:14-27 | bcryptjs sync cost 10 ≈ 58 ms/operasi (diukur) vs batas CPU Free 10 ms | Login/registrasi gagal di plan Free | PBKDF2 WebCrypto atau plan Paid | M |
| FE-003 | Medium | High | FE session | services/api.ts:70-100; authService.ts:81-88; permissionStore.tsx:42-46 | Tanpa 401 handling; permission jadi `[]`; logout palsu saat error jaringan | UI "Akses Ditolak" setelah token habis | 401 -> logout+returnTo; jangan telan error | S |
| FE-004 | Medium | High | FE | components/pms/CheckInButton.tsx:19-23; reservationService.ts:97-223 | Kegagalan check-in/out/cancel senyap; error jadi "not found" | Staf mengira berhasil | Tampilkan error, refetch tanpa reload | S |
| FE-005 | Medium | High | FE tanggal | pages/finance/ReportPage.tsx:36-47; SalesPage.tsx:30; InvoiceFormPage.tsx:60 | "Hari ini" di-hardcode 2026-09-15; `toISOString()` menggeser sehari di WIB | Periode laporan salah | date-fns lokal, `new Date()` | S |
| FE-007 | Medium | High | A11y | components/shared/Input.tsx:40-49; Modal.tsx:60-64 | Label tanpa `htmlFor`; modal tanpa nama/focus trap/restore | Screen reader/keyboard terhambat | `useId`, aria-labelledby, focus trap | M |
| X-001 | Medium | High | Permission | stores/permissionStore.tsx:48-55; userPermissionService.ts | Override izin per-user hanya di localStorage; API tak menegakkan | "Deny" tidak mengikat | Hapus atau simpan server-side | S/M |
| BE-010 | Low | High | Enumerasi | authService.ts:28,53-55,119 | 409 register dan timing login/forgot | Penemuan akun | Dummy bcrypt | S |
| BE-011 | Low | Medium | Reset token | authService.ts:138-173 | Single-use tidak atomik | Replay sempit | UPDATE `used_at IS NULL` | S |
| BE-012 | Low | High | Public | routes/public.ts:37-48; holidayService.ts:150-212 | `force=true` anonim memicu fetch upstream; respons memuat URL sumber | Amplifikasi, bocor URL | Hapus `force`, jangan echo | S |
| BE-014 | Low | High | Hardening | wrangler.jsonc:18; index.ts:37-51 | `workers_dev:true`, tanpa security headers, logout tanpa revokasi | Defense-in-depth | Matikan workers_dev, headers | S |
| BE-029 | Low | High (PoC) | Reservasi | reservationService.ts:224-237 | Kode dari `count+1` -> UNIQUE -> 500 saat konkuren (PoC) | 500 sporadis | Retry/counter | S |
| BE-030 | Low | High | Reservasi | reservationService.ts:441-442 | Cancel menimpa `total_amount`=0 sementara rates tetap | Nilai asli hilang, dua total | Turunkan dari status | S |
| BE-031 | Low | High | Validasi | lib/validation.ts:386-390,441-447 | Tanpa batas atas uang/kuantitas | Presisi >2^53 | `.max()` | S |
| BE-033 | Low | High | Observability | lib/errors.ts:39-40; wrangler.jsonc | `console.error(err)` mentah, observability mati | PII di log, insiden sulit dilacak | Log terstruktur, aktifkan observability | S |
| BE-034 | Low | High | Env | wrangler.jsonc; package.json scripts | Satu environment, `deploy`/`migrate:remote` tanpa `--env` | Salah deploy ke prod | Pisah env | S |
| FE-006 | Low | High | FE | stores/authStore.tsx:73-77; PublicOnlyRoute.tsx:8-14 | Form login ter-unmount saat submit | Input hilang setelah salah ketik | State `submitting` lokal | S |
| FE-008 | Low | High | Build | vite.config.ts:15; services/api.ts:16-18 | Sourcemap produksi; fallback diam ke localhost | Source terbuka, build rusak diam-diam | Hidden sourcemap, wajib env | S |
| FE-009 | Low | Medium | Deps | package.json (xlsx, react-router-dom) | Advisory xlsx HIGH & react-router; tak terjangkau (xlsx hanya menulis) | Rendah | Ganti/bump | S |
| FE-010 | Low | High | Kualitas | stores/authStore.tsx:6-12; eslint | `any` luas; 195 `no-undef` konfigurasi | Drift API tak terdeteksi | Tipe + globals | M |
| X-005 | Low | High | Kontrak | authService.ts:36-38 vs BE authService.ts:31-33 | 401 "inactive" tampil sebagai kredensial salah | Bingung | Bedakan pesan | S |
| X-006 | Low | High | Kontrak | pages/DashboardPage.tsx:278-281 | Shortcut create memakai izin `*.view` | 403 saat simpan | Gate dengan `*.create` | S |

Catatan dedup: X-002 = FE-001; X-003 + BE-035 = FE-002; X-004 = BE-001; X-007 = BE-026; BE-013 = BE-009 (sink FE tak ada, refuted sebagai eksploitasi).

---

## 4. Matriks otorisasi endpoint

| Endpoint | Auth | Permission | Status |
|---|---|---|---|
| POST /api/auth/register | tidak | - | **BE-001 (Critical)**, BE-006, BE-010 |
| POST /api/auth/login | tidak | - | BE-006, BE-010 |
| POST /api/auth/forgot-password, /reset-password | tidak | - | BE-008, BE-011, BE-006 |
| POST /logout, GET /me, POST /change-password | ya | self | BE-014 (logout tanpa revokasi) |
| GET /api/health | tidak | - | OK |
| GET /api/public/room-types | tidak | - | OK (disengaja) |
| GET /api/public/holidays | tidak | - | **BE-012** |
| GET /api/users[/:id] | ya | user.view | OK |
| POST /api/users | ya | user.create | **BE-003**, BE-023 |
| PATCH /api/users/:id, /status, PUT /roles | ya | user.update | **BE-002, BE-003**, BE-023 |
| DELETE /api/users/:id | ya | user.delete | **BE-002** (last admin), BE-023 |
| GET /api/roles[/:id], /api/permissions | ya | role.view / permission.view | OK |
| POST /api/roles | ya | role.create | **BE-003**, BE-023 |
| PATCH /api/roles/:id | ya | role.update | BE-007, BE-023 |
| PUT /api/roles/:id/permissions | ya | permission.assign | BE-023 |
| DELETE /api/roles/:id | ya | role.delete | BE-023 |
| /api/rooms, /api/room-types (CRUD) | ya | room.* | OK (diaudit); BE-009 (images) |
| GET /api/reservations[/...] | ya | reservation.view | BE-027, FE-002 |
| POST /api/reservations | ya | reservation.create | **BE-015**, BE-024, BE-025, BE-018 |
| PATCH /api/reservations/:id | ya | reservation.update | **BE-016, BE-017**, BE-024, BE-025 |
| POST check-in / check-out / cancel | ya | reservation.checkin / checkout / delete | BE-018, BE-030 |
| GET /api/invoices[/:id], /next-number | ya | finance.invoice.view / create | BE-026 (next-number) |
| POST/PATCH /api/invoices | ya | finance.invoice.create / update | **BE-020** |
| POST /:id/send, /pay, /cancel | ya | finance.invoice.update | BE-018 (race) |
| DELETE /api/invoices/:id | ya | finance.invoice.delete | **BE-019** |
| /api/expenses (CRUD) | ya | finance.expense.* | BE-023 (tanpa nilai lama) |
| GET /api/sales, /sales/breakdown | ya | finance.sales.view | BE-009 (breakdown tanpa zod), BE-022 |
| GET /api/reports/summary, /top-invoices | ya | finance.report.view | BE-022, BE-009 |
| GET /api/activities[/:id] | ya | activity.view | OK |
| GET /api/dashboard/overview | ya | any(reservation.view, room.view) | BE-026 |

---

## 5. Kelompok akar masalah

| RC | Akar masalah | Temuan |
|---|---|---|
| RC1 | Pendaftaran publik dan bootstrap kredensial lemah | BE-001, X-004, BE-004, BE-005, BE-006, BE-008, BE-010 |
| RC2 | Model otorisasi tanpa hirarki/subset dan status role diabaikan | BE-002, BE-003, BE-007, X-001 |
| RC3 | Tidak ada atomicity / invariant di level DB (D1) | BE-015, BE-016, BE-018, BE-029, BE-030 |
| RC4 | Tidak ada guard lifecycle/status | BE-017, BE-019, BE-020, BE-024 |
| RC5 | Semantik uang dan laporan tidak terdefinisi | BE-021, BE-022, BE-031 |
| RC6 | Audit trail tidak lengkap | BE-023, BE-033 |
| RC7 | Validasi input dan tanggal longgar | BE-009, BE-025, BE-012 |
| RC8 | FE belum terintegrasi penuh dan pagination salah | FE-001, FE-002 (BE-035), FE-003, FE-004, FE-005 |
| RC9 | Zona waktu UTC vs WIB | BE-026, FE-005 |
| RC10 | Batas platform dan operasi | BE-027, BE-032, BE-034, BE-014 |
| RC11 | Kualitas/aksesibilitas/pengujian | BE-028, FE-007, FE-006, FE-010, FE-008, FE-009, X-005, X-006 |

---

## 6. Wajib diperbaiki sebelum produksi (Critical/High terkonfirmasi)

Urutan yang disarankan: batch 0 -> A -> B -> C -> D -> E -> F -> G.

| Batch | Cakupan | File | Risiko | Cara uji | Effort |
|---|---|---|---|---|---|
| **0** | Perbaiki fixture 13 tes (BE-028) agar ada jaring pengaman | tests/*.test.ts, tests/helpers/app.ts | Rendah | `vitest run` hijau | S |
| **A** | Tutup registrasi publik; bootstrap admin produksi; guard JWT_SECRET/placeholder; guard `DEV_EXPOSE_RESET_TOKEN`; rate-limit auth (BE-001, BE-004, BE-005, BE-008, BE-006) | routes/auth.ts, authService.ts, env.ts, index.ts, scripts/generate-seed-sql.mjs, FE RegisterPage/App.tsx | Menengah (FE `/register`) | Tes: register -> 403/pending; boot dengan secret placeholder gagal; flag reset hanya localhost | S-M |
| **B** | Hirarki otorisasi dan subset izin; role inactive; last-admin (BE-002, BE-003, BE-007) | userService.ts, roleService.ts, identity.ts, routes/roles.ts | Menengah | Tes PoC `.tmp-audit/poc` dijadikan tes: manager->SA 403; role.create+user.update tak bisa eskalasi; inactive role tak beri izin | M |
| **C** | Audit log user/role/permission/finance + nilai lama + login gagal (BE-023) | routes/users.ts, routes/roles.ts, auth.ts, invoices.ts, expenses.ts, activityService.ts | Rendah | Tes: tiap mutasi menambah baris audit dengan before/after | M |
| **D** | Guard reservasi: status, kamar active, tanggal valid, >60 malam (BE-017, BE-024, BE-025) | reservationService.ts, pricing.ts, validation.ts | Rendah-Menengah (data legacy) | PATCH checked-out -> 409; kamar maintenance -> 422; `2026-02-31` -> 422 | S |
| **E** | Atomicity reservasi: `room_nights` + `db.batch`, urutan validasi-lalu-tulis, kode reservasi (BE-015, BE-016, BE-018, BE-029, BE-030) | schema.ts, migrasi 0007 baru, reservationService.ts, invoiceService.ts | **Tinggi** (migrasi + backfill room_nights) | Tes konkurensi dengan latency (PoC BE-015b/c), tes kegagalan-tengah-edit, backfill pada salinan data | M-L |
| **F** | Lifecycle invoice dan laporan: delete hanya Draft/void, status hanya via aksi, nomor tak dipakai ulang, definisi omzet (BE-019, BE-020, BE-022, BE-031) | invoiceService.ts, validation.ts, reportService.ts, salesService.ts | Menengah (perubahan perilaku UI) | Tes delete Paid -> 409; create Completed -> 422; nomor tak reuse; laporan paid vs billed | M |
| **G** | Integrasi finance FE ke API; pagination server + ORDER BY; 401/error handling; tanggal (FE-001, FE-002/BE-035, FE-003, FE-004, FE-005) | frontend services/*, pages/finance/*, DashboardPage, api.ts, authStore/permissionStore, semua `*Service.ts` BE (ORDER BY) | **Tinggi** (modul besar) | Playwright terhadap backend lokal ber-seed; tes >100 reservasi; token kedaluwarsa | L |

---

## 7. Cross-check `frontend/docs/frontend-design-audit.md`

| ID | Status | Bukti |
|---|---|---|
| SEC-001 | Confirmed (hanya UX; backend menegakkan) | BE punya `requirePermissions` di semua mutasi; UI tidak menyembunyikan aksi (X-006) |
| SEC-002 | Not reproducible (dead code) | UserForm.tsx:136 memblokir password kosong; fallback baris 158 tak terjangkau |
| UX-001 | Not reproducible | App.tsx:167 rute statis `invoices/new`, `id` undefined; cabang InvoiceFormPage.tsx:30 tak terjangkau |
| UX-002 | Confirmed | FE-004: service menelan error |
| UX-003 | Confirmed; Depends on backend | 0 state loading di Activity/Sales/Report/Expenses; halaman finance masih mock sinkron (FE-001) |
| UX-004 | Confirmed (gejala: gagal senyap) | CheckInButton.tsx:19-23 |
| UX-005 | Confirmed | InvoiceForm.tsx:62-65 `return` tanpa pesan |
| UX-006 | Confirmed | DashboardPage.tsx:404-420 label tanpa htmlFor |
| UX-007 | Confirmed | UserRoleForm.tsx:127, UserPermissionForm.tsx:128 `return null` |
| UX-008 | Partially fixed | ManagementPage.tsx:42,53,76 role tablist/tab/tabpanel ada; tanpa aria-controls |
| UI-001 | Confirmed | Button.tsx:43-75 enam varian `#232D36` |
| UI-002 | Partially fixed | Tersisa `#DC2626` di PMSLayout.tsx:302,416-417 |
| UI-003 | Confirmed | `#C85C5C` di 14 file |
| UI-004 | Confirmed | 718 hex literal vs 2 `var(--color` di *.tsx |
| UI-005 | Confirmed | 3 file masih memakai `#E3DED6/#F8F6F2/#E8E0D4` |
| UI-006 | Confirmed | radius 3/4/6px di components/pms, shared, rooms |
| UI-007 | Confirmed | maxWidth 1000/1400 di pages |
| UI-008 | Confirmed | PermissionCheckboxGrid.tsx:73,104,114 |
| UI-009 | Not a defect | FloorMapCard.tsx:246-258 punya tabIndex, Enter/Space, aria-pressed |
| UI-010 | Not reproducible | `donutR` sudah konstanta bernama (DashboardPage.tsx:258) |
| UI-011 | Confirmed | ActivityLogPage.tsx:159 |
| UI-012 | Confirmed | RoomTypeListPage tanpa Pagination |
| UI-013 | Confirmed | publicContent.ts:80 nomor placeholder |
| UI-014 | Confirmed | publicContent.ts:91-94 DUMMY |
| A11Y-001 | Confirmed | 0 htmlFor di UserForm/UserRoleForm/RoleForm; Input.tsx:40-49 |
| A11Y-002 | Partially fixed | Loading.tsx masih menyisipkan `<style>` (31,46,65); tanpa role=status |
| A11Y-003 | Confirmed | ErrorState.tsx:55 `<button>` mentah; tanpa role=alert |
| A11Y-004 | Confirmed | FE-007 (Modal tanpa focus trap/aria-labelledby) |
| A11Y-005 | Confirmed | CalendarView tanpa role=grid |
| A11Y-006 | Confirmed | PermissionCheckboxGrid tanpa fieldset/legend |
| A11Y-007 | Confirmed | scope="col" tidak ada di print docs |
| A11Y-008 | Confirmed | PermissionListPage.tsx:43 |
| A11Y-009 | Confirmed | ChangePasswordPage: h2 saja, Input tak berasosiasi (FE-007) |
| ARC-001 | Not re-verified (maintainability, di luar standar audit) | - |
| ARC-002 | Confirmed | statusVariantMap di DayReservationsPopup:22, ReservationCard:26, ReservationDetailPage:17 |
| ARC-003 | Already fixed | `handleCtaEnter` tidak ditemukan di pages/components |
| ARC-004 | Partially fixed | `FLAT_SERIES` hanya di ReportPage; `formatCurrency` masih 3 salinan |
| ARC-005 | Confirmed | shared/index.ts tanpa RoomForm/RoomTypeForm |
| ARC-006 | Confirmed | CheckInButton/CheckOutButton masih terpisah |
| ARC-007 | Not a defect | API update menerima `images` opsional |
| RWD-001 | Already fixed (statis) | tak ada `700px` di CalendarView/styles |
| RWD-002 | Already fixed (statis) | PMSLayout.tsx:122-131 state drawer + hamburger |
| RWD-003 | Already fixed | globals.css:103-104 `html {font-size:16px}` |
| RWD-004 | Already fixed | tak ada sticky/zIndex di ContactPage.tsx |
| RWD-005 | Already fixed | ReservationCalendarPage.tsx:196 `flexWrap: 'wrap'` |

---

## 8. Sepuluh tes terpenting yang belum ada

1. Dua `POST /api/reservations` konkuren (dengan latency) untuk kamar+tanggal sama harus menghasilkan tepat satu 201 (BE-015).
2. PATCH reservasi dengan tanggal bentrok tidak boleh mengubah rates/header/total (BE-016).
3. PATCH pada reservasi `checked-out`/`cancelled` ditolak (BE-017).
4. Manager tidak bisa menurunkan/menonaktifkan/mengubah email Super Admin; last-admin terlindungi (BE-002).
5. `role.create` tidak bisa memberi izin yang tidak dimiliki; assign role melebihi izin aktor ditolak (BE-003).
6. Registrasi publik ditutup/pending (BE-001).
7. Invoice: create/PATCH tak bisa set status; DELETE ditolak untuk Sent/Completed; nomor tak dipakai ulang (BE-019/020).
8. Laporan/sales hanya menghitung paid (atau berlabel billed); batas tanggal inklusif (BE-022).
9. Tanggal `2026-02-31` ditolak; stay >60 malam ditolak, bukan dipotong (BE-025).
10. Role inactive tidak memberi izin; audit row ada untuk perubahan user/role/permission dan login gagal (BE-007/BE-023).

---

## 9. Yang tidak ditinjau / tidak bisa diverifikasi / dilewati demi keamanan

- **Playwright e2e:** dilewati (butuh backend lokal ber-seed di :8787, spec mengubah data, target API build FE tidak pasti). Jalankan di lingkungan terisolasi.
- **Regresi mobile/tablet (drawer, kalender, kebocoran CSS public vs PMS):** hanya review statis + build; belum ada pengecekan browser. Kontras warna status tidak diukur.
- **Perilaku nyata D1/Workers:** semua PoC memakai SQLite in-memory dengan latency buatan; konkurensi dan batas CPU/query belum diuji di staging. Plan Cloudflare akun tidak diketahui (menentukan BE-027/BE-032).
- **Apakah `.dev.vars` ter-track/ter-commit:** tidak bisa dipastikan (git dan `.gitignore` tidak boleh disentuh). Pemilik repo sebaiknya mengecek `git ls-files backend/.dev.vars`.
- **Pengaturan dasbor Cloudflare** (WAF, rate limiting, Access, secrets terpasang): di luar repo.
- **Pengiriman email reset password:** belum ada, sehingga alur reset tidak dapat dipakai di produksi.
- **Dependensi dev, performa beban, CSP, pengujian ekspor xlsx/PDF, konten halaman publik, ARC-001** tidak ditinjau mendalam.
- **Tidak ada tabel tamu:** duplikasi/merge tamu bukan bagian model saat ini.

---

## 10. Lampiran: baseline tooling (offline)

| Pemeriksaan | Hasil |
|---|---|
| Backend `tsc --noEmit` | Lulus |
| Backend `vitest run` | 177 lulus / **13 gagal** (5 file: activities, dashboard, reservations, rooms, seed); penyebab fixture basi (BE-028) |
| Backend `npm audit --omit=dev` | 0 kerentanan |
| Frontend `tsc --noEmit` | Lulus |
| Frontend `eslint .` | 197 error / 319 warning (316 `no-explicit-any`, 195 `no-undef` konfigurasi `console`/`__dirname`) |
| Frontend `vite build` | Lulus (output dialihkan ke `.tmp-audit/fe-dist`); sourcemap aktif; chunk `ReportPage` 733 kB; entry 250 kB |
| Frontend `npm audit --omit=dev` | 3: `xlsx` HIGH (prototype pollution, ReDoS; tanpa fix), `react-router` moderate x2 |
| PoC verifikasi (`.tmp-audit/poc`) | 16 tes lulus (BE-001/002/003/007/015/016/017/018/019/020/022/023/024/025/029) |
| Pengukuran bcryptjs cost 10 (Node) | ±58 ms per hash/compare |
| Batas platform (dokumentasi Cloudflare) | D1: 50 (Free)/1000 (Paid) query per invocation, 100 bound parameter; Workers CPU Free 10 ms |
