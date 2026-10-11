# Phase 2 — Laporan Temuan Baseline (STOP sebelum Phase 3)

Tanggal: 2026-10-09. Bahasa: Indonesia. Tidak ada satu pun file source yang diubah pada Phase 0–2.

Ringkasan 15 baris (aturan §0.1): In-scope = RWD-002 (drawer), RWD-001 (kalender),
RWD-003 (html font-size), RWD-004 (tombol WA Contact), RWD-005 (header wrap),
UI-008 (font 11px), FloorMapCard, RoomSelector, Modal full, wrapper tabel
overflow-hidden, touch target ≥44px, dan overflow horizontal level halaman.
Out-of-scope = SEC-*/UX-001/UX-004 (logika/perilaku), UI-001..007 (warna/brand),
A11Y-001..009 + UX-002/003/005..008 (aksesibilitas/form), ARC-001..007 +
UI-010..014 (arsitektur/konten). 5 constraint terberat: (1) desktop ≥1280px
harus identik piksel, (2) tanpa perubahan business logic/API/rute/permission,
(3) tanpa perubahan warna/token/brand, (4) suite Playwright tetap hijau, tanpa
rename data-testid/role/label/teks, (5) inline style tidak bisa pakai media
query — responsivitas hanya via className/CSS yang ada.

## A. Baseline pengujian

Script yang ditemukan:
- `dev` = `vite`, `build` = `tsc -b && vite build`, `lint` = `eslint .`,
  `typecheck` = `tsc --noEmit`, `test:e2e` = `playwright test` (headed Chromium,
  `slowMo: 150`, melayani `vite preview` di 5173; backend prasyarat manual
  `wrangler dev` di 8787).
- Login pengujian memakai `e2e/helpers.ts` (`loginAsAdmin`, kredensial dari
  konstanta yang sama — tidak ada hardcode baru; mekanisme dipakai ulang
  via import di `.tmp-responsive/capture.spec.ts`).

Hasil suite SEBELUM perubahan (build fresh dari tree saat ini):
- Run 1 (sebelum seed D1 lokal): 55 passed / 16 failed. Semua 16 gagal di
  `loginAsAdmin` — halaman login menampilkan alert
  "Cannot reach the API server. Is the backend running?" (bukti:
  `test-results/02-auth-...-499a9-.../error-context.md`). Ini masalah
  environment (API tak terjangkau), bukan kode aplikasi.
- Setelah `npm run db:migrate:local` (no-op) + `npm run db:seed:local` di
  backend (backend sudah listen di 8787): Run 2 = **70 passed / 71 failed**.
  Satu-satunya gagal: `SCN-06-09 permissions list renders` — race timing di
  test itu sendiri: membaca `body.innerText` tanpa wait, sehingga tertangkap
  saat konten masih "Loading..." (snapshot menunjukkan tabel permissions
  ter-render sesaat sesudahnya). Dijalankan terisolasi: **1 passed (4.3s)**.
  File yang disentuh test & halaman tersebut tidak ada dalam daftar file
  dirty — kegagalan pra-ada, bukan regresi pekerjaan ini.
- Catatan vs audit: audit mengklaim 45/45, tetapi suite saat ini berisi
  **71 test dalam 8 file** (ada `e2e/10-invoice-stamp.spec.ts` baru +
  penambahan lain; `docs/PLAYWRIGHT_TEST_RESULTS.md` tertanggal 2026-09-30).
  Jadi baseline jujur = 70/71, bukan 45/45.

Baseline visual: `.tmp-responsive/capture.spec.ts` (headless, reuse helper
login, read-only) menangkap **109 PNG** (18 halaman × 6 viewport + 1 upaya
maju wizard) di `.tmp-responsive/baseline/<viewport>/<page>.png` dan
`.tmp-responsive/baseline/metrics.json` (font html/body, overflow halaman,
sidebar, elemen lebih lebar dari viewport, target <44px, teks <12px, font
input). Halaman detail diambil via GET read-only (id pertama dari API).
Wizard langkah 2–3 TIDAK tercapai tanpa side effect: tombol "Save &
Continue" diblokir validasi (sama seperti SCN-04-04), URL tidak berubah —
RoomSelector versi render belum terverifikasi visual (lihat H).

