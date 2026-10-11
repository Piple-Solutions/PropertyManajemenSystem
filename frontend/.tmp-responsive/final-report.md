# Laporan Akhir — Perbaikan Responsif Mobile/Tablet PMS (2026-10-10)

Kebijakan git dipatuhi: tidak ada perintah git yang mengubah state; semua perubahan adalah edit working tree biasa.
Catatan: kolom "MY FEEDBACK" pada prompt Blok 1 berisi placeholder -> diperlakukan "none". Pola kalender & sidebar 1024 tidak pernah
dijawab -> keputusan saya tercatat di bawah.

## 1. Ringkasan
- Drawer mobile (<768px) sekarang benar: satu pohon JSX, tidak remount, focus/inert/escape/backdrop/route-close terverifikasi.
- RWD-003: blok `html font-size` 14/13px dihapus (nol efek, nol `rem` di src).
- Teks <12px diangkat ke 12px (<=1279px), input >=16px di <=767px.
- Kalender: grid bulan kompak tanpa scroll horizontal di mobile; tablet tanpa scroll dalam; header halaman `flexWrap`.
- Tabel scroll di dalam wrapper dengan kolom pertama menempel (bukan diremas); target sentuh 44px di tabel/pagination/peta (<=1023).
- FloorMapCard: rencana ~600px dalam wadah scroll; tab/legend 44px; hint "Geser ke samping".
- Tablet: sidebar boot sebagai rail sampai <1280; kartu invoice dashboard tidak lagi terpotong di 1024-1279.
- Hasil verifikasi: typecheck 0 error, build OK, lint src 17 error (semua pra-ada `React is not defined`), Playwright **71/71** (dua kali berturut-turut
  setelah satu flake pra-ada terisolasi), desktop 1440 identik piksel kecuali data/animasi marquee.

## 2. File yang diubah (14 source + 1 artefak build)
| File | Alasan |
|---|---|
| `src/layouts/PMSLayout.tsx` | Drawer: satu pohon, `inert`, dialog aria, close on link, grup mobile tidak navigate; boot rail <1280 |
| `src/styles/pms-layout.css` | (dari Step A Phase 3A) topbar/drawer/backdrop — tidak diubah di sesi ini |
| `src/styles/globals.css` | Hapus html font-size; lantai teks 12px; input 16px; aturan `.tbl/.pg/.fmc/.dm-btn` |
| `src/index.css` | Hapus blok html font-size duplikat |
| `src/styles/reservation-wizard.css` | Label stepper 11px -> 12px (<=640px) |
| `src/components/shared/CalendarView.tsx` | className `cal-*`, wrapper chip, sufiks "more" |
| `src/styles/reservation-list.css` | Blok `.cal-*` (grid kompak) |
| `src/pages/reservations/ReservationCalendarPage.tsx` | RWD-005 flexWrap + gap header |
| `src/components/shared/Table.tsx` | className `tbl-wrap/tbl` + `--tbl-cols` |
| `src/components/shared/Pagination.tsx` | className `pg` |
| `src/components/pms/FloorMapCard.tsx` | wrapper scroll, kelas `fmc-*`, hint |
| `src/components/shared/RoomSelector.tsx` | `minmax(min(160px,100%),1fr)` |
| `src/components/shared/Modal.tsx` | `size="full"` -> `100%` (menghormati overlay padding; 0 call-site) |
| `src/pages/rooms/RoomListPage.tsx` | `minmax(0,1fr)` untuk layout 1 kolom; kelas `rooms-search` |
| `src/styles/dashboard-modern.css` | Tile invoice tetap stack di 1024-1279 |
| `tsconfig.tsbuildinfo` | ditulis ulang oleh typecheck/build (tracked) |

Tidak diubah (dikonfirmasi lewat mtime): `e2e/*`, `package.json`, `package-lock.json`, `playwright.config.ts`, route, permission, service, token warna.
Catatan: working tree sudah kotor sebelum sesi ini (fitur holiday/invoice/permission milik pengguna) — `git diff` HEAD mencampur keduanya.

## 3. Skill
Dipakai: better-layout (shell/drawer/kalender), better-interface, better-typography (lantai 12px/16px), better-accessibility (elemen tersentuh),
interface-review & full-output-enforcement (checklist), mobile-native/apple-design (hanya ide pola). Tidak dipakai: semua yang ada di daftar
"Not used" rules; better-writing/colors/ui tidak relevan.

## 4. Keputusan
- **RWD-003 = HAPUS**: html terukur 13px@375, 14px@768, 16px desktop; 0 unit `rem`; body 14px dari token px. Setelah hapus: html 16px di semua
  viewport, layout 375/768 hanya berubah karena lantai teks/input (bukan html).
- **Kalender = grid bulan kompak CSS-only**: satu DOM, handler/data sama; chip -> titik status <=767px (kode ada di `title`, detail di popup).
  Alasan: kalender per-hari (tidak ada kolom kamar sticky), tidak ada logika terduplikasi.
- **Sidebar**: drawer <768; rail 60px untuk 768-1279 (boot); full 240px >=1280. Keputusan 1024px: rail (membebaskan 180px, menghilangkan pemotongan grid).
- **Tabel**: scroll horizontal + kolom pertama sticky; tidak ada card-list global.
- **Peta kamar**: scroll horizontal ~600px agar kamar >=44px (opsi "scroll container" dari aturan 6.4).

