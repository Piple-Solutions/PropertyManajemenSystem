# Laporan Lengkap Remediasi PMS Homestay Joglo Seruni Syariah (Blok 0-10)

Gabungan utuh dari `reports/block-0.md` sampai `block-10.md` ditambah `handover.md`, tanpa perubahan isi (hanya tingkat judul diturunkan satu). Bila ada angka yang berbeda antar blok, laporan blok yang lebih akhir dan lampiran handover yang berlaku; contoh: Blok 9B menyebut 3 `div` pembungkus, Blok 10 mengoreksinya menjadi 7 dan mencabut semuanya.

## Daftar isi

- Blok 0: Laporan Blok 0 — Safety Net (Sonnet 5.5, Medium)
- Blok 1: Laporan Blok 1 — Auth Hardening (Sonnet 5.5, Medium)
- Blok 2: Laporan Blok 2 — Authorization Hierarchy (Opus 5.5, High)
- Blok 3: Laporan Blok 3 — Audit Trail dan Logging (Sonnet 5.5, Medium)
- Blok 4: Laporan Blok 4 — Reservation Guards (Sonnet 5.5, Medium)
- Blok 5: Laporan Blok 5 — Atomicity dan Double-Booking (Opus 5.5, High)
- Blok 6: Laporan Blok 6 — Invoice Lifecycle, Reports, Money (Sonnet 5.5, Medium)
- Blok 7: Laporan Blok 7 — Validasi, Waktu, Performa (Sonnet 5.5, High)
- Blok 8: Laporan Blok 8 — Perbaikan Logika Frontend, Non-UI (Sonnet 5.5, Medium)
- Blok 9A: Blok 9A — Catatan Desain FE-001: integrasi finance FE ke API (Opus 5.5, High)
- Blok 9B: Laporan Blok 9B — Implementasi FE-001: finance FE ke API nyata (Opus 5.5, High)
- Blok 10: Laporan Blok 10 — Verifikasi akhir dan handover (Opus 5.5, High)
- Lampiran: Handover (status per temuan, checklist pemilik, item ditunda, risiko residual)


---

## Laporan Blok 0 — Safety Net (Sonnet 5.5, Medium)

