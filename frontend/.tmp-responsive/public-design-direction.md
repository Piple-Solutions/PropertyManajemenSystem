# Design Direction — Situs Publik Homestay Joglo Seruni Syariah (Blok 1)

Tidak ada edit source (hanya snapshot). Tidak ada perintah git/gh. Semua nilai ukur ada di `.tmp-responsive\public-perf-baseline\perf.json` dan `public-baseline\metrics.json`.

## 0. Inventaris & baseline

### 0.1 Rute publik (dari `src/App.tsx`)
| Path | Komponen | File | Isi sekarang |
|---|---|---|---|
| `/` | `HomePage` | `src/pages/HomePage.tsx` (448 baris, `home-sogo.css` 931 baris) | Hero, form cek ketersediaan (-> WhatsApp), welcome, 3 tipe kamar dari `GET /api/public/room-types`, carousel placeholder, banner CTA |
| `/about` | `AboutPage` | `AboutPage.tsx` (75) | Placeholder: 1 judul + 1 kalimat "akan ditampilkan di sini" + tombol WA |
| `/rooms` | `RoomTypesPage` | `RoomTypesPage.tsx` (75) | Placeholder, sama |
| `/gallery` | `GalleryPage` | `GalleryPage.tsx` (75) | Placeholder, sama |
| `/contact` | `ContactPage` | `ContactPage.tsx` (95) | Judul, tombol WA, 3 baris label tanpa isi (telepon/alamat/jam) |
| `*` | `NotFoundPage` | `NotFoundPage.tsx` (23) | "404" polos, tanpa shell |
Halaman auth (`/login`, `/register`, `/forgot-password`, `/reset-password`) sudah di-layout ulang pada tugas sebelumnya dan berada di LUAR scope redesain ini (logika auth). `LoginPage` dkk dicatat saja.

### 0.2 Shell & isolasi
- `PublicLayout.tsx`: **header kosong** (`{/* Public Header */}`), footer kosong. Tidak ada navigasi sama sekali, tidak ada `<main>`, tidak ada skip link.
- Semua gaya inline (halaman placeholder) atau `home-sogo.css` (hanya Home). Tidak ada gaya publik global; `globals.css`/`index.css`/`auth-split.css` di-import global di `main.tsx` (token berasal dari sini).
- `index.html`: judul statis "Homestay Joglo Seruni Syariah" untuk semua halaman; **Google Fonts (Inter + Playfair Display) via `<link>` remote** (render-blocking, melanggar "tanpa CDN font"); berlaku juga untuk PMS.
- Isolasi: halaman publik adalah chunk lazy terpisah (bagus); entry `index-*.js` (242 KB / 76,7 KB gzip) memuat React, router, provider auth/permission/UI yang dipakai PMS dan publik.

### 0.3 Baseline uji
| Cek | Hasil |
|---|---|
| typecheck | 0 error |
| build | sukses |
| lint src | 17 error pra-ada (`React is not defined`) |
| Playwright | **70/71**; gagal hanya `SCN-09-03` (race `reload` vs `GET /me`, terbukti; tes publik semua lulus; tidak disentuh) |

