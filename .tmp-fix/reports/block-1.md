# Laporan Blok 1 — Auth Hardening (Sonnet 5.5, Medium)

**Status: SELESAI.** Backend `tsc --noEmit` lulus; `vitest run`: **304 lulus / 0 gagal (25 file)** (Blok 0: 282).
**Snapshot:** `snapshot-block-1\` — CATATAN: dibuat SETELAH edit Blok 1 dimulai (kelalaian proses). Isinya `src`, `scripts`, `README.md` dalam keadaan sebelum Blok 1 (identik dengan `snapshot-block-0`, karena Blok 0 tidak menyentuhnya). Berkas tes yang diubah Blok 1 terdaftar di bagian 3.
**Restore (satu baris):** `Copy-Item .tmp-fix\snapshot-block-1\backend\* backend\ -Recurse -Force; Remove-Item backend\src\lib\security.ts, backend\tests\hardening.test.ts` (lalu kembalikan 4 berkas tes yang diedit sesuai bagian 2/3).

## 1. Per temuan

| ID | Status | Perubahan | Sebelum -> sesudah | Residual |
|---|---|---|---|---|
| BE-001 | FIXED | `routes/auth.ts`: konstanta `PUBLIC_REGISTRATION_ENABLED=false` (di `lib/security.ts`, tanpa env var); register selalu `403` + pesan "Pendaftaran akun publik dinonaktifkan. Hubungi administrator untuk dibuatkan akun." Ditolak SEBELUM validasi/DB (tidak ada enumerasi 409). Service `register()` tetap ada & teruji. | 201+JWT -> 403 | FE `/register` masih tampil (sengaja, UI di luar scope; pesan tampil lewat `auth-error` karena `apiErrorMessage`). e2e `SCN-02-07` akan gagal (diharapkan; dijalankan pemilik). |
| BE-005 | FIXED | `jwtSecretGuard` (middleware untuk `/api/*` kecuali `/api/health`, `/api/public/*`): placeholder/kosong -> 500 + pesan JWT_SECRET, HANYA untuk request non-localhost. Deteksi berbasis fragmen ("change-me", "insecure", "dev-only", "placeholder", "example", ...) sehingga nilai contoh dari `.dev.vars.example` tertangkap tanpa menyalin nilainya ke kode; secret nyata yang pendek (<32) hanya `console.warn` sekali. | tanpa guard -> fail-closed | Jika produksi memakai nilai contoh, API akan 500 sampai secret dirotasi (itu tujuannya). Tidak ada perubahan `wrangler`/`.dev.vars`. |
| BE-006 | FIXED (best-effort) | `AttemptLimiter` per instance app (per isolate), kunci = IP + identifier, tanpa D1. Login: 20 GAGAL/10 mnt per IP+email (sukses menghapus); forgot-password: 10 req/10 mnt per IP+email; reset-password: 20 gagal/10 mnt per IP. 429 + `Retry-After` + pesan Indonesia. Map dibatasi 5000 kunci. | tanpa batas -> speed bump | Per isolate, tidak dibagi; proteksi nyata = aturan Cloudflare Rate Limiting/WAF (owner). Akun lain dari IP yang sama dan IP lain untuk akun yang sama tidak terpengaruh (diuji). |
| BE-008 | FIXED | `forgotPassword(..., exposeAllowed)`; route memberi `isLocalhostUrl(c.req.url)`. Flag `DEV_EXPOSE_RESET_TOKEN` tidak berefek untuk host non-localhost. Token tetap dibuat. | token bocor bila flag bocor -> hanya localhost | Pengiriman email tetap belum ada (owner). |
| BE-011 | FIXED | Klaim token dengan `UPDATE ... WHERE id=? AND used_at IS NULL` + cek `meta.changes===1` SEBELUM mengganti password; sukses juga memvoidkan token lain milik user. | select-lalu-update -> klaim atomik | Jika update password gagal setelah klaim, token terbakar (aman, user minta ulang). |
| BE-012 | FIXED | `routes/public.ts`: `force` diabaikan (selalu `false` ke service); respons `source` = `"upstream"` (bukan URL), `error` = `"Holiday source unavailable."` bila ada. Bentuk respons sama. FE hanya membaca `year/days/available` dan tak ada call site `force`. | URL & teks error bocor -> disembunyikan | Service-level `force` tetap ada untuk tes internal. |
| BE-014 | FIXED (header saja) | `securityHeaders()`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` (kecuali `/api/public/*` & `/api/health`), HSTS pada https. Logout TIDAK diubah. | tanpa header -> header | `workers_dev:false` = owner (config). |
| BE-004 | FIXED (guard + docs) | `scripts/generate-seed-sql.mjs`: menolak (exit 1, tanpa berkas) kecuali `--allow-default-credentials` atau env `PMS_ALLOW_DEFAULT_CREDENTIALS=1`; pesan tidak mencetak password. README diperbarui. | seed otomatis -> opt-in eksplisit | `scripts/seed-local.mjs` di luar scope tulis, jadi `npm run db:seed:local` kini butuh `PMS_ALLOW_DEFAULT_CREDENTIALS=1` di shell (didokumentasikan; PowerShell: `$env:PMS_ALLOW_DEFAULT_CREDENTIALS='1'`). Penghapusan password plaintext dari mock JSON = D3 (deferred). |

## 2. Bukti happy path tidak berubah
- Seluruh golden (12), contract (34), role matrix (160 sel), query budget (26) lulus TANPA diubah. Anggaran query tidak naik (tidak ada statement tambahan di jalur panas; reset-password +1 statement, bukan jalur panas dan tidak dalam anggaran).
- Satu-satunya tes lama yang berbalik adalah yang menguji perilaku cacat BE-001 (register 201/409): `auth.test.ts` (3 tes register diganti menjadi 2 tes 403; cakupan service dipindah ke `hardening.test.ts`), `activities.test.ts` (1 tes memakai register untuk mendapat token -> user dibuat admin lalu login; assertion log "registered" dihapus karena hook tak terjangkau), `golden/known-unsafe.test.ts` (BE-001, sesuai peta flip). Tidak ada assertion lain yang diubah. `seed.test.ts` hanya menambah argumen `--allow-default-credentials` pada pemanggilan skrip.

## 3. Berkas yang berubah
`src/lib/security.ts` (baru), `src/index.ts`, `src/routes/auth.ts`, `src/routes/public.ts`, `src/services/authService.ts`, `scripts/generate-seed-sql.mjs`, `README.md`; tes: `tests/hardening.test.ts` (baru, 23 tes), `tests/auth.test.ts`, `tests/activities.test.ts`, `tests/seed.test.ts`, `tests/golden/known-unsafe.test.ts`.
Tidak ada perubahan: frontend, `wrangler.jsonc`, `.dev.vars*`, migrations, `package.json`, lockfile.

## 4. Kompatibilitas FE
- Register: FE menampilkan `message` backend lewat `apiErrorMessage` (`authStore.register` catch -> `SET_ERROR`), tidak ada yang rusak. Login 429 jatuh ke `LOGIN_FAILURE` dengan pesan backend.
- Frontend tidak diubah; bekerja dengan backend lama maupun baru.

## 5. Risiko residual / tindakan owner
1. Verifikasi & rotasi `JWT_SECRET` produksi (`wrangler secret put`) SEBELUM deploy: nilai contoh membuat API 500 di domain non-localhost.
2. Tambahkan Cloudflare Rate Limiting/WAF untuk `/api/auth/*` (limiter ini hanya per isolate).
3. e2e `SCN-02-07` (register) perlu diperbarui/di-skip tim UI karena register ditutup; menyembunyikan halaman/tombol `/register` = D3.
4. Hapus/rotasi akun default di D1 produksi bila pernah di-seed (BE-004 operasional).
