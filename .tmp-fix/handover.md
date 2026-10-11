# Handover Remediasi PMS Homestay Joglo Seruni Syariah

Tanggal: 2026-10-11. Cakupan: Blok 0–10. Tidak ada perintah git, wrangler, deploy, migrate, atau seed yang dijalankan. Tidak ada perubahan config, skema, dependency, atau env.

Keadaan akhir yang terverifikasi:

| Pemeriksaan | Baseline (Blok 0) | Akhir |
|---|---|---|
| Backend `tsc --noEmit` | lulus | lulus |
| Backend `vitest run` | 177 lulus / 13 gagal | **456 lulus / 0 gagal (33 file)** |
| Frontend `tsc --noEmit` | lulus | lulus |
| Frontend ESLint | 197 error / 319 warning | **43 error / 308 warning** |
| Frontend build produksi (`.tmp-fix\fe-dist\`) | 1.845.006 B JS, 85 file | **1.838.796 B JS, 89 file** (−6.210 B) |
| Pemeriksaan logika FE | – | 18/18 (Blok 8) + 13/13 (Blok 9B) |

---

## 1. Status per temuan

| ID | Sev. | Status | Blok | Keterangan |
|---|---|---|---|---|
| BE-001 | Critical | **Fixed** | 1 | `/api/auth/register` selalu 403 (konstanta di kode). Re-attack: 8 varian path/method/header, tetap tidak ada akun dibuat. |
| BE-002 | High | **Fixed** (celah konkurensi ditutup di Blok 10) | 2, 10 | Hirarki superset izin + proteksi Super Admin terakhir. Re-attack menemukan dua Super Admin yang saling menurunkan bersamaan menyisakan 0; ditutup dengan guard di dalam batch yang sama. |
| BE-003 | High | **Fixed** | 2 | Tidak bisa memberi izin/role di luar izin sendiri lewat rute mana pun. |
| BE-004 | High | **Fixed (bagian kode)**; rotasi akun produksi = kelas C | 1 | Skrip seed menolak kredensial default tanpa flag eksplisit. |
| BE-005 | Medium | **Fixed** | 1 | Secret placeholder/kosong ditolak untuk origin non-localhost. Verifikasi/rotasi secret produksi = kelas C. |
| BE-006 | Medium | **Fixed (best effort)** | 1 | Limiter per-isolate. Rate limiting nyata = kelas C. |
| BE-007 | Medium | **Fixed** | 2 | Role inactive tidak lagi memberi izin (Super Admin kebal). |
| BE-008 | Medium | **Fixed** | 1 | Token reset hanya diekspos untuk origin localhost. |
| BE-009 (+BE-013) | Medium | **Fixed** | 7 | Batas panjang/array, zod di `sales/breakdown`, escape LIKE, batas bound parameter. |
| BE-010 | Low | **Deferred (C)** | – | Enumerasi lewat timing tidak diubah (keputusan anggaran CPU). 409 register hilang dengan BE-001. |
| BE-011 | Low | **Fixed** | 1 | Token reset dipakai lewat UPDATE bersyarat. |
| BE-012 | Low | **Fixed** | 1 | `force` diabaikan, URL sumber tidak dipantulkan. |
| BE-014 | Low | **Fixed (header)**; `workers_dev` = C; revokasi logout tidak diubah (keputusan default) | 1 | |
| BE-015 | High | **Fixed** | 5 | INSERT bersyarat `WHERE NOT EXISTS(overlap)`. PoC audit ber-latency: tepat satu 201 di semua offset. |
| BE-016 | High | **Fixed** | 5 | Edit = satu batch; edit yang gagal tidak mengubah apa pun. |
| BE-017 | High | **Fixed** | 4 | Reservasi checked-out/cancelled terkunci untuk harga/tanggal/kamar. Checked-in tetap bisa diedit (D-021, keputusan pemilik). |
| BE-018 | Medium | **Fixed** | 5 | Penulisan multi-baris lewat batch transaksional. |
| BE-019 | High | **Fixed** | 6 | Hapus hanya Draft; lainnya 409. Nomor invoice non-Draft tidak pernah dipakai ulang. |
| BE-020 | Medium | **Fixed** | 6 | Status hanya lewat `/send`, `/pay`, `/cancel`. |
| BE-021 | Medium | **Deferred (C)** | – | Butuh tabel pembayaran. |
| BE-022 | Medium | **Fixed (aditif)** | 6 | Angka billed vs paid di endpoint baru `/api/reports/revenue`, `/api/sales/summary`; field lama tidak berubah. UI belum memakainya (D3). |
| BE-023 | High | **Fixed** | 3 | Baris audit untuk mutasi user/role/izin/finance dan login gagal, dengan nilai sebelum/sesudah. |
| BE-024 | Medium | **Fixed** | 4 | Kamar harus `active`; snapshot kamar dari server. |
| BE-025 | Medium | **Fixed** | 4 | Tanggal kalender nyata; menginap > 60 malam ditolak 422. |
| BE-026 | Medium | **Fixed** | 7 | "Hari ini" memakai Asia/Jakarta. |
| BE-027 | Medium | **Fixed** | 7 | N+1 dihapus (lihat tabel query di §7). |
| BE-028 | Medium | **Fixed** | 0 | Fixture tes. |
| BE-029 | Low | **Fixed** | 5 | Kode reservasi: retry pada bentrok UNIQUE. PoC: dua 201 dengan kode berbeda. |
| BE-030 | Low | **Deferred (C)** | – | Butuh kolom atau keputusan semantik. |
| BE-031 | Low | **Fixed** | 6 | Batas atas nominal dan kuantitas. |
| BE-032 | Medium | **Deferred (C)** | – | bcryptjs vs batas CPU; tergantung plan. |
| BE-033 | Low | **Fixed (kode)**; observability = C | 3 | Log terstruktur dengan PII disamarkan. |
| BE-034 | Low | **Deferred (C)** | – | Pemisahan environment. |
| BE-035 | – | **Fixed** | 7 | `ORDER BY` eksplisit sama dengan urutan efektif lama. |
| FE-001 | High | **Fixed** | 9B | Finance UI memakai API nyata. Belum diuji di browser. |
| FE-002 | High | **Fixed** | 8 | `fetchAllPages` di lapisan service (batas 20 halaman; aktivitas 10). |
| FE-003 | Medium | **Fixed** | 8 | Penanganan 401 global, sekali, dengan returnTo. |
| FE-004 | Medium | **Fixed** | 8 | Error asli diteruskan, ditampilkan lewat `ErrorState` yang sudah ada (pilihan pemilik "a"). |
| FE-005 | Medium | **Fixed** | 8 | Tanggal lokal menggantikan tanggal hardcode. |
| FE-006 | Low | **Fixed** | 8 | State submit lokal. |
| FE-007 | Medium | **Deferred (D3)** | – | Markup aksesibilitas = UI. |
| FE-008 | Low | **Fixed (sourcemap `hidden`)** | 8 | Fallback API URL tidak diubah (sesuai aturan). |
| FE-009 | Low | **Deferred (D3)** | – | Bump dependency. |
| FE-010 | Low | **Fixed (terbatas)** | 8 | `globals` ESLint; `any` hanya di berkas yang disentuh. |
| X-001 | – | **Deferred (D3)** | – | Fitur override izin per user. |
| X-005 | – | **Fixed** | 8 | Pesan backend untuk akun inactive diteruskan. |
| X-006 | – | **Deferred (D3)** | – | Visibilitas shortcut dashboard. |
| SEC-001 / SEC-002 | – | Tidak perlu tindakan | – | Hanya UX / dead code menurut audit. |

### Hasil re-attack Critical/High (Blok 10.2)
PoC audit dijalankan ulang terhadap kode akhir (`.tmp-fix\poc-rerun.txt`) ditambah 17 tes serangan baru (`backend\tests\final-reattack.test.ts`).

| ID | PoC audit | Serangan tambahan | Putusan |
|---|---|---|---|
| BE-001 | permintaan eksploit ditolak (PoC berhenti) | trailing slash, huruf besar, PUT/PATCH, query `force`, header override, URL localhost; POST `/users` anonim | **Confirmed fixed** |
| BE-002 | demote 403 | 6 rute/field terhadap Super Admin; self-assign; lewat Manager kedua; admin role menonaktifkan role-001; **4 pasangan mutual-demote konkuren** | **Confirmed fixed** setelah perbaikan Blok 10 (sebelumnya: Partially) |
| BE-003 | ditolak | 6 rute bagi aktor dengan semua izin admin kecuali izin target; role dormant yang diaktifkan belakangan | **Confirmed fixed** |
| BE-004 | – | 7 flag/env mirip (salah eja, `=false`, `true`, `0`) | **Confirmed fixed** (bagian kode) |
| BE-015 | `[201,409]` tanpa dan dengan latency, 10 offset | 10 permintaan serentak campuran single/multi-kamar dan overlap parsial; create vs edit vs pindah tanggal; batas hari check-out | **Confirmed fixed** di shim; D1 nyata belum diuji |
| BE-016 | edit 409, tarif/total utuh | pihak yang kalah dalam balapan tetap konsisten (header = baris malam) | **Confirmed fixed** |
| BE-017 | 409 untuk checked-out dan cancelled | 10 bentuk payload tersamar; tidak ada transisi yang membuka kembali | **Confirmed fixed** (checked-in sengaja tidak dikunci, D-021) |
| BE-019 | hapus 409, nomor tidak dipakai ulang | rewind status lalu hapus; cancel lalu hapus; pengambilalihan nomor; bayar vs hapus konkuren 6 putaran | **Confirmed fixed** |
| BE-023 | 4 baris audit | rute alternatif (roles lewat PATCH, status lewat PATCH); log tidak bisa ditulis/dihapus lewat API; upaya yang ditolak tidak membuat baris | **Confirmed fixed** |

Enam tes PoC audit berstatus "failed" karena PoC meng-assert perilaku rentan yang lama; itu hasil yang diharapkan.

---

## 2. Perubahan perilaku yang terlihat pengguna

1. **Registrasi publik mati**: `/api/auth/register` mengembalikan 403. Halaman `/register` masih ada dan menampilkan pesan backend (menyembunyikannya = D3). Akun baru dibuat admin lewat menu Users.
2. **Manager tidak bisa mengubah Super Admin**, dan tidak ada yang bisa memberi role/izin di luar izinnya sendiri. Role user-admin murni tidak bisa membagikan role yang izinnya tidak ia miliki (D-012).
3. **Role inactive berhenti memberi izin** (termasuk role Viewer seed yang inactive).
4. **Super Admin aktif terakhir tidak bisa diturunkan, dinonaktifkan, atau dihapus** (403).
5. **Reservasi**: checked-out/cancelled tidak bisa diubah harga/tanggal/kamarnya (409); kamar maintenance/inactive tidak bisa dibooking (422); tanggal mustahil dan menginap > 60 malam ditolak (422); double-booking menghasilkan 409 untuk permintaan kedua.
6. **Invoice**: hanya Draft yang bisa dihapus; status berubah hanya lewat aksi; Overdue/Partial tidak bisa diset; total selalu dihitung server (diskon persen). Modal di daftar invoice sebelumnya menghitung diskon sebagai nominal.
7. **Finance UI menampilkan data D1 nyata**. Database tanpa data finance tampil kosong. Staff/Reception tanpa izin finance melihat tile omzet/invoice 0 dan lencana invoice hilang (sebelumnya angka mock).
8. **Tanggal**: "hari ini" nyata (WIB), bukan 2026-09-15.
9. **Sesi kedaluwarsa** mengarahkan ke login dengan returnTo; gangguan jaringan tidak lagi me-logout.
10. **Error tampil**: kegagalan aksi menampilkan pesan backend lewat blok `ErrorState`; spinner `Loading` singkat di halaman finance.
11. **Daftar > 100 baris** kini lengkap (lebih banyak request; lihat batas di §7).
12. Login gagal berulang dari IP+email yang sama dibatasi sementara (429).

---

## 3. Perubahan frontend dan bukti netralitas UI

Dibanding `snapshot-block-8` (keadaan sebelum Blok 8): **30 berkas berubah, 3 ditambah, 0 dihapus** di `frontend\src`, plus `vite.config.ts` (sourcemap) dan `eslint.config.js` (globals). Diff lengkap: `.tmp-fix\b10-fe-diff.txt` (2.251 baris).

- Ditambah: `hooks/useAsyncData.ts`, `utils/localDate.ts`, `utils/returnTo.ts`.
- Service (logic-only): `api`, `auth`, `reservation`, `room`, `roomType`, `user`, `role`, `activity`, `invoice`, `expense`, `sales`, `report`; `stores/authStore.tsx`; `utils/formatUtils.ts`.
- Komponen/halaman: `ProtectedRoute`, `PublicOnlyRoute`, `CheckInButton`, `CheckOutButton`, `DayReservationsPopup`, `LoginPage`, `RegisterPage`, `DashboardPage`, `ReservationDetailPage`, `ReservationListPage`, enam halaman finance.

**Audit Blok 10.4** memindai setiap baris yang ditambah/dihapus untuk JSX, `className`, `style`, CSS, dan aset:

- **Pelanggaran ditemukan dan dicabut: 7 `div` pembungkus** yang saya tambahkan di Blok 8/9B di sekitar `ErrorState`/`Loading` dan membawa `style` atau `className` (2 di `InvoiceListPage`, 3 di `InvoiceDetailPage`, 2 di `ReservationDetailPage`). Sekarang komponennya dirender polos. Akibatnya jarak 16px di sekitar blok error hilang; bila ingin jarak, itu keputusan UI pemilik.
- Sisa elemen render baru: hanya `ErrorState` dan `Loading` kondisional yang sudah ada dan disetujui pemilik (Blok 8 "a"; Blok 9B U1=a, U3=b).
- Binding atribut/logika, bukan markup baru: `disabled={submitting}` menggantikan `disabled={isLoading}` di Login/Register (teks tombol sama), `disabled={isLoading}` pada 2 tombol ekspor di ReportPage, handler `onClick` yang diganti.
- Tidak ada baris JSX/`className`/`style` yang dihapus; tidak ada CSS, ikon, aset, teks baru, route, menu, atau halaman publik yang diubah. Deskripsi `ErrorState` = pesan API.

Setelah pencabutan: `tsc` lulus, ESLint 43/308, build lulus, 31/31 pemeriksaan logika.

---

## 4. Catatan kontrak API finance

Detail lengkap: `.tmp-fix\contract.md` §7–8; dikunci oleh `backend\tests\contract\finance-frontend-contract.test.ts` (18 tes).

- Daftar: `GET /api/invoices|expenses|sales?page=N&pageSize=100`, FE mengambil semua halaman. 403 dipetakan ke daftar kosong hanya pada layar umum (dashboard, daftar reservasi, popup hari, sales/report).
- `POST /api/invoices` dan `PATCH /api/invoices/:id` **tanpa status**; server menghitung total. Nomor bentrok mendapat nomor berikutnya. Nomor awal dari `GET /api/invoices/next-number?date=`.
- Status hanya lewat `POST /api/invoices/:id/send|pay|cancel`. Select status di form diterjemahkan ke aksi di service (U2=A1); kombinasi tanpa aksi dikirim dengan status supaya backend menolak 422 dengan pesannya sendiri.
- `DELETE /api/invoices/:id`: 204 untuk Draft, 409 lainnya.
- Sales bersifat turunan invoice dan read-only. Draft/Sent ikut dihitung sebagai "ditagihkan".
- Tersedia tetapi belum dipakai FE: `/api/reports/revenue`, `/api/sales/summary` (billed vs paid), `/api/sales/breakdown`, `/api/reports/*`.
- **A1 tidak atomik**: create/PATCH lalu aksi adalah dua request; bila aksi gagal, invoice tersimpan sebagai Draft dan error tampil.

---

## 5. Checklist pemilik (urut)

### 5.1 Sebelum deploy
1. Tinjau diff dengan alat Anda sendiri. Working tree sudah berisi banyak perubahan tak ter-commit sebelum remediasi dimulai; daftar berkas yang saya ubah ada di `.tmp-fix\b10-hash-compare.txt`.
2. `backend`: `npm run typecheck` dan `npm test` (harap 456 lulus).
3. `frontend`: `npm run typecheck`, `npm run lint` (43 error lama, bukan regresi), `npm run build`. **Perhatian:** `frontend\vite.config.js` adalah artefak `tsc -b` yang masih berisi `sourcemap: true` dan didahulukan Vite; `npm run build` meregenerasinya dari `vite.config.ts`. Setelah build, pastikan `.map` tidak ikut diunggah atau tidak direferensikan.
4. Pastikan `JWT_SECRET` produksi bukan placeholder dan bukan kosong. Bila placeholder, backend baru menolak semua request non-localhost: **set secret dulu, baru deploy**.
5. Pastikan ada minimal satu Super Admin aktif yang bisa login di D1 produksi.
6. **Izin expense**: grant `finance.expense.*` hanya ada di skrip seed. Sebelum frontend baru aktif, beri izin itu ke role yang perlu lewat UI Roles; tanpa itu halaman Expenses menampilkan error 403.
7. Putuskan D-012, D-021, D-033 (§7) bila default tidak sesuai.

### 5.2 Urutan deploy
1. Backend dulu. Tidak ada migrasi baru.
2. Frontend sesudahnya.
Keduanya bekerja dalam urutan mana pun: FE baru + BE lama berfungsi, tetapi BE lama masih mengizinkan hapus invoice non-Draft dan menerima status di body. FE lama + BE baru berfungsi; finance FE lama tetap mock.

### 5.3 Smoke test pasca-deploy (read-only, aman)
1. `GET /api/health` → 200.
2. `POST /api/auth/register` dengan body kosong → 403 (tidak membuat apa pun).
3. Login sebagai admin nyata; `GET /api/auth/me` → daftar izin lengkap.
4. `GET /api/reservations?page=1&pageSize=10`, `/api/reservations/calendar?from=…&to=…`, `/api/rooms`, `/api/invoices?page=1&pageSize=10`, `/api/dashboard/overview` → 200.
5. `GET /api/activities?page=1&pageSize=10` → entri `login` terbaru terlihat.
6. Periksa header respons: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`.
7. Di browser: buka dashboard, daftar reservasi, satu detail reservasi, daftar invoice, laporan. Jangan menekan tombol aksi.

### 5.4 Playwright e2e (lingkungan terisolasi, bukan produksi)
Jalankan `npm run test:e2e` di `frontend` terhadap backend lokal dengan D1 lokal ter-seed (`--allow-default-credentials`): `01-public`, `02-auth`, `03-dashboard`, `04-reservations`, `05-rooms`, `06-users-roles`, `07-finance-activity`, `10-invoice-stamp`. Spec belum disesuaikan dengan remediasi; perkirakan kegagalan pada alur registrasi (`02-auth`) dan pada finance yang mengandalkan data mock (`07`, `10`). Tambahan manual: buat/edit/hapus invoice Draft, send/pay/cancel, buat expense, dashboard sebagai Staff, ekspor laporan, sesi kedaluwarsa, dua tab membooking kamar yang sama.

### 5.5 Rollback
Tanpa migrasi, rollback = deploy ulang versi sebelumnya. Di kode, `snapshot-block-N` berisi keadaan **sebelum** Blok N; memulihkannya juga membatalkan semua blok sesudahnya.

| Mundur ke sebelum | Perintah (PowerShell, dari root proyek) |
|---|---|
| Blok 10 (guard Super Admin, shim, pencabutan `div`) | salin `snapshot-block-10\backend\src`, `backend\tests`, `frontend\src` kembali. Catatan: snapshot ini dibuat setelah `fake-d1.ts` dan `final-reattack.test.ts` diubah, sebelum edit `src`. |
| Blok 9B | `Remove-Item frontend\src -Recurse -Force; Copy-Item .tmp-fix\snapshot-block-9b\frontend\src frontend\src -Recurse -Force` |
| Blok 8 (seluruh frontend) | sama dengan `snapshot-block-8\frontend\src`, plus `vite.config.ts` dan `eslint.config.js` |
| Blok 1–7 (backend) | `Remove-Item backend\src -Recurse -Force; Copy-Item .tmp-fix\snapshot-block-N\backend\src backend\src -Recurse -Force` (dan `backend\tests` yang sepadan) |
| Semua (backend) | `snapshot-block-0\backend` |

---

## 6. Item yang ditunda

### Kelas C (Cloudflare / config / skema / plan)
1. **BE-014**: set `workers_dev: false` di `wrangler.jsonc` setelah custom domain aktif.
2. **BE-033**: aktifkan `observability` di `wrangler.jsonc`; log backend sudah JSON terstruktur.
3. **BE-034**: pisahkan environment (`env.staging`, `env.production`, D1 terpisah) dan pakai `--env` di skrip.
4. **Rate limiting nyata**: aturan Rate Limiting/WAF Cloudflare untuk `/api/auth/*` (mis. 10 request/menit per IP). Limiter di kode hanya per-isolate.
5. **JWT_SECRET**: verifikasi dan rotasi secret produksi (semua sesi akan logout).
6. **BE-004**: di D1 produksi, buat admin nyata, lalu nonaktifkan/hapus atau ganti password akun default seed.
7. **BE-032**: konfirmasi plan Workers; migrasi ke PBKDF2 dengan dual-verify hanya setelah plan diketahui.
8. **BE-010**: perataan timing login/forgot (keputusan CPU).
9. **BE-021**: tabel pembayaran dan rekonsiliasi invoice–reservasi.
10. **BE-030**: semantik total saat cancel (butuh kolom atau keputusan).
11. **Nomor invoice**: counter khusus bila nomor Draft yang dihapus tidak boleh dipakai ulang.
12. **Email reset password**: belum ada pengiriman email.
13. Pastikan `backend\.dev.vars` tidak ter-track.
14. Jalankan e2e di lingkungan terisolasi (§5.4).
15. Tabel/constraint `room_nights`: tidak diperlukan menurut tes; pertimbangkan hanya bila uji D1 nyata menunjukkan sebaliknya.

### Kelas D3 (UI / produk)
1. FE-007: label input dan aksesibilitas modal.
2. X-001: override izin per user.
3. X-006: sembunyikan shortcut dashboard sesuai izin.
4. Sembunyikan halaman `/register` dan tautannya.
5. FE-009: bump `xlsx` dan `react-router`.
6. Hapus kredensial default dari mock JSON frontend (skrip seed bergantung padanya).
7. Label billed/paid di laporan (endpoint sudah ada), hapus Select status invoice (opsi A2), gaya banner error, jarak di sekitar `ErrorState`.
8. Seluruh item audit desain frontend lama (UI-*, A11Y-*, UX-*, ARC-*, RWD-*).

---

## 7. Risiko residual dan yang tidak diverifikasi

**Tidak diverifikasi**
1. **Konkurensi di D1 nyata.** Semua bukti atomisitas berasal dari shim better-sqlite3 dengan latency buatan. Perbaikan hanya mengandalkan dua jaminan D1 yang terdokumentasi (satu statement atomik; `batch` = satu transaksi), tetapi belum pernah dijalankan di D1.
2. **Batas plan** (50 vs 1000 query per invocation, CPU bcrypt): plan akun tidak diketahui.
3. **Browser/e2e**: tidak ada pengujian browser untuk Blok 8, 9B, maupun pencabutan `div` di Blok 10. Verifikasi = `tsc` + tes kontrak + pemeriksaan logika dengan fetch tiruan.
4. Urutan `rowid` sebagai tiebreaker (D-038) diasumsikan sama di D1.

**Risiko yang diketahui**
1. Guard Super Admin terakhir memakai pelanggaran `NOT NULL` yang disengaja untuk membatalkan batch. Pesan error D1 nyata diasumsikan memuat `NOT NULL constraint failed: user_roles.user_id`; bila berbeda, batch tetap dibatalkan (invarian terjaga) tetapi klien menerima 500, bukan 403.
2. Limiter login per-isolate: tidak efektif melawan serangan terdistribusi.
3. `fetchAllPages` dibatasi 20 halaman (2.000 baris; aktivitas 10 halaman); di atas itu daftar terpotong diam-diam (D-045). Dashboard melakukan 3 pengambilan daftar finance per buka.
4. Rentang tanggal kalender tidak dibatasi (D-042).
5. Role yang hanya punya `finance.report.view` melihat laporan kosong (D-051).
6. Invoice Sent masih bisa diedit (D-033); reservasi checked-in masih bisa diedit (D-021); Super Admin terakhir boleh mengubah emailnya sendiri (D-013).
7. `InvoiceListPage` dan `DashboardPage` juga disentuh workstream UI lain: periksa konflik saat menggabungkan.

**Penyimpangan proses yang perlu Anda ketahui**
1. Menjalankan ulang PoC audit membuat vitest menulis `.tmp-audit\poc\.cache\vitest\…\results.json`. Itu satu-satunya berkas di bawah `.tmp-audit\` yang berubah; berkas PoC dan laporan audit tidak tersentuh. Saya tidak punya salinan aslinya untuk dipulihkan.
2. Snapshot Blok 1 dan Blok 10 dibuat setelah edit pertama blok itu (Blok 10: setelah perubahan tes/shim, sebelum perubahan `src`).
3. Blok 10 seharusnya verifikasi saja; saya mengubah kode produksi di dua tempat (`services/authz.ts`, `services/userService.ts`) karena re-attack menemukan celah nyata pada temuan High, dan mengubah shim tes agar PoC audit bisa berjalan.
4. Golden happy-path (12 snapshot) dan tes kontrak lama identik dengan salinan paling awal (`snapshot-block-2`; snapshot Blok 0 dibuat sebelum golden ada). Yang berubah: `role-matrix.json` (3 sel, Blok 2), `known-unsafe.test.ts` dan `role-matrix.test.ts` (dibalik per blok sesuai rancangan). Ditambah: `role-matrix.block0.json`, `finance-frontend-contract.test.ts`.

### Tabel jumlah query D1 per request

| Endpoint | Baseline | Akhir (anggaran yang ditegakkan tes) |
|---|---|---|
| POST /auth/login | 7 | 6 |
| GET /auth/me | 4 | 2 |
| GET /users?pageSize=100 | 11 | 5 |
| GET /users/:id | 6 | 4 |
| GET /roles?pageSize=100 | 11 | 5 |
| GET /roles/:id | 6 | 4 |
| GET /permissions | 5 | 3 |
| GET /rooms, /room-types | 6 | 4 |
| GET /reservations?pageSize=100 | 51 | 6 |
| GET /reservations?pageSize=10 | 36 | 6 |
| GET /reservations/:id | 7 | 5 |
| GET /reservations/calendar | 19 | 4 |
| GET /reservations/availability | 7 | 3 |
| POST /reservations | 19 | 13 |
| GET /invoices?pageSize=100 | 15 | 5 |
| GET /invoices/:id | 6 | 4 |
| GET /expenses, /sales | 6 | 4 |
| GET /sales/breakdown | 5 | 3 |
| GET /reports/summary | 8 | 6 |
| GET /reports/top-invoices | 5 | 3 |
| GET /dashboard/overview | 11 | 6 |
| GET /activities?pageSize=100 | 6 | 4 |

Naik (jalur mutasi langka, bukan jalur panas): audit +1 sampai +3 statement per mutasi user/role; login gagal +2; penolakan create reservasi 7 → 11; perubahan yang mencabut status Super Admin +1 (guard Blok 10).
