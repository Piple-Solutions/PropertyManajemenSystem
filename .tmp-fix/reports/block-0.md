# Laporan Blok 0 — Safety Net (Sonnet 5.5, Medium)

**Status: SELESAI.** Snapshot: `.tmp-fix\snapshot-block-0\`.
**Restore (satu baris):** `Copy-Item .tmp-fix\snapshot-block-0\backend\* backend\ -Recurse -Force` (mengembalikan `src`, `tests`, `scripts`, `README.md` ke kondisi sebelum Blok 0; Blok 0 tidak mengubah `src`, `scripts`, maupun `README.md`, hanya `tests\`).

## 1. Angka baseline
| Pemeriksaan | Sebelum | Sesudah Blok 0 |
|---|---|---|
| Backend `tsc --noEmit` | lulus | lulus |
| Backend `vitest run` | 177 lulus / **13 gagal** (5 file) | **282 lulus / 0 gagal (24 file)**, ±43 dtk |
| Frontend `tsc --noEmit` | lulus | (baseline) lulus, ±7 dtk |
| Frontend ESLint | — | **197 error / 319 warning** (554 file; 316 `no-explicit-any`, 195 `no-undef`, 3 `no-unused-vars`, 2 `no-useless-escape`) |
| Frontend `vite build` (ke `.tmp-fix\fe-dist`) | — | lulus, ±10 dtk; 85 file JS, **1,845,006 byte** total; entry `index` 249.97 kB (gzip 79.18); `ReportPage` 732.92 kB (gzip 240.27) |

Rincian: `.tmp-fix\baseline-vitest.json` (13 gagal), `.tmp-fix\fe-eslint-baseline.json`, `.tmp-fix\fe-build-baseline.json`.

## 2. BE-028 — fixture basi (hanya fixture, tidak ada assertion yang dilemahkan)
Akar masalah dikonfirmasi: seed (dari `frontend/src/data/mock/*.json`) kini 6 room type / 21 kamar dengan id `room-01…room-20` + `room-joglo`, sedangkan `reservation_rooms` seed masih merujuk id lama `room-001…room-008` yang **tidak ada** di tabel `rooms` (tanpa FK). Perubahan fixture:
- `reservations.test.ts`: kamar `room-008/006/001/002` -> kamar nyata `room-04/19/01/02`; tes overlap/PATCH-conflict sekarang MEMBUAT blocker nyata lewat API dulu (karena reservasi seed tidak menempati kamar nyata). Helper `stayOnRoom`.
- `rooms.test.ts`: 5->6 room type, 8->21 kamar, pencarian `101`->`15`, filter tipe 2->9; "maintenance" dibuat lewat PATCH (seed tak punya kamar maintenance) lalu dihitung 0 -> 1; tes "room dengan riwayat reservasi (409)" dan "snapshot tidak ditulis ulang" kini memakai reservasi nyata (tes snapshot sebelumnya lulus secara kosong karena memanggil `/api/rooms/room-001` yang 404).
- `seed.test.ts`: room_types 5->6, rooms 8->21.
- `dashboard.test.ts`: rooms `{21,21,0,0}`, occupancy 2/21 = 10%.
- `activities.test.ts`: kamar `room-008`->`room-04`; duplikat nomor `101`->`01`.

## 3. Yang ditambahkan (semua di `backend\tests\`)
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

## 4. Anggaran query (statement D1 per request, DB seed 15 reservasi)
login 7 · me 4 · users?100 11 · users/:id 6 · roles?100 11 · roles/:id 6 · permissions 5 · rooms?100 6 · room-types?100 6 · **reservations?100 51** · **reservations?10 36** · reservations/:id 7 · calendar 19 · availability 7 · POST reservations 19 · invoices?100 15 · invoices/:id 6 · expenses?100 6 · sales?100 6 · breakdown 5 · reports/summary 8 · top-invoices 5 · dashboard 11 · activities?100 6.
**Temuan:** daftar reservasi sudah 51 statement dengan HANYA 15 baris (3 per baris + 6) — di atas batas 50 plan Free; pada 100 baris ±306. Blok 7 (BE-027) memotongnya.

## 5. Yang DICAKUP vs TIDAK dicakup
Dicakup: status + body JSON penuh (urutan list, field, kode error) untuk semua endpoint yang dipakai FE dan endpoint finance; kontrak FE; anggaran query; matriks role; emulasi batch/conditional write di shim.
Tidak dicakup: konkurensi nyata D1 (shim sinkron, single-thread), batas CPU Workers, `holidays` upstream (sudah ada `tests/holidays.test.ts`), Playwright e2e (dijalankan pemilik), UI/aksesibilitas, `db.insert().returning()` lewat batch (hanya `db.run` yang diuji), pengiriman email, plan Cloudflare. Snapshot memakai `toMatchFileSnapshot`: bila berkas snapshot hilang, vitest MENULIS ulang (di CI sebaiknya set `CI=1` agar gagal) — jangan hapus `golden/snapshots`.

## 6. Temuan baru yang harus diketahui blok berikutnya
1. **Role `role-004` (Viewer) berstatus `inactive` di seed, tetapi tes yang ada (rooms/reservations/dashboard) memakainya sebagai "viewer" yang memiliki `room.view` dan `reservation.view`.** BE-007 (Blok 2) akan membuat role itu tidak memberi izin -> tes-tes tersebut harus memakai role aktif baru (perubahan fixture yang terkait langsung dengan perbaikan; flag untuk S3/S4 di prompt Opus). `inactive@hotel.com` (user-004) memang user inactive.
2. **Edit reservasi di FE tersedia untuk semua status dan selalu mengirim payload lengkap** (contract.md §4) -> BE-017 harus membandingkan nilai, bukan menolak PATCH mentah; kontradiksi = S2.
3. **Reservasi seed (`res-001…res-015`) merujuk kamar yang tidak ada** — menyimpan ulang kamar reservasi seed lewat wizard memberi 422 `Room(s) not found` (dikunci di contract test). BE-024 tidak mengubahnya; ini drift data seed (rekomendasi: perbaiki mock/seed di luar scope ini atau akui sebagai data demo).
4. Pada peristiwa `activities` dengan `created_at` yang sama, urutan tak terdefinisi (BE-035); harness golden menggeser jam 1 dtk antar langkah supaya deterministik.
5. `forgot-password` mengembalikan `resetToken` di env tes karena `DEV_EXPOSE_RESET_TOKEN=true` + origin `localhost` (BE-008 harus mempertahankan perilaku ini untuk localhost).
6. FE `holidayService` hanya mengirim `force=true` bila dipanggil dengan `{force:true}`; grep seluruh `frontend/src` menunjukkan TIDAK ADA call site yang memakainya -> BE-012 aman dikerjakan di Blok 1 (field `source` pada respons tetap dipertahankan, hanya URL asal yang tidak di-echo; cek `HolidayYear.source` di Blok 1).

## 7. Happy path berubah? **Tidak.** Tidak ada perubahan di `backend\src`, `migrations`, `scripts`, `package.json`, frontend, `.tmp-audit` (diverifikasi lewat waktu modifikasi berkas). Hanya `backend\tests\` dan `.tmp-fix\`.
