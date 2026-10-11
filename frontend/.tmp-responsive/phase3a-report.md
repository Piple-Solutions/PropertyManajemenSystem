# Phase 3A — Laporan: Sidebar Drawer <768px (RWD-002)

Tanggal: 2026-10-09. Aturan yang dibaca ulang: §3, §6.2, §7
(`agents_rules_mobile.md`). Tablet diputuskan rail (pendekatan Phase 2):
perilaku boot rail <1024px tidak diubah; drawer hanya <768px.

## File yang diubah (hanya 2)

1. `src/layouts/PMSLayout.tsx` — cabang render mobile + state drawer.
2. `src/styles/pms-layout.css` — gaya topbar/drawer/backdrop dalam
   `@media (max-width: 767px)` + tambahan blok `prefers-reduced-motion`.
   Tidak ada file CSS baru.

## Apa yang berubah (mobile <768px saja)

- Sidebar hidden by default (off-canvas `translateX(-105%)` +
  `visibility: hidden`, 240px, `height: 100dvh` dgn fallback `100vh`).
- Top bar kompak: tinggi dasar 56px + `env(safe-area-inset-top)`,
  `position: sticky`, berisi hamburger `<button>` 44×44
  (`aria-label="Open navigation menu"`, `aria-expanded`,
  `aria-controls="pms-drawer"`) + label brand.
- Drawer overlay 240px + backdrop (tombol asli "Close navigation menu",
  `rgba(35,45,54,0.45)`); tombol X 44×44 di kepala drawer.
- Menutup via: backdrop tap, Escape, dan perubahan rute (`useLocation`).
  Terverifikasi otomatis (lihat bawah).
- Body scroll-lock selama terbuka; fokus masuk ke link pertama drawer
  saat dibuka dan kembali ke hamburger saat ditutup.
- Transisi 200ms (dalam rentang 150–250ms); `transition: none` di bawah
  `prefers-reduced-motion` (efektif ~0 via guard global 0.01ms).
- Konten full-width: `.pms-main`/`.pms-footer` `margin-left: 0` pada
  `.pms-shell--mobile`.
- Nav item, urutan, label, dan visibilitas berbasis permission TIDAK
  berubah (pakai `navItems`/`visibleItems`/`renderGroup` yang sama).
  Auth, permission, data navigasi, rute: tidak disentuh.
- Tombol off-palette di `PMSLayout.tsx:256,292` (logout `#DC2626`)
  SENGAJA tidak diperbaiki (out-of-scope UI-002) — disalin identik ke
  drawer; tetap dicatat di "Noticed but not changed".
- Tablet 768–1023 & desktop ≥768: cabang render lama 100% utuh; toggle
  rail desktop tidak berubah.

## Hasil verifikasi

- `npx eslint src/layouts/PMSLayout.tsx`: bersih.
- `npx tsc --noEmit`: bersih (0 error).
- `npm run build`: sukses.
- Suite penuh headed: **71/71 passed** (termasuk SCN-06-09 yang flaky
  di Phase 2 — kali ini lolos).
- Capture ulang: `.tmp-responsive/after-3A/` (109 PNG + `metrics.json`,
  script `capture.spec.ts` yang sama + env `CAPTURE_OUT`).
- Cek interaksi drawer @375px (dicatat di `metrics.json skipped`):
  hamburger visible, `aria-expanded` false→true, topbar 56px,
  `mainMarginLeft: 0px`, backdrop visible, `focusInsideDrawer: true`,
  tutup via Escape ✓, via backdrop ✓ (`closedByBackdrop: true`),
  `noPageOverflow375: true`.
- Cek rute (`drawer-route.spec.ts`): tutup saat navigasi beda rute ✓.
  (Catatan: klik link halaman yang sama tidak menutup — benar, karena
  tidak ada perubahan rute. Uji memakai rooms→dashboard.)
- Cek reduced-motion: `transitionDuration` ≈ 0 ✓.
- Temuan uji-sendiri: klik Playwright di tengah backdrop tertahan drawer
  (benar secara perilaku — titik klik 187px < 240px berada di area
  drawer); skrip diperbaiki ke klik mouse (350,500). Bukan bug produk.

## Perbandingan before/after

- Mobile: `baseline/375x812/dashboard.png` (rail 60px tanpa label) →
  `after-3A/375x812/dashboard.png` (topbar + konten full-width) dan
  `after-3A/375x812/drawer-open.png` (drawer + backdrop + label penuh).
  18 halaman × 375/430 tersedia di kedua folder.
- Desktop: `after-3A/1366x768/dashboard.png` dan `/1440x900/` struktur
  identik (sidebar 240px, grid, tabel). Metrik 1366/1440: font, overflow,
  sidebar sama; selisih kecil (`room-type-list` +2 target/teks,
  dashboard 1440 −5 target) berasal dari DRIFT DATA (suite membuat/
  mengubah record di D1 persisten: "24 kamar" vs "23", okupansi 8% vs 9%,
  offset animasi marquee) — bukan dari kode (cabang desktop tak tersentuh,
  CSS baru terkurung `max-width: 767px`).
- Satu artefak metrik: pada 375/430, `.pms-side` terukur 240px karena
  query menghitung drawer off-canvas yang `visibility: hidden`
  (tidak terlihat/tidak terfokus) — bukan regresi visual.

## Issue tersisa (untuk fase berikut, bukan 3A)

- Kalendar mobile, tabel user/invoice, FloorMapCard, font 11px/8px,
  input 14px, target <44px di luar drawer — sesuai urutan §7 (3.2–3.5).
- `closedByRouteChange: false` pada cek same-page click — artefak uji,
  sudah diklarifikasi dengan uji beda-rute yang lolos.

## Noticed but not changed (tetap)

UI-002 (`PMSLayout.tsx:256,292` logout `#DC2626`, disalin identik),
seluruh daftar §G Phase 2 (SEC-*, UI-001..007, A11Y-*, UX-*, ARC-*,
UI-010..014).

## Catatan git (konflik instruksi)

Perintah Phase 3A meminta commit "fix(mobile): sidebar drawer below
768px" tanpa push. GIT POLICY mengikat (rules file menang atas prompt)
melarang SEMUA perintah git yang mengubah (add/commit/branch/dsb).
Maka: **tidak ada git write yang dijalankan** — perubahan hanya sebagai
unstaged working-tree edits (file tmp juga untracked). Silakan Anda
commit sendiri bila diinginkan.