## B. Penyebab nyata "terlalu besar" (peringkat dampak)

1. **Tabel fixed-layout dengan 5–8 kolom diremas ke ~315px** — sel menumpuk
   vertikal huruf-per-huruf, baris jadi sangat tinggi, scroll berkilo-meter.
   Terparah: `invoice-list` (8 kolom, 375x812/invoice-list.png),
   `user-list` (6 kolom, 375x812/user-list.png). Klaim audit "tabel
   acceptable" TERBANTAH untuk kedua halaman ini.
2. **Kalender `minWidth: 700px`** — di 375px hanya ~2,5 dari 7 kolom
   terlihat, scroll di dalam kontainer + sel 80px → halaman sangat panjang
   (375x812/reservation-calendar.png). Di 768px justru muat penuh (pas).
3. **FloorMapCard absolut-% dalam 16/9 selebar ~300px** — ruangan jadi
   target 17×17px, label 8px bertumpuk tak terbaca
   ("SEWA JOGLO/Swimming Pool" menimpa nomor, 375x812/room-list.png).
4. **Skala desktop dipertahankan penuh di mobile (semua px)** — h1 24px,
   padding kartu, tombol 44–52px, pil filter full-width bertumpuk: tiap
   halaman jadi "besar" dan panjang. Ini inti keluhan subjektif: tidak ada
   yang mengecil, semuanya dijejalkan.
5. **Marquee dashboard** (kartu statis 230px, `overflow: hidden`) memotong
   kartu stat dan quick action di mobile ("+ Inv…" terpotong,
   375x812/dashboard.png).
6. **Sidebar mode rail 60px di mobile** — label hilang total, konten
   kena `margin-left: 60px` (bukan full-width), tanpa semantik drawer
   (tanpa backdrop/Escape/tutup-saat-pindah-rute).
7. **Target <44px di mana-mana** (tombol 44×36/46×36, aksi tabel, ruangan
   peta 17px; user-list 49, room-list 47, invoice-list 24 pada 375px) +
   **input 14px** (risiko iOS auto-zoom) + teks 11px/8px.
8. **Wizard: grid `minmax(250px,1fr)`** → input meluber keluar kartu di
   375px (375x812/reservation-wizard-new.png).
9. **Detail reservasi: kotak gelap "Remaining Balance"** memotong teks
   nominal ("Rp 1.500.00…", 375x812/reservation-detail.png).

Angka kunci (metrics.json): `pageOverflow=false` di SEMUA 108 kombinasi
halaman×viewport; sidebar `fixed`, 60px (<1024, share 0,16 di 375) /
240px (≥1024, share 0,23 di 1024); html 13px (≤480) / 14px (768) / 16px
(≥1024); body selalu 14px.

## C. Status tiap item in-scope

