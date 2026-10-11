# Laporan Blok 7 — Validasi, Waktu, Performa (Sonnet 5.5, High)

**Status: SELESAI.** Backend `tsc --noEmit` lulus; `vitest run`: **421 lulus / 0 gagal (31 file)** (Blok 6: 397).
**Snapshot:** `snapshot-block-7\` (dibuat SEBELUM edit pertama).
**Restore (satu baris):** `Remove-Item backend\src,backend\tests -Recurse -Force; Copy-Item .tmp-fix\snapshot-block-7\backend\* backend\ -Recurse -Force`

## 1. Bukti keluaran identik
Golden happy-path (12 snapshot: urutan list, field, isi), contract (34), matriks role (160 sel) dan seluruh tes lama lulus TANPA diubah setelah N+1 dihapus dan ORDER BY dibuat eksplisit. Satu-satunya tes lama yang disesuaikan: `dashboard.test.ts` (membangun "hari ini" dengan WIB, perilaku BE-026 yang disengaja) dan anggaran query yang diturunkan.

## 2. Per temuan
### BE-027 — N+1 dan jumlah statement
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

### BE-035 — urutan eksplisit
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

### BE-026 — hari bisnis WIB
`lib/time.ts` (`todayInJakarta`, `yearInJakarta`, UTC+7 tanpa DST) dipakai oleh: dashboard (`today`, tile check-in/upcoming), `GET /invoices/next-number` (default tanggal), kode reservasi (`RSV-YYYY-`, termasuk fallback). Timestamp tersimpan tetap UTC ISO; format tanggal tersimpan tidak berubah. Diuji pada batas 16:59Z/17:00Z dan pergantian tahun (2026-12-31T20:00Z -> 2027).
Catatan: `enumerateNights` memakai kalender runtime (UTC di Workers) hanya untuk aritmetika `YYYY-MM-DD`, bukan untuk "hari ini".

### BE-009 — validasi
- Batas string/array (`LIMITS` di `validation.ts`): nama 100, email 254, password 128, deskripsi 500/2000, kode 30, id 100, pencarian 100, filter 50, `page` 100.000; array: roles 20, izin 200, fasilitas 50, gambar 20, item invoice 100, kamar 60; kategori laporan 20 entri / 500 karakter.
- Data seed terpanjang 53 karakter dan array terbesar 26 izin; nilai pada batas atas diterima (diuji), nilai seed/FE tidak ada yang ditolak.
- `GET /api/sales/breakdown` kini lewat zod (`start/end` tanggal nyata, `end >= start`); tanpa parameter = tanpa batas seperti sebelumnya.
- `categories` > 20 -> 422 (sebelumnya 150 kategori -> `IN` > 100 parameter -> 500). Tanggal laporan juga divalidasi tanggal nyata.
- Pencarian LIKE memakai `ESCAPE '\'`: `%`, `_`, `\` literal (users, roles, rooms, room-types, reservations, invoices, expenses, activities).
- Statement tulis tetap < 100 parameter lewat chunk (Blok 5) dan batas array di zod.

## 3. Perubahan perilaku yang terlihat klien (hanya input tidak sah/ekstrem)
1. Pencarian yang mengandung `%` atau `_` kini mencari karakter itu, bukan wildcard.
2. Nilai di atas batas LIMITS ditolak 422 (belum ada nilai FE/seed yang mendekati).
3. `/sales/breakdown` dengan `start`/`end` tidak valid: 422 (sebelumnya hasil lexicographic acak).
4. Antara 00:00–07:00 WIB: `dashboard.today`, default tanggal next-number, dan tahun kode reservasi mengikuti WIB (sebelumnya hari/tahun UTC sebelumnya).
5. `GET /api/permissions` dan baca lain tidak berubah bentuk.

## 4. Berkas yang berubah
`src/lib/time.ts` (baru), `src/lib/sql.ts` (baru), `src/lib/validation.ts`, `src/lib/pricing.ts`, `src/middleware/auth.ts`, `src/services/{identity,dashboard,reservation,invoice,expense,sales,user,role,room,roomType,activity}Service.ts`, `src/routes/{invoices,reports,sales}.ts`; tes: `tests/performance-time-validation.test.ts` (baru, 30 tes), `tests/budgets/query-budget.test.ts` (anggaran turun, baseline tetap), `tests/dashboard.test.ts` (tanggal WIB), `tests/invoice-lifecycle.test.ts` (satu fixture). Tidak ada perubahan: frontend, config, migrations, dependency, golden/contract.

## 5. Risiko residual
1. **Urutan efektif ditentukan dari perilaku planner SQLite saat ini** (rowid atau indeks tanggal). Implementasi eksplisit menirunya untuk kombinasi filter yang diuji; kombinasi langka dengan beberapa indeks yang saling bersaing (mis. status + payment + rentang) memakai `rowid` seperti yang dipilih planner pada data seed. `rowid` bisa berubah bila tabel di-VACUUM/diimpor ulang di luar aplikasi.
2. `getCalendar` belum dibatasi rentang (temuan menyarankan maks 62 hari); jumlah statement kini konstan per 90 reservasi sehingga bukan lagi masalah query, tetapi ukuran respons tetap tak terbatas.
3. `enumerateNights` bergantung zona waktu runtime (UTC pada Workers; konsisten).
4. Pencarian menjadi literal untuk `%`/`_`; bila ada pengguna yang sengaja memakai wildcard, perilaku itu hilang (tidak ada pemakaian di FE).
5. Batas array item invoice 100 (seed maks 18) dan 60 kamar per reservasi; permintaan lebih besar harus dipecah.
