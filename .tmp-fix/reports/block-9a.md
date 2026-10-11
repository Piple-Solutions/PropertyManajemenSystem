# Blok 9A — Catatan Desain FE-001: integrasi finance FE ke API (Opus 5.5, High)

**Tidak ada berkas kode yang diubah di 9A.** Sumber: `frontend/src/services/{invoice,expense,sales,report}Service.ts`, halaman pemakainya, `backend/src/routes|services`, `.tmp-fix/contract.md` §7 (kontrak finance setelah Blok 6).

## 0. Ringkasan satu paragraf
Keempat layanan finance FE adalah kelas **sinkron** di atas JSON mock; 9 berkas memanggilnya langsung saat render. Backend sudah menyediakan semua yang dibutuhkan, dan bentuk datanya hampir sama. Yang berat bukan pemetaan endpoint, melainkan (1) mengubah 9 pemakai dari sinkron menjadi async, (2) tidak adanya mekanisme loading/error di halaman finance, dan (3) dua kontradiksi nyata antara form FE dan aturan backend Blok 6 (status invoice, dan diskon nominal vs persen). Rekomendasi saya: **kerjakan sebagian (Tahap 1: baca) sekarang, tunda tulis sampai tiga keputusan UI di §3 dijawab** (lihat §5).

## 1. Pemetaan fungsi layanan -> endpoint

### 1.1 `invoiceService`
| Fungsi FE (sinkron) | Pemakai | Endpoint pengganti | Selisih bentuk / catatan |
|---|---|---|---|
| `getAll(): Invoice[]` | InvoiceListPage, ReportPage, DashboardPage, InvoiceFormPage (hitung nomor), ReservationListPage (peta reservasi->invoice), DayReservationsPopup | `GET /api/invoices` (paging <=100) lewat `fetchAllPages` | Bentuk baris sama (`id, invoiceNumber, reservationId?, guestName, source, invoiceDate, items[], subtotal, discount, total, paymentStatus, invoiceStatus, createdAt, updatedAt`). `totalPaid` TIDAK ada di backend -> `utils/invoicePayment.ts` jatuh ke `paymentStatus` (sudah didukung). Izin: `finance.invoice.view` |
| `getById(id)` | InvoiceDetailPage, InvoiceFormPage (6x saat render), InvoiceListPage | `GET /api/invoices/:id` (404 -> `undefined`) | Dipanggil berulang saat render -> harus menjadi satu state |
| `getByStatus`, `getByPaymentStatus`, `getBySource`, `getSourceBreakdown` | tidak dipakai halaman | `?status=`, `?payment=`, `?source=`, `/api/sales/breakdown` | cukup dipertahankan sebagai filter di klien atas `getAll` |
| `create(data)` | InvoiceListPage, InvoiceFormPage | `POST /api/invoices` | FE mengirim `id` item, `invoiceId`, `subtotal`, `total`, `invoiceStatus`, `paymentStatus`. Backend hanya menerima `invoiceNumber?, reservationId?, guestName, source, invoiceDate, items[{description,quantity,unitPrice}], discount` dan MENGHITUNG ULANG total. **Kontradiksi A (status)** dan **B (diskon)**, lihat §1.5. Izin `finance.invoice.create` |
| `update(id, updates)` | InvoiceListPage, InvoiceFormPage | `PATCH /api/invoices/:id` | sama seperti create; invoice `Completed`/`Cancelled` -> 409. Izin `finance.invoice.update` |
| `delete(id)` | InvoiceListPage | `DELETE /api/invoices/:id` | **Hanya Draft** (Blok 6); selain itu 409 dengan pesan. Izin `finance.invoice.delete` |
| `send(id)` / `markPaid(id)` / `cancel(id)` | InvoiceDetailPage | `POST /:id/send` / `/pay` / `/cancel` | kembalian `boolean` -> respons invoice; yang kalah balapan/ilegal 409 |

### 1.2 `expenseService`
| Fungsi | Pemakai | Endpoint | Catatan |
|---|---|---|---|
| `getAll()` | ExpensesPage, ReportPage, SalesPage, DashboardPage | `GET /api/expenses` + `fetchAllPages` | bentuk sama (`status` selalu ada di backend). Izin `finance.expense.view` |
| `create(data)` | ExpensesPage | `POST /api/expenses` | `category` harus salah satu dari 8 enum; `amount` 1..10 miliar. Izin `finance.expense.create` |
| `getById`, `getByCategory`, `getByStatus`, `getTotalByPeriod`, `update`, `delete` | tidak dipakai UI | `GET/PATCH/DELETE /api/expenses/:id` | bisa dipetakan tetapi tidak ada pemakai |

