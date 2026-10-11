# Laporan Blok 5 — Atomicity dan Double-Booking (Opus 5.5, High)

**Status: SELESAI.** Backend `tsc --noEmit` lulus; `vitest run`: **379 lulus / 0 gagal (29 file)** (Blok 4: 356).
**Snapshot:** `snapshot-block-5\` (dibuat SEBELUM edit pertama).
**Restore (satu baris):** `Remove-Item backend\src,backend\tests -Recurse -Force; Copy-Item .tmp-fix\snapshot-block-5\backend\* backend\ -Recurse -Force`
**Tanpa tabel/constraint baru** — S1 tidak terpicu; `.tmp-fix\proposed-migrations\` tidak dibuat. BE-030 tetap deferred.

---

## A. DESAIN
Catatan proses: desain ditetapkan sebelum kode ditulis, tetapi dokumen ini baru ditulis di akhir blok (prompt meminta ditulis lebih dulu). Satu bagian berubah selama implementasi: A7 (cara menjalankan batch).

### A1. Predikat overlap yang dipakai logika ketersediaan saat ini
`getBookedRoomIds` (tidak diubah): reservasi LAIN yang `status != 'cancelled'` (jadi `reserved`, `checked-in`, `checked-out` semuanya dihitung), dengan interval setengah-terbuka `check_in_date < :checkOut AND check_out_date > :checkIn`, dan kamar lewat `reservation_rooms.room_id`. Edit mengecualikan dirinya sendiri (`id != :self`). Predikat yang sama ditulis sebagai SATU ekspresi SQL `overlapExists(...)`:
```sql
EXISTS (SELECT 1 FROM reservation_rooms rr JOIN reservations o ON o.id = rr.reservation_id
        WHERE rr.room_id IN (?, ...) AND o.status != 'cancelled'
          AND o.check_in_date < :checkOut AND o.check_out_date > :checkIn [AND o.id != :self])
