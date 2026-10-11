# Laporan Blok 8 — Perbaikan Logika Frontend, Non-UI (Sonnet 5.5, Medium)

**Status: SELESAI.** 8 dari 8 item. FE-004 dikerjakan setelah pemilik memilih opsi (a) pada STOP-AND-ASK S5 (pakai komponen `ErrorState` yang sudah ada, inline).
**Snapshot:** `snapshot-block-8\` (`frontend\src`, `vite.config.ts`, `eslint.config.js`; dibuat SEBELUM edit pertama).
**Restore (satu baris):** `Remove-Item frontend\src -Recurse -Force; Copy-Item .tmp-fix\snapshot-block-8\frontend\src frontend\src -Recurse -Force; Copy-Item .tmp-fix\snapshot-block-8\frontend\vite.config.ts,.tmp-fix\snapshot-block-8\frontend\eslint.config.js frontend\`

## 1. Ringkasan per item
| Item | Status | Perubahan |
|---|---|---|
| 8.1 FE-003 | FIXED | `apiFetch`: 401 pada panggilan ber-token -> hapus token + handler (`AuthProvider` -> LOGOUT) **sekali** per sesi; `ProtectedRoute` mengarahkan ke `/login?returnTo=<halaman>`; `LoginPage`/`PublicOnlyRoute` memakai `returnTo` (aman: hanya path internal, bukan `//`, bukan halaman auth). Panggilan login tidak mengirim token sehingga tidak memicu handler. `restoreSession` hanya menghapus token pada 401 (error jaringan/5xx tidak). `getMyPermissions` melempar error (store mempertahankan izin terakhir) |
| 8.2 FE-004 | FIXED (opsi a, disetujui pemilik) | `reservationService.checkIn/checkOut/cancel` kini menolak dengan `ApiError` asli (status + pesan) alih-alih `false`; method baru aditif `fetchFullById` (hanya 404 = `undefined`, error lain menolak) dipakai `ReservationDetailPage`. `ReservationDetailPage`, `CheckInButton`, `CheckOutButton` menangkap error dan menampilkannya dengan `ErrorState` yang sudah ada (inline, hanya saat error); sukses tetap menutup dialog + reload. Kegagalan memuat (bukan 404) menampilkan `ErrorState` dengan tombol "Coba Lagi" (404 tetap layar "Reservation not found"). `getFullById`/`getById` lain TIDAK diubah (banyak call site tanpa catch) |
| 8.3 FE-005 | FIXED | `src/utils/localDate.ts` (baru): `toLocalISODate`, `todayLocalISO`, `shiftISODate`. Dipakai di `ReportPage`, `SalesPage` (hari ini nyata + format lokal), `DashboardPage` (fallback today + bucket mingguan), `InvoiceFormPage` (tanggal default + tahun nomor), `formatUtils` (`'iso'`). Tidak ada lagi `2026-09-15` / `toISOString().split('T')[0]` di `src` (di luar data mock dan stempel waktu `createdAt`) |
| 8.4 FE-006 | FIXED | `authStore.login/register` tidak lagi menyalakan `isLoading` global (hanya untuk restore sesi awal); `LoginPage`/`RegisterPage` memakai state `submitting` lokal -> form tidak ter-unmount, input tidak hilang. Teks tombol sama ("Loading..." / "Creating Account...") |
| 8.5 FE-002 | FIXED | `fetchAllPages` di `api.ts`; dipakai oleh `reservationService`, `roomService`, `roomTypeService`, `userService`, `roleService`, `activityService` (`getAll`, `getByCategory`, `getByUser`). Bentuk keluaran identik (array). Halaman/komponen tidak disentuh |
| 8.6 X-005 | FIXED | `authService.login`: 401 "Invalid email or password" tetap `null` (teks store sama); 401 lain (mis. "User is inactive") dan 429 dilempar sehingga `apiErrorMessage` menampilkan pesan backend apa adanya. Tanpa teks baru |
| 8.7 FE-008 | FIXED | `vite.config.ts`: `sourcemap: 'hidden'`. Fallback URL API TIDAK dibuat melempar |
| 8.8 FE-010 | FIXED (terbatas) | `eslint.config.js`: globals Node untuk skrip root dan `.tmp-responsive`; `authStore` memakai `ApiUser` (bukan `any`). Mass cleanup tidak dilakukan |