### 1.3 `salesService`
| Fungsi | Pemakai | Endpoint | Catatan |
|---|---|---|---|
| `getAll()` | SalesPage, ReportPage, DashboardPage | `GET /api/sales` + `fetchAllPages` | Bentuk sama (`id, date, amount, source, description, invoiceId, reservationId?`). **Isi berbeda:** mock `sales.json` adalah tabel tersendiri; backend MENURUNKAN sales dari invoice non-Cancelled (Draft/Sent ikut dihitung = "ditagihkan"). Izin `finance.sales.view` |
| `getSourceBreakdown`, `getSummary`, `getByDateRange`, `getTotalByPeriod`, `getById`, `getBySource`, `create` | tidak dipakai halaman | `/api/sales/breakdown`, `/api/sales/summary` | `create` tidak punya padanan (sales tidak bisa ditulis); dibiarkan |

### 1.4 `reportService` dan dashboard
- `reportService` **tidak dipakai halaman mana pun** (ReportPage menghitung sendiri dari tiga `getAll`). Tidak perlu disentuh; `/api/reports/summary|revenue|top-invoices` tersedia bila kelak ingin perhitungan server.
- `DashboardPage.tsx:87-89` (`sales`, `invoices`, `expenses`) -> tiga `getAll` di atas. Dipakai untuk: Omzet Hari Ini/Bulan Ini, Invoice Tertunda/overdue/paid, grafik pendapatan vs pengeluaran. **Semua pengguna dashboard memanggilnya, termasuk Staff/Reception yang tidak punya izin finance** -> backend menjawab 403.

### 1.5 Dua kontradiksi form FE vs backend (inti keputusan)
**A. Status invoice.** `InvoiceForm` punya dua `<Select>` (Invoice Status: Draft/Sent/Completed/Cancelled; Payment Status: Pending/Paid/Overdue/Partial) dan mengirim keduanya. Sejak Blok 6 backend menolak (422) status selain `Draft`/`Pending` pada create dan setiap PERUBAHAN status pada PATCH.
- Opsi A1 (netral UI, di lapisan service): kirim create/PATCH TANPA status, lalu terjemahkan pilihan form menjadi aksi: `Sent` -> `/send`, `Completed`+`Paid` -> `/pay`, `Cancelled` -> `/cancel`. `Overdue`/`Partial` dan transisi mundur (Sent -> Draft) tidak punya padanan -> ditolak dengan pesan error. Kelemahan: 2 request tidak atomik (invoice bisa tersimpan sebagai Draft lalu aksinya gagal), dan butuh tempat menampilkan error.
- Opsi A2 (perubahan UI = S5): hilangkan/nonaktifkan dua Select itu di form; status hanya lewat tombol Send/Mark Paid/Cancel yang sudah ada di InvoiceDetailPage.
**B. Diskon.** `InvoiceFormPage` menghitung diskon sebagai PERSEN (`subtotal * discount / 100`), `InvoiceListPage` menghitungnya sebagai NOMINAL (`subtotal - discount`), form memvalidasi 0..100, backend memakai PERSEN dan menghitung ulang. Dengan API nyata total SELALU dari server (persen) -> angka invoice yang dibuat lewat modal di halaman daftar akan berbeda dari yang ditampilkan mock hari ini (ini perbaikan bug, tetapi terlihat).

## 2. Per halaman: sinkron hari ini? apa yang berubah? bisakah pakai komponen yang sudah ada?
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

