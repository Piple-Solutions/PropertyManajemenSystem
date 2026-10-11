# Laporan Blok 4 — Reservation Guards (Sonnet 5.5, Medium)

**Status: SELESAI.** Backend `tsc --noEmit` lulus; `vitest run`: **356 lulus / 0 gagal (28 file)** (Blok 3: 340).
**Snapshot:** `snapshot-block-4\` (dibuat SEBELUM edit pertama).
**Restore (satu baris):** `Remove-Item backend\src,backend\tests -Recurse -Force; Copy-Item .tmp-fix\snapshot-block-4\backend\* backend\ -Recurse -Force`

## 1. Keputusan kebijakan yang PERLU dikonfirmasi pemilik (D-021)
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

## 2. Per temuan
| ID | Status | Sebelum -> sesudah | Bukti |
|---|---|---|---|
| BE-017 | FIXED (terminal) | PATCH checked-out/cancelled mengubah harga/tanggal/kamar: 200 (total 1.500.000 -> 2; cancelled 0 -> 2) -> 409 + pesan Indonesia; baris tidak berubah. Payload wizard yang tidak berubah + nama/sumber/catatan: 200 dan hanya field itu yang ditulis (total cancelled tetap 0, rates/rooms tidak ditulis ulang) | `tests/reservation-guards.test.ts`, `known-unsafe` (dibalik), contract "edit UI vs status" lulus tanpa diubah |
| BE-024 | FIXED | kamar maintenance/inactive bisa dibooking (201) -> 422 `Kamar tidak aktif ...`; `roomNumber`/`roomTypeName` dari `rooms`/`room_types` (PoC "999" -> nomor asli). Edit: kamar yang DITAMBAHKAN harus aktif; bila tanggal berubah semua kamar harus aktif; kamar yang sudah ada tetap boleh bila hanya catatan diubah. Snapshot lama dipertahankan (kamar yang diganti nama tidak menulis ulang riwayat) | 4 tes + `known-unsafe` |
| BE-025 | FIXED | `2027-02-31` diterima -> 422 (create, patch, availability, calendar); stay > 60 malam diterima & dihargai 60 -> 422 "Maksimal menginap 60 malam"; tepat 60 malam diterima; hanya request baru/berubah (notes-only pada baris seed tetap 200) | 6 tes + `known-unsafe` |
Validasi tanggal nyata diterapkan di `dateString` (dipakai reservasi, nightly rates, calendar/availability, invoice dan expense date): hanya input baru yang terpengaruh; nilai tersimpan tidak divalidasi ulang.

## 3. Biaya query (statement D1; DB seed)
| Operasi | Sebelum | Sesudah |
|---|---|---|
| POST /reservations (1 kamar) | 19 | 19 |
| POST /reservations (2 kamar) | 21 | 20 (-1: satu query `inArray` + join tipe menggantikan 1 query per kamar) |
| PATCH catatan saja | 14 | 14 (lookup kamar dilewati) |
| PATCH payload lengkap wizard | 23 | 23 |
| PATCH ganti kamar | 19 | 19 |
Anggaran Blok 0 (26 tes) lulus tanpa perubahan angka. Tidak ada query tambahan di jalur baca.

## 4. Dampak ke frontend (tidak diubah)
- Wizard pada reservasi checked-out/cancelled yang mengubah tanggal/kamar/harga kini menerima 409 + pesan Indonesia lewat `ApiError.message` (`saveReservationDraft` melempar; penanganan tampilan di call site adalah FE-004 / Blok 8). Simpan catatan/nama tetap berhasil.
- 422 baru: kamar tidak aktif dan tanggal tidak nyata/stay > 60 malam muncul lewat `errors`/`message` yang sudah dibaca `apiErrorMessage`.
- FE mengirim `roomNumber`/`roomTypeName` dari inventaris kamar, yang kini diabaikan demi nilai server — nilai identik di kondisi normal, jadi tampilan tidak berubah.

## 5. Tes
Baru `tests/reservation-guards.test.ts` (16 tes). Berubah (menguji perilaku cacat yang dibalik): 4 tes BE-017/024/025 di `golden/known-unsafe.test.ts`. Golden happy-path (12 snapshot), contract (34), role matrix, query budget (26): tidak diubah, lulus.

## 6. Berkas
`src/lib/pricing.ts` (+`isRealCalendarDate`, `nightsBetween`), `src/lib/validation.ts` (`dateString`), `src/services/reservationService.ts`; tes: `tests/reservation-guards.test.ts` (baru), `tests/golden/known-unsafe.test.ts`. Tidak ada perubahan: frontend, config, migrations, dependency.

## 7. Risiko residual
1. Cek ketersediaan + insert masih tidak atomik (BE-015/016 = Blok 5, prompt Opus); guard status juga "baca lalu tulis" lintas `await` (edit bersamaan dengan check-out). Blok 5 menyatukan dengan `UPDATE ... WHERE status = ?`.
2. `enumerateNights` masih memakai zona waktu lokal runtime (BE-026, Blok 7).
3. `ReservationCard/ListPage` tetap menampilkan Edit untuk status terkunci (UI = D3); pesan 409 yang tampil bergantung penanganan error call site.
4. Data seed memuat reservasi dengan `room_id` yang tidak ada di `rooms`; edit kamar pada baris itu tetap 422 `Room(s) not found` (perilaku lama).
