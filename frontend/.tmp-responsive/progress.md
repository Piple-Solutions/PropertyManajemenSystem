# progress.md — implementasi RWD (setelah resume-report)

Kebijakan git: tidak ada perintah git yang mengubah state; semua perubahan = edit working tree biasa.
Catatan feedback: kolom "MY FEEDBACK" pada prompt Blok 1 masih berisi placeholder -> diperlakukan sebagai "none".
Keputusan default yang dipakai: F1-F3 + LOW diperbaiki; `viewport-fit=cover` TIDAK disentuh (belum disetujui; index.html di luar scope);
RWD-003 = HAPUS kedua blok (rekomendasi Phase 2, belum ada keberatan).

## Step A0 — perbaikan cacat drawer (Blok 1)
File: `src/layouts/PMSLayout.tsx` (satu-satunya file; CSS drawer lama tetap cocok — backdrop kini `<div>`).
- F1 (HIGH): satu pohon JSX untuk semua breakpoint. Topbar hanya dirender saat `isMobile` (slot tetap), isi `<aside>` yang berganti
  (drawer / sidebar penuh / rail). `<Outlet/>` tidak lagi remount saat melewati 767/768.
- F2: `onClick={closeDrawer}` pada semua `Link` nav (tap rute sama menutup drawer). Header grup di mobile hanya expand/collapse
  (tidak `navigate`), sehingga drawer tidak menutup sebelum sub-menu terlihat. Desktop/tablet tetap navigate seperti sebelumnya.
- F3: `inert` pada topbar + `.pms-main` + footer selama drawer terbuka; `role="dialog" aria-modal aria-label` pada aside (mobile saja).
- LOW: backdrop jadi `<div aria-hidden>` (satu-satunya tombol tutup bernama "Close navigation menu" = tombol X);
  label topbar memakai `appConfig.name` (bukan hard-code).
Verifikasi interaktif @375 (`after-A0/drawer-check.json`): semua PASS — closed-drawer tidak bisa di-Tab (25 Tab), open: Tab tidak
keluar ke main, Escape/backdrop menutup & fokus kembali ke hamburger, tap grup = expand tanpa navigate, child link menutup,
same-route tap menutup, Outlet selamat di 812x375 dan kembali, scroll lock dipulihkan saat resize ke 1280.
Pixel-diff desktop: 1440 identik dengan capture sebelum A0 (kalender IDENTICAL; dashboard ±1% = dinamis marquee/data).

## Step B — RWD-003 + lantai teks (Blok 1)
File: `src/styles/globals.css` (hapus blok html 14/13px; tambah aturan mobile), `src/index.css` (hapus blok duplikat),
`src/styles/reservation-wizard.css` (label 11px->12px di <=640px).
Keputusan RWD-003: HAPUS. Ukur: 0 unit rem di src (grep), html 13px@375 / 14px@768 -> 16px; body tetap 14px (px token) =>
tidak ada komponen berskala. Bukti: layar 375/768 beda hanya karena lantai teks & input (di bawah), bukan karena html.
Lantai teks (<=1023px): selector atribut `[style*='font-size: 8|9|10|11px']` -> 12px !important (inline style tak bisa media query);
desktop >=1024 tak tersentuh. Input/select/textarea (kecuali checkbox/radio/range/file/color) -> 16px !important di <=767px.
Hasil metrik (A0 -> B), 375: smallText 19->1 (dashboard, sisa 1 = teks SVG chart), 8->0, 6->0, 3->0, 26->0;
inputMin 14->16 (semua halaman form), overflow halaman tetap false; 1440 identik (semua halaman kecuali dashboard dinamis).
Sisa: label peta 8px sekarang 12px dan saling menimpa di FloorMapCard (diselesaikan di Step D); kalender 10px akan diganti di Blok 2.