```

### A2. Jaminan D1 yang diandalkan (hanya dua, keduanya terdokumentasi)
1. Satu statement bersifat atomik.
2. `batch()` menjalankan statement berurutan dalam SATU transaksi; bila satu gagal, semuanya di-rollback.
D1 = SQLite penulis tunggal, sehingga dua batch tidak pernah saling menyela: batch kedua selalu melihat hasil batch pertama. Tidak ada "cek, `await`, lalu tulis" untuk invariant.

### A3. Create — komposisi batch
| # | Statement | Parameter terikat |
|---|---|---|
| 1 | `INSERT INTO reservations (16 kolom) SELECT ?×13 … WHERE NOT overlapExists(rooms, ci, co)` — header HANYA masuk bila tidak ada bentrok | 16 + n + 2 (n = jumlah kamar, dibatasi 60 -> maks 78) |
| 2..k | `INSERT INTO reservation_nightly_rates … SELECT r.id, v.column1, v.column2 FROM (VALUES (?,?),…) v JOIN reservations r ON r.id = :id` — tarif hanya masuk bila header ADA | 2 per malam + 1 -> 47 malam per statement (60 malam = 2 statement) |
| k+1.. | `INSERT INTO reservation_rooms … FROM (VALUES (6 nilai),…) v JOIN reservations r ON r.id = :id` | 6 per kamar + 2 -> 15 kamar per statement |
Semua statement <= 95 parameter (`chunkByParams`); `runAtomic` menolak statement > 100.
**Membaca jumlah baris berubah:** hasil D1 per statement punya `meta.changes`; `changesOf(results[0]) === 1` berarti header masuk. Bila 0: tidak ada apa pun yang tertulis (statement 2.. tidak menemukan header) -> satu query `findClashingRooms` untuk menyusun pesan 409 yang SAMA seperti sebelumnya (`Room(s) already booked for these dates: …`).
**Kegagalan/rollback:** error apa pun di tengah batch (mis. UNIQUE, kegagalan storage) membatalkan seluruh batch -> tidak ada header tanpa tarif/kamar.

### A4. BE-029 — kode reservasi
Kode tetap `RSV-YYYY-NNN` dari `count + 1` (happy path identik). Bila dua request memilih kode yang sama, constraint UNIQUE menggagalkan batch (rollback total) -> `isUniqueViolation(err, 'reservations.reservation_code')` -> ulangi dengan kandidat baru; setelah 4 kali memakai sufiks acak; maksimum 8 percobaan lalu 409 (tidak pernah 500).

### A5. Edit (BE-016) — validasi dulu, lalu satu batch
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

### A6. BE-018 — transisi dan tulis multi-baris
- Check-in / check-out / cancel: `UPDATE reservations SET status = :to … WHERE id = :id AND status = :from` + cek `changes`; yang kalah menerima 409 yang sama seperti bila datang belakangan.
- Invoice send / pay / cancel: `UPDATE invoices … WHERE id = :id AND invoice_status = :statusYangDibaca` + cek `changes`.
- Tulis multi-baris dijadikan satu batch: invoice create (header + item, retry bila nomor invoice bentrok UNIQUE), invoice update (hapus item, sisip item, header terakhir; semua dijaga status), invoice delete, user create (user + role), ganti role user, role create (role + izin), ganti izin role, hapus user/role.

### A7. Temuan teknis penting: `db.batch()` drizzle tidak bisa dipakai
Drizzle 0.45.3 gagal mem-batch SQL mentah berparameter (`db.run(sql…)` di dalam `db.batch` -> `preparedQuery.stmt` undefined -> `TypeError … reading 'bind'`). Tes shim Blok 0 tidak menangkapnya karena memakai SQL tanpa parameter. Karena dependency tidak boleh diubah, `runAtomic` (`src/lib/atomic.ts`) mengompilasi statement dengan dialect drizzle (`SQLiteAsyncDialect.sqlToQuery` / `builder.toSQL()`) lalu memanggil `D1Database.prepare(sql).bind(...).batch` secara langsung melalui `db.$client`. Teks SQL dan parameter tetap dihasilkan drizzle (escaping/binding sama), dan yang dipakai adalah API batch D1 yang terdokumentasi.

---

## B. HASIL

| ID | Status | Sebelum -> sesudah | Bukti |
|---|---|---|---|
| BE-015 | FIXED | dua create bersamaan untuk kamar+malam sama: 201 + 201 (2 booking) -> tepat satu 201, lainnya 409 dengan pesan konflik lama; untuk SEMUA offset PoC 0-30 ms, 5 request simultan rentang tumpang-tindih sebagian, booking multi-kamar all-or-nothing | `tests/atomicity.test.ts` (5 tes) |
| BE-016 | FIXED | edit ke tanggal terisi: 409 tetapi tarif baru tertinggal (header 200k vs calc 300k) -> 409 dan header/tarif/kamar identik byte-per-byte; kegagalan storage di tengah edit/create di-rollback total; dua edit bersamaan ke kamar sama: satu menang; edit vs booking baru: tidak pernah keduanya | 6 tes |
| BE-018 | FIXED | pay vs cancel sama-sama 200 (Cancelled+Paid) -> 200 + 409 dan baris akhir konsisten; check-in vs cancel, double check-in/out, double send/pay: satu pemenang; edit vs cancel tidak bisa meninggalkan cancelled dengan total != 0; tulis multi-baris all-or-nothing (invoice create/update, role user, izin role) | 9 tes |
| BE-029 | FIXED | create bersamaan untuk kamar BERBEDA: 201 + 500 -> semua 201 dengan kode berbeda; urutan `RSV-YYYY-016, 017` pada create berurutan tidak berubah | 2 tes |
| BE-030 | DEFERRED | tidak diubah (butuh kolom/keputusan semantik) | rules 4C |

Tes baru ditulis dan DIJALANKAN lebih dulu pada kode Blok 4: 18 dari 23 gagal (membuktikan cacat), setelah perbaikan 23/23 lulus, stabil 3 kali berturut-turut. Emulasi konkurensi: latency per statement di shim (`setShimLatency`, default 0), satu batch = satu jeda lalu atomik.
Golden happy-path (12 snapshot), contract (34), role matrix, anggaran query: **tidak diubah, lulus** (urutan baris kamar/tarif/item dalam respons identik).

## C. Jumlah statement D1 (sebelum Blok 5 -> sesudah)
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

## D. Batasan baru (teknis, tidak mengenai operasi sah)
- Maksimal 60 kamar per reservasi (422 "Maksimal 60 kamar per reservasi.") agar statement bersyarat selalu <= 100 parameter. Inventaris saat ini 21 kamar.

## E. Berkas yang berubah
`src/lib/atomic.ts` (baru), `src/services/reservationService.ts`, `invoiceService.ts`, `userService.ts`, `roleService.ts`; tes: `tests/atomicity.test.ts` (baru, 23 tes), `tests/helpers/fake-d1.ts` (+latency opsional), `tests/budgets/query-budget.test.ts` (anggaran turun). Tidak ada perubahan: frontend, config, migrations, dependency, golden/contract.

## F. Risiko residual dan yang TIDAK terverifikasi
1. **Belum diuji di D1 nyata.** Shim = better-sqlite3 dengan batch dalam satu transaksi sinkron. Semantik yang diandalkan (statement atomik, batch transaksional, `meta.changes`, `VALUES … column1`, `db.$client`) terdokumentasi/standar SQLite, tetapi uji di staging tetap disarankan: dua `POST /api/reservations` bersamaan harus menghasilkan satu 201.
2. Dua edit bersamaan atas reservasi yang SAMA tanpa konflik kamar: penulis terakhir menang (masing-masing batch tetap utuh). Tidak ada optimistic locking (butuh kolom versi = S1).
3. Baris audit (`activities`) ditulis SETELAH mutasi, di luar batch: mutasi bisa sukses sementara penulisan audit gagal (500 setelah data berubah). Sama seperti sebelum Blok 5.
4. Retry klien/duplikasi request (idempotency key) tidak ditangani — bukan bagian temuan.
5. Proteksi admin-terakhir (Blok 2) masih cek-lalu-tulis; penggantian role sendiri kini atomik, tetapi hitungan "admin lain" tidak ada di dalam statement.
6. `getBookedRoomIds`/list masih N+1 (BE-027, Blok 7); `enumerateNights` masih zona waktu runtime (BE-026, Blok 7).
