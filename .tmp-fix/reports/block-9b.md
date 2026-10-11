# Laporan Blok 9B — Implementasi FE-001: finance FE ke API nyata (Opus 5.5, High)

**Status: SELESAI.** Keputusan pemilik: U1 = (a) `ErrorState` yang sudah ada, U2 = A1 (Select status dibiarkan, service menerjemahkan ke aksi), U3 = (b) komponen `Loading` yang sudah ada, U4 = (a) banner `feedback` hanya untuk sukses.
**Snapshot:** `snapshot-block-9b\` (`frontend\src`, dua berkas config, `backend\tests`; dibuat SEBELUM edit pertama).
**Restore (satu baris):** `Remove-Item frontend\src -Recurse -Force; Copy-Item .tmp-fix\snapshot-block-9b\frontend\src frontend\src -Recurse -Force; Remove-Item backend\tests\contract\finance-frontend-contract.test.ts`

## 1. Yang dikerjakan
### Lapisan data (4 layanan; nama fungsi dipertahankan, semuanya kini async)
| Layanan | Sekarang |
|---|---|
| `invoiceService` | `getAll` (`fetchAllPages('/api/invoices')`), `getAllIfPermitted` (403 -> `[]`), `getById` (404 -> `undefined`), `getNextNumber`, `create`/`update` (hanya field yang bisa diedit; total dihitung server), `delete`, `send`/`markPaid`/`cancel` (menolak dengan `ApiError` asli), filter turunan |
| `expenseService` | `getAll`, `getAllIfPermitted`, `getById`, `create`, `update`, `delete`, filter turunan |
| `salesService` | `getAll` (`/api/sales`), `getAllIfPermitted`, turunan; `create` dihapus (sales tidak bisa ditulis; tidak pernah dipakai) |
| `reportService` | formula sama, async (tidak dipakai halaman) |
Berkas mock JSON tidak diubah/dihapus (masih dipakai skrip seed); layanan tidak lagi mengimpornya, sehingga data mock tidak lagi ikut di bundel.
**U2 = A1 (status):** `statusActionFor(current, wanted)` memetakan pilihan Select ke satu aksi: Draft -> Sent = `/send`; Draft/Sent -> Completed+Paid = `/pay`; Draft/Sent -> Cancelled = `/cancel`. `create`/`update` mengirim body TANPA status lalu memanggil aksi itu. Kombinasi tanpa aksi (Overdue, Partial, Paid tanpa Completed, Sent -> Draft, dst.) dikirim DENGAN statusnya agar backend menolak dengan pesannya sendiri (422) dan tidak ada yang tersimpan.

### Halaman (9 berkas) — hook baru `hooks/useAsyncData.ts` (data + isLoading + error + reload)
| Berkas | Perubahan |
|---|---|
| `pages/finance/InvoiceListPage.tsx` | daftar dari API + refetch lewat `refreshKey` yang sudah ada; create/update/delete async; error simpan tampil di dalam modal, error hapus/muat di halaman (ErrorState); banner `feedback` tetap hanya untuk sukses; detail popup dari daftar yang sudah dimuat |
| `pages/finance/InvoiceDetailPage.tsx` | invoice dari API; `Loading` saat memuat; `ErrorState` (+Coba Lagi) bila gagal memuat; aksi Send/Paid/Cancel async, penolakan (409) tampil lewat ErrorState, sukses tetap reload |
| `pages/finance/InvoiceFormPage.tsx` | edit: invoice dimuat dulu; buat baru: nomor dari `GET /invoices/next-number` (fallback placeholder); form dirender setelah data ada (`Loading`); submit async, error (422/409) lewat ErrorState, navigasi hanya bila sukses |
| `pages/finance/ExpensesPage.tsx` | daftar dari API; create async + reload; error create di dalam modal; `Loading`/ErrorState |
| `pages/finance/SalesPage.tsx`, `ReportPage.tsx` | data dari API; `Loading` + ErrorState; tombol Export Excel/PDF `disabled` selama memuat (mencegah ekspor kosong) |
| `pages/DashboardPage.tsx`, `pages/reservations/ReservationListPage.tsx`, `components/shared/DayReservationsPopup.tsx` | data finance dari API lewat `getAllIfPermitted` (tanpa izin -> kosong); tidak ada elemen baru |

## 2. Verifikasi
| Pemeriksaan | Hasil |
|---|---|
| Frontend `tsc --noEmit` | lulus |
| ESLint | baseline 197 error/319 warning -> Blok 8 43/316 -> **43/308**; tidak ada berkas yang memburuk, berkas baru bersih |
| Build produksi (`.tmp-fix\fe-dist-block9b`) | lulus; JS **1.839.257 B** (89 berkas) vs baseline 1.845.006 B: **-5.749 B**; entry 251,07 kB (+1,1 kB); mock JSON tidak lagi di bundel |
| Tes kontrak backend (verifikasi pengganti e2e) | **+18 tes** `tests/contract/finance-frontend-contract.test.ts` memakai payload PERSIS layanan FE baru: list ber-halaman (239 baris = 3 request, tanpa duplikat), bentuk Invoice/Expense/Sale, create tanpa status + total dihitung server (diskon persen), nomor bentrok -> nomor berikutnya, urutan create -> send/pay/cancel, status tanpa aksi -> 422 + pesan, PATCH tanpa status, Sent -> Draft 422, delete Draft 204 / lainnya 409, aksi ilegal 409, 403 untuk Staff, error validasi berbentuk `errors` |
| Pemeriksaan logika FE (`.tmp-fix\fe-logic-check-9b.mjs`, fetch tiruan) | **13/13**: peta status -> aksi (termasuk 8 kombinasi tak didukung), jumlah & isi request create/update, body tanpa id/total/status, 404 -> undefined, 403 -> [], 5xx tetap menolak, paging 250 baris = 3 request untuk ketiga daftar |
| Pemeriksaan logika Blok 8 | 18/18 tetap lulus |
| Backend `tsc` + suite penuh | **439 lulus / 0 gagal (32 file)**; golden, contract lama, role matrix, anggaran query tidak diubah |

## 3. LAPORAN NETRALITAS UI (hunk-level terhadap snapshot; `.tmp-fix\b9b-diff.txt`)
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

## 4. Kompatibilitas backend
- **Backend baru (Blok 0–7):** seluruh alur di atas (diuji lewat tes kontrak).
- **Backend lama (yang sedang terpasang):** endpoint finance sudah ada; baca, create/update tanpa status, dan aksi send/pay/cancel bekerja sama. Perbedaan: backend lama masih mengizinkan hapus invoice non-Draft dan menerima status di body (FE baru hanya mengirim status untuk kombinasi tak didukung, yang oleh backend lama akan DITERIMA, bukan ditolak). `GET /invoices/next-number` ada di keduanya. Urutan antar halaman baru dijamin deterministik di backend baru. `/reports/revenue` dan `/sales/summary` tidak dipakai.

## 5. Perubahan yang terlihat pengguna
1. Semua halaman finance, tile Omzet/Invoice dan grafik pendapatan di dashboard, lencana invoice di daftar reservasi/popup hari: **data D1 nyata**. Database yang tidak di-seed: kosong.
2. **Staff/Reception (tanpa izin finance)**: tile omzet/invoice dan grafik pendapatan 0/kosong; lencana invoice hilang (sebelumnya angka mock).
3. Sales mengikuti invoice (Draft/Sent ikut dihitung = "ditagihkan").
4. Invoice/expense yang dibuat tersimpan permanen; total invoice selalu dari server (diskon persen) — modal di halaman daftar sebelumnya menghitung diskon sebagai nominal.
5. Hapus invoice non-Draft, edit invoice Completed/Cancelled, aksi status ilegal, pilihan Overdue/Partial di form: ditolak dan pesan backend ditampilkan.
6. Spinner singkat saat memuat; blok ErrorState saat gagal.
7. Halaman Laporan/Penjualan kini berisi sesuai periode nyata (masalah "preset kosong" dari Blok 8 hilang bila ada data pada periode itu).

## 6. Risiko residual / tindakan pemilik
1. **Belum diuji di browser.** Verifikasi = tsc + tes kontrak + pemeriksaan logika. Jalankan e2e finance di lingkungan terisolasi (buat/edit/hapus invoice, aksi status, expense, dashboard sebagai Staff, laporan + ekspor).
2. **Izin expense di produksi:** grant `finance.expense.*` untuk role hanya ada di skrip seed. Tanpa itu halaman Expenses menampilkan ErrorState 403 dan Sales/Report/Dashboard menghitung tanpa pengeluaran. Beri izin lewat UI role sebelum/ketika deploy.
3. **A1 tidak atomik:** create/PATCH lalu aksi adalah dua request; bila aksi gagal, invoice tersimpan sebagai Draft dan pesan error tampil.
4. Role yang hanya punya `finance.report.view` melihat laporan kosong (daftar sumber butuh izin sales/invoice/expense masing-masing; 403 dipetakan ke kosong).
5. Dashboard kini melakukan 3 pengambilan daftar finance per buka (masing-masing 4–5 statement di backend Blok 7); pada data besar pertimbangkan endpoint agregat (`/reports/revenue`, `/sales/summary` sudah ada) — butuh perubahan tampilan/logic lebih lanjut.
6. Cabang "invoice dari reservasi" di `InvoiceFormPage` tetap tidak terjangkau oleh route (kondisi lama, tidak diubah).
7. `InvoiceListPage` dan `DashboardPage` juga digarap workstream UI: periksa konflik saat menggabungkan.
8. Tetap ditunda: label billed/paid, `totalPaid`/pelunasan sebagian (BE-021), menghapus Select status (A2), gaya banner error.