## Step C — Kalender (RWD-001 + RWD-005) — DESIGN NOTE (ditulis sebelum coding, Blok 2 @HIGH)
Pola yang dipilih (pertanyaan Phase 2 I.2 tak pernah dijawab; saya memilih dan mencatatnya): **grid bulan kompak, CSS-only, satu DOM**.
Alasan: kalender ini adalah kalender bulan per-hari (bukan timeline per-kamar), jadi "kolom kamar sticky" tidak berlaku; grid 7 kolom
muat di 375px tanpa scroll bila lebar kartu dimaksimalkan, dan detail tamu tetap lewat `DayReservationsPopup` (tap hari) — handler sama.
Tidak ada view kedua: tombol hari yang sama, handler sama (`onDateClick`), data sama (`entries`/`holidays`), jadi tidak ada logika terduplikasi.
- <=767px: grid `repeat(7, minmax(0,1fr))`, `min-width: 0`, sel `min-height: 56px`, lebar sel ~44.7px (kartu edge-to-edge dgn margin negatif
  = padding halaman), chip kode reservasi -> titik status 10px (teks tetap di DOM, hanya disembunyikan; aria-label tombol tak berubah),
  "+N more" -> "+N", nav bulan satu baris (Prev | judul | Next), toggle "Cuti bersama" min-height 44px, wrapper scroll tidak lagi memotong fokus.
- 768-1023px: hanya `min-width: 0` (lebar konten 636px < 700 sehingga kalender scroll sebelumnya), chip 12px.
- >=1024px: nol perubahan visual. Properti inline statis yang perlu dioverride dipindah ke kelas CSS dengan nilai identik
  (minHeight 80, minWidth 700, grid, chip, "more"); yang dinamis (warna/border hari ini) tetap inline.
- File: `CalendarView.tsx` (className + wrapper chip + span sufiks "more"), `ReservationCalendarPage.tsx` (flexWrap/gap header RWD-005),
  `reservation-list.css` (blok `.cal-*`). Tidak menambah role="grid" (A11Y-005, dicatat sebagai "noticed").
- Selector tes dipertahankan: `data-testid="holiday-marker"`, `data-holiday-*`, `aria-label` sel hari, heading bulan (h3), tombol Prev/Next.

## Step C — Kalender (RWD-001 + RWD-005) — HASIL (Blok 2 @HIGH)
File: `src/components/shared/CalendarView.tsx` (className `cal-*`, wrapper `.cal-chips`, sufiks `.cal-more__sfx`; minHeight/min-width/grid/chip
dipindah dari inline ke CSS dengan nilai identik), `src/styles/reservation-list.css` (blok `.cal-*` + query <=1023 / <=767),
`src/pages/reservations/ReservationCalendarPage.tsx` (header `flexWrap: wrap`, `gap: 12px` — RWD-005).
Hasil @375 (`after-C/`): tanpa scroll horizontal (grid tidak melebihi kartu), 7 kolom tampil, sel 44.7x56px, tombol Prev/Next 88x44,
nav bulan 1 baris, tap hari -> `DayReservationsPopup` (terverifikasi), Enter pada sel terfokus membuka popup, bar libur tampil (3 marker Des 2026),
overflow halaman false. @768: grid 7 kolom muat tanpa scroll dalam (sebelumnya min-width 700 > kartu 636px), chip 12px.
Desktop 1440: piksel grid identik dgn after-B; satu-satunya selisih 567px = teks "26 -> 27 kamar aktif" (drift data, dibuktikan via crop).
Playwright penuh: run 1 = 70/71 (SCN-09-03 "session persists after reload" gagal, redirect ke /login; lulus saat dijalankan terisolasi 6/6,
tidak menyentuh kalender/layout); run 2 = **71/71**. Dicatat sebagai flake pra-ada (jenis sama dgn SCN-06-09 di baseline Phase 2).
Dicatat "noticed, not changed": A11Y-005 (kalender tanpa role="grid"), onFocus/onBlur imperatif pada sel, warna bar libur = merah danger (UI-010 area).

