# Laporan Blok 6 — Invoice Lifecycle, Reports, Money (Sonnet 5.5, Medium)

**Status: SELESAI.** Backend `tsc --noEmit` lulus; `vitest run`: **397 lulus / 0 gagal (30 file)** (Blok 5: 379).
**Snapshot:** `snapshot-block-6\` (dibuat SEBELUM edit pertama).
**Restore (satu baris):** `Remove-Item backend\src,backend\tests -Recurse -Force; Copy-Item .tmp-fix\snapshot-block-6\backend\* backend\ -Recurse -Force`

## 1. Per temuan
| ID | Status | Sebelum -> sesudah | Bukti |
|---|---|---|---|
| BE-019 | FIXED | DELETE invoice Paid/Sent/Cancelled: 204 (riwayat hilang, nomor dipakai ulang) -> 409 + pesan "Hanya invoice Draft yang dapat dihapus ... batalkan (cancel)"; Draft tetap 204. Hapus bersifat bersyarat (`WHERE invoice_status='Draft'`) dalam satu batch; penolakan tidak menulis audit | `tests/invoice-lifecycle.test.ts` (4 tes) |
| BE-020 | FIXED | create dengan Completed+Paid / Sent / Partial: 201 -> 422; PATCH Sent -> Draft+Paid: 200 -> 422. Nilai default (create) atau nilai yang sama dengan tersimpan (PATCH) diterima sebagai no-op; send/pay/cancel tidak berubah | 5 tes |
| BE-022 | FIXED (additif) | Laporan lama TIDAK diubah (Draft tetap dihitung sebagai sales, terdokumentasi). Angka eksplisit: `GET /api/reports/revenue` (billed/paid/unpaid/count/netBilled/netPaid) dan `GET /api/sales/summary` (+ per sumber). Batas tanggal inklusif diuji di invoices, sales, summary, revenue, expenses | 4 + 1 tes |
| BE-031 | FIXED | tanpa batas -> qty <= 10.000, harga/jumlah/tarif/DP <= Rp10 miliar, subtotal invoice <= Rp1 triliun (cek `isSafeInteger`); "1e21", "Infinity", > 2^53 ditolak 422; nilai pada batas dan nilai seed terbesar (Rp45 juta, 28 x Rp1,2 juta) diterima | 4 tes |

## 2. Keputusan yang perlu dikonfirmasi pemilik
1. **D-032 — endpoint baru, bukan field baru.** Prompt: "laporan menambah angka billed vs paid secara additif". Menambah field ke `/reports/summary` atau `/sales` akan mengubah respons yang dikunci golden snapshot Blok 0 (tidak boleh diedit). Karena itu angka baru ada di `/reports/revenue` dan `/sales/summary`; respons lama persis sama.
2. **D-033 — invoice `Sent` masih bisa diedit** (nama, item, diskon) selain statusnya. BE-020 menyarankan mengunci semuanya setelah Sent, tetapi rules 4B hanya mencantumkan status/delete dan mengunci Sent membutuhkan keputusan produk. Perubahan kini tercatat before/after di audit (Blok 3).
3. **Overdue/Partial tidak bisa lagi diset** lewat create/PATCH (tidak ada endpoint aksi). Nilai tersimpan tetap terbaca. Bila fitur pelunasan sebagian dibutuhkan, itu BE-021 (butuh tabel pembayaran).

## 3. Tes yang berubah (semuanya menguji perilaku cacat yang dibalik)
- `golden/known-unsafe.test.ts`: BE-019, BE-020 dibalik; BE-022 diganti menjadi dokumentasi perilaku legacy + cek endpoint baru.
- `finance.test.ts`: "accepts the wide frontend status literals" -> kini 422 (default tetap diterima); tes audit menghapus Draft, invoice Paid kini 409.
- `audit-trail.test.ts`: tes before/after menghapus Draft (bukan invoice yang sudah dibatalkan).
Golden happy-path (12 snapshot), contract (34), role matrix, query budget (26): tidak diubah, lulus.

## 4. Query count
Endpoint yang ada tidak berubah (anggaran lulus tanpa penyesuaian). `/reports/revenue`: 2 statement + autentikasi; `/sales/summary`: 1 statement + autentikasi.

## 5. Kontrak untuk integrasi FE masa depan
Ditulis di `.tmp-fix\contract.md` bagian 7 (endpoint, perubahan, batas nilai, perilaku Overdue/Partial). FE belum memanggil endpoint finance (FE-001), jadi tidak ada call site yang terpengaruh.

## 6. Berkas yang berubah
`src/lib/validation.ts`, `src/services/invoiceService.ts`, `reportService.ts`, `salesService.ts`, `src/routes/reports.ts`, `src/routes/sales.ts`; tes: `tests/invoice-lifecycle.test.ts` (baru, 18 tes), `tests/finance.test.ts`, `tests/audit-trail.test.ts`, `tests/golden/known-unsafe.test.ts`. Tidak ada perubahan: frontend, config, migrations, dependency.

## 7. Risiko residual
1. Menghapus Draft dengan nomor tertinggi membuat nomor itu dipakai lagi (alokasi max+1). Draft belum pernah dikirim/dibayar; counter yang tidak pernah mundur butuh tabel (owner/S1).
2. Invoice `Sent` yang bisa diedit (D-033).
3. `reservationId` pada invoice tetap tanpa FK/rekonsiliasi pembayaran (BE-021, deferred).
4. Pembulatan: `total = round(subtotal - subtotal*discount/100)` tidak berubah.