| ID | Status | Bukti | Penyebab nyata | Usulan fix (level file) | File yang disentuh | Risiko desktop | Effort |
|---|---|---|---|---|---|---|---|
| RWD-001 | Confirmed | calendar.png 375 (2,5 kolom); div 700px di metrics | `minWidth: 700px` + sel 80px | Layout mobile (agenda/list atau grid kompak + sticky header, `max-width` query) di CSS/class baru di `CalendarView`, tanpa duplikasi logika | `CalendarView.tsx`, `reservation-list.css` (reuse pola), mungkin `ReservationCalendarPage.tsx` | Low (query ≤767px) | M |
| RWD-002 | Partially | Klaim "240px = 64%" TERBANTAH: boot rail 60px via `useState(window.innerWidth >= 1024)` (`PMSLayout.tsx:115`); tapi label hilang, konten `margin-left: 60px`, tanpa drawer | Tidak ada drawer/backdrop/Escape/route-close; rail manual | Drawer <768px (hamburger ≤56px, backdrop, Escape, tutup saat rute berubah), reuse mode rail; konten full-width di mobile; semua query `max-width` | `PMSLayout.tsx`, `pms-layout.css` | Med (shell dipakai semua halaman; kunci desktop ≥1280 identik via query) | M |
| RWD-003 | Refuted (sebagai masalah) | html 13/14/16px terukur; NOL unit `rem` di seluruh src (27 hit grep semuanya `removeEventListener`/`remaining`); token semua px; Tailwind tak dipakai (tanpa `@import`, tanpa utilitas `sm:/md:/text-*`) | Aturan mati (dead code), duplikat di 2 file | HAPUS (cleanup, delta visual nol) — lihat D | `globals.css:222-232`, `index.css:181-187` | None (desktop sudah 16px) | S |
| RWD-004 | Refuted | contact-public.png 375: tombol sebaris dalam flow, tanpa overlap | `position: sticky; top: 12px; zIndex: 1` di dalam section, halaman pendek | TIDAK diubah; opsional hardening `zIndex` bila terbukti overlap saat scroll (butuh bukti) | — (tidak disentuh) | — | — |
| RWD-005 | Refuted | Header 1 anak, tanpa overflow di semua viewport (metrics wide=0) | Tidak ada 2 kolom yang berdesakan | TIDAK diubah; `flexWrap`+`gap` opsional sebagai hardening 2 baris | — (tidak disentuh, atau 1-blok kecil) | None | S |
| UI-008 | Confirmed | Kode: grup 11px (`PermissionCheckboxGrid.tsx:73`), `(role)` 11px (:104), hint 11px (:114); PLUS temuan: label peta 8px (`FloorMapCard.tsx:218`) | Hardcode px di bawah minimum 12px | Naikkan ke ≥12px (hanya nilai, di `max-width` query atau global — samakan visual desktop? desktop ikut naik 1px; alternatif batasi query mobile. Diputuskan di Phase 3) | `PermissionCheckboxGrid.tsx`, `FloorMapCard.tsx` | Low | S |
| FloorMapCard | Confirmed | room-list.png 375 + target 17px + teks <12px ×22 | Persen-absolut dalam 16/9 + `overflow: hidden` | Kontainer scroll horizontal dgn min-size wajar ATAU susun bertumpuk; tanpa ubah data/klik | `FloorMapCard.tsx` (+ CSS bila perlu) | Low | M |
| RoomSelector | Partially | Kode `minmax(160px,1fr)` (:129); render mobile BELUM terfoto (wizard langkah 2 tak tercapai read-only) | Pada 375px konten ~230px → 1 kolom, mestinya aman; risiko hanya <~200px | Hardening `minmax(min(160px,100%),1fr)` 1 baris | `RoomSelector.tsx` | None | S |
| Modal full | Tidak dipakai | NOL call-site `size="full"`; bottom-sheet ≤640px terkonfirmasi (`modal-responsive.css:14`) | — | TIDAK diubah | — | — | — |
| Table overflow hidden | Non-issue di RoomList (stack 1 kolom ≤1024, metrics wide=0); masalah NYATA = squeeze kolom di user/invoice/role lists | `tableLayout: fixed` + 6–8 kolom | Sticky kolom pertama + scroll horizontal di wrapper halaman BERMASALAH SAJA (user, invoice; cek role), bukan card-list global | CSS tabel + halaman terkait | Low–Med | M |
| Touch target | Confirmed | user-list 49, room-list 47, invoice-list 24, dashboard 9 (375px); sampel: tombol 44×36, aksi tabel, ruangan 17px, link 25×94 | Tinggi 36px (size sm), ikon tanpa hit-area, ruangan absolut | Perbesar hit-area (padding/pseudo-element) hanya komponen yang disentuh; jarak ≥8px | File komponen yg sama dgn baris di atas | Low | M |
| Page overflow | Refuted | `pageOverflow=false` 108/108 | Scroll terjadi di kontainer dalam (kalender, marquee, main) — secara kriteria "halaman" lolos | TIDAK ada fix overflow halaman; fokus ke kliping kontainer-dalam (marquee, tabel, kotak balance) | — | — | — |

## D. Keputusan RWD-003: HAPUS