**Status: SELESAI.** Snapshot: `.tmp-fix\snapshot-block-0\`.
**Restore (satu baris):** `Copy-Item .tmp-fix\snapshot-block-0\backend\* backend\ -Recurse -Force` (mengembalikan `src`, `tests`, `scripts`, `README.md` ke kondisi sebelum Blok 0; Blok 0 tidak mengubah `src`, `scripts`, maupun `README.md`, hanya `tests\`).

### 1. Angka baseline
| Pemeriksaan | Sebelum | Sesudah Blok 0 |
|---|---|---|
| Backend `tsc --noEmit` | lulus | lulus |
| Backend `vitest run` | 177 lulus / **13 gagal** (5 file) | **282 lulus / 0 gagal (24 file)**, ±43 dtk |
| Frontend `tsc --noEmit` | lulus | (baseline) lulus, ±7 dtk |
| Frontend ESLint | — | **197 error / 319 warning** (554 file; 316 `no-explicit-any`, 195 `no-undef`, 3 `no-unused-vars`, 2 `no-useless-escape`) |
| Frontend `vite build` (ke `.tmp-fix\fe-dist`) | — | lulus, ±10 dtk; 85 file JS, **1,845,006 byte** total; entry `index` 249.97 kB (gzip 79.18); `ReportPage` 732.92 kB (gzip 240.27) |

Rincian: `.tmp-fix\baseline-vitest.json` (13 gagal), `.tmp-fix\fe-eslint-baseline.json`, `.tmp-fix\fe-build-baseline.json`.

### 2. BE-028 — fixture basi (hanya fixture, tidak ada assertion yang dilemahkan)
Akar masalah dikonfirmasi: seed (dari `frontend/src/data/mock/*.json`) kini 6 room type / 21 kamar dengan id `room-01…room-20` + `room-joglo`, sedangkan `reservation_rooms` seed masih merujuk id lama `room-001…room-008` yang **tidak ada** di tabel `rooms` (tanpa FK). Perubahan fixture:
- `reservations.test.ts`: kamar `room-008/006/001/002` -> kamar nyata `room-04/19/01/02`; tes overlap/PATCH-conflict sekarang MEMBUAT blocker nyata lewat API dulu (karena reservasi seed tidak menempati kamar nyata). Helper `stayOnRoom`.
- `rooms.test.ts`: 5->6 room type, 8->21 kamar, pencarian `101`->`15`, filter tipe 2->9; "maintenance" dibuat lewat PATCH (seed tak punya kamar maintenance) lalu dihitung 0 -> 1; tes "room dengan riwayat reservasi (409)" dan "snapshot tidak ditulis ulang" kini memakai reservasi nyata (tes snapshot sebelumnya lulus secara kosong karena memanggil `/api/rooms/room-001` yang 404).
- `seed.test.ts`: room_types 5->6, rooms 8->21.
- `dashboard.test.ts`: rooms `{21,21,0,0}`, occupancy 2/21 = 10%.
- `activities.test.ts`: kamar `room-008`->`room-04`; duplikat nomor `101`->`01`.

### 3. Yang ditambahkan (semua di `backend\tests\`)
| Berkas | Isi |
|---|---|
| `helpers/fake-d1.ts` | **Query log** (`queryLogFor(sqlite)`: count/batches/sql) dan `batch` **transaksional** (sync, rollback bila gagal, `meta.changes` per statement). Perilaku lama untuk `run/all/first/raw` tidak berubah. |
| `shim.test.ts` (6 tes) | Membuktikan: batch commit/rollback (CHECK, PK), `INSERT … SELECT … WHERE NOT EXISTS` (changes 1 lalu 0), `UPDATE … WHERE` bersyarat, penghitungan statement termasuk di dalam batch. Lewat drizzle `db.batch([...db.run(sql…)])`. |
| `helpers/golden.ts` | Harness: jam beku (+1 dtk per request), normalisasi uuid/id pendek/JWT/reset token, `Recorder`. |
| `golden/*.golden.test.ts` (12 tes) + `golden/snapshots/*.json` (12 berkas) | Karakterisasi happy-path: auth, users, roles/permissions, rooms, room-types, public room-types, reservasi (list/filter/get/calendar/availability/create/edit/check-in/check-out/cancel), invoices (list/filter/create/patch/send/pay/cancel/delete Draft), expenses, sales, breakdown, reports, dashboard, activities, baris audit yang ada. Stabil: 6 kali berturut-turut identik. |
| `golden/known-unsafe.test.ts` (13 tes) | Perilaku CACAT yang dibuktikan di baseline dan akan dibalik oleh blok tertentu (peta di header file): BE-001, 002, 003, 007, 023, 017, 024, 025 (x2), 019, 020, 022. Blok yang memperbaiki mengubah assertion-nya menjadi tes regresi; golden happy-path tidak boleh diubah. |
| `golden/role-matrix.test.ts` + `snapshots/role-matrix.json` | Matriks 4 aktor x 8 aksi x 5 role target (160 sel). Lihat `.tmp-fix\role-matrix-notes.md`. ±40 dtk. |
| `contract/frontend-contract.test.ts` (34 tes) | Kontrak FE (lihat `contract.md`). |
| `budgets/query-budget.test.ts` (26 tes) | Anggaran statement D1 per endpoint (hanya boleh turun). |

### 4. Anggaran query (statement D1 per request, DB seed 15 reservasi)
login 7 · me 4 · users?100 11 · users/:id 6 · roles?100 11 · roles/:id 6 · permissions 5 · rooms?100 6 · room-types?100 6 · **reservations?100 51** · **reservations?10 36** · reservations/:id 7 · calendar 19 · availability 7 · POST reservations 19 · invoices?100 15 · invoices/:id 6 · expenses?100 6 · sales?100 6 · breakdown 5 · reports/summary 8 · top-invoices 5 · dashboard 11 · activities?100 6.
**Temuan:** daftar reservasi sudah 51 statement dengan HANYA 15 baris (3 per baris + 6) — di atas batas 50 plan Free; pada 100 baris ±306. Blok 7 (BE-027) memotongnya.

### 5. Yang DICAKUP vs TIDAK dicakup
Dicakup: status + body JSON penuh (urutan list, field, kode error) untuk semua endpoint yang dipakai FE dan endpoint finance; kontrak FE; anggaran query; matriks role; emulasi batch/conditional write di shim.
Tidak dicakup: konkurensi nyata D1 (shim sinkron, single-thread), batas CPU Workers, `holidays` upstream (sudah ada `tests/holidays.test.ts`), Playwright e2e (dijalankan pemilik), UI/aksesibilitas, `db.insert().returning()` lewat batch (hanya `db.run` yang diuji), pengiriman email, plan Cloudflare. Snapshot memakai `toMatchFileSnapshot`: bila berkas snapshot hilang, vitest MENULIS ulang (di CI sebaiknya set `CI=1` agar gagal) — jangan hapus `golden/snapshots`.

### 6. Temuan baru yang harus diketahui blok berikutnya
1. **Role `role-004` (Viewer) berstatus `inactive` di seed, tetapi tes yang ada (rooms/reservations/dashboard) memakainya sebagai "viewer" yang memiliki `room.view` dan `reservation.view`.** BE-007 (Blok 2) akan membuat role itu tidak memberi izin -> tes-tes tersebut harus memakai role aktif baru (perubahan fixture yang terkait langsung dengan perbaikan; flag untuk S3/S4 di prompt Opus). `inactive@hotel.com` (user-004) memang user inactive.
2. **Edit reservasi di FE tersedia untuk semua status dan selalu mengirim payload lengkap** (contract.md §4) -> BE-017 harus membandingkan nilai, bukan menolak PATCH mentah; kontradiksi = S2.
3. **Reservasi seed (`res-001…res-015`) merujuk kamar yang tidak ada** — menyimpan ulang kamar reservasi seed lewat wizard memberi 422 `Room(s) not found` (dikunci di contract test). BE-024 tidak mengubahnya; ini drift data seed (rekomendasi: perbaiki mock/seed di luar scope ini atau akui sebagai data demo).
4. Pada peristiwa `activities` dengan `created_at` yang sama, urutan tak terdefinisi (BE-035); harness golden menggeser jam 1 dtk antar langkah supaya deterministik.
5. `forgot-password` mengembalikan `resetToken` di env tes karena `DEV_EXPOSE_RESET_TOKEN=true` + origin `localhost` (BE-008 harus mempertahankan perilaku ini untuk localhost).
6. FE `holidayService` hanya mengirim `force=true` bila dipanggil dengan `{force:true}`; grep seluruh `frontend/src` menunjukkan TIDAK ADA call site yang memakainya -> BE-012 aman dikerjakan di Blok 1 (field `source` pada respons tetap dipertahankan, hanya URL asal yang tidak di-echo; cek `HolidayYear.source` di Blok 1).

### 7. Happy path berubah? **Tidak.** Tidak ada perubahan di `backend\src`, `migrations`, `scripts`, `package.json`, frontend, `.tmp-audit` (diverifikasi lewat waktu modifikasi berkas). Hanya `backend\tests\` dan `.tmp-fix\`.

---

## Laporan Blok 1 — Auth Hardening (Sonnet 5.5, Medium)

**Status: SELESAI.** Backend `tsc --noEmit` lulus; `vitest run`: **304 lulus / 0 gagal (25 file)** (Blok 0: 282).
**Snapshot:** `snapshot-block-1\` — CATATAN: dibuat SETELAH edit Blok 1 dimulai (kelalaian proses). Isinya `src`, `scripts`, `README.md` dalam keadaan sebelum Blok 1 (identik dengan `snapshot-block-0`, karena Blok 0 tidak menyentuhnya). Berkas tes yang diubah Blok 1 terdaftar di bagian 3.
**Restore (satu baris):** `Copy-Item .tmp-fix\snapshot-block-1\backend\* backend\ -Recurse -Force; Remove-Item backend\src\lib\security.ts, backend\tests\hardening.test.ts` (lalu kembalikan 4 berkas tes yang diedit sesuai bagian 2/3).

### 1. Per temuan

| ID | Status | Perubahan | Sebelum -> sesudah | Residual |
|---|---|---|---|---|
| BE-001 | FIXED | `routes/auth.ts`: konstanta `PUBLIC_REGISTRATION_ENABLED=false` (di `lib/security.ts`, tanpa env var); register selalu `403` + pesan "Pendaftaran akun publik dinonaktifkan. Hubungi administrator untuk dibuatkan akun." Ditolak SEBELUM validasi/DB (tidak ada enumerasi 409). Service `register()` tetap ada & teruji. | 201+JWT -> 403 | FE `/register` masih tampil (sengaja, UI di luar scope; pesan tampil lewat `auth-error` karena `apiErrorMessage`). e2e `SCN-02-07` akan gagal (diharapkan; dijalankan pemilik). |
| BE-005 | FIXED | `jwtSecretGuard` (middleware untuk `/api/*` kecuali `/api/health`, `/api/public/*`): placeholder/kosong -> 500 + pesan JWT_SECRET, HANYA untuk request non-localhost. Deteksi berbasis fragmen ("change-me", "insecure", "dev-only", "placeholder", "example", ...) sehingga nilai contoh dari `.dev.vars.example` tertangkap tanpa menyalin nilainya ke kode; secret nyata yang pendek (<32) hanya `console.warn` sekali. | tanpa guard -> fail-closed | Jika produksi memakai nilai contoh, API akan 500 sampai secret dirotasi (itu tujuannya). Tidak ada perubahan `wrangler`/`.dev.vars`. |
| BE-006 | FIXED (best-effort) | `AttemptLimiter` per instance app (per isolate), kunci = IP + identifier, tanpa D1. Login: 20 GAGAL/10 mnt per IP+email (sukses menghapus); forgot-password: 10 req/10 mnt per IP+email; reset-password: 20 gagal/10 mnt per IP. 429 + `Retry-After` + pesan Indonesia. Map dibatasi 5000 kunci. | tanpa batas -> speed bump | Per isolate, tidak dibagi; proteksi nyata = aturan Cloudflare Rate Limiting/WAF (owner). Akun lain dari IP yang sama dan IP lain untuk akun yang sama tidak terpengaruh (diuji). |
| BE-008 | FIXED | `forgotPassword(..., exposeAllowed)`; route memberi `isLocalhostUrl(c.req.url)`. Flag `DEV_EXPOSE_RESET_TOKEN` tidak berefek untuk host non-localhost. Token tetap dibuat. | token bocor bila flag bocor -> hanya localhost | Pengiriman email tetap belum ada (owner). |
| BE-011 | FIXED | Klaim token dengan `UPDATE ... WHERE id=? AND used_at IS NULL` + cek `meta.changes===1` SEBELUM mengganti password; sukses juga memvoidkan token lain milik user. | select-lalu-update -> klaim atomik | Jika update password gagal setelah klaim, token terbakar (aman, user minta ulang). |
| BE-012 | FIXED | `routes/public.ts`: `force` diabaikan (selalu `false` ke service); respons `source` = `"upstream"` (bukan URL), `error` = `"Holiday source unavailable."` bila ada. Bentuk respons sama. FE hanya membaca `year/days/available` dan tak ada call site `force`. | URL & teks error bocor -> disembunyikan | Service-level `force` tetap ada untuk tes internal. |
| BE-014 | FIXED (header saja) | `securityHeaders()`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` (kecuali `/api/public/*` & `/api/health`), HSTS pada https. Logout TIDAK diubah. | tanpa header -> header | `workers_dev:false` = owner (config). |
| BE-004 | FIXED (guard + docs) | `scripts/generate-seed-sql.mjs`: menolak (exit 1, tanpa berkas) kecuali `--allow-default-credentials` atau env `PMS_ALLOW_DEFAULT_CREDENTIALS=1`; pesan tidak mencetak password. README diperbarui. | seed otomatis -> opt-in eksplisit | `scripts/seed-local.mjs` di luar scope tulis, jadi `npm run db:seed:local` kini butuh `PMS_ALLOW_DEFAULT_CREDENTIALS=1` di shell (didokumentasikan; PowerShell: `$env:PMS_ALLOW_DEFAULT_CREDENTIALS='1'`). Penghapusan password plaintext dari mock JSON = D3 (deferred). |

### 2. Bukti happy path tidak berubah
- Seluruh golden (12), contract (34), role matrix (160 sel), query budget (26) lulus TANPA diubah. Anggaran query tidak naik (tidak ada statement tambahan di jalur panas; reset-password +1 statement, bukan jalur panas dan tidak dalam anggaran).
- Satu-satunya tes lama yang berbalik adalah yang menguji perilaku cacat BE-001 (register 201/409): `auth.test.ts` (3 tes register diganti menjadi 2 tes 403; cakupan service dipindah ke `hardening.test.ts`), `activities.test.ts` (1 tes memakai register untuk mendapat token -> user dibuat admin lalu login; assertion log "registered" dihapus karena hook tak terjangkau), `golden/known-unsafe.test.ts` (BE-001, sesuai peta flip). Tidak ada assertion lain yang diubah. `seed.test.ts` hanya menambah argumen `--allow-default-credentials` pada pemanggilan skrip.

### 3. Berkas yang berubah
`src/lib/security.ts` (baru), `src/index.ts`, `src/routes/auth.ts`, `src/routes/public.ts`, `src/services/authService.ts`, `scripts/generate-seed-sql.mjs`, `README.md`; tes: `tests/hardening.test.ts` (baru, 23 tes), `tests/auth.test.ts`, `tests/activities.test.ts`, `tests/seed.test.ts`, `tests/golden/known-unsafe.test.ts`.
Tidak ada perubahan: frontend, `wrangler.jsonc`, `.dev.vars*`, migrations, `package.json`, lockfile.

### 4. Kompatibilitas FE
- Register: FE menampilkan `message` backend lewat `apiErrorMessage` (`authStore.register` catch -> `SET_ERROR`), tidak ada yang rusak. Login 429 jatuh ke `LOGIN_FAILURE` dengan pesan backend.
- Frontend tidak diubah; bekerja dengan backend lama maupun baru.

### 5. Risiko residual / tindakan owner
1. Verifikasi & rotasi `JWT_SECRET` produksi (`wrangler secret put`) SEBELUM deploy: nilai contoh membuat API 500 di domain non-localhost.
2. Tambahkan Cloudflare Rate Limiting/WAF untuk `/api/auth/*` (limiter ini hanya per isolate).
3. e2e `SCN-02-07` (register) perlu diperbarui/di-skip tim UI karena register ditutup; menyembunyikan halaman/tombol `/register` = D3.
4. Hapus/rotasi akun default di D1 produksi bila pernah di-seed (BE-004 operasional).

---

## Laporan Blok 2 — Authorization Hierarchy (Opus 5.5, High)

**Status: SELESAI.** Backend `tsc --noEmit` lulus; `vitest run`: **322 lulus / 0 gagal (26 file)** (Blok 1: 304).
**Snapshot:** `snapshot-block-2\` (dibuat SEBELUM edit pertama; berisi `src`, `tests`, `scripts`, `README.md` kondisi akhir Blok 1).
**Restore (satu baris):** `Remove-Item backend\src,backend\tests -Recurse -Force; Copy-Item .tmp-fix\snapshot-block-2\backend\* backend\ -Recurse -Force`

### 1. Model yang diterapkan
Hirarki berbasis **superset izin** (bukan peringkat role), di `src/services/authz.ts`:
1. Aktor boleh mengubah user/role hanya bila aktor memegang SEMUA izin target (izin target dihitung dari semua role-nya, apa pun status role: konservatif).
2. Aktor hanya boleh MEMBERI (assign role / menempelkan izin) apa yang ia pegang sendiri.
3. `POST /roles` dengan `permissions` tidak kosong butuh `permission.assign` + subset. Role kosong tetap cukup `role.create`.
4. Role Super Admin (`role-001`) adalah akar kepercayaan: pemegangnya dikecualikan dari aturan subset; role itu tidak pernah berhenti memberi izin (kebal `inactive`), tidak bisa dinonaktifkan/dihapus, dan harus tetap punya izin inti `user.*`, `role.*`, `permission.*`.
5. Super Admin AKTIF terakhir tidak bisa dihapus, dinonaktifkan, diturunkan (kehilangan `role-001`), atau diubah emailnya oleh orang lain. Ia tetap boleh mengubah nama/email miliknya sendiri.
6. Self-lockout: nonaktifkan diri sendiri kini juga ditolak lewat `PATCH /users/:id {status}` (sebelumnya hanya lewat `/status`).
7. BE-007: `loadAuthContext` hanya menggabungkan izin dari role `active` (+ `role-001`). `user.roles` dan bentuk respons tidak berubah.
Semua penolakan: `403` dengan pesan Indonesia dalam bentuk `{ message }` yang sudah ada.

### 2. Per temuan
| ID | Status | Sebelum -> sesudah | Bukti |
|---|---|---|---|
| BE-002 | FIXED | Manager demote/deactivate/ubah email/rename Super Admin: 200 -> 403; hapus/turunkan admin terakhir: 2xx -> 403 | `tests/authorization.test.ts` (8 tes), matriks role, `known-unsafe` (2 tes dibalik) |
| BE-003 | FIXED | `role.create` menempelkan izin: 201 -> 403; assign role berizin lebih: 200 -> 403; `PUT /roles/:id/permissions` di luar milik aktor: 200 -> 403; edit/hapus role yang lebih tinggi: 2xx -> 403 | 5 tes + `known-unsafe` |
| BE-007 | FIXED | role inactive tetap memberi izin -> tidak memberi apa pun; reaktivasi memulihkan; Super Admin kebal | 4 tes + `known-unsafe` |

Catatan protokol: tes regresi baru ditulis sebelum kode, tetapi TIDAK dijalankan dalam keadaan gagal lebih dulu; bukti "gagal sebelum perbaikan" adalah tes `known-unsafe` Blok 0 (lulus pada kode lama, dibalik sekarang) dan PoC audit.

### 3. Oracle: matriks role seed (160 sel)
Hanya 3 sel berubah, persis yang diprediksi `role-matrix-notes.md`: **Manager x {demote, deactivate, changeEmail} x role-001: 200 -> 403**. 157 sel lain identik. Baseline disimpan sebagai `tests/golden/snapshots/role-matrix.block0.json` dan tes baru memastikan selisihnya HANYA 3 sel itu.
Operasi sah yang tetap berjalan (diuji): Super Admin mengelola siapa pun; Manager membuat/mengubah/menonaktifkan/mengganti role Staff, Reception, Viewer, dan Manager lain; edit diri sendiri.

### 4. Tes lama yang berubah (semuanya menguji perilaku cacat atau memakai fixture yang bergantung padanya)
| Berkas | Perubahan | Alasan |
|---|---|---|
| `golden/known-unsafe.test.ts` | 4 tes BE-002/003/007 dibalik menjadi "FIXED in Block 2" | sesuai peta flip Blok 0 |
| `golden/snapshots/role-matrix.json` | 3 sel 200 -> 403 (+ baseline `.block0.json`, + tes selisih) | BE-002 |
| `reservations.test.ts`, `rooms.test.ts` | fixture "viewer" memakai role AKTIF baru (izin sama) alih-alih `role-004` yang inactive | BE-007; assertion tidak berubah |
| `rbac.test.ts` | fixture role `UserManager` kini juga memegang izin Staff yang ia bagikan | BE-003 (lihat keputusan D-012); assertion tidak berubah |
Golden happy-path (12 snapshot), contract (34), query budget (26): **tidak diubah, lulus**.
Satu koreksi selama pengerjaan: guard "role Super Admin tidak bisa dihapus" semula mendahului cek "role masih dipakai" dan mengubah 409 yang sudah ada menjadi 403; urutannya dikembalikan sehingga `DELETE /roles/role-001` tetap 409 seperti sebelumnya.

### 5. PERUBAHAN PERILAKU YANG PERLU DIKETAHUI PEMILIK
1. **Role "admin pengguna" murni (hanya `user.*`) tidak bisa lagi membagikan role yang izinnya tidak ia pegang** (mis. Staff), dan tidak bisa mengubah user yang memegang izin di luar miliknya. Ini konsekuensi langsung aturan subset yang diwajibkan rules 4A. Di seed tidak ada role seperti itu (Manager memegang superset Staff/Reception/Viewer), jadi tidak ada operasi seed yang terblokir. Bila kelak dibuat role HR-only, beri juga izin yang akan ia bagikan, atau lakukan lewat Super Admin.
2. **Role `Viewer` (`role-004`) berstatus inactive di seed**: pemegangnya sekarang tidak punya izin sama sekali sampai role diaktifkan (`PATCH /roles/role-004 {status:"active"}`). Satu-satunya pemegang di seed adalah `user-004` yang memang user inactive. Periksa D1 produksi: bila ada user aktif yang hanya memegang role inactive, mereka akan kehilangan akses setelah deploy.
3. Super Admin dikenali lewat id role `role-001`. Bila D1 produksi tidak memiliki role dengan id itu, tidak ada pengecualian maupun proteksi admin-terakhir (aturan subset tetap berlaku untuk semua).

### 6. Biaya query (hanya pada mutasi user/role; jalur baca dan anggaran tidak berubah)
| Mutasi | Aktor Super Admin | Aktor lain |
|---|---|---|
| PATCH user (nama/email) | +0 | +1 (izin target) |
| PATCH user status inactive / roles tanpa role-001 / DELETE user | +1 (role target), +1 bila target Super Admin aktif | +1, +1 bila target Super Admin aktif |
| assign role (create/PUT/PATCH roles) | +0 | 1 query batched (`inArray`) menggantikan N query per role |
| PATCH role | +0 (query izin dipindah, bukan ditambah) | +0 |
| PUT role permissions / DELETE role | +0 | +1 |

### 7. Matriks otorisasi endpoint (rute yang disentuh)
| Endpoint | Izin rute | Pemeriksaan service baru |
|---|---|---|
| POST /api/users | user.create | role yang diberikan ⊆ izin aktor |
| PATCH /api/users/:id | user.update | target ⊆ aktor; role baru ⊆ aktor; admin-terakhir; self-deactivate |
| PATCH /api/users/:id/status | user.update | target ⊆ aktor; admin-terakhir; self-deactivate |
| PUT /api/users/:id/roles | user.update | target ⊆ aktor; role baru ⊆ aktor; admin-terakhir |
| DELETE /api/users/:id | user.delete | target ⊆ aktor; admin-terakhir; self-delete |
| POST /api/roles | role.create | izin tidak kosong => permission.assign + subset |
| PATCH /api/roles/:id | role.update | role ⊆ aktor; role-001 tak bisa inactive |
| PUT /api/roles/:id/permissions | permission.assign | izin baru ⊆ aktor; role ⊆ aktor; izin inti role-001 |
| DELETE /api/roles/:id | role.delete | role ⊆ aktor; role-001 tak bisa dihapus (setelah cek "masih dipakai" 409) |
GET tidak berubah.

### 8. Risiko residual
- Proteksi admin-terakhir adalah "cek lalu tulis" lintas `await`: dua Super Admin yang saling menurunkan dalam milidetik yang sama bisa lolos. Peluang sangat kecil (butuh dua admin bertindak bersamaan); perbaikan atomik butuh statement bersyarat tambahan dan dapat dikerjakan bersama Blok 5 bila diinginkan.
- Role yang ditetapkan ke user tetap boleh berstatus inactive (hanya tidak memberi izin); menolak assignment role inactive akan mengubah sel matriks yang sah.
- FE: `userService.getUserPermissions` menghitung gabungan izin role di klien tanpa melihat status role (hanya tampilan; backend yang menegakkan). X-001 tetap deferred.
- Frontend tidak diubah; pesan 403 baru diteruskan lewat `message` (sebagian service FE masih menelan error menjadi `null`/`false`, FE-004 di Blok 8).

### 9. Berkas yang berubah
`src/services/authz.ts` (baru), `src/services/userService.ts`, `src/services/roleService.ts`, `src/services/identity.ts`, `src/routes/users.ts`, `src/routes/roles.ts`; tes: `tests/authorization.test.ts` (baru, 17 tes), `tests/golden/role-matrix.test.ts` (+1 tes), `tests/golden/snapshots/role-matrix.json`, `role-matrix.block0.json` (baru), `tests/golden/known-unsafe.test.ts`, `tests/rbac.test.ts`, `tests/reservations.test.ts`, `tests/rooms.test.ts`.
Tidak ada perubahan: frontend, config, migrations, dependency, `.tmp-audit`.

---

## Laporan Blok 3 — Audit Trail dan Logging (Sonnet 5.5, Medium)

**Status: SELESAI.** Backend `tsc --noEmit` lulus; `vitest run`: **340 lulus / 0 gagal (27 file)** (Blok 2: 322).
**Snapshot:** `snapshot-block-3\` (dibuat SEBELUM edit pertama).
**Restore (satu baris):** `Remove-Item backend\src,backend\tests -Recurse -Force; Copy-Item .tmp-fix\snapshot-block-3\backend\* backend\ -Recurse -Force`

### 1. Verifikasi mekanisme yang ada (tanpa perubahan skema -> S1 tidak terpicu)
Tabel `activities` (migrasi 0004) sudah cukup:
- `category` CHECK `authentication|reservation|finance|system` -> event user/role/permission dicatat di `system` (sama seperti room/room-type yang sudah ada), failed login di `authentication`.
- `action` bebas teks; `entity_type`/`entity_id` bebas, tanpa FK; `user_id`/`user_name` snapshot tanpa FK (aman untuk user yang dihapus; failed login untuk email tak dikenal memakai `user_id='anonymous'`).
- `metadata` = JSON string-only -> before/after disimpan sebagai pasangan datar `before_<field>` / `after_<field>`.
- `ip_address` sudah ada.
Frontend: `ActivityFeed` menampilkan `activityActionLabels[action] || action`, jadi action baru tampil apa adanya tanpa perubahan FE.

### 2. Yang ditambahkan
| Event | category / action | entity | metadata (semua string) |
|---|---|---|---|
| Buat user | system / `user_create` | user:<id> | `after_name,email,status,roles` |
| Ubah user (nama/email/role/status via PATCH) | system / `user_update` | user | `before_*` + `after_*` (name,email,status,roles) |
| Ubah status user | system / `user_status` | user | `before_status`, `after_status` |
| Ganti role user | system / `user_roles` | user | `before_roles`, `after_roles` (CSV terurut) |
| Hapus user | system / `user_delete` | user | `before_*` |
| Buat role | system / `role_create` | role | `after_name,description,status,permissions` |
| Ubah role | system / `role_update` | role | `before_*` + `after_*` |
| Ubah izin role | system / `role_permissions` | role | `before_permissions`, `after_permissions`, `added`, `removed` |
| Hapus role | system / `role_delete` | role | `before_*` |
| Invoice update/send/pay/cancel | finance / `invoice_*` (sudah ada) | invoice | metadata lama + `before_{subtotal,discount,total,invoiceStatus,paymentStatus}` + `after_*` |
| Invoice delete | finance / `invoice_delete` | invoice | metadata lama + `before_*` |
| Expense update/delete | finance / `expense_update`, `expense_delete` | expense | metadata lama + `before_*` (+ `after_*` untuk update) |
| Login gagal | authentication / `login_failed` | - | `email` (dimasker `a***@hotel.com`), `reason` (`invalid_credentials`/`inactive`); ip |
Create invoice/expense TIDAK diubah (metadata `after`-nya sudah ada; menjaga golden `audit-rows.json`).

Aturan: baris ditulis HANYA setelah mutasi sukses (ditolak 403/404/409/422 tidak menulis apa pun); mutasi sensitif di-`await`; login gagal lewat `waitUntil` bila ada `executionCtx` (fallback `await` di Node/tes); kegagalan menulis audit tidak mengubah respons (diuji dengan tabel dihapus). Tidak pernah menyimpan password, hash, token, atau email utuh pada login gagal.

### 3. Biaya statement D1 per mutasi (sebelum -> sesudah, DB seed)
| Mutasi | Sebelum | Sesudah | Tambahan |
|---|---|---|---|
| POST /users | 9 | 10 | +1 (insert) |
| PATCH /users/:id | 8 | 11 | +3 (before-image 2 + insert 1) |
| PATCH /users/:id/status | 9 | 12 | +3 |
| PUT /users/:id/roles | 10 | 13 | +3 |
| DELETE /users/:id | 8 | 11 | +3 |
| POST /roles | 10 | 11 | +1 |
| PATCH /roles/:id | 8 | 11 | +3 |
| PUT /roles/:id/permissions | 14 | 17 | +3 |
| DELETE /roles/:id | 8 | 11 | +3 |
| Invoice update/send/pay/cancel, expense update/delete | 9-13 | sama | +0 (before-image diambil dari baris yang sudah dimuat service lewat callback `capture`; hook memakai penulisan yang sama seperti sebelumnya) |
| Login gagal (401) | 1 | 3 | +2 (lookup user + insert), hanya pada kegagalan |
Jalur panas (login sukses, semua GET, reservasi, anggaran query Blok 0): **tidak berubah**, tes anggaran lulus.
Hook baru memakai `writeAudit` (1 statement, tanpa read-back) bukan `recordActivity` (2 statement).

### 4. BE-033 (bagian kode): logging error terstruktur
`lib/errors.ts`: error tak terduga kini dicatat sebagai SATU baris JSON `{level, event:'unhandled_error', method, path, name, message(dimasker, <=500), stack(<=6 baris, dimasker)}`; tidak ada objek error mentah, body, header, maupun query string. `maskPii` menutup email (`a***@domain`), `Bearer ...`, JWT, hash bcrypt, dan token opak >=43 karakter. Body respons 500 tetap `{ message: 'Internal server error' }`. Observability di `wrangler.jsonc` TIDAK disentuh (class C, owner).

### 5. Tes
- Baru `tests/audit-trail.test.ts` (16 tes): tiap event + before/after, penolakan tidak menulis baris, failed login (masked, IP, user dikenal/anonim, inactive, 429 tidak mencatat, kegagalan tulis tak mengubah respons), tidak ada password/hash/token tersimpan, anggaran statement, masking & logging JSON.
- Berubah (keduanya menguji perilaku cacat BE-023 yang kini sengaja dibalik): `activities.test.ts` "does not log failed logins..." -> kini tepat satu baris `login_failed` dan forgot-password tetap tidak mencatat; `golden/known-unsafe.test.ts` BE-023 -> "FIXED in Block 3".
- Golden happy-path (12 snapshot), contract (34), role matrix, query budget (26): tidak diubah, lulus.

### 6. Berkas yang berubah
`src/lib/audit.ts`, `src/lib/errors.ts`, `src/index.ts`, `src/services/activityService.ts` (+`writeAudit`), `src/services/invoiceService.ts` & `expenseService.ts` (parameter opsional `capture`, perilaku sama), `src/routes/{users,roles,invoices,expenses,auth}.ts`; tes: `tests/audit-trail.test.ts` (baru), `tests/activities.test.ts`, `tests/golden/known-unsafe.test.ts`.
Tidak ada perubahan: frontend, config, migrations, dependency, `.tmp-audit`.

### 7. Risiko residual / catatan
1. Failed login membuat baris `activities` per kegagalan (maks 20 per 10 menit per IP+email per isolate karena limiter Blok 1). Serangan terdistribusi lintas isolate/IP tetap bisa menambah baris; mitigasi nyata = rate limiting Cloudflare (owner, class C).
2. Tabel `activities` tidak punya retensi/pembersihan; pertumbuhan perlu dipantau (di luar scope).
3. Event user/role berada di kategori `system` karena CHECK taxonomy (tanpa migrasi). Bila ingin kategori khusus (`user`, `role`) diperlukan migrasi + perubahan konstanta FE (S1, ditunda).
4. Request yang mutasinya sukses tetapi penulisan audit gagal (D1 error) mengembalikan 500 untuk mutasi yang di-`await` setelah perubahan data terjadi; ini perilaku lama untuk hook yang sudah ada dan sama untuk hook baru (atomik penuh butuh `db.batch`, scope Blok 5).
5. Aksi reservasi/room sudah diaudit sejak Phase 4 dan tidak diubah (BE-023 tidak mencantumkannya).

---

## Laporan Blok 4 — Reservation Guards (Sonnet 5.5, Medium)

**Status: SELESAI.** Backend `tsc --noEmit` lulus; `vitest run`: **356 lulus / 0 gagal (28 file)** (Blok 3: 340).
**Snapshot:** `snapshot-block-4\` (dibuat SEBELUM edit pertama).
**Restore (satu baris):** `Remove-Item backend\src,backend\tests -Recurse -Force; Copy-Item .tmp-fix\snapshot-block-4\backend\* backend\ -Recurse -Force`

### 1. Keputusan kebijakan yang PERLU dikonfirmasi pemilik (D-021)
Prompt Blok 4 berbunyi "blokir perubahan finansial/tanggal/kamar/harga kecuali status `reserved`, dan blokir SEMUA edit untuk checked-out/cancelled". Rules file (yang menang) berbunyi "blokir hanya yang tidak aman, turunkan dari field yang diedit FE per status". Hasil pembacaan FE (`contract.md` §4):
- Tombol Edit ada di SEMUA status dan wizard selalu mengirim payload lengkap.
- Memperpanjang menginap / mengubah kamar / menyesuaikan tarif untuk tamu yang sedang `checked-in` adalah operasi resepsionis yang sah, dan temuan BE-017 sendiri hanya menyebut checked-out/cancelled ("Reservasi checked-out/cancelled dapat diedit dan di-reprice").
- Memblokir SEMUA edit di checked-out/cancelled berarti setiap simpan dari wizard (termasuk hanya catatan) gagal 409 — kontradiksi dengan call site FE (S2).

Yang diterapkan (konservatif, mudah dibalik: satu konstanta `LOCKED_STATUSES` di `reservationService.ts`):
| Status | Tanggal / kamar / harga per malam / mode harga / ketentuan DP | Nama tamu, sumber, catatan |
|---|---|---|
| reserved | boleh (seperti sebelumnya) | boleh |
| checked-in | boleh (perpanjang/ubah kamar/tarif tetap mungkin; kamar tetap diperiksa bentrok & aktif) | boleh |
| checked-out, cancelled | **DIBEKUKAN**: perubahan nilai ditolak 409; payload tak berubah diterima | boleh |
Jika pemilik ingin mengunci checked-in juga (hanya catatan), cukup tambahkan `'checked-in'` ke `LOCKED_STATUSES` — ini akan menolak perpanjangan menginap lewat wizard (S2 nyata di sisi UI).

### 2. Per temuan
| ID | Status | Sebelum -> sesudah | Bukti |
|---|---|---|---|
| BE-017 | FIXED (terminal) | PATCH checked-out/cancelled mengubah harga/tanggal/kamar: 200 (total 1.500.000 -> 2; cancelled 0 -> 2) -> 409 + pesan Indonesia; baris tidak berubah. Payload wizard yang tidak berubah + nama/sumber/catatan: 200 dan hanya field itu yang ditulis (total cancelled tetap 0, rates/rooms tidak ditulis ulang) | `tests/reservation-guards.test.ts`, `known-unsafe` (dibalik), contract "edit UI vs status" lulus tanpa diubah |
| BE-024 | FIXED | kamar maintenance/inactive bisa dibooking (201) -> 422 `Kamar tidak aktif ...`; `roomNumber`/`roomTypeName` dari `rooms`/`room_types` (PoC "999" -> nomor asli). Edit: kamar yang DITAMBAHKAN harus aktif; bila tanggal berubah semua kamar harus aktif; kamar yang sudah ada tetap boleh bila hanya catatan diubah. Snapshot lama dipertahankan (kamar yang diganti nama tidak menulis ulang riwayat) | 4 tes + `known-unsafe` |
| BE-025 | FIXED | `2027-02-31` diterima -> 422 (create, patch, availability, calendar); stay > 60 malam diterima & dihargai 60 -> 422 "Maksimal menginap 60 malam"; tepat 60 malam diterima; hanya request baru/berubah (notes-only pada baris seed tetap 200) | 6 tes + `known-unsafe` |
Validasi tanggal nyata diterapkan di `dateString` (dipakai reservasi, nightly rates, calendar/availability, invoice dan expense date): hanya input baru yang terpengaruh; nilai tersimpan tidak divalidasi ulang.

### 3. Biaya query (statement D1; DB seed)
| Operasi | Sebelum | Sesudah |
|---|---|---|
| POST /reservations (1 kamar) | 19 | 19 |
| POST /reservations (2 kamar) | 21 | 20 (-1: satu query `inArray` + join tipe menggantikan 1 query per kamar) |
| PATCH catatan saja | 14 | 14 (lookup kamar dilewati) |
| PATCH payload lengkap wizard | 23 | 23 |
| PATCH ganti kamar | 19 | 19 |
Anggaran Blok 0 (26 tes) lulus tanpa perubahan angka. Tidak ada query tambahan di jalur baca.

### 4. Dampak ke frontend (tidak diubah)
- Wizard pada reservasi checked-out/cancelled yang mengubah tanggal/kamar/harga kini menerima 409 + pesan Indonesia lewat `ApiError.message` (`saveReservationDraft` melempar; penanganan tampilan di call site adalah FE-004 / Blok 8). Simpan catatan/nama tetap berhasil.
- 422 baru: kamar tidak aktif dan tanggal tidak nyata/stay > 60 malam muncul lewat `errors`/`message` yang sudah dibaca `apiErrorMessage`.
- FE mengirim `roomNumber`/`roomTypeName` dari inventaris kamar, yang kini diabaikan demi nilai server — nilai identik di kondisi normal, jadi tampilan tidak berubah.

### 5. Tes
Baru `tests/reservation-guards.test.ts` (16 tes). Berubah (menguji perilaku cacat yang dibalik): 4 tes BE-017/024/025 di `golden/known-unsafe.test.ts`. Golden happy-path (12 snapshot), contract (34), role matrix, query budget (26): tidak diubah, lulus.

### 6. Berkas
`src/lib/pricing.ts` (+`isRealCalendarDate`, `nightsBetween`), `src/lib/validation.ts` (`dateString`), `src/services/reservationService.ts`; tes: `tests/reservation-guards.test.ts` (baru), `tests/golden/known-unsafe.test.ts`. Tidak ada perubahan: frontend, config, migrations, dependency.

### 7. Risiko residual
1. Cek ketersediaan + insert masih tidak atomik (BE-015/016 = Blok 5, prompt Opus); guard status juga "baca lalu tulis" lintas `await` (edit bersamaan dengan check-out). Blok 5 menyatukan dengan `UPDATE ... WHERE status = ?`.
2. `enumerateNights` masih memakai zona waktu lokal runtime (BE-026, Blok 7).
3. `ReservationCard/ListPage` tetap menampilkan Edit untuk status terkunci (UI = D3); pesan 409 yang tampil bergantung penanganan error call site.
4. Data seed memuat reservasi dengan `room_id` yang tidak ada di `rooms`; edit kamar pada baris itu tetap 422 `Room(s) not found` (perilaku lama).

---

## Laporan Blok 5 — Atomicity dan Double-Booking (Opus 5.5, High)

**Status: SELESAI.** Backend `tsc --noEmit` lulus; `vitest run`: **379 lulus / 0 gagal (29 file)** (Blok 4: 356).
**Snapshot:** `snapshot-block-5\` (dibuat SEBELUM edit pertama).
**Restore (satu baris):** `Remove-Item backend\src,backend\tests -Recurse -Force; Copy-Item .tmp-fix\snapshot-block-5\backend\* backend\ -Recurse -Force`
**Tanpa tabel/constraint baru** — S1 tidak terpicu; `.tmp-fix\proposed-migrations\` tidak dibuat. BE-030 tetap deferred.

---

### A. DESAIN
Catatan proses: desain ditetapkan sebelum kode ditulis, tetapi dokumen ini baru ditulis di akhir blok (prompt meminta ditulis lebih dulu). Satu bagian berubah selama implementasi: A7 (cara menjalankan batch).

#### A1. Predikat overlap yang dipakai logika ketersediaan saat ini
`getBookedRoomIds` (tidak diubah): reservasi LAIN yang `status != 'cancelled'` (jadi `reserved`, `checked-in`, `checked-out` semuanya dihitung), dengan interval setengah-terbuka `check_in_date < :checkOut AND check_out_date > :checkIn`, dan kamar lewat `reservation_rooms.room_id`. Edit mengecualikan dirinya sendiri (`id != :self`). Predikat yang sama ditulis sebagai SATU ekspresi SQL `overlapExists(...)`:
```sql
EXISTS (SELECT 1 FROM reservation_rooms rr JOIN reservations o ON o.id = rr.reservation_id
        WHERE rr.room_id IN (?, ...) AND o.status != 'cancelled'
          AND o.check_in_date < :checkOut AND o.check_out_date > :checkIn [AND o.id != :self])
```

#### A2. Jaminan D1 yang diandalkan (hanya dua, keduanya terdokumentasi)
1. Satu statement bersifat atomik.
2. `batch()` menjalankan statement berurutan dalam SATU transaksi; bila satu gagal, semuanya di-rollback.
D1 = SQLite penulis tunggal, sehingga dua batch tidak pernah saling menyela: batch kedua selalu melihat hasil batch pertama. Tidak ada "cek, `await`, lalu tulis" untuk invariant.

#### A3. Create — komposisi batch
| # | Statement | Parameter terikat |
|---|---|---|
| 1 | `INSERT INTO reservations (16 kolom) SELECT ?×13 … WHERE NOT overlapExists(rooms, ci, co)` — header HANYA masuk bila tidak ada bentrok | 16 + n + 2 (n = jumlah kamar, dibatasi 60 -> maks 78) |
| 2..k | `INSERT INTO reservation_nightly_rates … SELECT r.id, v.column1, v.column2 FROM (VALUES (?,?),…) v JOIN reservations r ON r.id = :id` — tarif hanya masuk bila header ADA | 2 per malam + 1 -> 47 malam per statement (60 malam = 2 statement) |
| k+1.. | `INSERT INTO reservation_rooms … FROM (VALUES (6 nilai),…) v JOIN reservations r ON r.id = :id` | 6 per kamar + 2 -> 15 kamar per statement |
Semua statement <= 95 parameter (`chunkByParams`); `runAtomic` menolak statement > 100.
**Membaca jumlah baris berubah:** hasil D1 per statement punya `meta.changes`; `changesOf(results[0]) === 1` berarti header masuk. Bila 0: tidak ada apa pun yang tertulis (statement 2.. tidak menemukan header) -> satu query `findClashingRooms` untuk menyusun pesan 409 yang SAMA seperti sebelumnya (`Room(s) already booked for these dates: …`).
**Kegagalan/rollback:** error apa pun di tengah batch (mis. UNIQUE, kegagalan storage) membatalkan seluruh batch -> tidak ada header tanpa tarif/kamar.

#### A4. BE-029 — kode reservasi
Kode tetap `RSV-YYYY-NNN` dari `count + 1` (happy path identik). Bila dua request memilih kode yang sama, constraint UNIQUE menggagalkan batch (rollback total) -> `isUniqueViolation(err, 'reservations.reservation_code')` -> ulangi dengan kandidat baru; setelah 4 kali memakai sufiks acak; maksimum 8 percobaan lalu 409 (tidak pernah 500).

#### A5. Edit (BE-016) — validasi dulu, lalu satu batch
Urutan: baca header, tarif, kamar (+lookup kamar bila perlu) -> SEMUA validasi di memori (cakupan tarif, batas DP, kamar ada/aktif, batas malam, snapshot) -> hitung header, tarif akhir, total, split kamar -> satu batch. Tidak ada tulis sebelum validasi selesai (sebelumnya `writeNightly` menimpa tarif sebelum cek kamar).
Setiap statement membawa guard yang SAMA:
`G = EXISTS(SELECT 1 FROM reservations g WHERE g.id = :id AND g.status = :statusYangDivalidasi) [AND NOT overlapExists(kamarBaru, ciBaru, coBaru, :id)]`
| # | Statement |
|---|---|
| 1 | `UPDATE reservations SET … WHERE id = :id AND status = :status [AND NOT overlap]` |
| 2 | (bila harga berubah) `DELETE FROM reservation_nightly_rates WHERE reservation_id = :id AND G`, lalu INSERT ber-chunk `… WHERE G` |
| 3 | (bila kamar/tanggal/harga berubah) `DELETE FROM reservation_rooms … AND G`, lalu INSERT ber-chunk `… WHERE G` |
G tidak bisa berubah nilai di dalam batch (overlap mengecualikan reservasi ini, dan tidak ada statement yang mengubah status), jadi semua statement berlaku atau tidak satu pun. `changes` statement 1 != 1 -> tidak ada yang tertulis: bila ada kamar bentrok -> 409 pesan lama; selain itu status berubah oleh request lain -> 409 "Status reservasi telah berubah…".
Edit metadata saja = satu `UPDATE … WHERE id AND status` (bukan batch).

#### A6. BE-018 — transisi dan tulis multi-baris
- Check-in / check-out / cancel: `UPDATE reservations SET status = :to … WHERE id = :id AND status = :from` + cek `changes`; yang kalah menerima 409 yang sama seperti bila datang belakangan.
- Invoice send / pay / cancel: `UPDATE invoices … WHERE id = :id AND invoice_status = :statusYangDibaca` + cek `changes`.
- Tulis multi-baris dijadikan satu batch: invoice create (header + item, retry bila nomor invoice bentrok UNIQUE), invoice update (hapus item, sisip item, header terakhir; semua dijaga status), invoice delete, user create (user + role), ganti role user, role create (role + izin), ganti izin role, hapus user/role.

#### A7. Temuan teknis penting: `db.batch()` drizzle tidak bisa dipakai
Drizzle 0.45.3 gagal mem-batch SQL mentah berparameter (`db.run(sql…)` di dalam `db.batch` -> `preparedQuery.stmt` undefined -> `TypeError … reading 'bind'`). Tes shim Blok 0 tidak menangkapnya karena memakai SQL tanpa parameter. Karena dependency tidak boleh diubah, `runAtomic` (`src/lib/atomic.ts`) mengompilasi statement dengan dialect drizzle (`SQLiteAsyncDialect.sqlToQuery` / `builder.toSQL()`) lalu memanggil `D1Database.prepare(sql).bind(...).batch` secara langsung melalui `db.$client`. Teks SQL dan parameter tetap dihasilkan drizzle (escaping/binding sama), dan yang dipakai adalah API batch D1 yang terdokumentasi.

---

### B. HASIL

| ID | Status | Sebelum -> sesudah | Bukti |
|---|---|---|---|
| BE-015 | FIXED | dua create bersamaan untuk kamar+malam sama: 201 + 201 (2 booking) -> tepat satu 201, lainnya 409 dengan pesan konflik lama; untuk SEMUA offset PoC 0-30 ms, 5 request simultan rentang tumpang-tindih sebagian, booking multi-kamar all-or-nothing | `tests/atomicity.test.ts` (5 tes) |
| BE-016 | FIXED | edit ke tanggal terisi: 409 tetapi tarif baru tertinggal (header 200k vs calc 300k) -> 409 dan header/tarif/kamar identik byte-per-byte; kegagalan storage di tengah edit/create di-rollback total; dua edit bersamaan ke kamar sama: satu menang; edit vs booking baru: tidak pernah keduanya | 6 tes |
| BE-018 | FIXED | pay vs cancel sama-sama 200 (Cancelled+Paid) -> 200 + 409 dan baris akhir konsisten; check-in vs cancel, double check-in/out, double send/pay: satu pemenang; edit vs cancel tidak bisa meninggalkan cancelled dengan total != 0; tulis multi-baris all-or-nothing (invoice create/update, role user, izin role) | 9 tes |
| BE-029 | FIXED | create bersamaan untuk kamar BERBEDA: 201 + 500 -> semua 201 dengan kode berbeda; urutan `RSV-YYYY-016, 017` pada create berurutan tidak berubah | 2 tes |
| BE-030 | DEFERRED | tidak diubah (butuh kolom/keputusan semantik) | rules 4C |

Tes baru ditulis dan DIJALANKAN lebih dulu pada kode Blok 4: 18 dari 23 gagal (membuktikan cacat), setelah perbaikan 23/23 lulus, stabil 3 kali berturut-turut. Emulasi konkurensi: latency per statement di shim (`setShimLatency`, default 0), satu batch = satu jeda lalu atomik.
Golden happy-path (12 snapshot), contract (34), role matrix, anggaran query: **tidak diubah, lulus** (urutan baris kamar/tarif/item dalam respons identik).

### C. Jumlah statement D1 (sebelum Blok 5 -> sesudah)
| Operasi | Sebelum | Sesudah |
|---|---|---|
| POST /reservations (1 kamar) | 19 | **15** |
| POST /reservations (2 kamar) | 20 | **15** |
| POST /reservations yang ditolak 409 | 7 | 11 (jalur gagal: generate kode + batch + query pesan) |
| PATCH catatan saja | 14 | 13 |
| PATCH payload lengkap wizard | 23 | **18** |
| PATCH ganti kamar | 19 | 16 |
| check-in / check-out | 11 | 11 |
| invoice create (2 item) / update | 13 / 14 | 12 / 13 |
| invoice send / pay | 10 | 10 |
| user create / ganti role | 10 / 15 | 10 / 14 |
| role create (3 izin) / ganti izin | 17 / 17 | 13 / 15 |
Anggaran `POST /reservations` di `tests/budgets/query-budget.test.ts` diturunkan 19 -> 15 (baseline tetap 19). Satu-satunya kenaikan adalah jalur PENOLAKAN create (+4), bukan jalur sukses.

### D. Batasan baru (teknis, tidak mengenai operasi sah)
- Maksimal 60 kamar per reservasi (422 "Maksimal 60 kamar per reservasi.") agar statement bersyarat selalu <= 100 parameter. Inventaris saat ini 21 kamar.

### E. Berkas yang berubah
`src/lib/atomic.ts` (baru), `src/services/reservationService.ts`, `invoiceService.ts`, `userService.ts`, `roleService.ts`; tes: `tests/atomicity.test.ts` (baru, 23 tes), `tests/helpers/fake-d1.ts` (+latency opsional), `tests/budgets/query-budget.test.ts` (anggaran turun). Tidak ada perubahan: frontend, config, migrations, dependency, golden/contract.

### F. Risiko residual dan yang TIDAK terverifikasi
1. **Belum diuji di D1 nyata.** Shim = better-sqlite3 dengan batch dalam satu transaksi sinkron. Semantik yang diandalkan (statement atomik, batch transaksional, `meta.changes`, `VALUES … column1`, `db.$client`) terdokumentasi/standar SQLite, tetapi uji di staging tetap disarankan: dua `POST /api/reservations` bersamaan harus menghasilkan satu 201.
2. Dua edit bersamaan atas reservasi yang SAMA tanpa konflik kamar: penulis terakhir menang (masing-masing batch tetap utuh). Tidak ada optimistic locking (butuh kolom versi = S1).
3. Baris audit (`activities`) ditulis SETELAH mutasi, di luar batch: mutasi bisa sukses sementara penulisan audit gagal (500 setelah data berubah). Sama seperti sebelum Blok 5.
4. Retry klien/duplikasi request (idempotency key) tidak ditangani — bukan bagian temuan.
5. Proteksi admin-terakhir (Blok 2) masih cek-lalu-tulis; penggantian role sendiri kini atomik, tetapi hitungan "admin lain" tidak ada di dalam statement.
6. `getBookedRoomIds`/list masih N+1 (BE-027, Blok 7); `enumerateNights` masih zona waktu runtime (BE-026, Blok 7).

---

## Laporan Blok 6 — Invoice Lifecycle, Reports, Money (Sonnet 5.5, Medium)

**Status: SELESAI.** Backend `tsc --noEmit` lulus; `vitest run`: **397 lulus / 0 gagal (30 file)** (Blok 5: 379).
**Snapshot:** `snapshot-block-6\` (dibuat SEBELUM edit pertama).
**Restore (satu baris):** `Remove-Item backend\src,backend\tests -Recurse -Force; Copy-Item .tmp-fix\snapshot-block-6\backend\* backend\ -Recurse -Force`

### 1. Per temuan
| ID | Status | Sebelum -> sesudah | Bukti |
|---|---|---|---|
| BE-019 | FIXED | DELETE invoice Paid/Sent/Cancelled: 204 (riwayat hilang, nomor dipakai ulang) -> 409 + pesan "Hanya invoice Draft yang dapat dihapus ... batalkan (cancel)"; Draft tetap 204. Hapus bersifat bersyarat (`WHERE invoice_status='Draft'`) dalam satu batch; penolakan tidak menulis audit | `tests/invoice-lifecycle.test.ts` (4 tes) |
| BE-020 | FIXED | create dengan Completed+Paid / Sent / Partial: 201 -> 422; PATCH Sent -> Draft+Paid: 200 -> 422. Nilai default (create) atau nilai yang sama dengan tersimpan (PATCH) diterima sebagai no-op; send/pay/cancel tidak berubah | 5 tes |
| BE-022 | FIXED (additif) | Laporan lama TIDAK diubah (Draft tetap dihitung sebagai sales, terdokumentasi). Angka eksplisit: `GET /api/reports/revenue` (billed/paid/unpaid/count/netBilled/netPaid) dan `GET /api/sales/summary` (+ per sumber). Batas tanggal inklusif diuji di invoices, sales, summary, revenue, expenses | 4 + 1 tes |
| BE-031 | FIXED | tanpa batas -> qty <= 10.000, harga/jumlah/tarif/DP <= Rp10 miliar, subtotal invoice <= Rp1 triliun (cek `isSafeInteger`); "1e21", "Infinity", > 2^53 ditolak 422; nilai pada batas dan nilai seed terbesar (Rp45 juta, 28 x Rp1,2 juta) diterima | 4 tes |

### 2. Keputusan yang perlu dikonfirmasi pemilik
1. **D-032 — endpoint baru, bukan field baru.** Prompt: "laporan menambah angka billed vs paid secara additif". Menambah field ke `/reports/summary` atau `/sales` akan mengubah respons yang dikunci golden snapshot Blok 0 (tidak boleh diedit). Karena itu angka baru ada di `/reports/revenue` dan `/sales/summary`; respons lama persis sama.
2. **D-033 — invoice `Sent` masih bisa diedit** (nama, item, diskon) selain statusnya. BE-020 menyarankan mengunci semuanya setelah Sent, tetapi rules 4B hanya mencantumkan status/delete dan mengunci Sent membutuhkan keputusan produk. Perubahan kini tercatat before/after di audit (Blok 3).
3. **Overdue/Partial tidak bisa lagi diset** lewat create/PATCH (tidak ada endpoint aksi). Nilai tersimpan tetap terbaca. Bila fitur pelunasan sebagian dibutuhkan, itu BE-021 (butuh tabel pembayaran).

### 3. Tes yang berubah (semuanya menguji perilaku cacat yang dibalik)
- `golden/known-unsafe.test.ts`: BE-019, BE-020 dibalik; BE-022 diganti menjadi dokumentasi perilaku legacy + cek endpoint baru.
- `finance.test.ts`: "accepts the wide frontend status literals" -> kini 422 (default tetap diterima); tes audit menghapus Draft, invoice Paid kini 409.
- `audit-trail.test.ts`: tes before/after menghapus Draft (bukan invoice yang sudah dibatalkan).
Golden happy-path (12 snapshot), contract (34), role matrix, query budget (26): tidak diubah, lulus.

### 4. Query count
Endpoint yang ada tidak berubah (anggaran lulus tanpa penyesuaian). `/reports/revenue`: 2 statement + autentikasi; `/sales/summary`: 1 statement + autentikasi.

### 5. Kontrak untuk integrasi FE masa depan
Ditulis di `.tmp-fix\contract.md` bagian 7 (endpoint, perubahan, batas nilai, perilaku Overdue/Partial). FE belum memanggil endpoint finance (FE-001), jadi tidak ada call site yang terpengaruh.

### 6. Berkas yang berubah
`src/lib/validation.ts`, `src/services/invoiceService.ts`, `reportService.ts`, `salesService.ts`, `src/routes/reports.ts`, `src/routes/sales.ts`; tes: `tests/invoice-lifecycle.test.ts` (baru, 18 tes), `tests/finance.test.ts`, `tests/audit-trail.test.ts`, `tests/golden/known-unsafe.test.ts`. Tidak ada perubahan: frontend, config, migrations, dependency.

### 7. Risiko residual
1. Menghapus Draft dengan nomor tertinggi membuat nomor itu dipakai lagi (alokasi max+1). Draft belum pernah dikirim/dibayar; counter yang tidak pernah mundur butuh tabel (owner/S1).
2. Invoice `Sent` yang bisa diedit (D-033).
3. `reservationId` pada invoice tetap tanpa FK/rekonsiliasi pembayaran (BE-021, deferred).
4. Pembulatan: `total = round(subtotal - subtotal*discount/100)` tidak berubah.

---

## Laporan Blok 7 — Validasi, Waktu, Performa (Sonnet 5.5, High)

**Status: SELESAI.** Backend `tsc --noEmit` lulus; `vitest run`: **421 lulus / 0 gagal (31 file)** (Blok 6: 397).
**Snapshot:** `snapshot-block-7\` (dibuat SEBELUM edit pertama).
**Restore (satu baris):** `Remove-Item backend\src,backend\tests -Recurse -Force; Copy-Item .tmp-fix\snapshot-block-7\backend\* backend\ -Recurse -Force`

### 1. Bukti keluaran identik
Golden happy-path (12 snapshot: urutan list, field, isi), contract (34), matriks role (160 sel) dan seluruh tes lama lulus TANPA diubah setelah N+1 dihapus dan ORDER BY dibuat eksplisit. Satu-satunya tes lama yang disesuaikan: `dashboard.test.ts` (membangun "hari ini" dengan WIB, perilaku BE-026 yang disengaja) dan anggaran query yang diturunkan.

### 2. Per temuan
#### BE-027 — N+1 dan jumlah statement
| Endpoint (DB seed, 15 reservasi) | Sebelum | Sesudah |
|---|---|---|
| POST /auth/login | 7 | 6 |
| GET /auth/me (konteks auth: user + role + izin) | 4 | **2** |
| GET /users?pageSize=100 | 11 | 5 |
| GET /users/:id | 6 | 4 |
| GET /roles?pageSize=100 | 11 | 5 |
| GET /roles/:id | 6 | 4 |
| GET /permissions | 5 | 3 |
| GET /rooms?pageSize=100 | 6 | 4 |
| GET /room-types?pageSize=100 | 6 | 4 |
| **GET /reservations?pageSize=100** | **51** | **6** |
| **GET /reservations?pageSize=10** | **36** | **6** |
| GET /reservations/:id | 7 | 5 |
| **GET /reservations/calendar** | **19** | **4** |
| GET /reservations/availability | 7 | 3 |
| POST /reservations | 19 | 13 |
| **GET /invoices?pageSize=100** | **15** | **5** |
| GET /invoices/:id | 6 | 4 |
| GET /expenses?pageSize=100 | 6 | 4 |
| GET /sales?pageSize=100 | 6 | 4 |
| GET /sales/breakdown | 5 | 3 |
| GET /reports/summary | 8 | 6 |
| GET /reports/top-invoices | 5 | 3 |
| GET /dashboard/overview | 11 | 6 |
| GET /activities?pageSize=100 | 6 | 4 |
Penyebab dan perbaikan:
- **Auth** (setiap request): user dibaca dua kali + 1 query per role. Kini user dibaca sekali dan role+izin lewat SATU query join (`loadAuthContext(db, id, row)`); konteks dibangun sekali per request dan dibagikan ke handler lewat `c.get('auth')` (memo per request, tanpa cache global).
- **Reservasi list**: 3 query per baris -> 1 query `IN (...)` untuk tarif dan 1 untuk kamar per 90 id (100 baris = 2 chunk). Jumlah statement kini konstan terhadap ukuran halaman (diuji: 2 vs 9 baris sama).
- **Calendar**: kamar per baris -> satu query per 90 id; **availability**: loop per reservasi -> satu join; **invoices**: item per invoice -> satu query; **users/roles**: role/izin per baris -> satu query; `assertRolesExist`/`assertPermissionsExist`: satu query bukan satu per id; dashboard: 7 -> 3 query + recent.
- Pada rencana Free (50 query/invocation) daftar reservasi 100 baris dulu ≈ 306 query -> kini 6.

#### BE-035 — urutan eksplisit
Tidak ada yang beralih ke newest-first. Urutan efektif sebelumnya diperiksa dengan `EXPLAIN QUERY PLAN` untuk setiap kombinasi filter: tanpa filter / filter kesetaraan pada kolom ber-indeks / LIKE -> urutan sisip (rowid); filter rentang tanggal saja -> urutan indeks tanggal. Itu yang dibuat eksplisit:
| List | ORDER BY |
|---|---|
| users, roles, rooms, room-types | `rowid` |
| reservations | `rowid`; hanya filter `date` (tanpa status/source): `check_in_date, check_out_date, rowid` |
| invoices | `rowid`; hanya rentang `start/end` (tanpa status/payment): `invoice_date, rowid` |
| expenses | `rowid`; hanya rentang (tanpa category/status): `date, rowid` |
| sales | `rowid`; rentang: `invoice_date, rowid` |
| calendar | `check_in_date, check_out_date, rowid` |
| activities | tidak berubah (`created_at DESC, id DESC`) |
| availability | `check_in_date, check_out_date, rowid` reservasi lalu `rowid` kamar |
Tie-breaker `rowid` unik dan stabil. Dikunci tes (setiap query baris punya ORDER BY) dan golden (urutan identik).

#### BE-026 — hari bisnis WIB
`lib/time.ts` (`todayInJakarta`, `yearInJakarta`, UTC+7 tanpa DST) dipakai oleh: dashboard (`today`, tile check-in/upcoming), `GET /invoices/next-number` (default tanggal), kode reservasi (`RSV-YYYY-`, termasuk fallback). Timestamp tersimpan tetap UTC ISO; format tanggal tersimpan tidak berubah. Diuji pada batas 16:59Z/17:00Z dan pergantian tahun (2026-12-31T20:00Z -> 2027).
Catatan: `enumerateNights` memakai kalender runtime (UTC di Workers) hanya untuk aritmetika `YYYY-MM-DD`, bukan untuk "hari ini".

#### BE-009 — validasi
- Batas string/array (`LIMITS` di `validation.ts`): nama 100, email 254, password 128, deskripsi 500/2000, kode 30, id 100, pencarian 100, filter 50, `page` 100.000; array: roles 20, izin 200, fasilitas 50, gambar 20, item invoice 100, kamar 60; kategori laporan 20 entri / 500 karakter.
- Data seed terpanjang 53 karakter dan array terbesar 26 izin; nilai pada batas atas diterima (diuji), nilai seed/FE tidak ada yang ditolak.
- `GET /api/sales/breakdown` kini lewat zod (`start/end` tanggal nyata, `end >= start`); tanpa parameter = tanpa batas seperti sebelumnya.
- `categories` > 20 -> 422 (sebelumnya 150 kategori -> `IN` > 100 parameter -> 500). Tanggal laporan juga divalidasi tanggal nyata.
- Pencarian LIKE memakai `ESCAPE '\'`: `%`, `_`, `\` literal (users, roles, rooms, room-types, reservations, invoices, expenses, activities).
- Statement tulis tetap < 100 parameter lewat chunk (Blok 5) dan batas array di zod.

### 3. Perubahan perilaku yang terlihat klien (hanya input tidak sah/ekstrem)
1. Pencarian yang mengandung `%` atau `_` kini mencari karakter itu, bukan wildcard.
2. Nilai di atas batas LIMITS ditolak 422 (belum ada nilai FE/seed yang mendekati).
3. `/sales/breakdown` dengan `start`/`end` tidak valid: 422 (sebelumnya hasil lexicographic acak).
4. Antara 00:00–07:00 WIB: `dashboard.today`, default tanggal next-number, dan tahun kode reservasi mengikuti WIB (sebelumnya hari/tahun UTC sebelumnya).
5. `GET /api/permissions` dan baca lain tidak berubah bentuk.

### 4. Berkas yang berubah
`src/lib/time.ts` (baru), `src/lib/sql.ts` (baru), `src/lib/validation.ts`, `src/lib/pricing.ts`, `src/middleware/auth.ts`, `src/services/{identity,dashboard,reservation,invoice,expense,sales,user,role,room,roomType,activity}Service.ts`, `src/routes/{invoices,reports,sales}.ts`; tes: `tests/performance-time-validation.test.ts` (baru, 30 tes), `tests/budgets/query-budget.test.ts` (anggaran turun, baseline tetap), `tests/dashboard.test.ts` (tanggal WIB), `tests/invoice-lifecycle.test.ts` (satu fixture). Tidak ada perubahan: frontend, config, migrations, dependency, golden/contract.

### 5. Risiko residual
1. **Urutan efektif ditentukan dari perilaku planner SQLite saat ini** (rowid atau indeks tanggal). Implementasi eksplisit menirunya untuk kombinasi filter yang diuji; kombinasi langka dengan beberapa indeks yang saling bersaing (mis. status + payment + rentang) memakai `rowid` seperti yang dipilih planner pada data seed. `rowid` bisa berubah bila tabel di-VACUUM/diimpor ulang di luar aplikasi.
2. `getCalendar` belum dibatasi rentang (temuan menyarankan maks 62 hari); jumlah statement kini konstan per 90 reservasi sehingga bukan lagi masalah query, tetapi ukuran respons tetap tak terbatas.
3. `enumerateNights` bergantung zona waktu runtime (UTC pada Workers; konsisten).
4. Pencarian menjadi literal untuk `%`/`_`; bila ada pengguna yang sengaja memakai wildcard, perilaku itu hilang (tidak ada pemakaian di FE).
5. Batas array item invoice 100 (seed maks 18) dan 60 kamar per reservasi; permintaan lebih besar harus dipecah.

---

## Laporan Blok 8 — Perbaikan Logika Frontend, Non-UI (Sonnet 5.5, Medium)

**Status: SELESAI.** 8 dari 8 item. FE-004 dikerjakan setelah pemilik memilih opsi (a) pada STOP-AND-ASK S5 (pakai komponen `ErrorState` yang sudah ada, inline).
**Snapshot:** `snapshot-block-8\` (`frontend\src`, `vite.config.ts`, `eslint.config.js`; dibuat SEBELUM edit pertama).
**Restore (satu baris):** `Remove-Item frontend\src -Recurse -Force; Copy-Item .tmp-fix\snapshot-block-8\frontend\src frontend\src -Recurse -Force; Copy-Item .tmp-fix\snapshot-block-8\frontend\vite.config.ts,.tmp-fix\snapshot-block-8\frontend\eslint.config.js frontend\`

### 1. Ringkasan per item
| Item | Status | Perubahan |
|---|---|---|
| 8.1 FE-003 | FIXED | `apiFetch`: 401 pada panggilan ber-token -> hapus token + handler (`AuthProvider` -> LOGOUT) **sekali** per sesi; `ProtectedRoute` mengarahkan ke `/login?returnTo=<halaman>`; `LoginPage`/`PublicOnlyRoute` memakai `returnTo` (aman: hanya path internal, bukan `//`, bukan halaman auth). Panggilan login tidak mengirim token sehingga tidak memicu handler. `restoreSession` hanya menghapus token pada 401 (error jaringan/5xx tidak). `getMyPermissions` melempar error (store mempertahankan izin terakhir) |
| 8.2 FE-004 | FIXED (opsi a, disetujui pemilik) | `reservationService.checkIn/checkOut/cancel` kini menolak dengan `ApiError` asli (status + pesan) alih-alih `false`; method baru aditif `fetchFullById` (hanya 404 = `undefined`, error lain menolak) dipakai `ReservationDetailPage`. `ReservationDetailPage`, `CheckInButton`, `CheckOutButton` menangkap error dan menampilkannya dengan `ErrorState` yang sudah ada (inline, hanya saat error); sukses tetap menutup dialog + reload. Kegagalan memuat (bukan 404) menampilkan `ErrorState` dengan tombol "Coba Lagi" (404 tetap layar "Reservation not found"). `getFullById`/`getById` lain TIDAK diubah (banyak call site tanpa catch) |
| 8.3 FE-005 | FIXED | `src/utils/localDate.ts` (baru): `toLocalISODate`, `todayLocalISO`, `shiftISODate`. Dipakai di `ReportPage`, `SalesPage` (hari ini nyata + format lokal), `DashboardPage` (fallback today + bucket mingguan), `InvoiceFormPage` (tanggal default + tahun nomor), `formatUtils` (`'iso'`). Tidak ada lagi `2026-09-15` / `toISOString().split('T')[0]` di `src` (di luar data mock dan stempel waktu `createdAt`) |
| 8.4 FE-006 | FIXED | `authStore.login/register` tidak lagi menyalakan `isLoading` global (hanya untuk restore sesi awal); `LoginPage`/`RegisterPage` memakai state `submitting` lokal -> form tidak ter-unmount, input tidak hilang. Teks tombol sama ("Loading..." / "Creating Account...") |
| 8.5 FE-002 | FIXED | `fetchAllPages` di `api.ts`; dipakai oleh `reservationService`, `roomService`, `roomTypeService`, `userService`, `roleService`, `activityService` (`getAll`, `getByCategory`, `getByUser`). Bentuk keluaran identik (array). Halaman/komponen tidak disentuh |
| 8.6 X-005 | FIXED | `authService.login`: 401 "Invalid email or password" tetap `null` (teks store sama); 401 lain (mis. "User is inactive") dan 429 dilempar sehingga `apiErrorMessage` menampilkan pesan backend apa adanya. Tanpa teks baru |
| 8.7 FE-008 | FIXED | `vite.config.ts`: `sourcemap: 'hidden'`. Fallback URL API TIDAK dibuat melempar |
| 8.8 FE-010 | FIXED (terbatas) | `eslint.config.js`: globals Node untuk skrip root dan `.tmp-responsive`; `authStore` memakai `ApiUser` (bukan `any`). Mass cleanup tidak dilakukan |

### 2. Verifikasi
| Pemeriksaan | Baseline (Blok 0) | Sekarang |
|---|---|---|
| Frontend `tsc --noEmit` | lulus | **lulus** |
| ESLint | 197 error / 319 warning | **43 error / 316 warning**; tidak ada file yang memburuk (`no-undef` 195 -> 41 sisa, semua di salinan snapshot `.tmp-responsive`) |
| Build produksi (ke `.tmp-fix\fe-dist-block8`) | JS 1.845.006 B (85 berkas), entry 249,97 kB | **JS 1.843.955 B** (87 berkas, -1.051 B), entry ~250,9 kB; bundel tanpa komentar `sourceMappingURL`, 86 berkas `.map` terpisah |
| Pemeriksaan logika murni (`.tmp-fix\fe-logic-check.mjs`, zona WIB) | - | **18/18 lulus**: tanggal lokal vs UTC (bug 2026-08-31 direproduksi), shift tanggal, `returnTo` aman, fetch-all-pages (250 baris = 3 request; <=100 baris = 1 request; cap; error halaman ke-n menolak), 401 sekali + re-arm setelah login, login tidak memicu handler, error jaringan/5xx tidak logout, restoreSession, getMyPermissions, X-005, aksi reservasi menolak dengan ApiError asli, `fetchFullById` 404/5xx |
| Backend `tsc` + `vitest` | 282 lulus | **421 lulus / 0 gagal** (tidak ada perubahan backend di blok ini) |

Perdagangan FE-002: daftar >100 baris kini butuh beberapa request berurutan (1 request per 100 baris; kasus <=100 baris tetap 1 request). Batas pengaman: 20 halaman (2.000 baris) per layanan, **10 halaman (1.000 baris terbaru)** untuk activities karena log audit tumbuh cepat (Blok 3). Urutan stabil mengandalkan `ORDER BY` backend (Blok 7); terhadap backend lama (urutan tak dijamin) tetap berfungsi tetapi baris bisa saja tumpang-tindih/terlewat antar halaman.

### 3. FE-004 — keputusan S5 dan penerapannya
Pemeriksaan awal: tidak ada mekanisme tampil-error yang sudah ada untuk aksi check-in/check-out/cancel (`ErrorState` ada di `components/shared` tetapi belum dipakai; tidak ada toast/banner), sehingga menampilkan pesan dihitung sebagai elemen visual baru (S5). Pemilik memilih **opsi (a)**: pakai `ErrorState` yang sudah ada, inline di `ReservationDetailPage` dan dialog Check-In/Out.
Yang tampil baru (hanya saat error): satu `ErrorState` dengan deskripsi = pesan backend apa adanya (mis. "Cannot check in from status 'checked-in'."). Judul memakai teks bawaan komponen ("Terjadi Kesalahan"); tidak ada teks baru yang saya tulis. Catatan: `ErrorState` bertinggi minimum 200 px, jadi blok error cukup besar; bila terasa terlalu besar, itu keputusan desain komponen (di luar blok ini).
`CheckInButton`/`CheckOutButton` saat ini tidak dirender di halaman mana pun (komponen yatim); tetap diperbarui supaya tidak ada pemanggil `checkIn/checkOut` yang menelan penolakan.

### 4. LAPORAN NETRALITAS UI (setiap berkas frontend yang berubah)
Perbandingan hunk-level terhadap snapshot (`.tmp-fix\b8-diff.txt`). Klasifikasi: **logic-only** = state/handler/pengambilan data/fungsi tanggal; **UI** = JSX/markup/className/style/CSS/teks/ikon/aset. Hasil: **0 hunk UI yang tidak disetujui**; satu-satunya tambahan render adalah `ErrorState` kondisional untuk FE-004 (disetujui, opsi a).
| Berkas | Hunk | Klasifikasi |
|---|---|---|
| `components/ProtectedRoute.tsx` | import, `useLocation`, target `navigate` + `returnTo` | logic-only |
| `components/PublicOnlyRoute.tsx` | import, `useLocation`, target `<Navigate>` memakai `returnTo` | logic-only (nilai prop `to`, markup sama) |
| `components/pms/CheckInButton.tsx`, `CheckOutButton.tsx`, `pages/reservations/ReservationDetailPage.tsx` | state + try/catch + render kondisional `<ErrorState>` (komponen yang sudah ada, hanya saat error); `fetchFullById` | logic-only; **satu elemen kondisional yang disetujui pemilik (opsi a)** — satu-satunya perubahan render, hanya muncul saat error |
| `pages/LoginPage.tsx` | state `submitting`, handler submit, `returnTo`; di JSX hanya ekspresi `disabled={...}` dan kondisi label menunjuk `submitting` | logic-only (binding; teks, struktur, style tidak berubah) |
| `pages/RegisterPage.tsx` | sama seperti LoginPage | logic-only |
| `pages/DashboardPage.tsx` | sumber `today`, perhitungan kunci bucket mingguan | logic-only |
| `pages/finance/ReportPage.tsx`, `SalesPage.tsx` | `getDateRange` memakai hari nyata + formatter lokal | logic-only |
| `pages/finance/InvoiceFormPage.tsx` | nilai default tanggal & tahun nomor | logic-only |
| `services/api.ts`, `authService.ts`, `activityService.ts`, `reservationService.ts`, `roomService.ts`, `roomTypeService.ts`, `userService.ts`, `roleService.ts` | 401/paging/error | logic-only |
| `stores/authStore.tsx` | handler 401, tidak toggle `isLoading` saat submit, tipe `ApiUser` | logic-only |
| `utils/formatUtils.ts` | format `'iso'` lokal | logic-only |
| `utils/localDate.ts`, `utils/returnTo.ts` (baru) | helper murni | logic-only |
| `vite.config.ts` | `sourcemap: 'hidden'` | config yang diizinkan (FE-008) |
| `eslint.config.js` | blok `globals` | config yang diizinkan (FE-010) |
Tidak ada perubahan: CSS, className, style, teks tampilan yang ditulis sendiri, ikon/aset, halaman publik, struktur menu/route, komponen bersama (`ErrorState` dipakai apa adanya). File `utils/dateUtils.ts` yang sudah ada sempat tertimpa oleh kesalahan saya lalu DIPULIHKAN dari snapshot (hash identik); helper baru dipindah ke berkas bernama `localDate.ts`.

### 5. Kompatibilitas backend lama dan baru
- 401 handling: backend lama dan baru sama-sama 401 pada token tak valid -> perilaku identik.
- Login 401 "User is inactive": ada di backend lama maupun baru; 429 hanya di backend baru (Blok 1) dan tampil lewat `message`.
- Paging: dua versi backend menerima `page`/`pageSize` (<=100). Backend baru memberi urutan deterministik (Blok 7); backend lama urutan tak dijamin.
- Tanggal: tidak bergantung backend.
- `returnTo`, `submitting`, sourcemap: murni sisi klien.

### 6. Dampak yang terlihat
1. Halaman Laporan/Penjualan memakai hari nyata (bukan 15 Sep 2026): preset "Bulan Ini"/"Hari Ini" kini menunjuk periode sebenarnya. Data finance masih MOCK (FE-001) dengan tanggal September 2026, sehingga preset periode yang tidak mencakup September 2026 akan tampak kosong sampai finance terhubung ke API.
2. Setelah sesi berakhir, pengguna dikembalikan ke halaman yang sama setelah login ulang.
3. Form login tidak lagi kosong setelah salah ketik.
4. Daftar yang >100 baris kini lengkap (dengan batas pengaman).

### 7. Catatan / risiko
1. **`frontend\vite.config.js` (artefak hasil `tsc -b`) masih berisi `sourcemap: true`.** `vite` memilih `.js` sebelum `.ts` bila dijalankan langsung; `npm run build` menjalankan `tsc -b` lebih dulu yang membuat ulang `.js` dari `.ts`. Jika build dijalankan dengan `vite build` langsung, hasilnya masih sourcemap publik. Berkas `.js` itu di luar scope tulis (tidak diubah). Verifikasi: build dengan `--config vite.config.ts` menghasilkan bundel tanpa referensi map.
2. Handler 401 menggunakan satu flag per sesi; bila tab lain login ulang token baru dipakai tab ini pada panggilan berikutnya (token dibaca per request).
3. `.tmp-responsive` (milik workstream UI) tetap diabaikan dari perubahan kecuali konfigurasi globals ESLint.
4. FE-007, X-001, X-006, `/register`, FE-009, JSON kredensial mock, FE-001: tidak dikerjakan (di luar blok ini).

---

## Blok 9A — Catatan Desain FE-001: integrasi finance FE ke API (Opus 5.5, High)

**Tidak ada berkas kode yang diubah di 9A.** Sumber: `frontend/src/services/{invoice,expense,sales,report}Service.ts`, halaman pemakainya, `backend/src/routes|services`, `.tmp-fix/contract.md` §7 (kontrak finance setelah Blok 6).

### 0. Ringkasan satu paragraf
Keempat layanan finance FE adalah kelas **sinkron** di atas JSON mock; 9 berkas memanggilnya langsung saat render. Backend sudah menyediakan semua yang dibutuhkan, dan bentuk datanya hampir sama. Yang berat bukan pemetaan endpoint, melainkan (1) mengubah 9 pemakai dari sinkron menjadi async, (2) tidak adanya mekanisme loading/error di halaman finance, dan (3) dua kontradiksi nyata antara form FE dan aturan backend Blok 6 (status invoice, dan diskon nominal vs persen). Rekomendasi saya: **kerjakan sebagian (Tahap 1: baca) sekarang, tunda tulis sampai tiga keputusan UI di §3 dijawab** (lihat §5).

### 1. Pemetaan fungsi layanan -> endpoint

#### 1.1 `invoiceService`
| Fungsi FE (sinkron) | Pemakai | Endpoint pengganti | Selisih bentuk / catatan |
|---|---|---|---|
| `getAll(): Invoice[]` | InvoiceListPage, ReportPage, DashboardPage, InvoiceFormPage (hitung nomor), ReservationListPage (peta reservasi->invoice), DayReservationsPopup | `GET /api/invoices` (paging <=100) lewat `fetchAllPages` | Bentuk baris sama (`id, invoiceNumber, reservationId?, guestName, source, invoiceDate, items[], subtotal, discount, total, paymentStatus, invoiceStatus, createdAt, updatedAt`). `totalPaid` TIDAK ada di backend -> `utils/invoicePayment.ts` jatuh ke `paymentStatus` (sudah didukung). Izin: `finance.invoice.view` |
| `getById(id)` | InvoiceDetailPage, InvoiceFormPage (6x saat render), InvoiceListPage | `GET /api/invoices/:id` (404 -> `undefined`) | Dipanggil berulang saat render -> harus menjadi satu state |
| `getByStatus`, `getByPaymentStatus`, `getBySource`, `getSourceBreakdown` | tidak dipakai halaman | `?status=`, `?payment=`, `?source=`, `/api/sales/breakdown` | cukup dipertahankan sebagai filter di klien atas `getAll` |
| `create(data)` | InvoiceListPage, InvoiceFormPage | `POST /api/invoices` | FE mengirim `id` item, `invoiceId`, `subtotal`, `total`, `invoiceStatus`, `paymentStatus`. Backend hanya menerima `invoiceNumber?, reservationId?, guestName, source, invoiceDate, items[{description,quantity,unitPrice}], discount` dan MENGHITUNG ULANG total. **Kontradiksi A (status)** dan **B (diskon)**, lihat §1.5. Izin `finance.invoice.create` |
| `update(id, updates)` | InvoiceListPage, InvoiceFormPage | `PATCH /api/invoices/:id` | sama seperti create; invoice `Completed`/`Cancelled` -> 409. Izin `finance.invoice.update` |
| `delete(id)` | InvoiceListPage | `DELETE /api/invoices/:id` | **Hanya Draft** (Blok 6); selain itu 409 dengan pesan. Izin `finance.invoice.delete` |
| `send(id)` / `markPaid(id)` / `cancel(id)` | InvoiceDetailPage | `POST /:id/send` / `/pay` / `/cancel` | kembalian `boolean` -> respons invoice; yang kalah balapan/ilegal 409 |

#### 1.2 `expenseService`
| Fungsi | Pemakai | Endpoint | Catatan |
|---|---|---|---|
| `getAll()` | ExpensesPage, ReportPage, SalesPage, DashboardPage | `GET /api/expenses` + `fetchAllPages` | bentuk sama (`status` selalu ada di backend). Izin `finance.expense.view` |
| `create(data)` | ExpensesPage | `POST /api/expenses` | `category` harus salah satu dari 8 enum; `amount` 1..10 miliar. Izin `finance.expense.create` |
| `getById`, `getByCategory`, `getByStatus`, `getTotalByPeriod`, `update`, `delete` | tidak dipakai UI | `GET/PATCH/DELETE /api/expenses/:id` | bisa dipetakan tetapi tidak ada pemakai |

#### 1.3 `salesService`
| Fungsi | Pemakai | Endpoint | Catatan |
|---|---|---|---|
| `getAll()` | SalesPage, ReportPage, DashboardPage | `GET /api/sales` + `fetchAllPages` | Bentuk sama (`id, date, amount, source, description, invoiceId, reservationId?`). **Isi berbeda:** mock `sales.json` adalah tabel tersendiri; backend MENURUNKAN sales dari invoice non-Cancelled (Draft/Sent ikut dihitung = "ditagihkan"). Izin `finance.sales.view` |
| `getSourceBreakdown`, `getSummary`, `getByDateRange`, `getTotalByPeriod`, `getById`, `getBySource`, `create` | tidak dipakai halaman | `/api/sales/breakdown`, `/api/sales/summary` | `create` tidak punya padanan (sales tidak bisa ditulis); dibiarkan |

#### 1.4 `reportService` dan dashboard
- `reportService` **tidak dipakai halaman mana pun** (ReportPage menghitung sendiri dari tiga `getAll`). Tidak perlu disentuh; `/api/reports/summary|revenue|top-invoices` tersedia bila kelak ingin perhitungan server.
- `DashboardPage.tsx:87-89` (`sales`, `invoices`, `expenses`) -> tiga `getAll` di atas. Dipakai untuk: Omzet Hari Ini/Bulan Ini, Invoice Tertunda/overdue/paid, grafik pendapatan vs pengeluaran. **Semua pengguna dashboard memanggilnya, termasuk Staff/Reception yang tidak punya izin finance** -> backend menjawab 403.

#### 1.5 Dua kontradiksi form FE vs backend (inti keputusan)
**A. Status invoice.** `InvoiceForm` punya dua `<Select>` (Invoice Status: Draft/Sent/Completed/Cancelled; Payment Status: Pending/Paid/Overdue/Partial) dan mengirim keduanya. Sejak Blok 6 backend menolak (422) status selain `Draft`/`Pending` pada create dan setiap PERUBAHAN status pada PATCH.
- Opsi A1 (netral UI, di lapisan service): kirim create/PATCH TANPA status, lalu terjemahkan pilihan form menjadi aksi: `Sent` -> `/send`, `Completed`+`Paid` -> `/pay`, `Cancelled` -> `/cancel`. `Overdue`/`Partial` dan transisi mundur (Sent -> Draft) tidak punya padanan -> ditolak dengan pesan error. Kelemahan: 2 request tidak atomik (invoice bisa tersimpan sebagai Draft lalu aksinya gagal), dan butuh tempat menampilkan error.
- Opsi A2 (perubahan UI = S5): hilangkan/nonaktifkan dua Select itu di form; status hanya lewat tombol Send/Mark Paid/Cancel yang sudah ada di InvoiceDetailPage.
**B. Diskon.** `InvoiceFormPage` menghitung diskon sebagai PERSEN (`subtotal * discount / 100`), `InvoiceListPage` menghitungnya sebagai NOMINAL (`subtotal - discount`), form memvalidasi 0..100, backend memakai PERSEN dan menghitung ulang. Dengan API nyata total SELALU dari server (persen) -> angka invoice yang dibuat lewat modal di halaman daftar akan berbeda dari yang ditampilkan mock hari ini (ini perbaikan bug, tetapi terlihat).

### 2. Per halaman: sinkron hari ini? apa yang berubah? bisakah pakai komponen yang sudah ada?
"Loading/error yang sudah ada" di aplikasi: halaman ber-API memakai teks inline `{loadError && <p role="alert">...}` dan `emptyMessage="Loading ..."` pada tabel; `ErrorState`/`Loading` ada di `components/shared`; `ErrorState` sudah dipakai di ReservationDetailPage (Blok 8, disetujui). **Halaman finance saat ini tidak punya satu pun**, kecuali `InvoiceListPage` yang punya banner `feedback` (hijau, `role="status"`).
| Berkas | Hari ini | Perubahan logika | Elemen visual baru? |
|---|---|---|---|
| `pages/finance/InvoiceListPage.tsx` (464 baris) | `useMemo(() => service.getAll())`, create/update/delete sinkron + `feedback` | state `invoices` + effect + `refreshKey`; handler jadi async | **Tidak wajib**: daftar kosong sesaat saat memuat (tabel sudah punya empty state); error tulis bisa memakai banner `feedback` yang SUDAH ada (teks = pesan API). Catatan: banner itu bergaya sukses (hijau) |
| `pages/finance/InvoiceDetailPage.tsx` (117) | `getById` saat render; `send/markPaid/cancel` + `navigate(0)` | state + effect; aksi di-`await` | **Ya untuk error aksi** (mis. 409): tidak ada tempat menampilkan. Saat memuat: tampil "not found" sesaat kecuali ditambah state loading |
| `pages/finance/InvoiceFormPage.tsx` (157) | `getById` 6x saat render untuk `defaultValues`, `getAll().length` untuk nomor | form baru boleh dirender SETELAH data ada (react-hook-form `defaultValues` dibaca sekali) -> perlu gerbang loading; submit async | **Ya**: gerbang loading (boleh `return null`/Loading yang sudah ada) dan tempat error submit (422/409) |
| `pages/finance/ExpensesPage.tsx` (255) | `service.getAll()` saat render; `create` sinkron | state + effect; create async + refetch | error create (422 kategori/amount) tidak punya tempat tampil -> **ya** |
| `pages/finance/SalesPage.tsx` (190) | dua `getAll` saat render | state + effect | tidak wajib (grafik/tabel kosong sesaat) |
| `pages/finance/ReportPage.tsx` (361) | tiga `getAll` saat render; ekspor Excel/PDF dari data itu | state + effect | tidak wajib; ekspor saat data belum termuat menghasilkan laporan kosong (perlu menonaktifkan tombol = perubahan atribut `disabled`, bukan elemen baru) |
| `pages/DashboardPage.tsx` (578) | tiga `getAll` saat render | state + effect; 403 (tanpa izin finance) -> array kosong, tanpa error | tidak ada elemen baru; **angka berubah** (lihat §3) |
| `pages/reservations/ReservationListPage.tsx` | `invoiceService.getAll()` di `useMemo` (peta reservasi -> invoice) | state + effect; 403 -> peta kosong | tidak ada elemen baru; lencana invoice hilang bagi pengguna tanpa izin finance |
| `components/shared/DayReservationsPopup.tsx` | `invoiceService.getAll()` saat render | state + effect; 403 -> kosong | sama |
Bentuk layanan: fungsi harus menjadi `async` (mengembalikan `Promise`) — tidak mungkin mempertahankan tanda tangan sinkron. Nama fungsi dan bentuk hasil bisa dipertahankan. Berkas mock JSON tidak dihapus (masih dipakai skrip seed).

### 3. DAFTAR DAMPAK UI (yang akan terlihat)
#### 3.1 Terlihat, tanpa elemen baru (konsekuensi wajar data nyata)
1. Semua halaman finance, tile omzet/invoice di dashboard, dan grafik pendapatan menampilkan **data D1 nyata**, bukan mock. Pada database baru yang tidak di-seed: kosong.
2. **Sales = turunan invoice** (Draft/Sent ikut): angka "Omzet" mengikuti invoice, bukan `sales.json`.
3. Invoice/expense yang dibuat **bertahan setelah reload** (hari ini hilang).
4. **Pengguna tanpa izin finance (Staff, Reception)**: tile Omzet/Invoice dan grafik pendapatan di dashboard menjadi 0/kosong; lencana invoice di daftar reservasi dan popup hari hilang. Hari ini mereka melihat angka mock.
5. Sesaat setelah halaman dibuka, tabel/grafik kosong sampai data tiba (tanpa spinner bila tidak diizinkan menambah elemen).
6. Total invoice dari modal di halaman daftar mengikuti diskon PERSEN (kontradiksi B).
7. Hapus invoice non-Draft, edit invoice Completed/Cancelled, dan aksi status ilegal kini DITOLAK backend.
8. Nomor invoice bisa berbeda dari yang diketik bila bentrok (backend mengalokasikan nomor berikutnya).
9. `Expenses`: halaman butuh `finance.expense.view`. **Grant izin expense untuk role hanya ada di skrip SEED, bukan di migrasi** -> pada D1 produksi yang tidak di-seed ulang, halaman Expenses akan 403 untuk semua role sampai pemilik memberi izin lewat UI role (aksi pemilik).

#### 3.2 Membutuhkan elemen visual baru atau perubahan UI -> S5, perlu keputusan
| # | Kebutuhan | Pilihan |
|---|---|---|
| U1 | Menampilkan error tulis/aksi di InvoiceDetailPage, InvoiceFormPage, ExpensesPage | (a) `ErrorState` yang sudah ada, inline (pola yang sudah disetujui di Blok 8); (b) teks `role="alert"` seperti halaman rooms/reservations; (c) tidak ditampilkan (gagal senyap = mengulang FE-004, tidak saya sarankan) |
| U2 | Dua Select status di `InvoiceForm` (kontradiksi A) | A1: biarkan Select, terjemahkan ke aksi di service (tanpa perubahan UI, dua request, pilihan Overdue/Partial akan error); A2: hilangkan/nonaktifkan Select (perubahan UI) |
| U3 | Keadaan memuat | (a) tanpa indikator (kosong sesaat); (b) `emptyMessage="Loading..."`/komponen `Loading` yang sudah ada |
| U4 | Banner `feedback` hijau di InvoiceListPage dipakai untuk pesan error | (a) pakai apa adanya (warna sukses untuk error, menyesatkan); (b) varian warna error (perubahan style) |
Label "billed vs paid" (BE-022) tidak bisa ditampilkan tanpa mengubah teks/tile -> tetap deferred (D3).

### 4. Risiko, usaha, urutan, verifikasi
**Usaha:** L (9 berkas pemakai + 3 layanan + tes kontrak). Tahap 1 saja: M.
**Risiko utama:**
1. Volume perubahan di berkas halaman besar (InvoiceListPage 464, DashboardPage 578 baris) yang juga digarap workstream UI -> risiko konflik dan hunk yang sulit dibuktikan "logic-only".
2. Tidak bisa dijalankan e2e oleh agen; perilaku async (race, state basi, form `defaultValues`) hanya terverifikasi lewat tsc + tes kontrak + pemeriksaan logika, bukan di browser.
3. Dua request tidak atomik bila memilih A1.
4. Dashboard: 3 `fetchAllPages` tambahan setiap dibuka (lebih banyak request; pada backend Blok 7 masing-masing 4–5 statement).
5. Izin expense di produksi (lihat §3.1 butir 9).
6. Urutan deploy: FE baru + backend LAMA tetap bekerja untuk baca; untuk tulis, backend lama menerima status di body (FE baru tidak mengirimnya) -> kompatibel. `/reports/revenue` dan `/sales/summary` hanya ada di backend baru -> tidak dipakai.
**Urutan yang disarankan:**
- Tahap 1 (baca saja, netral UI): `expenseService.getAll`, `salesService.getAll`, `invoiceService.getAll/getById` menjadi async + `fetchAllPages`; ubah SalesPage, ReportPage, DashboardPage, ReservationListPage, DayReservationsPopup, InvoiceListPage (baca), InvoiceDetailPage (baca). 403 -> kosong. Tulis tetap ke mock? **Tidak**: mencampur baca-nyata dengan tulis-mock menyesatkan, jadi di Tahap 1 tombol tulis tetap memanggil API hanya di InvoiceListPage (punya `feedback`) dan sisanya ditunda — atau seluruh tulis ditunda dengan konsekuensi create/edit di UI tidak tersimpan (lebih buruk). Lihat rekomendasi.
- Tahap 2 (tulis): invoice create/update/delete + aksi status + expense create, setelah U1/U2/U4 diputuskan.
**Verifikasi tanpa e2e:** tambahkan ke `backend/tests/contract/` tes yang memanggil endpoint dengan PAYLOAD PERSIS yang akan dikirim layanan FE baru (create tanpa status, PATCH tanpa status, urutan create -> send/pay, delete Draft vs non-Draft, list ber-halaman, 403 untuk Staff) dan menegaskan field yang dibaca halaman; pemeriksaan logika dengan fetch tiruan untuk layanan baru (pemetaan status -> aksi, 403 -> kosong, 404 -> undefined); `tsc --noEmit`, ESLint (berkas tersentuh tidak memburuk), build ke `.tmp-fix\fe-dist`, perbandingan ukuran bundel, laporan netralitas UI per hunk.

### 5. Rekomendasi
**Kerjakan sebagian sekarang, dengan batas yang jelas** — bukan tunda seluruhnya, karena FE-001 adalah temuan High (data uang tidak persisten, angka dashboard fiktif), dan bukan kerjakan seluruhnya tanpa keputusan, karena bagian tulis tidak bisa dibuat benar tanpa minimal U1 dan U2.
Usulan konkret untuk 9B:
1. **Baca**: semua pembacaan finance (9 berkas) ke API, 403 -> kosong, tanpa elemen baru (U3 = a).
2. **Tulis**: dikerjakan juga, dengan **U1 = (a) `ErrorState` yang sudah ada** (pola Blok 8), **U2 = A1** (Select dibiarkan; service menerjemahkan ke aksi; Overdue/Partial -> pesan error backend apa adanya), **U4 = (a)** hanya untuk pesan SUKSES seperti sekarang, sedangkan error di InvoiceListPage memakai `ErrorState` yang sama agar tidak berwarna sukses.
3. Bila pemilik TIDAK menyetujui elemen error apa pun (U1 = c): saya sarankan **hanya Tahap baca** yang dikerjakan dan tulis ditunda, dengan catatan bahwa tombol create/edit/hapus/aksi akan tetap menulis ke mock in-memory yang tidak lagi terlihat di daftar (membingungkan) — dalam kasus itu lebih jujur menunda seluruh FE-001.
Yang tetap ditunda apa pun pilihannya: label billed/paid, `totalPaid`/pelunasan sebagian (BE-021), menghapus Select status (A2), perubahan gaya banner.

### 6. Yang saya butuhkan dari pemilik sebelum 9B
- "Lanjut ke Blok 9B" **dengan** pilihan: U1 (a/b/c), U2 (A1/A2), U3 (a/b), U4 (a/b) — atau cukup "sesuai rekomendasi".
- Atau "Lewati Blok 9B".

---

## Laporan Blok 9B — Implementasi FE-001: finance FE ke API nyata (Opus 5.5, High)

**Status: SELESAI.** Keputusan pemilik: U1 = (a) `ErrorState` yang sudah ada, U2 = A1 (Select status dibiarkan, service menerjemahkan ke aksi), U3 = (b) komponen `Loading` yang sudah ada, U4 = (a) banner `feedback` hanya untuk sukses.
**Snapshot:** `snapshot-block-9b\` (`frontend\src`, dua berkas config, `backend\tests`; dibuat SEBELUM edit pertama).
**Restore (satu baris):** `Remove-Item frontend\src -Recurse -Force; Copy-Item .tmp-fix\snapshot-block-9b\frontend\src frontend\src -Recurse -Force; Remove-Item backend\tests\contract\finance-frontend-contract.test.ts`

### 1. Yang dikerjakan
#### Lapisan data (4 layanan; nama fungsi dipertahankan, semuanya kini async)
| Layanan | Sekarang |
|---|---|
| `invoiceService` | `getAll` (`fetchAllPages('/api/invoices')`), `getAllIfPermitted` (403 -> `[]`), `getById` (404 -> `undefined`), `getNextNumber`, `create`/`update` (hanya field yang bisa diedit; total dihitung server), `delete`, `send`/`markPaid`/`cancel` (menolak dengan `ApiError` asli), filter turunan |
| `expenseService` | `getAll`, `getAllIfPermitted`, `getById`, `create`, `update`, `delete`, filter turunan |
| `salesService` | `getAll` (`/api/sales`), `getAllIfPermitted`, turunan; `create` dihapus (sales tidak bisa ditulis; tidak pernah dipakai) |
| `reportService` | formula sama, async (tidak dipakai halaman) |
Berkas mock JSON tidak diubah/dihapus (masih dipakai skrip seed); layanan tidak lagi mengimpornya, sehingga data mock tidak lagi ikut di bundel.
**U2 = A1 (status):** `statusActionFor(current, wanted)` memetakan pilihan Select ke satu aksi: Draft -> Sent = `/send`; Draft/Sent -> Completed+Paid = `/pay`; Draft/Sent -> Cancelled = `/cancel`. `create`/`update` mengirim body TANPA status lalu memanggil aksi itu. Kombinasi tanpa aksi (Overdue, Partial, Paid tanpa Completed, Sent -> Draft, dst.) dikirim DENGAN statusnya agar backend menolak dengan pesannya sendiri (422) dan tidak ada yang tersimpan.

#### Halaman (9 berkas) — hook baru `hooks/useAsyncData.ts` (data + isLoading + error + reload)
| Berkas | Perubahan |
|---|---|
| `pages/finance/InvoiceListPage.tsx` | daftar dari API + refetch lewat `refreshKey` yang sudah ada; create/update/delete async; error simpan tampil di dalam modal, error hapus/muat di halaman (ErrorState); banner `feedback` tetap hanya untuk sukses; detail popup dari daftar yang sudah dimuat |
| `pages/finance/InvoiceDetailPage.tsx` | invoice dari API; `Loading` saat memuat; `ErrorState` (+Coba Lagi) bila gagal memuat; aksi Send/Paid/Cancel async, penolakan (409) tampil lewat ErrorState, sukses tetap reload |
| `pages/finance/InvoiceFormPage.tsx` | edit: invoice dimuat dulu; buat baru: nomor dari `GET /invoices/next-number` (fallback placeholder); form dirender setelah data ada (`Loading`); submit async, error (422/409) lewat ErrorState, navigasi hanya bila sukses |
| `pages/finance/ExpensesPage.tsx` | daftar dari API; create async + reload; error create di dalam modal; `Loading`/ErrorState |
| `pages/finance/SalesPage.tsx`, `ReportPage.tsx` | data dari API; `Loading` + ErrorState; tombol Export Excel/PDF `disabled` selama memuat (mencegah ekspor kosong) |
| `pages/DashboardPage.tsx`, `pages/reservations/ReservationListPage.tsx`, `components/shared/DayReservationsPopup.tsx` | data finance dari API lewat `getAllIfPermitted` (tanpa izin -> kosong); tidak ada elemen baru |

### 2. Verifikasi
| Pemeriksaan | Hasil |
|---|---|
| Frontend `tsc --noEmit` | lulus |
| ESLint | baseline 197 error/319 warning -> Blok 8 43/316 -> **43/308**; tidak ada berkas yang memburuk, berkas baru bersih |
| Build produksi (`.tmp-fix\fe-dist-block9b`) | lulus; JS **1.839.257 B** (89 berkas) vs baseline 1.845.006 B: **-5.749 B**; entry 251,07 kB (+1,1 kB); mock JSON tidak lagi di bundel |
| Tes kontrak backend (verifikasi pengganti e2e) | **+18 tes** `tests/contract/finance-frontend-contract.test.ts` memakai payload PERSIS layanan FE baru: list ber-halaman (239 baris = 3 request, tanpa duplikat), bentuk Invoice/Expense/Sale, create tanpa status + total dihitung server (diskon persen), nomor bentrok -> nomor berikutnya, urutan create -> send/pay/cancel, status tanpa aksi -> 422 + pesan, PATCH tanpa status, Sent -> Draft 422, delete Draft 204 / lainnya 409, aksi ilegal 409, 403 untuk Staff, error validasi berbentuk `errors` |
| Pemeriksaan logika FE (`.tmp-fix\fe-logic-check-9b.mjs`, fetch tiruan) | **13/13**: peta status -> aksi (termasuk 8 kombinasi tak didukung), jumlah & isi request create/update, body tanpa id/total/status, 404 -> undefined, 403 -> [], 5xx tetap menolak, paging 250 baris = 3 request untuk ketiga daftar |
| Pemeriksaan logika Blok 8 | 18/18 tetap lulus |
| Backend `tsc` + suite penuh | **439 lulus / 0 gagal (32 file)**; golden, contract lama, role matrix, anggaran query tidak diubah |

### 3. LAPORAN NETRALITAS UI (hunk-level terhadap snapshot; `.tmp-fix\b9b-diff.txt`)
13 berkas berubah + 1 baru. Klasifikasi:
| Berkas | Hunk | Klasifikasi |
|---|---|---|
| `services/{invoice,expense,sales,report}Service.ts`, `hooks/useAsyncData.ts` | seluruhnya | logic-only |
| `DashboardPage.tsx`, `ReservationListPage.tsx`, `DayReservationsPopup.tsx` | sumber data (hook) | logic-only, tanpa perubahan render |
| `SalesPage.tsx`, `ReportPage.tsx` | sumber data; `{isLoading && <Loading />}`, `{loadError && <ErrorState .../>}`; `disabled={isLoading}` pada 2 tombol ekspor (ReportPage) | logic-only + elemen kondisional yang DISETUJUI (U1a/U3b); `disabled` = atribut (dicatat di 9A) |
| `ExpensesPage.tsx` | sumber data, handler async; `Loading` menggantikan tabel selama memuat; ErrorState muat/simpan | logic-only + elemen disetujui |
| `InvoiceListPage.tsx` | sumber data, handler async, payload; ErrorState simpan (di modal), hapus & muat (dibungkus `div` ber-`marginBottom` 16px agar sejajar banner yang ada); `Loading` menggantikan tabel selama memuat | logic-only + elemen disetujui. **Catatan jujur:** 2 `div` pembungkus ber-style inline (jarak) ikut ditambahkan untuk menempatkan ErrorState |
| `InvoiceDetailPage.tsx` | sumber data; cabang memuat (`Loading` dalam `div` berpola sama dengan cabang "not found" yang ada), cabang gagal muat (ErrorState), ErrorState aksi (dalam `div` `marginTop` 16px); handler tombol | logic-only + elemen disetujui (+1 `div` pembungkus jarak) |
| `InvoiceFormPage.tsx` | pemuatan, `defaultValues`, submit async; `Loading`/ErrorState; form dirender bersyarat | logic-only + elemen disetujui |
Tidak ada perubahan: CSS, className yang ada, teks/label, ikon/aset, Select status di `InvoiceForm` (dibiarkan sesuai A1), banner `feedback` (dibiarkan sesuai U4a), komponen bersama (`ErrorState`, `Loading`, `InvoiceForm` dipakai apa adanya), halaman publik, route/menu. Tidak ada teks baru yang saya tulis: deskripsi ErrorState = pesan API; judul = teks bawaan komponen.
Elemen render baru seluruhnya adalah `Loading`/`ErrorState` kondisional yang disetujui, ditambah 3 `div` pembungkus jarak dan 2 atribut `disabled`.

### 4. Kompatibilitas backend
- **Backend baru (Blok 0–7):** seluruh alur di atas (diuji lewat tes kontrak).
- **Backend lama (yang sedang terpasang):** endpoint finance sudah ada; baca, create/update tanpa status, dan aksi send/pay/cancel bekerja sama. Perbedaan: backend lama masih mengizinkan hapus invoice non-Draft dan menerima status di body (FE baru hanya mengirim status untuk kombinasi tak didukung, yang oleh backend lama akan DITERIMA, bukan ditolak). `GET /invoices/next-number` ada di keduanya. Urutan antar halaman baru dijamin deterministik di backend baru. `/reports/revenue` dan `/sales/summary` tidak dipakai.

### 5. Perubahan yang terlihat pengguna
1. Semua halaman finance, tile Omzet/Invoice dan grafik pendapatan di dashboard, lencana invoice di daftar reservasi/popup hari: **data D1 nyata**. Database yang tidak di-seed: kosong.
2. **Staff/Reception (tanpa izin finance)**: tile omzet/invoice dan grafik pendapatan 0/kosong; lencana invoice hilang (sebelumnya angka mock).
3. Sales mengikuti invoice (Draft/Sent ikut dihitung = "ditagihkan").
4. Invoice/expense yang dibuat tersimpan permanen; total invoice selalu dari server (diskon persen) — modal di halaman daftar sebelumnya menghitung diskon sebagai nominal.
5. Hapus invoice non-Draft, edit invoice Completed/Cancelled, aksi status ilegal, pilihan Overdue/Partial di form: ditolak dan pesan backend ditampilkan.
6. Spinner singkat saat memuat; blok ErrorState saat gagal.
7. Halaman Laporan/Penjualan kini berisi sesuai periode nyata (masalah "preset kosong" dari Blok 8 hilang bila ada data pada periode itu).

### 6. Risiko residual / tindakan pemilik
1. **Belum diuji di browser.** Verifikasi = tsc + tes kontrak + pemeriksaan logika. Jalankan e2e finance di lingkungan terisolasi (buat/edit/hapus invoice, aksi status, expense, dashboard sebagai Staff, laporan + ekspor).
2. **Izin expense di produksi:** grant `finance.expense.*` untuk role hanya ada di skrip seed. Tanpa itu halaman Expenses menampilkan ErrorState 403 dan Sales/Report/Dashboard menghitung tanpa pengeluaran. Beri izin lewat UI role sebelum/ketika deploy.
3. **A1 tidak atomik:** create/PATCH lalu aksi adalah dua request; bila aksi gagal, invoice tersimpan sebagai Draft dan pesan error tampil.
4. Role yang hanya punya `finance.report.view` melihat laporan kosong (daftar sumber butuh izin sales/invoice/expense masing-masing; 403 dipetakan ke kosong).
5. Dashboard kini melakukan 3 pengambilan daftar finance per buka (masing-masing 4–5 statement di backend Blok 7); pada data besar pertimbangkan endpoint agregat (`/reports/revenue`, `/sales/summary` sudah ada) — butuh perubahan tampilan/logic lebih lanjut.
6. Cabang "invoice dari reservasi" di `InvoiceFormPage` tetap tidak terjangkau oleh route (kondisi lama, tidak diubah).
7. `InvoiceListPage` dan `DashboardPage` juga digarap workstream UI: periksa konflik saat menggabungkan.
8. Tetap ditunda: label billed/paid, `totalPaid`/pelunasan sebagian (BE-021), menghapus Select status (A2), gaya banner error.

---

## Laporan Blok 10 — Verifikasi akhir dan handover (Opus 5.5, High)

**Status: SELESAI.** Handover: `.tmp-fix\handover.md`.
**Snapshot:** `snapshot-block-10\` (`backend\src`, `backend\tests`, `frontend\src`). Dibuat setelah `tests\helpers\fake-d1.ts` dan `tests\final-reattack.test.ts` diubah, sebelum edit `backend\src` dan `frontend\src`.
**Restore (satu baris):** `Copy-Item .tmp-fix\snapshot-block-10\backend\src\* backend\src -Recurse -Force; Copy-Item .tmp-fix\snapshot-block-10\frontend\src\* frontend\src -Recurse -Force`

### 10.1 Verifikasi
| Pemeriksaan | Baseline | Akhir |
|---|---|---|
| Backend tsc | lulus | lulus |
| Backend vitest | 177 lulus / 13 gagal | 456 lulus / 0 gagal (33 file) |
| Frontend tsc | lulus | lulus |
| ESLint | 197 / 319 | 43 / 308 |
| Build (`.tmp-fix\fe-dist\`) | 1.845.006 B, 85 file | 1.838.796 B, 89 file |
| Logika FE | – | 18/18 + 13/13 |

### 10.2 Re-attack
- PoC audit dijalankan ulang (`poc-rerun.txt`). Awalnya BE-015b/015c/029 mengembalikan `[500,500]`: harness latency PoC membungkus statement, dan `batch` di shim menolak statement terbungkus. Ini keterbatasan shim, bukan kode produksi. Shim diperbaiki (statement terbungkus di-resolve lewat `AsyncLocalStorage`, tetap satu transaksi). Hasil: BE-015b/c `[201,409]` di semua offset, BE-029 `[201,201]` dengan kode berbeda.
- 17 tes serangan baru di `tests\final-reattack.test.ts`.
- **Temuan baru:** dua Super Admin yang saling menurunkan/menonaktifkan/menghapus pada saat bersamaan menyisakan 0 Super Admin aktif (cek lalu tulis). Diperbaiki: `lastSuperAdminGuard()` di `services/authz.ts` ditambahkan sebagai statement terakhir pada batch di `updateUser`, `setUserRoles`, `deleteUser` hanya bila target memegang role Super Admin dan kehilangannya. Diuji pada 4 pasangan konkuren: selalu tersisa tepat 1, pihak yang kalah menerima 403 dan tidak mengubah apa pun.
- Putusan: BE-001, 002, 003, 004 (kode), 015, 016, 017, 019, 023 = Confirmed fixed (di shim).

### 10.3 Perbandingan hash (`b10-hash-compare.txt`)
- `backend\src`: 27 berubah, 5 ditambah. `backend\tests`: 9 berubah, 35 ditambah. `scripts\generate-seed-sql.mjs` dan `README.md` berubah. Tidak ada yang dihapus.
- `frontend\src`: 30 berubah, 3 ditambah; `vite.config.ts`, `eslint.config.js` berubah.
- Config, wrangler, package/lockfile, migrasi, `.dev.vars*`, `.env*`, `.gitignore`, `index.html`: mtime lebih tua dari Blok 0, tidak berubah.
- `.tmp-audit\`: satu berkas cache vitest (`poc\.cache\…\results.json`) tertulis oleh run PoC. **Penyimpangan**, dilaporkan di handover.
- Golden happy-path dan kontrak lama identik dengan salinan terawal; yang berubah hanya `role-matrix.json` (3 sel), `known-unsafe.test.ts`, `role-matrix.test.ts`.

### 10.4 Audit netralitas UI
7 `div` pembungkus ber-`style`/`className` yang ditambahkan di Blok 8/9B dicabut (InvoiceListPage 2, InvoiceDetailPage 3, ReservationDetailPage 2). Laporan Blok 9B menyebut 3; hitungan sebenarnya 7 termasuk dua dari Blok 8. Sisa elemen baru: `ErrorState`/`Loading` yang disetujui. Tidak ada JSX/className/style lama yang dihapus.

### 10.5 Query
Lihat tabel di handover §7. Semua jalur baca turun; tes anggaran lulus pada kode akhir.

### Perubahan kode di blok ini
`backend\src\services\authz.ts`, `backend\src\services\userService.ts`, `backend\tests\helpers\fake-d1.ts`, `backend\tests\final-reattack.test.ts` (baru), tiga halaman frontend (pencabutan `div`).

---

## Handover Remediasi PMS Homestay Joglo Seruni Syariah

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

### 1. Status per temuan

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

#### Hasil re-attack Critical/High (Blok 10.2)
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

### 2. Perubahan perilaku yang terlihat pengguna

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

### 3. Perubahan frontend dan bukti netralitas UI

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

### 4. Catatan kontrak API finance

Detail lengkap: `.tmp-fix\contract.md` §7–8; dikunci oleh `backend\tests\contract\finance-frontend-contract.test.ts` (18 tes).

- Daftar: `GET /api/invoices|expenses|sales?page=N&pageSize=100`, FE mengambil semua halaman. 403 dipetakan ke daftar kosong hanya pada layar umum (dashboard, daftar reservasi, popup hari, sales/report).
- `POST /api/invoices` dan `PATCH /api/invoices/:id` **tanpa status**; server menghitung total. Nomor bentrok mendapat nomor berikutnya. Nomor awal dari `GET /api/invoices/next-number?date=`.
- Status hanya lewat `POST /api/invoices/:id/send|pay|cancel`. Select status di form diterjemahkan ke aksi di service (U2=A1); kombinasi tanpa aksi dikirim dengan status supaya backend menolak 422 dengan pesannya sendiri.
- `DELETE /api/invoices/:id`: 204 untuk Draft, 409 lainnya.
- Sales bersifat turunan invoice dan read-only. Draft/Sent ikut dihitung sebagai "ditagihkan".
- Tersedia tetapi belum dipakai FE: `/api/reports/revenue`, `/api/sales/summary` (billed vs paid), `/api/sales/breakdown`, `/api/reports/*`.
- **A1 tidak atomik**: create/PATCH lalu aksi adalah dua request; bila aksi gagal, invoice tersimpan sebagai Draft dan error tampil.

---

### 5. Checklist pemilik (urut)

#### 5.1 Sebelum deploy
1. Tinjau diff dengan alat Anda sendiri. Working tree sudah berisi banyak perubahan tak ter-commit sebelum remediasi dimulai; daftar berkas yang saya ubah ada di `.tmp-fix\b10-hash-compare.txt`.
2. `backend`: `npm run typecheck` dan `npm test` (harap 456 lulus).
3. `frontend`: `npm run typecheck`, `npm run lint` (43 error lama, bukan regresi), `npm run build`. **Perhatian:** `frontend\vite.config.js` adalah artefak `tsc -b` yang masih berisi `sourcemap: true` dan didahulukan Vite; `npm run build` meregenerasinya dari `vite.config.ts`. Setelah build, pastikan `.map` tidak ikut diunggah atau tidak direferensikan.
4. Pastikan `JWT_SECRET` produksi bukan placeholder dan bukan kosong. Bila placeholder, backend baru menolak semua request non-localhost: **set secret dulu, baru deploy**.
5. Pastikan ada minimal satu Super Admin aktif yang bisa login di D1 produksi.
6. **Izin expense**: grant `finance.expense.*` hanya ada di skrip seed. Sebelum frontend baru aktif, beri izin itu ke role yang perlu lewat UI Roles; tanpa itu halaman Expenses menampilkan error 403.
7. Putuskan D-012, D-021, D-033 (§7) bila default tidak sesuai.

#### 5.2 Urutan deploy
1. Backend dulu. Tidak ada migrasi baru.
2. Frontend sesudahnya.
Keduanya bekerja dalam urutan mana pun: FE baru + BE lama berfungsi, tetapi BE lama masih mengizinkan hapus invoice non-Draft dan menerima status di body. FE lama + BE baru berfungsi; finance FE lama tetap mock.

#### 5.3 Smoke test pasca-deploy (read-only, aman)
1. `GET /api/health` → 200.
2. `POST /api/auth/register` dengan body kosong → 403 (tidak membuat apa pun).
3. Login sebagai admin nyata; `GET /api/auth/me` → daftar izin lengkap.
4. `GET /api/reservations?page=1&pageSize=10`, `/api/reservations/calendar?from=…&to=…`, `/api/rooms`, `/api/invoices?page=1&pageSize=10`, `/api/dashboard/overview` → 200.
5. `GET /api/activities?page=1&pageSize=10` → entri `login` terbaru terlihat.
6. Periksa header respons: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`.
7. Di browser: buka dashboard, daftar reservasi, satu detail reservasi, daftar invoice, laporan. Jangan menekan tombol aksi.

#### 5.4 Playwright e2e (lingkungan terisolasi, bukan produksi)
Jalankan `npm run test:e2e` di `frontend` terhadap backend lokal dengan D1 lokal ter-seed (`--allow-default-credentials`): `01-public`, `02-auth`, `03-dashboard`, `04-reservations`, `05-rooms`, `06-users-roles`, `07-finance-activity`, `10-invoice-stamp`. Spec belum disesuaikan dengan remediasi; perkirakan kegagalan pada alur registrasi (`02-auth`) dan pada finance yang mengandalkan data mock (`07`, `10`). Tambahan manual: buat/edit/hapus invoice Draft, send/pay/cancel, buat expense, dashboard sebagai Staff, ekspor laporan, sesi kedaluwarsa, dua tab membooking kamar yang sama.

#### 5.5 Rollback
Tanpa migrasi, rollback = deploy ulang versi sebelumnya. Di kode, `snapshot-block-N` berisi keadaan **sebelum** Blok N; memulihkannya juga membatalkan semua blok sesudahnya.

| Mundur ke sebelum | Perintah (PowerShell, dari root proyek) |
|---|---|
| Blok 10 (guard Super Admin, shim, pencabutan `div`) | salin `snapshot-block-10\backend\src`, `backend\tests`, `frontend\src` kembali. Catatan: snapshot ini dibuat setelah `fake-d1.ts` dan `final-reattack.test.ts` diubah, sebelum edit `src`. |
| Blok 9B | `Remove-Item frontend\src -Recurse -Force; Copy-Item .tmp-fix\snapshot-block-9b\frontend\src frontend\src -Recurse -Force` |
| Blok 8 (seluruh frontend) | sama dengan `snapshot-block-8\frontend\src`, plus `vite.config.ts` dan `eslint.config.js` |
| Blok 1–7 (backend) | `Remove-Item backend\src -Recurse -Force; Copy-Item .tmp-fix\snapshot-block-N\backend\src backend\src -Recurse -Force` (dan `backend\tests` yang sepadan) |
| Semua (backend) | `snapshot-block-0\backend` |

---

### 6. Item yang ditunda

#### Kelas C (Cloudflare / config / skema / plan)
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

#### Kelas D3 (UI / produk)
1. FE-007: label input dan aksesibilitas modal.
2. X-001: override izin per user.
3. X-006: sembunyikan shortcut dashboard sesuai izin.
4. Sembunyikan halaman `/register` dan tautannya.
5. FE-009: bump `xlsx` dan `react-router`.
6. Hapus kredensial default dari mock JSON frontend (skrip seed bergantung padanya).
7. Label billed/paid di laporan (endpoint sudah ada), hapus Select status invoice (opsi A2), gaya banner error, jarak di sekitar `ErrorState`.
8. Seluruh item audit desain frontend lama (UI-*, A11Y-*, UX-*, ARC-*, RWD-*).

---

### 7. Risiko residual dan yang tidak diverifikasi

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

#### Tabel jumlah query D1 per request

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