## 2. Verifikasi
| Pemeriksaan | Baseline (Blok 0) | Sekarang |
|---|---|---|
| Frontend `tsc --noEmit` | lulus | **lulus** |
| ESLint | 197 error / 319 warning | **43 error / 316 warning**; tidak ada file yang memburuk (`no-undef` 195 -> 41 sisa, semua di salinan snapshot `.tmp-responsive`) |
| Build produksi (ke `.tmp-fix\fe-dist-block8`) | JS 1.845.006 B (85 berkas), entry 249,97 kB | **JS 1.843.955 B** (87 berkas, -1.051 B), entry ~250,9 kB; bundel tanpa komentar `sourceMappingURL`, 86 berkas `.map` terpisah |
| Pemeriksaan logika murni (`.tmp-fix\fe-logic-check.mjs`, zona WIB) | - | **18/18 lulus**: tanggal lokal vs UTC (bug 2026-08-31 direproduksi), shift tanggal, `returnTo` aman, fetch-all-pages (250 baris = 3 request; <=100 baris = 1 request; cap; error halaman ke-n menolak), 401 sekali + re-arm setelah login, login tidak memicu handler, error jaringan/5xx tidak logout, restoreSession, getMyPermissions, X-005, aksi reservasi menolak dengan ApiError asli, `fetchFullById` 404/5xx |
| Backend `tsc` + `vitest` | 282 lulus | **421 lulus / 0 gagal** (tidak ada perubahan backend di blok ini) |

Perdagangan FE-002: daftar >100 baris kini butuh beberapa request berurutan (1 request per 100 baris; kasus <=100 baris tetap 1 request). Batas pengaman: 20 halaman (2.000 baris) per layanan, **10 halaman (1.000 baris terbaru)** untuk activities karena log audit tumbuh cepat (Blok 3). Urutan stabil mengandalkan `ORDER BY` backend (Blok 7); terhadap backend lama (urutan tak dijamin) tetap berfungsi tetapi baris bisa saja tumpang-tindih/terlewat antar halaman.

## 3. FE-004 — keputusan S5 dan penerapannya
Pemeriksaan awal: tidak ada mekanisme tampil-error yang sudah ada untuk aksi check-in/check-out/cancel (`ErrorState` ada di `components/shared` tetapi belum dipakai; tidak ada toast/banner), sehingga menampilkan pesan dihitung sebagai elemen visual baru (S5). Pemilik memilih **opsi (a)**: pakai `ErrorState` yang sudah ada, inline di `ReservationDetailPage` dan dialog Check-In/Out.
Yang tampil baru (hanya saat error): satu `ErrorState` dengan deskripsi = pesan backend apa adanya (mis. "Cannot check in from status 'checked-in'."). Judul memakai teks bawaan komponen ("Terjadi Kesalahan"); tidak ada teks baru yang saya tulis. Catatan: `ErrorState` bertinggi minimum 200 px, jadi blok error cukup besar; bila terasa terlalu besar, itu keputusan desain komponen (di luar blok ini).
`CheckInButton`/`CheckOutButton` saat ini tidak dirender di halaman mana pun (komponen yatim); tetap diperbarui supaya tidak ada pemanggil `checkIn/checkOut` yang menelan penolakan.