Angka: `html` terkomputasi 13px (375/430), 14px (768), 16px (1024/1366/1440);
`body` 14px di semua viewport (token px, bukan rem). Pencarian: 0 unit `rem`
asli di `src/` (semua hit = `removeEventListener`/`remainingBalance`/
`REMEMBER_KEY`); 0 utilitas Tailwind (`sm:/md:/text-*/p-*/gap-*` tidak ada;
bahkan `@import "tailwindcss"` tidak ada di src). Semua token
(`--font-size-*`, `--space-*`) px. Opsi: (a) pertahankan → nol efek, jebakan
masa depan; (b) ubah nilai → tetap nol efek; (c) HAPUS → nol efek visual di
SEMUA viewport (desktop sudah 16px) + hilangkan duplikasi membingungkan di
`globals.css:222-232` dan `index.css:181-187` (keduanya ter-load via
`main.tsx`). Rekomendasi: **(c) hapus kedua blok**, dengan screenshot
before/after sebagai bukti nol-delta. Ini satu-satunya item RWD yang
"diperbaiki" tanpa mengubah satu piksel pun.

## E. Temuan tablet

- 768 portrait: dashboard dan kalender tampil BAIK (kalender 7 kolom muat
  penuh; ~676px konten vs 700px min — pas, sedikit padat tapi tanpa scroll).
  Rail 60px + konten single-column bekerja.
- 1024 landscape: sidebar penuh 240px (23% viewport) + grid desktop 12 kolom
  → kartu stat, quick action ("Log A…"), dan tile invoice TERPOTONG di tepi
  kanan kontainer (1024x768/dashboard.png). Ini temuan tablet terbesar:
  breakpoint boot sidebar (`>=1024` → full) terlalu rendah untuk grid
  desktop yang rakus.
- Rencana: perpanjang mode rail/drawer hingga <1280px (desktop ≥1280 tak
  tersentuh) ATAU buat grid dashboard mengikuti lebar konten; grid 2 kolom
  di 768–1023 sesuai aturan (tidak meregangkan layout 1 kolom mobile).

## F. Yang luput dari audit (in-scope saja)

1. Tabel user/invoice tidak usable (audit: "acceptable") — bukti §B.1.
2. Input wizard meluber keluar kartu di 375px (`minmax(250px,1fr)`).
3. Kotak "Remaining Balance" memotong nominal di 375px.
4. Marquee memotong konten di mobile (bukan sekadar "menggandakan DOM").
5. Rail-mode = navigasi tanpa label; toggle sulit ditemukan (lebih buruk
   dari deskripsi audit §7.5).
6. Aturan RWD-003 duplikat di `globals.css` + `index.css`.
7. `Modal size="full"` tidak dipakai di mana pun (widthMap mati).
8. Input finance-reports 13,33px (<16, zoom-risk) — di luar Input standar.
9. Status render RoomSelector mobile belum terverifikasi (butuh isi
   dummy + maju, tanpa submit — minta izin, lihat I.5).

## G. Noticed but not changed (out-of-scope, hanya dicatat)

Terlihat di screenshot/kode tetapi TIDAK disentuh: tombol aksi biru
`#2563EB`/merah `#DC2626` + hover hitam (UI-002, mis. aksi tabel user/
invoice/room); varian Button identik semua (UI-001); error `#C85C5C`
(UI-003); hexagon token-vs-hardcode (UI-004/005); radius non-token (UI-006);
max-width tak konsisten (UI-007); aksi Check In/Cancel/Edit tanpa gating
tampak (SEC-001); teks "6200000000000"/konten placeholder (UI-013/014);
label tak terasosiasi & tanpa `aria-invalid` (A11Y-001/009);
`role="button"` pada div peta (UI-009/A11Y); tanpa focus-trap/modal
`aria-labelledby` (A11Y-004); tanpa `role="grid"` kalender (A11Y-005);
tanpa `fieldset/legend` grup permission (A11Y-006); bug rute
`/invoices/new` (UX-001); `navigate(0)`; silent error/loading tak
konsisten (UX-002/003); duplikasi cascade filter & `statusVariantMap`
(ARC-001/002); magic numbers (UI-010). Semua tercatat di sini saja.

## H. Rencana implementasi (urutan file aturan; selector aman)

