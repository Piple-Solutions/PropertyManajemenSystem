# public-progress.md — Redesain situs publik (Blok 1)

Kebijakan: tidak ada perintah git/gh. Snapshot: `.tmp-responsive\snapshot-public-start\` (186 file; `public\` belum ada).
Konteks yang dibaca ulang: `agents_rules_mobile.md`, `docs/frontend-design-audit.md` (RWD-004 ContactPage, UI-010..014, UI-013/014 placeholder),
`.tmp-responsive\progress.md` + laporan sebelumnya (drawer, kalender, login — TIDAK diulang; pola login `auth-split.css` hanya dipakai sebagai referensi proporsi).

## Catatan skill (maks 5 baris; sumber `.claude\skills\<nama>\SKILL.md`)
Prioritas konflik: prompt > better-* > design-taste / high-end-visual-design > lainnya.

- **design-taste-frontend** — dipakai: kontrol dial (VARIANCE 6 / MOTION 5 / DENSITY 3), aturan hero (<=4 elemen teks, `min-height` dvh), batas eyebrow (maks 1 per 3 seksi),
  larangan zigzag >2, larangan em-dash (dipakai: TIDAK ada em-dash di copy), copy self-audit, pre-flight check.
  Tidak dipakai: ganti icon library (proyek wajib lucide-react), larangan Inter/serif/palet krem (brand tetap), Motion/GSAP (tanpa dependensi baru), picsum/gambar remote (dilarang prompt).
- **high-end-visual-design** — dipakai: ritme ruang lega, easing kustom, `transform/opacity` saja, `backdrop-blur` hanya di nav (desktop), scroll reveal via IntersectionObserver.
  Tidak dipakai: ban Inter/Lucide/border abu, "double-bezel" berlebihan (terlalu berat di mobile), blur pada reveal.
- **redesign-existing-projects** — dipakai sebagai daftar audit (CTA tanpa focus, skip link, 404 bermerek, nav aktif, rating palsu, judul Title Case campur Inggris).
- **better-layout / typography / ui / interface / colors / accessibility / writing** — dipakai penuh: skala fluid `clamp()`, `text-wrap`, container, hit-area 44px, kontras diukur,
  copy Indonesia sentence case, tanpa "Oops"/"klik di sini", link menjelaskan tujuan.
- **animate / animation-vocabulary / find-animation-opportunities / emil-design-eng / apple-design** — dipakai: gate frekuensi (halaman publik = "occasional" -> animasi masuk boleh),
  easing `cubic-bezier(0.23,1,0.32,1)` untuk UI & `(0.22,1,0.36,1)` untuk reveal (sesuai prompt), `ease-in` dilarang, hover hanya `(hover:hover) and (pointer:fine)`, press scale 0.97.
  apple-design (spring/gesture) hanya untuk ide swipe galeri; tanpa library spring.
- **improve-animations / review-animations / interface-review / full-output-enforcement** — ditunda ke Blok 4 (review) dan seluruh Blok (output lengkap, tanpa placeholder kode).
- **brandkit** — HANYA cek konsistensi (tidak membuat brand baru; bagian generasi gambar tidak relevan stack web ini).
- **build-design** — tidak ada file Figma/gambar desain: dilewati (hanya aturan "bangun dari token yang ada" dipakai).
- **mobile-native** — dipakai ide web: `dvh/svh`, `-webkit-tap-highlight-color`, `touch-action: manipulation`, safe-area, input >=16px, hover gating.
- TIDAK dipakai (sesuai prompt): minimalist-ui, design-taste-frontend-v1, gpt-taste, stitch-design-taste, industrial-brutalist-ui, animate-expo, write-swift, imagegen-frontend-*,
  pick-ui-library, prototype, variant, break, break-ui, state-machine, ask-sonner, explain-interface.

## Baseline (sebelum redesain)
- typecheck 0 error; build OK; lint: 17 error src pra-ada (folder snapshot ikut ter-lint, abaikan).
- Playwright: **70/71** — hanya `SCN-09-03 session persists after reload` gagal. Akar masalah TERBUKTI (bukan terkait situs publik): `goto('/dashboard')` lalu `reload()` langsung;
  `restoreSession` (`authService.ts:67-77`) memanggil `GET /me`; reload membatalkan fetch -> `catch` -> `clearToken()` -> redirect login. Dengan jeda 1,5 s sebelum reload, token bertahan (diverifikasi).
  Sebelumnya lulus karena kebetulan timing. Kegagalan non-publik; tes tidak diubah.
- Screenshot baseline: `.tmp-responsive\public-baseline\{375x812,768x1024,1440x900}\`.
- Performa baseline: `.tmp-responsive\public-perf-baseline\perf.json`; ukuran dist: `dist-baseline.json`.

---
# Blok 2 — pondasi + Home (catatan kerja)

## Perubahan file (vs snapshot-public-start, hash SHA-1)
- DIUBAH: `src/App.tsx` (hanya fallback 5 rute publik -> `PublicPageFallback`; PMS tidak disentuh), `src/layouts/PublicLayout.tsx` (ditulis ulang), `src/pages/HomePage.tsx` (ditulis ulang).
- DIHAPUS: `src/styles/home-sogo.css` (tidak terpakai).
- BARU: `src/content/publicContent.ts`, `src/styles/public.css`, `src/components/public/{Accordion,AvailabilityForm,icons,OrnamentDivider,PlaceholderMedia,PublicChrome,PublicContext,Reveal,usePublicPage}.ts(x)`.
- About/Rooms/Gallery/Contact/NotFound: BELUM diubah (Blok 3).

## Temuan performa Blok 2 (A/B, Slow 4G + CPU 4x, font Google di-stub agar adil)
1. CLS non-Home 0.25-0.33: footer lazy muncul masuk viewport saat fallback 100vh ("Loading...") diganti halaman pendek.
   Perbaikan: fallback publik kosong bertag `.pub-fallback` + `:has()` menyembunyikan footer (`visibility`) sampai halaman siap; padding `main` dikirim lewat CSS kritis di layout (bukan menunggu public.css lazy).
2. LCP Home +0.7 s vs baseline. Akar masalah berlapis:
   a. BUG: `.pub-route--fade` terputar ulang pada re-render layout saat load pertama -> teks hero tidak terdaftar sebagai LCP. Diperbaiki (`entryPath`).
   b. Animasi (opacity/transform) pada h1/lead membuat Chrome tidak mendaftarkannya sebagai kandidat LCP -> h1/lead sengaja TIDAK dianimasikan.
   c. Header/footer (chunk + 4 request) bersaing dengan chunk halaman -> sekarang di-fetch setelah halaman ter-commit (sinyal: fallback unmount, timer cadangan 1.5 s).
   d. Bagian bawah fold Home di-mount setelah paint pertama (2 rAF / 400 ms) -> commit awal lebih kecil.
   e. Logo PNG footer 966x508 (127 KB, tampil 168 px) menjadi kandidat LCP di halaman pendek (+0.7 s) -> footer memakai wordmark (atap SVG + teks). Butuh persetujuan derivatif logo ter-resize bila logo asli ingin dipakai.
3. Entry `index`: +534 B gzip vs baseline (78584 -> 79118 B). Sedikit di atas target +500 B yang saya usulkan.

## Hasil akhir Blok 2 (build final)
- Typecheck 0 error; eslint file yang diubah bersih; build OK.
- Playwright penuh: 71/71 lulus pada run pertama (SCN-09-03 tidak flake kali ini); run ulang final sedang/telah dijalankan.
- Pengecekan perilaku (public-check): menu 375 (fokus masuk, Tab terjebak, Esc menutup + fokus kembali ke tombol, scroll-lock dipulihkan, tutup saat pindah rute),
  skip link (top 12 px), `aria-current`, judul per halaman, reduced-motion (0 tersembunyi, `.pub-js` mati), tanpa IntersectionObserver (0 tersembunyi),
  scroll penuh (0 tersembunyi), CLS 0 / 0.0002, overflow 0 di 320/375/430/768/1024/1280/1440/812x375.
- Bundel PMS: selisih ukuran per chunk non-publik <= 5 byte (nama alias impor ter-minify); entry `index` +527 B gzip (78584 -> 79111).
- A/B (Slow 4G, CPU 4x, font Google di-stub, median 5 run): Home LCP 1204 -> 1224 ms, CLS 0 -> 0; JS 81.2 -> 88.6 KB gz, CSS 8.6 -> 12.0 KB gz, request 8 -> 10, DOM 194 -> 479, long task max 107 ms.
- Perbaikan di akhir: target sentuh nama kamar (22 px) -> stretched link (seluruh kartu 277x434 jadi target); back-to-top tidak muncul di scroll 0 pada landscape (sentinel `max(240px, 60dvh)`).

---
# Blok 3 — halaman dalam (catatan kerja)

## Perubahan (vs snapshot-public-start)
- DITULIS ULANG: `src/pages/{AboutPage,RoomTypesPage,GalleryPage,ContactPage,NotFoundPage}.tsx`.
- BARU: `src/components/public/{PageHero,PageCta,Lightbox,RoomSkeleton,useRoomTypes}.ts(x)`; konten halaman dalam ditambahkan ke `src/content/publicContent.ts` (`about`, `roomsPage`, `galleryPage`, `contactPage`, `notFound`).
- DIUBAH: `src/layouts/PublicLayout.tsx` (ekspor `PublicShell`; `PublicLayout` = shell + Outlet; 4 rute ditambahkan ke `DARK_HERO_ROUTES`; normalisasi trailing slash),
  `src/pages/HomePage.tsx` (memakai `useRoomTypes` + `RoomSkeleton` bersama; perilaku sama), `src/styles/public.css` (+ gaya halaman dalam, + `@font-face` fallback Inter ber-metrik sama).
- TIDAK diubah: `App.tsx` (sejak Blok 2), index.html, PMS, e2e, package.json.

## Keputusan
- 404: `NotFoundPage` merender `PublicShell` sendiri (rute `*` tetap di luar PublicLayout; tanpa perubahan rute). Memanggil `markReady()` agar header/footer tidak menunggu 1,5 s.
- Hero halaman dalam: gelap ringkas (`.pub-hero--page`), h1/lead statis (LCP), tanpa breadcrumb (situs datar, 1 level).
- Kartu CTA penutup terang (`PageCta`) agar tidak ada dua pita gelap berurutan sebelum footer.
- Kamar: kartu vertikal + tombol WA per tipe, dimuat 6 per kelompok (DB dev punya 21 tipe E2E). Tabel perbandingan TIDAK dibuat (kartu sudah memperlihatkan kapasitas/fasilitas/harga berdampingan).
- Galeri: filter kategori (aria-pressed), grid dense dengan span hanya di tampilan "Semua" (tampilan terfilter seragam, tanpa lubang), lightbox portal ke `.pub-root` (Esc, panah, Tab terjebak, inert, fokus kembali, swipe).
- Kontak: tanpa sticky WA di mobile (tombol WA sudah di hero + menu). Telepon/email tampil sebagai teks (nilai dummy, bukan tautan tel:/mailto:).
- Font: Inter dimuat remote oleh index.html (display=swap) -> swap menggeser teks hero (CLS 0.017-0.030 pada scroll-through). Ditambah `@font-face 'Pub Inter Fallback'` (Arial, size-adjust 105.6%/101.4%) hanya di `.pub-root` -> 0 pergeseran di 3 run x 3 halaman.

## Blok 3 — perbaikan lanjutan (setelah pesan user soal logo)
- LOGO: `assets/LogoWhite.png` (966x508, 127 KB) dan `assets/LogoBrown.png` (1080x608, 169 KB) dipakai untuk header + footer publik (SVG sementara `BrandRoof` dihapus).
  Aslinya TIDAK diubah (PMS memakainya). Dibuat turunan WebP transparan 360 px: `assets/public/LogoWhite.webp` (12,3 KB), `assets/public/LogoBrown.webp` (21,1 KB),
  dibangkitkan dengan Chromium bawaan Playwright (`.tmp-responsive/make-logos.spec.ts`; tanpa paket baru). Satu modul `src/components/public/brand.ts` memetakan file + dimensi.
  Header: putih di atas hero/menu terbuka, coklat saat header solid; keduanya dalam kotak tetap (rasio aspek berbeda 1,86 vs 1,81) -> nav/CTA tidak bergeser.
  Footer: putih, `loading=lazy`, alt = nama situs. Catatan aset: LogoWhite.png menyentuh tepi atas file (alpha minY=0) -> ornamen puncak atap terlihat terpotong tipis.
- Fragmentasi chunk: komponen bersama digabung ke SATU modul `src/components/public/kit.tsx` (Rollup tidak bisa memecah satu modul). Request per halaman 16-18 -> 10 (12 setelah logo).
  Percobaan `manualChunks` di vite.config DITOLAK (Rollup menarik React/router ke chunk manual) dan dikembalikan; vite.config.ts/.js identik dengan awal (454 B).
- Reveal: tidak lagi membaca layout di layout effect (memaksa layout awal seluruh halaman di dalam satu task); kelompok di atas lipatan memakai `immediate`; transisi tidak dijalankan untuk elemen yang sudah terlihat saat load.
  Efek: long task halaman dalam 137-177 ms -> 0-50 ms. Home: mount di bawah lipatan dibagi 2 tahap -> long task maks ~116 ms (median).
- Font: `@font-face 'Pub Inter Fallback'` (Arial, size-adjust) hanya di `.pub-root` -> 0 pergeseran saat Inter (remote) selesai dimuat.
- Catatan sampel kamar dipindah ke bawah daftar (tidak mendorong kartu saat API gagal).