## 4. LAPORAN NETRALITAS UI (setiap berkas frontend yang berubah)
Perbandingan hunk-level terhadap snapshot (`.tmp-fix\b8-diff.txt`). Klasifikasi: **logic-only** = state/handler/pengambilan data/fungsi tanggal; **UI** = JSX/markup/className/style/CSS/teks/ikon/aset. Hasil: **0 hunk UI yang tidak disetujui**; satu-satunya tambahan render adalah `ErrorState` kondisional untuk FE-004 (disetujui, opsi a).
| Berkas | Hunk | Klasifikasi |
|---|---|---|
| `components/ProtectedRoute.tsx` | import, `useLocation`, target `navigate` + `returnTo` | logic-only |
| `components/PublicOnlyRoute.tsx` | import, `useLocation`, target `<Navigate>` memakai `returnTo` | logic-only (nilai prop `to`, markup sama) |
| `components/pms/CheckInButton.tsx`, `CheckOutButton.tsx`, `pages/reservations/ReservationDetailPage.tsx` | state + try/catch + render kondisional `<ErrorState>` (komponen yang sudah ada, hanya saat error); `fetchFullById` | logic-only; **satu elemen kondisional yang disetujui pemilik (opsi a)** — satu-satunya perubahan render, hanya muncul saat error |
| `pages/LoginPage.tsx` | state `submitting`, handler submit, `returnTo`; di JSX hanya ekspresi `disabled={...}` dan kondisi label menunjuk `submitting` | logic-only (binding; teks, struktur, style tidak berubah) |
| `pages/RegisterPage.tsx` | sama seperti LoginPage | logic-only |
| `pages/DashboardPage.tsx` | sumber `today`, perhitungan kunci bucket mingguan | logic-only |
| `pages/finance/ReportPage.tsx`, `SalesPage.tsx` | `getDateRange` memakai hari nyata + formatter lokal | logic-only |
| `pages/finance/InvoiceFormPage.tsx` | nilai default tanggal & tahun nomor | logic-only |
| `services/api.ts`, `authService.ts`, `activityService.ts`, `reservationService.ts`, `roomService.ts`, `roomTypeService.ts`, `userService.ts`, `roleService.ts` | 401/paging/error | logic-only |
| `stores/authStore.tsx` | handler 401, tidak toggle `isLoading` saat submit, tipe `ApiUser` | logic-only |
| `utils/formatUtils.ts` | format `'iso'` lokal | logic-only |
| `utils/localDate.ts`, `utils/returnTo.ts` (baru) | helper murni | logic-only |
| `vite.config.ts` | `sourcemap: 'hidden'` | config yang diizinkan (FE-008) |
| `eslint.config.js` | blok `globals` | config yang diizinkan (FE-010) |
Tidak ada perubahan: CSS, className, style, teks tampilan yang ditulis sendiri, ikon/aset, halaman publik, struktur menu/route, komponen bersama (`ErrorState` dipakai apa adanya). File `utils/dateUtils.ts` yang sudah ada sempat tertimpa oleh kesalahan saya lalu DIPULIHKAN dari snapshot (hash identik); helper baru dipindah ke berkas bernama `localDate.ts`.

## 5. Kompatibilitas backend lama dan baru
- 401 handling: backend lama dan baru sama-sama 401 pada token tak valid -> perilaku identik.
- Login 401 "User is inactive": ada di backend lama maupun baru; 429 hanya di backend baru (Blok 1) dan tampil lewat `message`.
- Paging: dua versi backend menerima `page`/`pageSize` (<=100). Backend baru memberi urutan deterministik (Blok 7); backend lama urutan tak dijamin.
- Tanggal: tidak bergantung backend.
- `returnTo`, `submitting`, sourcemap: murni sisi klien.

## 6. Dampak yang terlihat
1. Halaman Laporan/Penjualan memakai hari nyata (bukan 15 Sep 2026): preset "Bulan Ini"/"Hari Ini" kini menunjuk periode sebenarnya. Data finance masih MOCK (FE-001) dengan tanggal September 2026, sehingga preset periode yang tidak mencakup September 2026 akan tampak kosong sampai finance terhubung ke API.
2. Setelah sesi berakhir, pengguna dikembalikan ke halaman yang sama setelah login ulang.
3. Form login tidak lagi kosong setelah salah ketik.
4. Daftar yang >100 baris kini lengkap (dengan batas pengaman).

## 7. Catatan / risiko
1. **`frontend\vite.config.js` (artefak hasil `tsc -b`) masih berisi `sourcemap: true`.** `vite` memilih `.js` sebelum `.ts` bila dijalankan langsung; `npm run build` menjalankan `tsc -b` lebih dulu yang membuat ulang `.js` dari `.ts`. Jika build dijalankan dengan `vite build` langsung, hasilnya masih sourcemap publik. Berkas `.js` itu di luar scope tulis (tidak diubah). Verifikasi: build dengan `--config vite.config.ts` menghasilkan bundel tanpa referensi map.
2. Handler 401 menggunakan satu flag per sesi; bila tab lain login ulang token baru dipakai tab ini pada panggilan berikutnya (token dibaca per request).
3. `.tmp-responsive` (milik workstream UI) tetap diabaikan dari perubahan kecuali konfigurasi globals ESLint.
4. FE-007, X-001, X-006, `/register`, FE-009, JSON kredensial mock, FE-001: tidak dikerjakan (di luar blok ini).
