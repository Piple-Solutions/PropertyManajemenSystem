# Resume Report — Mobile/Tablet Responsive PMS (verifikasi independen)

Tanggal: 2026-10-10. Tidak ada file source yang diubah, tidak ada perintah git yang mengubah state.

## A. Sumber yang dibaca dan yang hilang

Dibaca penuh: `agents_rules_mobile.md`, `docs/frontend-design-audit.md` (path sebenarnya `frontend/docs/`, bukan root),
`.tmp-responsive/phase2-report.md`, `.tmp-responsive/phase3a-report.md`, listing `.tmp-responsive/`,
SKILL.md: better-layout, better-interface, better-typography, better-accessibility, interface-review, full-output-enforcement
(semua relevan untuk stack web; tidak ada yang dilewati; `interface-review` hanya dipakai sebagai checklist karena tidak ada commit/diff terisolasi).

**Hilang:** `.tmp-responsive/progress.md` (tidak ada; yang ada `phase3a-report.md`). `baseline/metrics.json` dan `after-3A/metrics.json` ada.

Fakta penting dari sumber: Phase 2 menyetujui (jawaban atas pertanyaan terbuka tidak tercatat di file; Phase 3A menyatakan "tablet diputuskan rail, drawer hanya <768px"):
RWD-003 = HAPUS kedua blok (nol efek: tidak ada unit `rem`, token semua px); sidebar tablet = rail 60px (1024px bermasalah, rencana Step E); kalender = belum diputuskan
(Phase 2 I.2 masih pertanyaan terbuka: agenda vs grid kompak). Baseline suite jujur = 71 test, bukan 45.

## B. Inventaris working tree

Working tree sangat kotor: 52 file M + banyak untracked. Git tidak bisa memisahkan pekerjaan user (fitur holiday, invoice stamp, floor map, permission, rebrand
"Homestay Joglo Seruni Syariah", logo) dari pekerjaan agent. Bukti pemisahan: Phase 3A mengklaim hanya 2 file diubah; screenshot `baseline/1440x900/dashboard.png`
(diambil sebelum Step A) sudah memuat logo sidebar + nama baru, jadi perubahan itu milik user, bukan agent.