### 0.4 Performa baseline (Chromium + CDP, 375x812 DPR2, Slow 4G 1,6 Mbps/150 ms, CPU 4x, median 3 run; `vite preview` tanpa gzip -> gzip dihitung dari `dist`)
| Halaman | LCP | CLS | Long task (maks) | DOM | Request | JS gzip | CSS gzip | Gambar |
|---|---|---|---|---|---|---|---|---|
| `/` | 1288 ms | 0,002 | 2 (56 ms) | 266 | 8 | 81,2 KB | 8,6 KB | 124 KB (LogoWhite.png) |
| `/about` | 1100 ms | 0,004 | 1 (51 ms) | 28 | 5 | 78,0 KB | 6,1 KB | 0 |
| `/rooms` | 1084 ms | 0,004 | 0 | 28 | 5 | 78,0 KB | 6,1 KB | 0 |
| `/gallery` | 1084 ms | 0,004 | 1 (56 ms) | 28 | 5 | 77,9 KB | 6,1 KB | 0 |
| `/contact` | 1080 ms | 0,004 | 0 | 42 | 6 | 78,7 KB | 6,1 KB | 0 |
| 404 | 884 ms | 0,000 | 0 | 17 | 4 | 77,2 KB | 6,1 KB | 0 |
Catatan: nilai fonts = 0 karena Google Fonts tidak terjangkau di lingkungan uji; di jaringan nyata menambah 2 request + CSS render-blocking. Elemen LCP Home = logo PNG 127 KB (bergantung gambar).
Ukuran total `dist` (seluruh aplikasi): JS 565 KB gzip, CSS 17,5 KB gzip (93 file). Bundle PMS terbesar: `ReportPage` 234,6 KB gzip (jspdf/xlsx), `index` 76,7 KB.