## Step D / E / F — ringkas (Blok 3 @MEDIUM)
D: Table (tbl/tbl-wrap + --tbl-cols, scroll + kolom pertama sticky di <=767), Pagination (.pg), FloorMapCard (scroll 600px, hint, tab/legend 44px),
RoomSelector (minmax(min())), Modal full (100%), RoomListPage (minmax(0,1fr), rooms-search), touch 44px di <=1023 (+coarse <=1279).
Temuan di jalan: metrik overflow halaman tidak melihat scroll dalam `.pms-main` -> ditambahkan ke capture; map 600px sempat memperlebar grid (diperbaiki dgn minmax(0,1fr)).
E: sidebar boot rail <1280 (PMSLayout), lantai teks 12px di <=1279, tile invoice stack di 1024-1279, chip kalender 12px di <=1279.
RWD-004 (ContactPage sticky) TIDAK diubah: tidak ada overlap di screenshot 375 (Phase 2 refuted); RWD-005 hardening diterapkan di Blok 2.
F: typecheck 0, build OK, lint src 17 (pra-ada), Playwright 71/71. Laporan: `.tmp-responsive/final-report.md`.

## ADDENDUM — Blok 1 (diagnosis) — lihat `addendum-diagnosis.md`
Snapshot `snapshot-addendum-start\`; baseline 71/71, tsc 0, build OK. Jawaban pemilik: 1024-1279 dipertahankan; semua halaman auth; peta 0.5 diterima;
hit-area ::after diterima; skala teks global kecuali sidebar/navbar.

## ADDENDUM — Blok 2 (login + sistem skala tabel)
2A Login (<=1023px; desktop tidak berubah): `src/styles/auth-split.css` (blok baru di akhir), `src/components/AuthSplitLayout.tsx` (+1 elemen dekoratif `.auth-badge`
berisi aset LogoWhite.png yang sudah ada, `aria-hidden`, `display:none` di desktop).
Mapping token: hero = ink #232D36; sheet = surface #FFFFFF; kanvas tablet = canvas #EEEDE9; aksen (badge/fokus/lingkaran) = bronze #97764D; garis = #C7BBAB. Tidak ada warna baru.
Struktur: hero (min-height clamp(200px,34dvh,320px), sudut kanan-bawah clamp(40px,14vw,72px)) + sheet menimpa (margin-top negatif) + input garis-bawah
(override inline Input dgn !important terkurung `.auth-form` <=1023) + tombol 52px bertumpuk; tablet = kartu 520px di tengah; landscape pendek (<=480px tinggi) = 2 kolom.
Link brand `.auth-brand` disembunyikan visual (hanya tampil saat fokus) agar tidak duplikat dengan judul hero — tetap ada untuk keyboard/SR.
Elemen referensi TIDAK ditambahkan: Skip, panah kembali, layar Create Account, footer "Don't have an account? SIGN UP", show/hide password.
2B Tabel + skala: `src/styles/globals.css` (parameter `:root` --row-scale-*/--text-scale-*/--text-floor-*/--floormap-scale-* satu tempat; token density `.tbl--comfortable/compact`;
aturan mobile/tablet; hit-area ::after; blok skala teks global ter-generate), `src/components/shared/Table.tsx` (padding/font pindah dari inline ke kelas; nilai desktop identik).
Skala teks global: semua selector di-scope `.pms-main` (sidebar/drawer/topbar dikecualikan), 67 aturan class-defined (generator postcss, skrip di scratchpad) + 15 nilai inline px
(attribute selector + !important); input/select/textarea tetap 16px (mobile).
Hasil: desktop 1440 IDENTIK (7/7 halaman uji termasuk login); tinggi baris @375: sales 78->51, reports 88->58, room-list 57->35, invoice 71->50, user 69->49;
@768: 57->41, 60->46, 57->38, 109->69, 79->55. Teks <10px (mobile) = 0, <11px (tablet) = 0. Tabel tablet: auto-layout + scroll (fixed layout memecah kata per huruf).
Verifikasi: tsc 0, lint src 17 (pra-ada), Playwright 70/71 -> SCN-06-09 flake pra-ada (race `innerText`), lulus 6/6 terisolasi; semua SCN-02 (login) lulus.
## ADDENDUM — Blok 3 selesai: lihat addendum-final-report.md (71/71, desktop identik, 10 file berubah).