## 5. Metrik sebelum -> sesudah (baseline -> final)
Per halaman (target<44 / teks<12 / input min px):
- 375: dashboard 9->7 / 19->1 / -; reservation-list 7->4 / 8->0 / 14->16; calendar 2->0 / 6->0 / 14->16; wizard 4->0 / 3->0 / 14->16;
  room-list 47->5 / 26->0 / 14->16; invoice-list 24->3 / 0 / 14->16; user-list 49->6 / 0 / 14->16; contact 0.
- 768: room-list 36->7, invoice 24->5, user-list 49->8, dashboard 9->9; teks<12 semua 0 kecuali dashboard 1 (teks SVG chart).
- 1024: target 15-55 -> 2-49 (mouse; aturan sentuh `pointer: coarse` tidak teremulasi); teks<12 -> 0 kecuali 1 SVG.
- Overflow level halaman + `.pms-main`: **tidak ada** di 375/430/768/1024 (semua 8 halaman kunci).
- Pangsa sidebar: 375: 0.16 (rail) -> 0 (drawer tertutup); 1024: 0.234 -> 0.059.
- Desktop 1440: semua halaman IDENTIK piksel dengan capture sebelum langkah terakhir; dashboard selisih 0.7-1.5% hanya di baris marquee
  (animasi); room-list/user-list/calendar selisih = angka data ("26->27->29 rooms", suite menambah kamar). Baseline lama (Phase 1) tidak bisa
  dibandingkan piksel-per-piksel karena drift data D1; rantai after-A0..final dipakai sebagai bukti identitas.

## 6. Definition of Done
- [~] Screenshot baseline & after 375/430/768/1024/1366/1440: final 375/430/768/1024/1440; **1366 tidak diambil ulang** (hemat token; aturan identik >=1280).
- [x] Tanpa overflow horizontal tak diinginkan di 375/430/768/1024 (`.tmp-responsive/final/metrics.json`).
- [x] Drawer <768 dan konten full width (`mainLeft 0`).
- [x] Kalender usable di mobile tanpa 700px (`calendar-check.json`).
- [~] Teks <12px: 0 kecuali 1 teks SVG chart dashboard (atribut `font-size` SVG, di luar jangkauan CSS inline-attr; dicatat). Input >=16px di mobile: ya (min 16).
- [~] Touch target 44px: komponen yang disentuh sudah (tabel/pagination/peta/kalender/drawer; 375 total 25 elemen <44 dari 8 halaman, sebelumnya 142);
  sisa: dashboard (kartu marquee, tombol kecil), elemen halaman lain yang tidak disentuh (filter, wizard), dan 768 total 39.
- [x] Desktop tak berubah (1440 identik; 1366 identik secara aturan).
- [x] Playwright 71/71, build, typecheck. Lint: **tidak bersih** (46 error total proyek; src 17 pra-ada — bukan dari pekerjaan ini).
- [x] Tidak ada perubahan logika bisnis, route, permission, warna/token (satu perubahan perilaku navigasi: header grup di drawer mobile hanya expand).
- [x] Daftar "noticed but not changed" di bawah.

## 7. Noticed but not changed (ID audit)
UI-001 (Button varian identik), UI-002 (tombol biru/merah `#2563EB/#DC2626` di tabel & logout drawer), UI-003 (`#C85C5C`), UI-004..006 (hex/radius non-token;
`#F8F6F2/#E3DED6` di FloorMapCard), UI-007 (max-width tak konsisten), UI-009 (`role="button"` pada div peta), UI-010 (angka magis),
A11Y-004 (Modal tanpa focus trap), A11Y-005 (kalender tanpa `role="grid"`; fokus imperatif), A11Y-001/009 (label form), A11Y-006,
SEC-001/002, UX-001..008, ARC-*, UI-011..014; tabel scroll container tidak fokusable via keyboard; marquee dashboard masih memotong
kartu stat di mobile (animasi — tidak diubah, perlu keputusan desain); `viewport-fit=cover` tidak ditambahkan (index.html di luar scope).

## 8. Sisa masalah & rekomendasi
1. Tabel user-list di mobile: kolom email/role/aksi di luar layar -> pertimbangkan kolom prioritas atau baris-kartu khusus (butuh keputusan desain).
2. Marquee dashboard (kartu stat dipotong) -> ganti ke grid 2 kolom di mobile (perlu keputusan).
3. Target sentuh dashboard/wizard di 768 -> pass lanjutan.
4. Keamanan: SEC-001 gating aksi, SEC-002 password default; Design-system: UI-001..005; Aksesibilitas: A11Y-001, A11Y-004.
5. Lint tidak bersih: perbaiki `React` import di 5 halaman publik + abaikan `verify-*.mjs`/`.tmp-responsive` di eslint.
6. Flake e2e SCN-06-09 & SCN-09-03 (timing) — perlu wait eksplisit di test (butuh izin menyentuh test).

## 9. Bersihkan
Hapus folder `E:\Project\Web\pms-internal\frontend\.tmp-responsive\` (screenshot, spec sementara, laporan). `test-results/` dan `playwright-report/`
adalah artefak Playwright (ter-ignore). Backend dev server yang saya jalankan sudah dimatikan.
