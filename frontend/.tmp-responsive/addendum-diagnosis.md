# Addendum — Diagnosis (Blok 1) — 2026-10-10

Tidak ada edit source; hanya snapshot `.tmp-responsive\snapshot-addendum-start\` (186 file: src, index.html, package*.json, tsconfig*, vite/postcss/tailwind/playwright/eslint config).
Tidak ada perintah git/gh yang dijalankan. Konteks (progress.md, final-report.md, skills) dibaca; pekerjaan sebelumnya (drawer, kalender, tabel scroll, peta 600px)
tidak diulang.

## 1. Baseline (sebelum addendum)
| Cek | Hasil |
|---|---|
| typecheck | 0 error |
| build | sukses |
| Playwright penuh | **71/71** (4.6m) |
| lint | 86 error / 213 warning — **angka naik karena `.tmp-responsive\snapshot-addendum-start\` ikut di-lint**; src asli 17 error (pra-ada), proyek tanpa snapshot = 46. Bukan regresi. |
Screenshot + metrik: `.tmp-responsive\addendum-baseline\` (login 8 viewport; sales, reports, room-list, reservation-list, invoice-list, user-list @375/768/1440).

## 2. Akar masalah per item

### 2.1 Sales — "Revenue by Source" dan "Sales vs Expenses (Bulanan)"
Bukti terukur @375 (`probe-grid`): `.fin-grid-2` lebar 311px tetapi kolom grid = **437.3px**; kedua kartu 437px, `.pms-main` scrollWidth 469 > 375 (overflow).
Penyebab berantai:
1. `finance-responsive.css:91-96` — `.fin-grid-2 { grid-template-columns: 1fr }`. `1fr` = `minmax(auto,1fr)`: kolom tak bisa lebih kecil dari min-content kartu.
2. `Card` (`Card.tsx`) tidak punya `min-width: 0`; item grid memakai min-content.
3. Min-content kartu = tabel: `Table.tsx` `.tbl` mobile `table-layout:auto` (`globals.css`, pekerjaan sebelumnya) + sel `nowrap` kolom pertama -> lebar tabel 401px.
4. Grafik bulanan `SalesChart.tsx:27,37` — label `width: 70px` + nilai `width: 120px` (11px) + bar `flex:1`: sisa untuk bar tinggal ±50px di 311px, nilai
   "Net: -Rp 44.400.000" bisa terdorong keluar; tanpa `min-width: 0`/wrap.
Tablet 768: tidak ada overflow halaman, tetapi **nilai StatsCard terpotong** (`Rp 49.900.000` 28px di kartu `minmax(200px,1fr)`; `clipped` 4 elemen) dan kolom tabel padat.

### 2.2 Reports — "Pengeluaran per Kategori" dan "Ringkasan Invoice"
Bukti @375: grid kedua `.fin-grid-2` kolom 434.7px dalam 311px; `.pms-main` scrollWidth 467. Penyebab:
1. Sama seperti 2.1 (`1fr` + tabel `.tbl` min-width + auto-layout).
2. `ExpenseChart.tsx:28-32` — baris flex: titik 12px + label `width:100px` + bar `flex:1` + nilai `width:100px` (+ 3 gap 8px) = ±236px tetap; tersisa ±40px untuk bar di 279px;
   nilai `Rp 1.500.000` (14px) memotong/menimpa bar (terlihat di screenshot: "Rp 4…" terpotong), label panjang tidak truncate.
3. `ReportPage.tsx:310` grid ringkasan `repeat(auto-fit, minmax(110px,1fr))` + 3 petak; di 279px hanya 2 muat -> petak ke-3 turun/terpotong ("Ov…").
4. Tabel "Ringkasan Invoice" 4 kolom (Nomor/Tamu/Status/Total) memakai `.tbl` sama; kolom Total terpotong di sisi kanan.

### 2.3 Login (semua halaman `AuthSplitLayout`: login, register, forgot, reset)
Dari screenshot 375/768/812x375:
- Tombol **Login/Sign Up setinggi ±18px** (`auth-split.css:285-287` `.auth-actions {flex-direction: column}` + `.auth-actions > * {flex: 1}` -> `flex-basis:0` di arah kolom = tinggi runtuh).
- Layout tumpuk (<=768px): panel form tidak mengisi layar, panel gelap 200-240px di bawah, lalu **blok kosong abu-abu** (shell `min-height:100vh` tetapi anak `flex:none`), tidak ada centering vertikal.
- Brand rata kiri kecil, jarak vertikal besar & tetap (padding 24/32/48px px, tidak proporsional); dekorasi (kotak 160px, lingkaran 320px) menimpa caption pada panel gelap.
- 768x1024: kartu form 480px tidak di tengah secara vertikal, ±465px kosong.
- 812x375 (landscape): `max-width:768px` tak terpenuhi -> split 50/50, form harus discroll; tombol OK tapi sempit.
- `100vh` dipakai (bukan `dvh`) -> keyboard on-screen menutupi.
Input sudah 16px di mobile (aturan global) dan 44px tinggi; checkbox "Remember me" 18px dalam label 44px — OK.

### 2.4 Tabel (semua)
Inventaris:
- **Shared `Table.tsx`: 10 halaman** (Dashboard, Expenses, InvoiceList, Report x2, Sales x2, PermissionList, RoleList, RoomTypeList, RoomList, UserList) — satu-satunya implementasi `<table>` interaktif.
- Raw `<table>` lain: `InvoicePrintDocument.tsx`, `ReportPrintDocument.tsx` (khusus cetak; tidak disentuh).
- Pseudo-tabel div (flex/grid): `ExpenseChart`/`SalesChart` (baris bar), `ReservationCard` list, `PermissionCheckboxGrid`, `inv-itemrow` (form invoice), `ActivityFeed`. Bukan tabel data -> di luar mekanisme tabel (grafik ditangani di 3A/3B).
Ukuran baris diatur **inline** di `Table.tsx` (`cellPad` 12px 16px / compact 6px 8px; `headFont` 12/11px; `bodyFont` 14/13px) -> inline mengalahkan CSS.
Mekanisme terbersih (tanpa `!important` utama):
1. `Table.tsx`: pindahkan `padding`/`font-size` th/td dari inline ke kelas (`.tbl--comfortable` / `.tbl--compact` yang mendefinisikan `--tbl-py/--tbl-px/--tbl-fs-head/--tbl-fs-body`); nilai desktop identik.
2. `globals.css` (satu tempat): variabel parameter `--row-scale-mobile/tablet`, `--text-scale-mobile/tablet`, `--text-floor-mobile/tablet`, `--floormap-scale-*`.
3. Di `@media (max-width:767px)` dan `(min-width:768px) and (max-width:1023px)`: `.tbl th, .tbl td { padding: calc(var(--tbl-py)*scale) calc(var(--tbl-px)*scale); font-size: max(floor, calc(var(--tbl-fs-*) * scale)); }`.
4. Kontrol dalam baris: ganti `min-height:44px` (yang kini menggemukkan baris) dengan area-sentuh `::after` (inset negatif) pada `.tbl-wrap button, a`.
Inline yang masih mengalahkan CSS: `Badge` (fontSize inline 11/12px) dan `<span style fontWeight>` di sel render, tombol aksi off-palette (inline px). Badge: override terkurung `.tbl td [style*='font-size']`
dalam media query (komentar jelas) — tak terhindarkan tanpa menyentuh `Badge.tsx`; alternatif lebih bersih: beri `Badge` className `badge` lalu atur ukuran lewat CSS (1 file kecil).
Aturan lantai teks 12px lama (`globals.css` atribut `[style*='font-size: 11px']`) harus dikecualikan untuk sel tabel & label peta agar tidak membatalkan skala 10/11px.

### 2.5 Peta kamar (`FloorMapCard.tsx`)
Kamar sudah diposisikan **proporsional** (`left/top/width/height` dalam %, kotak `aspect-ratio: 16/9`). Yang tetap piksel: ukuran font label (14/11px; grup 8px), border 1-3px, padding 2px,
tab lantai & legenda (13/12px), serta `min-width:600px` + scroll (pekerjaan sebelumnya). Pendekatan: hapus `min-width:600px` di <=1023px; kotak peta mengikuti lebar kontainer (100%);
skala tipografi lewat **container query units** (`container-type:inline-size` pada pembungkus; `font-size: max(floor, calc(Npx * scale))`) — tanpa `transform: scale`.
Konsekuensi: pada 303px lebar, kamar ±22px (tap < 44px) — sesuai instruksi (override) dan akan dilaporkan.

## 3. Usulan perbaikan (level file)
| Item | File | Perubahan | Risiko desktop |
|---|---|---|---|
| Login | `auth-split.css` (hanya media query <=1023/<=767/landscape), `AuthSplitLayout.tsx` (className tambahan saja) | lihat 4 | Low |
| Sales/Reports grid | `finance-responsive.css` (`minmax(0,1fr)` di <=1023), `Card.tsx` (`min-width:0` via className/CSS) | tabel/grafik tak melebihi kartu | Low |
| Grafik bar | `SalesChart.tsx`, `ExpenseChart.tsx` -> className + CSS (flex `min-width:0`, truncate label, nilai wrap) | nilai desktop identik | Low |
| Ringkasan Invoice | `ReportPage.tsx` (className pada grid petak) + CSS | Low |
| StatsCard tablet | `StatsCard.tsx` (className) + CSS `clamp()` di <=1023 | Low |
| Tabel global | `Table.tsx` (kelas, buang `cellPad/headFont/bodyFont` inline), `globals.css` (variabel + media) | **Med** (menyentuh 10 halaman; diverifikasi pixel-diff 1440) |
| Hit-area ::after | `globals.css` | Med (overlap area sentuh antar baris — dilaporkan) |
| Peta kamar | `FloorMapCard.tsx` (className label), `globals.css` | Low |

## 4. Konsep layout login (kata-kata)
- **Mobile (<=767px):** satu kolom dalam wadah `min-height: 100dvh` (+ `env(safe-area-inset-*)`), diratakan vertikal di tengah, scroll aman saat keyboard muncul.
  Header brand ringkas di atas (panel gelap diciutkan menjadi pita brand kompak di atas form: nama + subtitle satu baris, tinggi `clamp(88px, 18dvh, 140px)`, dekorasi disembunyikan),
  lalu kartu form lebar fluid (`max-width: 28rem`, padding `clamp(16px, 5vw, 24px)`), judul `clamp(22px, 6.5vw, 28px)`, jarak `clamp()`.
  Tombol Login/Sign Up **bertumpuk, tinggi 48px, lebar penuh**, input 16px/48px, area "Remember me" & "Forgot password?" 44px.
- **Tablet (768-1023):** kartu tengah (max-width ~34rem) di tengah layar vertikal+horizontal di atas kanvas; pita brand di atas kartu; tidak ada ruang kosong berlebih (kartu `margin:auto`).
  Landscape (812x375, 1024x768): split 2 kolom tetap dipakai bila tinggi >= 480px; di bawah itu form satu kolom tanpa panel gelap (hemat tinggi).
- Warna/token/logo/teks tetap; hanya tata letak. Id, label, name, urutan fokus tidak berubah.

## 5. Risiko regresi desktop ringkas
Login Low | Grid finance Low | Grafik Low | Tabel global Med | Peta kamar Low.

## 6. Pertanyaan terbuka (butuh jawaban sebelum Blok 2)
1. **Konflik definisi desktop:** addendum menyatakan "Desktop (>=1024px) identik", tetapi pekerjaan sebelumnya (disetujui) mengubah 1024-1279px: sidebar boot rail <1280 dan lantai teks 12px <=1279.
   Pertahankan perilaku 1024-1279 itu (rekomendasi: ya; parameter tablet baru hanya <=1023), atau kembalikan 1024-1279 ke tampilan lama?
2. Layout login dipakai bersama login/register/forgot/reset: terapkan relayout ke **semua** halaman auth (rekomendasi) atau hanya `/login`?
3. Peta kamar skala 0.5 di mobile membuat kamar ±22px (<44px). Terima sebagai instruksi eksplisit (saya akan laporkan), atau tambah mode "ketuk-besar" (popup besar saat dipilih)? Rekomendasi: terima.
4. Area sentuh `::after` pada tombol tabel akan saling overlap antar baris pada skala 0.5 (baris ±24px). Terima, atau tombol aksi tabel dibiarkan 32px bila overlap?
5. Teks tabel/label peta 10px (mobile) / 11px (tablet) menggantikan aturan 12px hanya untuk tabel & peta — konfirmasi bahwa teks lain (kartu, form, legenda) tetap >=12px.

Menunggu konfirmasi untuk Blok 2.

---

## Jawaban pemilik untuk pertanyaan §6 (dicatat)
1. Perilaku 1024-1279px dari pekerjaan sebelumnya **dipertahankan**; parameter tablet baru hanya <=1023px. (Desktop "identik" = >=1280 dibandingkan pekerjaan sebelumnya; >=1024 dibandingkan baseline addendum untuk selain yang sudah disetujui.)
2. Relayout login berlaku untuk **semua halaman auth** (`AuthSplitLayout`: login, register, forgot, reset).
3. Peta kamar skala 0,5: **diterima** (target sentuh <44px akan dilaporkan).
4. Area sentuh `::after` tombol tabel: **diterima** (overlap antar baris dilaporkan).
5. Skala teks (10px mobile / 11px tablet floor): **global kecuali sidebar/navbar** (drawer, topbar, sidebar rail). Catatan interpretasi di bawah.

Interpretasi #5 yang akan saya pakai kecuali dikoreksi: (a) skala berlaku untuk konten halaman (`.pms-main`, termasuk kartu, form, badge, judul) di <=1023px, **bukan** `.pms-side`/`.pms-topbar`; (b) `input/select/textarea` tetap >=16px di mobile (aturan iOS); (c) halaman auth/login memakai ukuran `clamp()` dari desain referensi (bukan skala global);
(d) halaman publik (home, about, dst.) tidak termasuk (bukan area PMS). Peringatan keterbacaan: dengan skala 0,5 teks 14px menjadi 10px (floor) — keterbacaan menurun; dapat dinaikkan lewat satu variabel `--text-floor-mobile`.

## Login reference mapping (pengganti langkah 1.5)

Referensi: `.tmp-responsive\references\login_mobile.jpg` (dilihat). Ponsel kiri = layar login: hero gelap dengan sudut kanan-bawah sangat membulat dan foto tinted, lencana logo lingkaran + "Welcome Back!",
sheet putih yang menimpa hero dengan sudut kiri-atas besar, input gaya garis-bawah (label kecil di atas, garis kuning saat aktif), "Remember me" + "Forgot Password?", tombol LOGIN penuh,
baris "Don't have an account? SIGN UP", tautan "Skip" kanan-atas, lingkaran dekoratif di latar. Ponsel kanan = layar "Create Account" (tidak ada padanan; register memakai layout sama — hanya judulnya yang berbeda).

### (a) Masalah mobile saat ini (dari screenshot baseline `addendum-baseline\*\login.png`)
- Tombol Login & Sign Up setinggi ±18px (`auth-split.css:285-287`: `flex-direction:column` + `.auth-actions > * {flex:1}` -> `flex-basis:0` meruntuhkan tinggi).
- Panel gelap (`.auth-visual`) ditumpuk di BAWAH form, `min-height:200-240px`, lalu blok kosong abu-abu (`.auth-split` min-height `100vh` tetapi anak `flex:none`).
- Tidak ada logo gambar (hanya link teks `.auth-brand`), dekorasi kotak 160px + lingkaran 320px menimpa caption.
- Jarak tetap px (24/32/48px), tidak proporsional; judul 24-28px tetap; `100vh` (bukan `dvh`) -> keyboard menutup; landscape 812x375 = split 50/50 yang discroll.
- Tidak ada overflow horizontal (metrik: pageOverflow tidak ada, wide 0 di semua 8 viewport); input sudah 16px, tinggi 44px.

### (b) Pemetaan elemen referensi -> halaman login yang ADA
| Elemen referensi | Padanan yang sudah ada | Tindakan |
|---|---|---|
| Hero gelap bersudut besar | `.auth-visual` + `.auth-visual-placeholder` (panel gelap token ink) | Dipindah ke atas (CSS `order`), sudut kanan-bawah membulat |
| Judul "Welcome Back!" | Caption hero `<strong>` (nama produk) + `h1.auth-heading` "Welcome back" | Pakai teks yang ada: caption = judul hero; `h1` tetap di sheet. **Tidak** menambah teks baru |
| Lencana logo lingkaran | Tidak ada gambar logo di login; aset `assets/LogoWhite.png` sudah ada (dipakai PMSLayout) | Lencana CSS (lingkaran bronze) berisi aset logo yang ada — satu `<img>` dekoratif (`alt=""`) ditambahkan di hero; **catatan: ini satu-satunya elemen DOM baru, memakai aset yang ada, sesuai instruksi "use the existing logo asset"** |
| Sheet putih menimpa hero | `.auth-panel` / `.auth-panel-inner` | Margin-top negatif, sudut kiri-atas besar |
| Input garis-bawah + label kecil | `Input` (label di atas + kotak) | Gaya garis-bawah via CSS khusus `.auth-form` di <=1023px (override inline `border/padding/height` — butuh `!important` terkurung + komentar) |
| Remember me | `.auth-remember` (ada) | Relayout |
| Forgot Password? | `.auth-link` (ada) | Relayout |
| Tombol LOGIN penuh | `Button type=submit` (ada, warna bronze inline) | Penuh lebar, 48-52px; warna/hover/loading tidak berubah |
| "Don't have an account? SIGN UP" | Tombol outline "Sign Up" (ada) — tanpa baris teks | Tombol Sign Up tetap; **baris teks footer TIDAK ditambahkan** |
| Lingkaran dekoratif | pseudo-elemen placeholder (1 lingkaran + 1 kotak) | Ganti dengan 3-5 lingkaran CSS via `radial-gradient` berlapis (tanpa DOM baru), token saja |
| Foto latar hero | `AUTH_HERO_IMAGE = ''` (tidak ada) | Warna datar token (+ gradient token opasitas rendah); jika `AUTH_HERO_IMAGE` kelak diisi, tampil opasitas rendah |
| "Skip" (kanan atas) | Tidak ada | **Tidak ditambahkan** |
| Panah kembali, judul "Create Account", Phone/Date of birth/Confirm Password | Tidak ada di login (register punya layout sendiri) | **Tidak ditambahkan** |
| Tombol show/hide password | Tidak ada | **Tidak ditambahkan** (aturan hit-area tak berlaku) |

### Token yang dipakai (dari `src/index.css:7-28`; tidak ada warna/token baru)
| Peran | Token |
|---|---|
| Latar hero | `--color-ink` `#232D36` (panel gelap yang sudah ada) |
| Sheet form | `--color-surface` `#FFFFFF` |
| Kanvas halaman / area di balik kartu tablet | `--color-canvas` `#EEEDE9` |
| Aksen: garis bawah fokus, lencana logo, lingkaran dekoratif | `--color-bronze` `#97764D` (hover `--color-bronze-dark` `#7D6240`; lingkaran sekunder `--color-line` `#C7BBAB` opasitas rendah) |
| Garis bawah netral | `--color-line` `#C7BBAB` |
| Label/judul | `--color-ink`; teks sekunder `--color-slate` `#6B7881` |
| Tombol utama | warna inline yang ada `#97764D` / hover `#7A5E3E` (tidak diubah) |
Kontras: putih di atas `#232D36` ≈ 13:1 (>=4.5); `#6B7881` di atas putih ≈ 4.6:1 (lolos 4.5 untuk teks normal).

### Catatan struktur & risiko
- Urutan DOM: form (panel) lalu visual. Hero tampil di atas hanya via CSS `order`; urutan Tab tidak berubah (hero `aria-hidden`, tidak fokusabel). Link brand `.auth-brand` tetap ada di sheet (diperkecil) — ia satu-satunya tautan "home" dan dirujuk tes (`getByText(/joglo seruni/i).first()`).
- Selector tes login (placeholder `john@hotel.com`, `Enter your password`, tombol `Login`, alert) tidak berubah.
- Override inline Input (`border`, `height`, `padding`, fokus imperatif) tak bisa dihindari tanpa `!important`; dikurung di `<=1023px` dan scope `.auth-form`.
- Desktop >=1024px: aturan baru seluruhnya di media query; identik piksel (diverifikasi pixel-diff 1440 + 1024).

Menunggu konfirmasi untuk Blok 2.
