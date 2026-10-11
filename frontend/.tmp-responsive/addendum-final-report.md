# Laporan Akhir Addendum — Login, Tabel, Overlap Sales/Reports, Peta Kamar (2026-10-10)

Tidak ada perintah git/gh. Perbandingan perubahan memakai hash terhadap `snapshot-addendum-start\` (`hashdiff.cjs`).

## 1. Ringkasan
- Login (semua halaman AuthSplitLayout) di <=1023px: hero + sheet menimpa, input garis-bawah, tombol 52px; tablet = kartu tengah; landscape pendek = 2 kolom. Desktop >=1024 identik.
- Sistem skala satu tempat (`globals.css :root`): tabel (baris/padding/teks) + teks global `.pms-main` (sidebar/navbar dikecualikan) + peta kamar.
- Sales & Reports: overflow halaman hilang (375: Y -> tidak ada), grafik bar membungkus, kartu 2-up tidak melebihi viewport.
- Peta kamar: muat lebar kontainer tanpa scroll; popup menjadi panel bawah (fixed) agar tidak terpotong.
- Hasil verifikasi: tsc 0, build OK, lint src 17 (pra-ada), Playwright **71/71**, desktop 1440 identik kecuali drift data.

## 2. Akar masalah & perbaikan
| Item | Akar masalah (bukti) | Perbaikan |
|---|---|---|
| Sales/Reports overlap | `.fin-grid-2 {1fr}` (min-content) + tabel auto-layout 401px -> kolom 437px dlm kontainer 311px; `.pms-main` scrollWidth 469 | `minmax(0,1fr)` + `min-width:0` anak (`finance-responsive.css`) |
| Grafik bulanan/kategori | lebar tetap 70/100/120px + bar `flex:1` tanpa wrap (`SalesChart/ExpenseChart.tsx`) | kelas `sc-*`/`ec-*` (nilai desktop identik); mobile: label+nilai satu baris, bar baris penuh; label truncate + `title` |
| Ringkasan Invoice | petak `minmax(110px,1fr)` x3 tak muat 279px | `.rep-tiles` -> 3 kolom `minmax(0,1fr)` di mobile |
| Login | tombol runtuh 18px, panel gelap di bawah, blok kosong, `100vh` | blok responsif baru (lihat progress.md) |
| Tabel | padding/font inline (mengalahkan CSS); fixed layout memecah kata per huruf di tablet | kelas density + variabel; auto-layout + scroll di mobile/tablet |
| Peta | font px tetap, `min-width:600px` scroll, popup terpotong | `width:min(100%, 670px*scale)`, label via skala teks, popup fixed |

## 3. File yang diubah (10, hash)
`src/components/AuthSplitLayout.tsx`, `src/styles/auth-split.css`, `src/components/shared/Table.tsx`, `src/styles/globals.css`,
`src/components/shared/SalesChart.tsx`, `src/components/shared/ExpenseChart.tsx`, `src/pages/finance/ReportPage.tsx`, `src/styles/finance-responsive.css`,
`src/components/pms/FloorMapCard.tsx`, `src/components/pms/RoomOccupancyPopup.tsx`. Tidak ada file baru; `e2e/*`, `package.json`, lockfile, rute, permission, token/warna: tidak berubah.
(Catatan: `FloorMapCard.tsx` & `RoomOccupancyPopup.tsx` sudah untracked/kotor sebelum sesi — dibandingkan dgn snapshot, bukan git.)

## 4. Parameter yang dipakai (`globals.css :root`)
ROW_SCALE_MOBILE 0.5 · ROW_SCALE_TABLET 0.75 · TEXT_SCALE_MOBILE 0.5 · TEXT_SCALE_TABLET 0.75 · TEXT_FLOOR 10px (mobile) / 11px (tablet) · FLOORMAP_SCALE 0.5 / 0.75
(skala peta = lebar desain 670px x scale, dibatasi lebar kontainer).

## 5. Di mana floor mengubah 50% literal
Hampir semua teks: 14px*0.5=7 -> 10px; 13->10; 12->10; 11->10; 20px (judul halaman) -> 10px (literal 10); 18 -> 10; 24px -> 12; 28px -> 14 (tidak kena floor).
Tablet: 14*0.75=10.5 -> 11; 13 -> 11; 12 -> 11 (9.75 -> 11); 11 -> 11.
Konsekuensi: hierarki judul vs isi mendatar di mobile (judul 20px == body 14px == 10px). Naikkan `--text-floor-mobile` / `--text-scale-mobile` bila ingin kembali.
Input tetap 16px (mobile) dan 14px (tablet).

## 6. Metrik sebelum -> sesudah (375 | 768)
| Halaman | Overflow @375 | Tinggi baris @375 | Tinggi baris @768 | Font sel @375 | Teks <10 / <11 | Elemen > viewport |
|---|---|---|---|---|---|---|
| Sales | Y -> - | 78->51 | 57->41 | 14->10 | 0 / 0 | 0 |
| Reports | Y -> - | 88->58 | 60->46 | 14->10 | 0 / 0 | 0 |
| Room list | - | 57->35 | 57->38 | 13->10 | 0 / 0 | 0 |
| Invoice list | - | 71->50 | 109->69 | 14->10 | 0 / 0 | 0 |
| User list | - | 69->49 | 79->55 | 14->10 | 0 / 0 | 0 |
Login: 320/360/375/430/768/812x375: overflow tidak ada, overlap 0, input >=16px (mobile).
Input <16px di mobile: 0. Elemen interaktif <44px (diukur dari box): sales 5, reports 15 (tidak disentuh); tabel naik karena hit-area kini lewat `::after` (lihat 7).

## 7. Kontrol yang area sentuhnya kurang
- Tombol/ link dalam baris tabel: box visual 16-91px lebar x ~20-28px tinggi; area sentuh efektif 44px via `::after` (tidak menambah tinggi baris). Pada baris < 44px tinggi, area sentuh antar baris saling overlap (diterima).
- Peta kamar: 10 dari 11 kamar <44px: **21px @375**, **39px @768** (diterima sesuai instruksi).
- Dashboard, filter, wizard (di luar scope): tidak disentuh.

## 8. transform: scale
Tidak dipakai untuk skala peta/tabel/kartu. `transform: translate` dipakai hanya untuk memposisikan `::after` hit-area dan popup peta (bukan mengecilkan).

## 9. Checklist interface-review / better-accessibility (elemen yang disentuh)
- Login: label terlihat di atas input (tetap `<label>`), fokus terlihat (garis 2px + outline), urutan Tab tidak berubah (hero `aria-hidden`), kontras putih/#232D36 ≈ 13:1, tombol 52px, link brand hanya tampil saat fokus. **Catatan:** kontras `#6B7881` placeholder/deskripsi di putih ≈ 4.6:1 (lolos 4.5).
- Peta: popup tetap `role=dialog` + tombol tutup berlabel; room tetap `role=button` (UI-009 tidak diubah).
- Skala teks 10px: di bawah praktik terbaik keterbacaan (WCAG tidak punya batas piksel, tapi 1.4.4 resize 200% tetap bisa); dicatat sebagai risiko.
- Reduced motion: tidak ada animasi baru (entrance login memakai aturan lama yang sudah dimatikan di reduced-motion).

## 10. Elemen referensi login yang tidak ditambahkan
Skip, panah kembali, layar Create Account, baris "Don't have an account? SIGN UP", show/hide password, foto latar hero.
Deviasi sengaja: warna hanya token existing (bronze, bukan kuning referensi); logo = wordmark LogoWhite.png dalam lingkaran bronze (kecil); judul hero = nama produk existing (bukan "Welcome Back!").

## 11. Catatan jujur / sisa
- 1024x768 login tampil layout desktop (>=1024 = desktop sesuai aturan); relayout hanya <=1023.
- Tabel "Revenue by Source"/"Ringkasan Invoice" @375 masih scroll horizontal kecil dalam kartu (kolom terakhir terpotong sampai digeser) — tidak overflow halaman.
- Label grup peta "SPLIT LEVEL" terpotong sebagian di 375 (grup di tepi kanan peta 269px; overlay dgn sel "Swimming Pool").
- Desktop 1440: login/sales/reports/reservation/invoice identik; room-list & user-list beda 419/73 px = drift data (jumlah kamar 31->32, tombol halaman tambahan), bukan CSS.
- Playwright: 71/71 (run final). Flake pra-ada SCN-06-09 sempat muncul di run sebelumnya, lulus terisolasi.
- Noticed but not changed: UI-001..007, A11Y-001/004/005/009, SEC-001/002, UX-*, ARC-*, UI-009 (role=button div peta), kalender tanpa role=grid, tombol aksi tabel biru/merah off-palette, marquee dashboard memotong kartu di mobile, teks SVG chart 1 elemen <10px.

## 12. Bersihkan
Hapus `E:\Project\Web\pms-internal\frontend\.tmp-responsive\` (snapshot, screenshot, spec sementara). `test-results/` & `playwright-report/` = artefak Playwright (ter-ignore).