## a. Mengapa situs publik terasa terlalu minimal
1. Tiga dari lima halaman hanya kartu putih + satu kalimat "akan ditampilkan di sini" — terasa belum jadi, bukan sengaja sederhana.
2. Tidak ada header/navigasi dan footer: pengunjung tidak bisa berpindah halaman kecuali lewat tombol di tengah halaman; tidak ada penanda halaman aktif, merek, atau kontak.
3. Seluruh antarmuka sama dengan PMS (kanvas #EEEDE9, kartu border tipis, tombol bronze 18px) — tidak ada identitas hospitality; tidak ada ornamen/pola joglo.
4. Home sudah punya struktur, tetapi isinya generik/asing: judul campur Inggris ("A Best Place To Stay", "Welcome!", "Rooms & Suites", "Photos"), "Selamat Datang di Hotel Kami" (ini homestay),
   dan **klaim yang tidak bisa diverifikasi** ("Rating 4.9", "Layanan 24 jam").
5. Media hanya ikon abu pada kotak datar; tidak ada kedalaman (lapisan, overlap, tekstur), ritme latar hanya ink/krem.
6. Tipografi satu keluarga satu bobot; hero 1 logo PNG kecil; CTA bronze dengan teks putih berkontras ±4,2:1 (di bawah 4,5).
7. Mikro-interaksi hampir nol (hover manual via `onMouseEnter`), tanpa transisi halaman, tanpa pengungkapan saat scroll.

## b. Konsep — "Teduh Joglo"
Satu ide: **berteduh di bawah atap joglo** — hangat, tenang, bersahaja, berkelas.
Kata suasana: teduh, hangat, tertata, ramah keluarga, bersahaja, berkarakter Jawa tanpa kitsch.
Bahasa visual:
- **Garis atap tumpang** (siluet joglo bertingkat, SVG sederhana satu `<symbol>`) sebagai pembatas ornamen antar seksi dan sebagai bentuk atas hero (lengkung/tumpang), bukan foto orang.
- **Pola kawung/garis halus** (SVG < 2 KB, opasitas 4-8%, satu definisi dipakai ulang lewat CSS `background-image`) pada permukaan gelap dan pita seksi.
- **Warna kayu**: turunan bronze sebagai tint/shade (lihat c) — papan, pendopo, sandaran; ink untuk bagian "dalam rumah" (hero, CTA, footer).
- **Bentuk**: sudut besar tidak simetris (satu sudut membulat besar seperti ujung atap) dikecilkan secara proporsional dengan `clamp()`; kartu dengan ruang lega, bukan kotak berborder.
- **Ritme ruang**: seksi lega (`clamp(48px, 9vw, 120px)`), lapisan bertumpuk (kartu menimpa tepi seksi), latar bergantian lembut: kanvas -> permukaan putih -> pasir (tint) -> ink -> pasir -> ink footer.
- **Syariah-friendly**: tanpa figur manusia/alkohol/malam hari; nada sopan, kata ganti "Anda"; ruang keluarga & kenyamanan sebagai tema (bukan klaim sertifikasi).
Dial (design-taste): VARIANCE 6, MOTION 5, DENSITY 3. Satu tema terang untuk halaman; bagian gelap hanya hero, CTA, footer (bukan inversi acak).

## c. Warna — token turunan khusus publik (tanpa hue baru)
Sumber: `--color-ink #232D36`, `--color-bronze #97764D`, `--color-bronze-dark #7D6240`, `--color-canvas #EEEDE9`, `--color-surface #FFFFFF`, `--color-line #C7BBAB`, `--color-slate #6B7881`.
Ruang nama `.pub-` / `--pub-*` di `public.css` (diimpor hanya oleh layout/halaman publik):
| Token | Turunan | Dipakai untuk |
|---|---|---|
| `--pub-bronze-50` | `color-mix(in srgb, var(--color-bronze) 8%, #fff)` | latar seksi lembut |
| `--pub-bronze-100` | `color-mix(... 16%, #fff)` | permukaan kartu hangat |
| `--pub-bronze-200` | `color-mix(... 30%, #fff)` | garis/ornamen terang |
| `--pub-sand` | `color-mix(in srgb, var(--color-bronze) 7%, var(--color-canvas))` | kanvas halaman publik |
| `--pub-ink-90/80` | `color-mix(in srgb, var(--color-ink) 90%/80%, var(--color-bronze))` | lapisan di atas ink |
| `--pub-cta` | `var(--color-bronze-dark)` | isi tombol utama (kontras teks putih) |
| `--pub-cta-hover` | `color-mix(in srgb, var(--color-bronze-dark) 88%, #000)` | hover |
Kontras (rumus WCAG, dihitung dari nilai hex yang ada; diverifikasi ulang di Blok 2 dengan skrip):
| Pasangan | Rasio | Hasil |
|---|---|---|
| ink #232D36 di putih | ±13,2:1 | lolos AA/AAA |
| ink di `--pub-bronze-50` (~#F6F3EE) | ±12:1 | lolos |
| bronze #97764D di putih | **±4,2:1** | gagal 4,5 untuk teks normal; dipakai hanya untuk teks >=24px / UI 3:1 / dekorasi |
| putih di bronze #97764D (tombol sekarang) | ±4,2:1 | gagal untuk 16-18px -> diganti `--pub-cta` |
| putih di bronze-dark #7D6240 | ±5,7:1 | lolos |
| bronze-dark di putih | ±5,7:1 | lolos (teks tautan/eyebrow) |
| slate #6B7881 di putih | ±4,6:1 | lolos tipis; teks kecil memakai ink |
| putih di ink | ±13:1 | lolos |

## d. Tipografi
Keputusan: **tetap pada keluarga yang sudah ada di proyek**, tetapi dibuat mandiri (tanpa CDN):
- Rekomendasi (butuh persetujuan karena menambah file font): `Playfair Display` (sudah dideklarasikan `--font-family-display` di `globals.css`) varian 500/600 **satu file woff2 variabel, subset Latin** untuk H1/H2 saja; teks isi memakai tumpukan sistem (`system-ui, "Segoe UI", ...`) agar tidak ada file Inter tambahan; atau Inter ter-host sendiri (1 file) bila ingin nuansa PMS sama.
- Alasan serif: konsep heritage/Jawa-bersahaja memenuhi syarat "heritage" pada design-taste; Playfair bukan font yang dilarang skill, sudah ada di token proyek.
- Fallback metrik: `Georgia` + `size-adjust`/`ascent-override` agar tidak ada CLS; `font-display: swap`; preload hanya 1 file (Playfair).
- Opsi nol-file (jika tidak disetujui): seluruh publik pakai tumpukan sistem + bobot 600/700 — tetap elegan karena ritme/ornamen; sebutkan di laporan.
- **Memerlukan persetujuan:** (1) file woff2 di `public\fonts`, (2) penghapusan `<link>` Google Fonts di `index.html` (juga memengaruhi PMS: Inter akan jatuh ke font sistem kecuali Inter juga ter-host).
Skala fluid (didefinisikan sekali di `.pub-root`):
| Peran | clamp() | ± px (320 -> 1440) |
|---|---|---|
| Display/H1 | `clamp(2.125rem, 1.45rem + 3.1vw, 3.75rem)` | 34 -> 60 |
| H2 | `clamp(1.625rem, 1.25rem + 1.7vw, 2.5rem)` | 26 -> 40 |
| H3 | `clamp(1.25rem, 1.12rem + 0.6vw, 1.5rem)` | 20 -> 24 |
| Lead | `clamp(1.0625rem, 1rem + 0.35vw, 1.25rem)` | 17 -> 20 |
| Body | `clamp(1rem, 0.96rem + 0.2vw, 1.0625rem)` | 16 -> 17 |
| Kecil/label | `0.875rem` (14px) | 14 |
Aturan: `text-wrap: balance` judul, `pretty` paragraf; lebar baca 45-75 karakter (`max-width: 62ch`); line-height display 1.15, body 1.65; tracking judul -0,01em, label uppercase +0,06em (maks 1 eyebrow per 3 seksi).

## e. Sistem layout
- Container: `--pub-container: min(1200px, 100% - 2 * gutter)`; teks panjang `max-width: 62ch`; sempit `760px`.
- Gutter: `clamp(16px, 5vw, 48px)`. Seksi: `padding-block: clamp(48px, 9vw, 120px)`. Jarak judul->isi seragam `clamp(24px, 4vw, 48px)`.
- Skala spasi: 4/8/12/16/24/32/48/64/96 (`--pub-s-1..9`) dan `gap` grid `clamp(16px, 2.5vw, 32px)`.
- Radius: `--pub-r-sm clamp(8px,1vw,12px)`, `--pub-r-lg clamp(16px,2.4vw,28px)`, sudut atap `clamp(32px, 7vw, 88px)` (satu sudut).
- Aspek media: hero 16/9 (>=768) / 4/5 (mobile), kartu 4/3, potret 3/4, ubin 1/1. Tanpa tinggi px konten.
- Latar per seksi (ritme): Hero ink+pola -> Sorotan (putih, tumpang tepi hero) -> Tentang (pasir) -> Kamar (bronze-50) -> Fasilitas (putih) -> Galeri (pasir) -> Testimoni (bronze-100) -> FAQ (putih) -> CTA (ink + pola) -> Footer (ink-90).
- Satu bentuk "tumpang": kartu/ornamen menimpa tepi seksi `margin-top: calc(-1 * clamp(24px, 6vw, 72px))` (dihilangkan di <768 bila menimbulkan konflik sentuh).
- Navigasi satu baris, tinggi <=72px; header transparan di atas hero -> solid saat scroll (sentinel IO, tanpa listener scroll).

## f. Pustaka komponen (semua di `src/components/public/`, gaya `public.css` berawalan `.pub-`)
`PublicShell` (header, `MobileMenu`, footer, `SkipLink`, `BackToTop`), `Container`, `Section` (varian surface), `SectionHeading`, `PageHero` (halaman dalam + breadcrumb),
`Button`/`LinkButton` (primer/sekunder/teks; hit 44px), `OrnamentDivider` (atap tumpang), `PatternBackdrop` (kawung), `PlaceholderMedia` (hero/card/portrait/tile; prop `src`/`alt`),
`RoomCard`, `FacilityTile`, `ValueCard`, `QuoteCard`, `HighlightStrip`, `Accordion` (FAQ), `GalleryGrid` + `Lightbox`, `AvailabilityForm` (logika WA yang ada dipindah apa adanya),
`Reveal` + `useInView` (satu IntersectionObserver bersama), `RouteFade`. Konten semua dari `src/content/publicContent.ts`.

## g. Spesifikasi gerak
- Gate (animate skill): halaman publik = frekuensi "occasional"; animasi masuk boleh; tidak ada animasi pada aksi keyboard/berulang.
- Masuk/reveal: fade + `translateY` (desktop 24px, <768: 12-16px), 500-800 ms (mobile 350-550 ms), `cubic-bezier(0.22,1,0.36,1)`, stagger 60-90 ms dibatasi total ~500 ms; grup panjang di-reveal sebagai satu blok.
- Scroll reveal: **satu** IntersectionObserver (threshold ~0,15, sekali, `unobserve`). Bawaan = terlihat: kelas `.pub-js` ditambahkan hanya setelah IO tersedia; tanpa IO/JS konten tetap tampil; `<noscript>`/reduced-motion = statis.
- Hero: stagger judul -> sub -> CTA; media placeholder: drift Ken-Burns sangat kecil (transform, hanya >=1024px, berhenti saat off-screen/`document.hidden`); parallax hanya desktop.
- Nav: latar transparan -> solid via sentinel IO (tanpa scroll listener); indikator aktif garis bawah menggambar (`transform: scaleX`); menu mobile: panel `100dvh`, buka/tutup `translateX` 220-280 ms, kunci scroll + pulihkan, fokus masuk/kembali, Esc/backdrop.
- Mikro: tombol hover/press (scale 0.97, 150 ms) hanya `(hover:hover) and (pointer:fine)`; kartu terangkat shadow tipis; garis bawah tautan menggambar; zoom gambar <=1.05; accordion halus (grid-rows 0fr->1fr atau `max-height` tidak dipakai: gunakan `grid-template-rows`); count-up opsional sekali (dilewati reduced-motion).
- Transisi rute: `opacity` 0->1 <=200 ms pada kontainer keyed lokasi (CSS animation), tanpa layout jump.
- Reduced motion: semua statis, konten penuh terlihat, tanpa parallax/Ken-Burns/count-up; crossfade opasitas pendek diperbolehkan.
- Library: **tidak ada** (tidak ada framer-motion/GSAP di `package.json`); CSS transition + IO sudah cukup.
- Tidak ada: marquee, scroll-jacking, video, blur besar, gradient beranimasi, kursor kustom.

## h. Rencana per halaman (rute yang ada; rute baru hanya diusulkan)
| Halaman | Seksi | Isi dummy (ringkas) | Animasi |
|---|---|---|---|
| **Home** | Hero (judul "Selamat datang di Joglo Seruni", sub, CTA WA + "Lihat Kamar"), sorotan 3-4 butir, cek ketersediaan (logika WA yang ada), tentang singkat, kamar unggulan (API room-types + fallback dummy), fasilitas ikon, pratinjau galeri (ubin placeholder), testimoni generik, FAQ ringkas, CTA | Sorotan generik: "Suasana teduh", "Ruang keluarga", "Kamar bersih dan tenang", "Sapaan hangat" (tanpa klaim jarak/lokasi/angka) | Hero stagger, reveal seksi, kartu lift |
| **About (Tentang)** | PageHero, kisah, konsep joglo & arsitektur (tiga elemen: pendopo/ruang tengah/atap), nilai (3-4), pendekatan keramahan, CTA | Tanpa tim/orang, tanpa sejarah bertanggal | Reveal, ornamen atap menggambar |
| **Rooms (Kamar)** | PageHero, kartu tipe kamar (API room-types; fallback dummy), strip perbandingan, ringkasan aturan rumah, CTA tanya ketersediaan | harga "mulai dari" dari API (nilai nyata) atau "Rp xxx.000" | Reveal grup, hover kartu |
| **Gallery (Galeri)** | PageHero, filter kategori (client-side: Semua/Kamar/Ruang bersama/Taman/Eksterior), grid ubin placeholder, lightbox (Esc, fokus kembali, swipe via scroll-snap) | 12 ubin placeholder berlabel "Foto akan ditambahkan" | Reveal grup, lightbox fade |
| **Contact (Hubungi)** | PageHero (h1 "Hubungi Kami"), kartu kontak (WA, telepon, alamat generik, jam), placeholder peta, FAQ singkat, tombol WA (tautan yang ada) | `+62 8xx-xxxx-xxxx`, "Jl. Contoh No. 00" | Reveal, hover kartu |
| **404** | Shell publik + ornamen + tautan ke Beranda/Kamar | "Halaman tidak ditemukan" | Fade |
| *Diusulkan (butuh persetujuan rute)* | Kebijakan/Aturan rumah, FAQ lengkap, Lokasi | — | — |
Selektor tes yang dijaga: satu heading dengan "selamat datang" di Home (strict mode), tautan pertama "Lihat Kamar", teks "WhatsApp" terlihat, `h1` "Hubungi Kami", tautan `wa.me`, teks "tentang/properti/hotel" di About, "kamar/room" di Rooms, "galeri/gallery" di Gallery, teks 404, tanpa overflow 375.

## i. Rencana konten
- `src/content/publicContent.ts` (header "DUMMY CONTENT - replace before launch"): `site` (nama, tagline, nomor WA), `nav`, `footer`, `home` (hero, highlights, about, facilities, gallery tiles, testimonials, faq, cta), `about`, `rooms` (fallback + aturan rumah), `gallery` (kategori + ubin), `contact`, `notFound`. Tipe ketat (interface), tanpa `any`.
- Nomor WA tetap `6200000000000` (nilai yang sudah ada di 5 file; dipusatkan satu tempat).
- Nilai yang akan perlu diganti (dicatat file+kunci): nomor WA, telepon, email, alamat, jam, tautan media sosial (tidak ada), harga fallback, teks testimoni, nama kategori galeri, FAQ.
- Larangan: tidak ada skor ulasan, sertifikasi halal/MUI, penghargaan, angka yang terkesan data nyata; hapus "Rating 4.9" dan "Layanan 24 jam" yang sekarang ada.
- Bahasa: Indonesia natural, sentence case, tanpa em-dash, tanpa "Oops", tautan menjelaskan tujuan.

## j. Risiko & pertanyaan terbuka
Risiko: (1) kebocoran CSS ke PMS — `main.tsx` mengimpor CSS global; gaya publik hanya di `public.css` dengan awalan `.pub-` dan diimpor oleh `PublicShell`/halaman (bukan global); (2) selektor tes (lihat h); (3) performa mobile (blur/animasi) — lihat bagian Performa; (4) `index.html` bersama PMS (font/judul); (5) judul dokumen per halaman butuh `document.title` (perubahan kecil, tidak menyentuh rute).
Pertanyaan (maks 5):
1. **Font:** setujui Playfair Display ter-host (1 file woff2 subset Latin) + penghapusan link Google Fonts dari `index.html` (memengaruhi PMS)? Atau tumpukan sistem saja?
2. **Rute:** boleh menambah halaman baru (FAQ/Kebijakan/Lokasi)? Saran: tidak sekarang; FAQ jadi seksi.
3. **Split kode:** setujui `React.lazy` untuk `PublicLayout` di `App.tsx` (menjaga entry bundle tidak membawa kode publik)?
4. **Logo PNG 127 KB** (`LogoWhite.png`/`LogoBrown.png`) dipakai di hero & PMS: boleh dibuatkan versi SVG/PNG ringan? (file baru butuh persetujuan) atau logo dihapus dari hero agar LCP berbasis teks?
5. **Auth di nav:** tampilkan tautan kecil "Masuk staf" (`/login`) di footer? (tujuan sudah ada)

---

# Mobile/Tablet plan

Sistem proporsi (berlaku semua halaman): tipografi `clamp()` (bagian d); spasi seksi `clamp(48px, 9vw, 120px)`; gutter `clamp(16px, 5vw, 48px)`; aspect-ratio untuk semua media/kartu; radius & ornamen `clamp()`; kontainer cair maks 1200px (teks 62ch).
| Halaman | Mobile 320-767 | Tablet portrait 768-1023 | Tablet landscape 1024-1279 / Desktop 1280+ | Collapse / reflow |
|---|---|---|---|---|
| Home | Hero `min-height: clamp(520px, 86svh/dvh, 760px)`, judul <=4 baris di 320, CTA bertumpuk penuh lebar; cek ketersediaan 1 kolom (date 16px); kamar = baris snap-scroll horizontal; fasilitas 2 kolom; galeri snap; FAQ accordion | Hero terpisah 2 kolom (teks + media) atau tengah dgn proporsi lebih besar; kamar 2 kolom; fasilitas 3; sorotan 2x2 | 3 kolom kamar/fasilitas, hero seperti desktop (ukuran tipe tablet); 1280+: komposisi penuh dgn tumpang | snap-scroll hanya untuk daftar panjang; info penting tidak hanya di balik swipe |
| About | PageHero 1 kolom, kisah teks 62ch, nilai bertumpuk | 2 kolom (teks + panel ornamen), nilai 2x2 | 12 kolom: teks 7 + ornamen 5 | diagram joglo disembunyikan di <480, diganti daftar |
| Rooms | Kartu 1 kolom, perbandingan jadi kartu bertumpuk, aturan rumah accordion | 2 kolom kartu, perbandingan tabel ringkas | 3 kolom | tabel -> kartu di mobile |
| Gallery | Filter = chip scroll horizontal, ubin 2 kolom (1:1), lightbox layar penuh, swipe scroll-snap | 3 kolom | 4 kolom (masonry ringan via aspect berganti) | filter tetap dapat dijangkau (tidak tersembunyi) |
| Contact | Kartu kontak bertumpuk, WA CTA penuh lebar (sticky bawah HANYA bila tidak menutup konten + safe-area), peta placeholder 4/3 | 2 kolom (kontak + peta) | 5/7 kolom | jam/alamat jadi daftar bersusun |
| 404 | Ornamen + 2 tombol bertumpuk | sama, lebih besar | sama | — |
Landscape pendek (max-height <= 480, mis. 812x375): hero `min-height: auto`/`100svh` tanpa memotong CTA; menu mobile tetap bisa dipakai (panel scroll); tidak ada sticky yang menutup.
Sentuh & perangkat: hit area >=44px (kontrol kecil diperluas `::after`), jarak >=8px; semua hover dibungkus `(hover:hover) and (pointer:fine)` dengan padanan `:focus-visible`/`:active`; safe-area pada bar tetap; input >=16px & `type/inputmode` benar; `-webkit-tap-highlight-color: transparent` + `touch-action: manipulation` pada kontrol.
Gerak mobile: amplitudo 12-16px, durasi 350-550 ms, tanpa parallax/Ken-Burns, reveal per grup.
Pengecekan overflow: 320/375/430/768/1024/1280/1440; dekorasi dibungkus `overflow: clip`.

---

# Performance baseline and budget

## Status & anggaran yang diusulkan (menunggu konfirmasi)
| Metrik | Baseline terukur (publik) | Default prompt | **Usulan anggaran** | Catatan |
|---|---|---|---|---|
| JS rute publik (gzip, termasuk vendor/entry) | 77-81 KB | <= 170 KB | **<= 110 KB** | masih ruang ~30 KB; tanpa dependensi baru. Default 170 terlalu longgar vs baseline |
| CSS publik (gzip) | 6,1-8,6 KB | <= 40 KB | **<= 25 KB** | global CSS 6,1 KB + `public.css` <= ~18 KB |
| LCP (Slow 4G, CPU 4x) | 0,88-1,29 s | <= 2,5 s | **<= 1,8 s** dan tidak lebih buruk dari baseline +0,4 s | LCP harus TEKS/blok CSS, bukan gambar |
| CLS | 0,000-0,004 | <= 0,05 | **<= 0,02** | reservasi aspect-ratio + fallback font `size-adjust` |
| Long task | maks 56 ms | tidak > 200 ms | **tidak ada > 120 ms** saat load/scroll | satu IO bersama, tanpa scroll listener |
| Node DOM per halaman | Home 266, lainnya <= 42 | <= 1500 | **Home <= 900, lain <= 700** | 1500 tidak realistis sebagai target; anggaran lebih ketat |
| Request per halaman | 4-8 | <= 25 | **<= 14** (tanpa font remote) | 0 request font remote setelah self-host |
| Ukuran bundle PMS | lihat `dist-baseline.json` | tidak boleh naik | **0 KB kenaikan** pada semua chunk PMS; entry `index` tidak boleh naik > 0,5 KB gzip | kode publik harus berada di chunk publik |
Prinsip: redesain tidak boleh memperburuk LCP/CLS dibanding baseline walau konten & animasi bertambah; bila anggaran terlewati: kurangi ornamen/animasi, bukan konten inti.

## Performance plan
- **Code splitting (status):** semua halaman sudah `React.lazy` (chunk terpisah 1-2 KB). Celah: `PublicLayout` diimpor statis di `App.tsx` dan akan tumbuh (nav, footer, gerak); usulan minimal: `React.lazy(() => import('./layouts/PublicLayout'))` + `Suspense` (menyentuh `App.tsx`; **butuh persetujuan**). Entry `index` (76,7 KB gzip) membawa provider auth/permission/UI yang dipakai PMS; tidak diubah.
- **CSS:** `public.css` hanya diimpor `PublicShell`/halaman publik (tidak di `main.tsx`); `home-sogo.css` (931 baris) diganti/dihapus setelah Home dibangun ulang; satu definisi pola SVG (<2 KB data-URI) dipakai ulang via variabel CSS.
- **Font:** keputusan butuh persetujuan (lihat d). Setelah self-host: hapus 2 request remote + CSS render-blocking; preload 1 file; `font-display: swap`; fallback `size-adjust`.
- **Ikon:** import bernama dari `lucide-react` saja; tanpa barrel.
- **Aset:** tidak ada gambar baru; placeholder CSS/SVG. Logo PNG 127 KB menjadi elemen LCP Home — rekomendasi: hero LCP = teks; logo dipindah ke header ukuran kecil `loading` normal (pertanyaan 4).
- **Animasi:** hanya `transform/opacity`; `will-change` dipasang sesaat; satu IO bersama; sentinel IO untuk nav; parallax/Ken-Burns hanya >=1024px dan berhenti saat off-screen/`document.hidden`; maks 1 elemen ambient per halaman; tanpa `backdrop-filter`/blur di mobile (desktop: nav saja); tanpa gradient beranimasi (animasikan opasitas overlay).
- **Render:** `content-visibility: auto` + `contain-intrinsic-size` pada seksi panjang di bawah lipatan (diverifikasi tidak merusak anchor/CLS); tanpa JS-layout.
- **Kesiapan foto nanti:** komponen media menerima `src`, `width/height` atau `aspect-ratio`, `loading="lazy"` (kecuali hero), `fetchpriority="high"` hanya untuk gambar hero, `decoding="async"`, slot `srcset/sizes`.
- **Pengukuran ulang:** akhir Blok 2 (Home), tiap halaman di Blok 3 (JS/CSS gzip + 375/768), Blok 4 (semua halaman, median 3, profil throttled).

Menunggu konfirmasi untuk Blok 2.