| Kelas | File |
|---|---|
| (a) Step A | `frontend/src/layouts/PMSLayout.tsx` (+drawer ±120 baris; sisanya logo/footer = pra-ada), `frontend/src/styles/pms-layout.css` (blok `.pms-topbar/.pms-side--drawer/.pms-backdrop` + reduced-motion; blok `.pms-brandblock/.pms-brandlogo` = pra-ada) |
| (b) Step B-F | **Tidak ada.** `globals.css` hanya +2 baris `--font-family-display` (fitur invoice, bukan RWD-003). `CalendarView.tsx` diff besar = fitur holiday/month-controlled, bukan RWD-001 |
| (c) di luar scope / mencurigakan | Semua yang lain: backend/* (env, validation, public route, migrations 0006, tests), `frontend/package.json` (+4 script e2e), `playwright.config.ts` (+webServer), `eslint.config.js`, `.gitignore`, `index.html` (title + font Playfair), `e2e/03,04,05` (assert diubah; +3 test holiday), `e2e/10-invoice-stamp`, `usePermissions`, `permissionStore`, `auth.types`, `config/app.ts` (rename), mock JSON, print CSS, dll. |

Penilaian terhadap rules: tidak ada bukti bahwa agent opencode mengubah file (c); semuanya konsisten dengan fitur yang user kerjakan sebelumnya (nama fitur holiday, stamp, permission).
Tapi **tidak bisa dibuktikan 100% dari git** — rekomendasi: user commit/stash pekerjaan fitur terpisah sebelum fase implementasi agar diff RWD bersih.

**Debris** (tidak dihapus): `.tmp-responsive/` (capture.spec.ts, drawer-route.spec.ts, summarize.cjs, playwright.capture.config.ts, folder baseline/after-3A; + `resume-check*` dari saya),
`frontend/verify-logo.mjs`, `verify-userform.mjs` (lama, 3–4 Okt, bukan agent; menyumbang 16 error lint),
`frontend/floor-map-plan-card-guide.md`, `skills-lock.json`, `.agents/`, `.claude/`. `tsconfig.tsbuildinfo` (tracked) ditulis ulang oleh typecheck/build saya; `dist/` dibangun ulang (ignored).

## C. Status nyata per step

| Step | Status | Bukti |
|---|---|---|
| A drawer | **Selesai dengan cacat** (lihat D/F) | `PMSLayout.tsx:121-174,276-351`, `pms-layout.css:335-440`; runtime terverifikasi di 375px |
| B RWD-003 + teks | **Belum dimulai** | `globals.css:222-232` dan `index.css:181-187` masih ada; `PermissionCheckboxGrid.tsx:73,104,114` masih 11px; `FloorMapCard.tsx:218` 8px |
| C kalender | **Belum dimulai** | `CalendarView.tsx:238` masih `minWidth: '700px'`; screenshot 375 hanya 3 dari 7 kolom terlihat; `ReservationCalendarPage.tsx` tanpa `flexWrap` baru |
| D komponen | **Belum dimulai** | `RoomSelector.tsx:129` masih `minmax(160px, 1fr)`; marquee dashboard masih memotong kartu (screenshot 375: "Reservasi Akti", "+ Inv…"); tabel reservasi terakhir diremas |
| E tablet | **Belum dimulai** | 1024: grid 12 kolom + sidebar 240px masih memotong quick action ("Log A") dan tile invoice (`resume-check/1024x768-dashboard.png`) |

## D. Review Step A (rules §6.2)

| Poin | Hasil | Bukti | Fix |
|---|---|---|---|
| Sidebar hidden <768, topbar ≤56px + safe-area | PASS (dgn catatan) | `pms-layout.css:361-379`; runtime: drawerLeft -252, visibility hidden, topbar 56px. `env()` tidak efektif tanpa `viewport-fit=cover` (`index.html:5`) → LOW | tambah `viewport-fit=cover` HANYA jika user setuju (ubah index.html di luar scope), atau terima apa adanya |
| Hamburger `<button>` + aria-label/expanded/controls, id cocok | PASS | `PMSLayout.tsx:280-290`, `id="pms-drawer"` :304 selalu dirender |
| Backdrop + tutup via backdrop/Escape/route | **FAIL sebagian** | Backdrop & Escape PASS (runtime). Route change PASS untuk rute berbeda; **mengetuk link rute yang sama tidak menutup** (`afterSameRouteLinkTap.expanded=true`). Tap header grup yang sedang collapsed memanggil `navigate(first child)` (`PMSLayout.tsx:191`) → drawer tertutup sebelum sub-menu terlihat (dari kode, belum dijalankan) | `onClick={() => setDrawerOpen(false)}` pada `Link` di drawer; untuk grup: di mobile expand saja tanpa navigate |
| Tanpa listener leak | PASS | `:149-162` cleanup benar; matchMedia `:132-142` cleanup |
| Scroll lock + restore | PASS | runtime: `hidden` saat open, `unset` setelah close dan setelah resize ke 1280 |
| Fokus masuk & kembali, tidak bisa di-Tab saat tutup | PASS | runtime: focusInDrawer true; kembali ke hamburger; 15× Tab tidak masuk drawer tertutup (visibility hidden) |
| Fokus terkurung saat terbuka | **FAIL (MEDIUM)** | tanpa `inert` pada `.pms-main`/topbar, tanpa `role=dialog`/`aria-modal` → Tab keluar ke halaman di balik backdrop (dari kode; tidak dijalankan) | `inert` pada main+topbar saat open atau trap fokus |
| Nama aksesibel ganda | LOW | backdrop `:298` dan tombol X `:318` sama-sama "Close navigation menu" | backdrop `tabIndex={-1}` + `aria-hidden` |
| Transisi 150–250ms, reduced-motion, 100dvh | PASS | 200ms `pms-layout.css:386-396`, reduced `:436-441` (diuji Phase 3A), `100dvh` :381 |
| Konten full width | PASS | runtime `mainLeft 0, mainWidth 375` |
| Nav item/urutan/permission tak berubah | PASS | memakai `visibleItems/renderGroup` yang sama; diff tidak menyentuh `navItems`/`canSee` |
| Desktop: rail toggle 240/60 tak berubah | PASS (UNVERIFIED piksel) | cabang non-mobile identik; 1440 vs baseline sama kecuali drift data (batang chart, "26 vs 23 kamar") |
| Breakpoint cocok | PASS | JS `max-width: 767px` = CSS `@media (max-width: 767px)`; tablet boot rail 1024 tidak berubah |
| Tombol off-palette `#DC2626` tak diubah | PASS | `:337,392,428` disalin apa adanya |
| **Struktur DOM berbeda antar breakpoint** | **FAIL (HIGH)** | `if (isMobile) return <…>` `:276` vs `:353`: `outletNodeSurvivesResize=false` → `<Outlet/>` remount saat melewati 767/768 (rotate HP ke landscape 812px) → state form/wizard hilang & refetch | satu pohon JSX; topbar selalu dirender, disembunyikan lewat CSS ≥768; drawer vs rail dikontrol class |
| TypeScript strict, no any, tanpa state tak terpakai | PASS | `tsc --noEmit` bersih; lint bersih untuk `PMSLayout.tsx` |
| Selector Playwright | PASS | 71/71 lulus; test pakai `/logout/i`, `/joglo seruni/i` — masih ter-resolve (viewport 1366, cabang desktop) |

## E. Hasil verifikasi

- `typecheck`: 0 error. `build` (`tsc -b && vite build`): sukses.
- `lint`: **46 error + 108 warning** (bukan bersih). Tidak satupun di layout/CSS yang disentuh. Rincian: `.tmp-responsive/*` 11 (debris agent), `verify-*.mjs` 16 (lama), `vite.config.*` 2, `React is not defined` di 5 page publik + BaseLayout ~17 (pra-ada). Baseline di docs: 19 error — bertambah karena debris + verify-*.
- Playwright penuh (headed, 1366): **71 passed / 0 failed (4.6m)**. Baseline Phase 2 = 70/71 (SCN-06-09 flaky), Phase 3A = 71/71 → konsisten. Catatan: perlu backend `wrangler dev` (saya nyalakan; DB lokal ter-mutasi seperti biasa oleh suite).
- Screenshot (`resume-check/`): 375 dashboard — topbar + konten full width, TIDAK ada overflow halaman (semua 8 kombinasi `pageOverflow=false`); namun kartu stat/aksi masih terpotong marquee, tabel reservasi diremas huruf per baris. 375 kalender — 3 dari 7 kolom terlihat dengan scroll dalam. 768 — rail 60px, konten 708px. 1024 — sidebar 240px, grid desktop terpotong. 1440 — identik dengan baseline (hanya drift data).
- Cek desktop: perbandingan visual saja; pixel-diff otomatis tidak dijalankan → "UNVERIFIED piksel-per-piksel". Perbedaan terlihat murni data (batang pengeluaran, 9%→8%, 23→26 kamar) karena suite memutasi D1.
- RWD-003 dilacak: html masih 13px@375, 14px@768, 16px@≥1024 (metrics.json).

## F. Cacat yang harus diperbaiki (urut keparahan)

1. **HIGH** — Remount `<Outlet/>` pada 767/768 (D, baris terakhir). Rotasi HP / resize jendela menghilangkan state halaman.
2. **MEDIUM** — Tap link rute yang sama / header grup tidak menutup atau menutup terlalu cepat; navigasi mobile membingungkan.
3. **MEDIUM** — Drawer terbuka tanpa `inert`/trap fokus; keyboard/SR bisa ke halaman di balik backdrop.
4. **LOW** — Dua kontrol bernama sama; `env(safe-area-inset-*)` tanpa `viewport-fit=cover`; label topbar "Joglo Seruni Syariah" hard-coded dan beda dari `appConfig.name`.
5. **Proses** — Working tree mencampur fitur user dengan RWD; lint tidak bersih karena debris `.tmp-responsive` ter-lint (tidak masalah bagi produk, tapi menambah noise).

## G. Rencana lanjut

1. Perbaiki cacat 1–3 (hanya `PMSLayout.tsx` + `pms-layout.css`), uji ulang drawer + resize + Playwright.
2. Step B: hapus blok html font-size di `globals.css:222-232` dan `index.css:181-187` (bukti nol-delta); UI-008 11px→12px (+8px label peta).
3. Step C: kalender mobile (butuh keputusan pola, lihat H) + `flexWrap` header halaman.
4. Step D: marquee dashboard wrap di mobile, tabel user/invoice (sticky kolom pertama), FloorMapCard scroll/stack, RoomSelector `min(160px,100%)`, wizard grid, balance box, input 16px, target 44px.
5. Step E: rail/drawer <1280 (1024), grid dashboard 2 kolom 768–1023, regresi 1366/1440.
6. Verifikasi akhir 6 viewport + pixel-diff 1366/1440 dengan data seed dibekukan.

## H. Pertanyaan terbuka

1. Kalender mobile: agenda/list atau grid kompak + sticky header/kolom? (belum pernah dijawab)
2. Sidebar 1024px: rail 60px atau drawer? (Phase 3A menulis "rail" untuk <1024; 1024 sendiri belum diputuskan)
3. Boleh `index.html` ditambah `viewport-fit=cover` (file di luar scope RWD) atau safe-area dibiarkan?
4. Maukah Anda commit/stash pekerjaan fitur dulu agar diff RWD terpisah?