## 3. DAFTAR DAMPAK UI (yang akan terlihat)
### 3.1 Terlihat, tanpa elemen baru (konsekuensi wajar data nyata)
1. Semua halaman finance, tile omzet/invoice di dashboard, dan grafik pendapatan menampilkan **data D1 nyata**, bukan mock. Pada database baru yang tidak di-seed: kosong.
2. **Sales = turunan invoice** (Draft/Sent ikut): angka "Omzet" mengikuti invoice, bukan `sales.json`.
3. Invoice/expense yang dibuat **bertahan setelah reload** (hari ini hilang).
4. **Pengguna tanpa izin finance (Staff, Reception)**: tile Omzet/Invoice dan grafik pendapatan di dashboard menjadi 0/kosong; lencana invoice di daftar reservasi dan popup hari hilang. Hari ini mereka melihat angka mock.
5. Sesaat setelah halaman dibuka, tabel/grafik kosong sampai data tiba (tanpa spinner bila tidak diizinkan menambah elemen).
6. Total invoice dari modal di halaman daftar mengikuti diskon PERSEN (kontradiksi B).
7. Hapus invoice non-Draft, edit invoice Completed/Cancelled, dan aksi status ilegal kini DITOLAK backend.
8. Nomor invoice bisa berbeda dari yang diketik bila bentrok (backend mengalokasikan nomor berikutnya).
9. `Expenses`: halaman butuh `finance.expense.view`. **Grant izin expense untuk role hanya ada di skrip SEED, bukan di migrasi** -> pada D1 produksi yang tidak di-seed ulang, halaman Expenses akan 403 untuk semua role sampai pemilik memberi izin lewat UI role (aksi pemilik).

### 3.2 Membutuhkan elemen visual baru atau perubahan UI -> S5, perlu keputusan
| # | Kebutuhan | Pilihan |
|---|---|---|
| U1 | Menampilkan error tulis/aksi di InvoiceDetailPage, InvoiceFormPage, ExpensesPage | (a) `ErrorState` yang sudah ada, inline (pola yang sudah disetujui di Blok 8); (b) teks `role="alert"` seperti halaman rooms/reservations; (c) tidak ditampilkan (gagal senyap = mengulang FE-004, tidak saya sarankan) |
| U2 | Dua Select status di `InvoiceForm` (kontradiksi A) | A1: biarkan Select, terjemahkan ke aksi di service (tanpa perubahan UI, dua request, pilihan Overdue/Partial akan error); A2: hilangkan/nonaktifkan Select (perubahan UI) |
| U3 | Keadaan memuat | (a) tanpa indikator (kosong sesaat); (b) `emptyMessage="Loading..."`/komponen `Loading` yang sudah ada |
| U4 | Banner `feedback` hijau di InvoiceListPage dipakai untuk pesan error | (a) pakai apa adanya (warna sukses untuk error, menyesatkan); (b) varian warna error (perubahan style) |
Label "billed vs paid" (BE-022) tidak bisa ditampilkan tanpa mengubah teks/tile -> tetap deferred (D3).

## 4. Risiko, usaha, urutan, verifikasi
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

## 5. Rekomendasi
**Kerjakan sebagian sekarang, dengan batas yang jelas** — bukan tunda seluruhnya, karena FE-001 adalah temuan High (data uang tidak persisten, angka dashboard fiktif), dan bukan kerjakan seluruhnya tanpa keputusan, karena bagian tulis tidak bisa dibuat benar tanpa minimal U1 dan U2.
Usulan konkret untuk 9B:
1. **Baca**: semua pembacaan finance (9 berkas) ke API, 403 -> kosong, tanpa elemen baru (U3 = a).
2. **Tulis**: dikerjakan juga, dengan **U1 = (a) `ErrorState` yang sudah ada** (pola Blok 8), **U2 = A1** (Select dibiarkan; service menerjemahkan ke aksi; Overdue/Partial -> pesan error backend apa adanya), **U4 = (a)** hanya untuk pesan SUKSES seperti sekarang, sedangkan error di InvoiceListPage memakai `ErrorState` yang sama agar tidak berwarna sukses.
3. Bila pemilik TIDAK menyetujui elemen error apa pun (U1 = c): saya sarankan **hanya Tahap baca** yang dikerjakan dan tulis ditunda, dengan catatan bahwa tombol create/edit/hapus/aksi akan tetap menulis ke mock in-memory yang tidak lagi terlihat di daftar (membingungkan) — dalam kasus itu lebih jujur menunda seluruh FE-001.
Yang tetap ditunda apa pun pilihannya: label billed/paid, `totalPaid`/pelunasan sebagian (BE-021), menghapus Select status (A2), perubahan gaya banner.

## 6. Yang saya butuhkan dari pemilik sebelum 9B
- "Lanjut ke Blok 9B" **dengan** pilihan: U1 (a/b/c), U2 (A1/A2), U3 (a/b), U4 (a/b) — atau cukup "sesuai rekomendasi".
- Atau "Lewati Blok 9B".