Prinsip selector: tidak ada rename/hapus `data-testid` (mis.
`holiday-marker`), role, aria-label, atau teks yang dipakai
`getByRole/getByPlaceholder/getByText` di `e2e/` (contoh sensitif:
"Filter", "Search reservations", "Save & Continue", "Login",
"john@hotel.com"). Semua perubahan di `max-width` query / prefix
responsif ≤1023px (desktop ≥1280 identik); re-screenshot + suite tiap
langkah.
1. **Drawer (RWD-002)**: `src/layouts/PMSLayout.tsx` (tombol hamburger
   `<button aria-label aria-expanded aria-controls>` baru; drawer menutup
   via backdrop/Escape/perubahan rute; item/link/label/urutan/visibilitas
   permission tidak berubah) + `src/styles/pms-layout.css` (query <768px:
   sidebar off-canvas + backdrop; konten `margin-left: 0`; hormati
   `prefers-reduced-motion`; transisi 150–250ms). Verifikasi keyboard drawer.
2. **RWD-003**: hapus blok di `src/styles/globals.css:222-232` dan
   `src/index.css:181-187`; bukti nol-delta via screenshot diff.
3. **Kalender (RWD-001 + hardening RWD-005)**: `CalendarView.tsx`
   (hilangkan perilaku `minWidth: 700px` di mobile → pola yang disetujui;
   data/filter/popup/navigasi sama; tambah `flexWrap: wrap; gap: 12px`
   pada header `ReservationCalendarPage.tsx:196` sebagai hardening).
4. **Komponen (§6.4 + UI-008)**: `FloorMapCard.tsx` (min-size/scroll atau
   susun; label 8px→≥12px), `RoomSelector.tsx`
   (`minmax(min(160px,100%),1fr)`), tabel user/invoice (+role bila terbukti:
   sticky kolom pertama, tanpa card-list global), `RoomListPage.tsx:388`
   (pastikan `overflow: hidden` tak memotong focus ring/dropdown),
   `PermissionCheckboxGrid.tsx:73,104,114` (11px→≥12px), wizard grid
   (minmax turun agar input tak meluber), kotak balance detail (wrap),
   marquee mobile (wrap ganti scroll-potong), input 14px→16px di mobile
   (termasuk 13,33px reports), target <44px pada komponen yang disentuh.
5. **Tablet pass**: rail/drawer <1280px (khusus 1024), grid 2 kolom
   768–1023, verifikasi 768 + 1024 + regresi 1366/1440.
6. **Verifikasi akhir**: 6 viewport before/after, nol overflow halaman,
   `interface-review` + checklist `better-accessibility` (hanya elemen yang
   disentuh), build+lint+typecheck+suite hijau.

Skill dipakai: better-layout (drawer/kalender), better-interface
(koordinasi), better-typography (skala 12/16px), better-accessibility
(hanya elemen tersentuh), interface-review (final),
full-output-enforcement (output lengkap). mobile-native & apple-design
sebagai referensi pola (hanya ide web). Lainnya di §4 rules tidak relevan
untuk stack ini (animate-expo/write-swift/imagegen-*/brandkit/dsb —
encoding skill eksplisit "Not used") — dicatat sesuai perintah.

## I. Pertanyaan terbuka (hanya yang truly blocking)

1. Race `SCN-06-09` (timing, pra-ada): boleh saya tambahkan wait eksplisit
   di test itu saja pada Phase 3 agar baseline hijau — atau test tetap
   tidak boleh disentuh sama sekali?
2. Pola mobile kalender yang diinginkan: (a) tampilan agenda/list, atau
   (b) grid kompak + scroll dalam dengan header tanggal & kolom ruang
   sticky?
3. Tabel user/invoice di mobile: (a) scroll horizontal + kolom pertama
   sticky, atau (b) kurangi kolom tampil (tanpa card-list global)?
4. Sidebar 1024px: (a) rail 60px, atau (b) drawer seperti mobile?
5. Boleh saya isi field wizard langkah-1 dengan data dummy dan maju ke
   langkah 2–3 untuk baseline foto (TANPA pernah klik submit/final)?

Menunggu konfirmasi untuk lanjut ke Phase 3.
