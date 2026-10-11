# Laporan Blok 3 — Audit Trail dan Logging (Sonnet 5.5, Medium)

**Status: SELESAI.** Backend `tsc --noEmit` lulus; `vitest run`: **340 lulus / 0 gagal (27 file)** (Blok 2: 322).
**Snapshot:** `snapshot-block-3\` (dibuat SEBELUM edit pertama).
**Restore (satu baris):** `Remove-Item backend\src,backend\tests -Recurse -Force; Copy-Item .tmp-fix\snapshot-block-3\backend\* backend\ -Recurse -Force`

## 1. Verifikasi mekanisme yang ada (tanpa perubahan skema -> S1 tidak terpicu)
Tabel `activities` (migrasi 0004) sudah cukup:
- `category` CHECK `authentication|reservation|finance|system` -> event user/role/permission dicatat di `system` (sama seperti room/room-type yang sudah ada), failed login di `authentication`.
- `action` bebas teks; `entity_type`/`entity_id` bebas, tanpa FK; `user_id`/`user_name` snapshot tanpa FK (aman untuk user yang dihapus; failed login untuk email tak dikenal memakai `user_id='anonymous'`).
- `metadata` = JSON string-only -> before/after disimpan sebagai pasangan datar `before_<field>` / `after_<field>`.
- `ip_address` sudah ada.
Frontend: `ActivityFeed` menampilkan `activityActionLabels[action] || action`, jadi action baru tampil apa adanya tanpa perubahan FE.

## 2. Yang ditambahkan
| Event | category / action | entity | metadata (semua string) |
|---|---|---|---|
| Buat user | system / `user_create` | user:<id> | `after_name,email,status,roles` |
| Ubah user (nama/email/role/status via PATCH) | system / `user_update` | user | `before_*` + `after_*` (name,email,status,roles) |
| Ubah status user | system / `user_status` | user | `before_status`, `after_status` |
| Ganti role user | system / `user_roles` | user | `before_roles`, `after_roles` (CSV terurut) |
| Hapus user | system / `user_delete` | user | `before_*` |
| Buat role | system / `role_create` | role | `after_name,description,status,permissions` |
| Ubah role | system / `role_update` | role | `before_*` + `after_*` |
| Ubah izin role | system / `role_permissions` | role | `before_permissions`, `after_permissions`, `added`, `removed` |
| Hapus role | system / `role_delete` | role | `before_*` |
| Invoice update/send/pay/cancel | finance / `invoice_*` (sudah ada) | invoice | metadata lama + `before_{subtotal,discount,total,invoiceStatus,paymentStatus}` + `after_*` |
| Invoice delete | finance / `invoice_delete` | invoice | metadata lama + `before_*` |
| Expense update/delete | finance / `expense_update`, `expense_delete` | expense | metadata lama + `before_*` (+ `after_*` untuk update) |
| Login gagal | authentication / `login_failed` | - | `email` (dimasker `a***@hotel.com`), `reason` (`invalid_credentials`/`inactive`); ip |
Create invoice/expense TIDAK diubah (metadata `after`-nya sudah ada; menjaga golden `audit-rows.json`).

Aturan: baris ditulis HANYA setelah mutasi sukses (ditolak 403/404/409/422 tidak menulis apa pun); mutasi sensitif di-`await`; login gagal lewat `waitUntil` bila ada `executionCtx` (fallback `await` di Node/tes); kegagalan menulis audit tidak mengubah respons (diuji dengan tabel dihapus). Tidak pernah menyimpan password, hash, token, atau email utuh pada login gagal.

## 3. Biaya statement D1 per mutasi (sebelum -> sesudah, DB seed)
| Mutasi | Sebelum | Sesudah | Tambahan |
|---|---|---|---|
| POST /users | 9 | 10 | +1 (insert) |
| PATCH /users/:id | 8 | 11 | +3 (before-image 2 + insert 1) |
| PATCH /users/:id/status | 9 | 12 | +3 |
| PUT /users/:id/roles | 10 | 13 | +3 |
| DELETE /users/:id | 8 | 11 | +3 |
| POST /roles | 10 | 11 | +1 |
| PATCH /roles/:id | 8 | 11 | +3 |
| PUT /roles/:id/permissions | 14 | 17 | +3 |
| DELETE /roles/:id | 8 | 11 | +3 |
| Invoice update/send/pay/cancel, expense update/delete | 9-13 | sama | +0 (before-image diambil dari baris yang sudah dimuat service lewat callback `capture`; hook memakai penulisan yang sama seperti sebelumnya) |
| Login gagal (401) | 1 | 3 | +2 (lookup user + insert), hanya pada kegagalan |
Jalur panas (login sukses, semua GET, reservasi, anggaran query Blok 0): **tidak berubah**, tes anggaran lulus.
Hook baru memakai `writeAudit` (1 statement, tanpa read-back) bukan `recordActivity` (2 statement).

## 4. BE-033 (bagian kode): logging error terstruktur
`lib/errors.ts`: error tak terduga kini dicatat sebagai SATU baris JSON `{level, event:'unhandled_error', method, path, name, message(dimasker, <=500), stack(<=6 baris, dimasker)}`; tidak ada objek error mentah, body, header, maupun query string. `maskPii` menutup email (`a***@domain`), `Bearer ...`, JWT, hash bcrypt, dan token opak >=43 karakter. Body respons 500 tetap `{ message: 'Internal server error' }`. Observability di `wrangler.jsonc` TIDAK disentuh (class C, owner).

## 5. Tes
- Baru `tests/audit-trail.test.ts` (16 tes): tiap event + before/after, penolakan tidak menulis baris, failed login (masked, IP, user dikenal/anonim, inactive, 429 tidak mencatat, kegagalan tulis tak mengubah respons), tidak ada password/hash/token tersimpan, anggaran statement, masking & logging JSON.
- Berubah (keduanya menguji perilaku cacat BE-023 yang kini sengaja dibalik): `activities.test.ts` "does not log failed logins..." -> kini tepat satu baris `login_failed` dan forgot-password tetap tidak mencatat; `golden/known-unsafe.test.ts` BE-023 -> "FIXED in Block 3".
- Golden happy-path (12 snapshot), contract (34), role matrix, query budget (26): tidak diubah, lulus.

## 6. Berkas yang berubah
`src/lib/audit.ts`, `src/lib/errors.ts`, `src/index.ts`, `src/services/activityService.ts` (+`writeAudit`), `src/services/invoiceService.ts` & `expenseService.ts` (parameter opsional `capture`, perilaku sama), `src/routes/{users,roles,invoices,expenses,auth}.ts`; tes: `tests/audit-trail.test.ts` (baru), `tests/activities.test.ts`, `tests/golden/known-unsafe.test.ts`.
Tidak ada perubahan: frontend, config, migrations, dependency, `.tmp-audit`.

## 7. Risiko residual / catatan
1. Failed login membuat baris `activities` per kegagalan (maks 20 per 10 menit per IP+email per isolate karena limiter Blok 1). Serangan terdistribusi lintas isolate/IP tetap bisa menambah baris; mitigasi nyata = rate limiting Cloudflare (owner, class C).
2. Tabel `activities` tidak punya retensi/pembersihan; pertumbuhan perlu dipantau (di luar scope).
3. Event user/role berada di kategori `system` karena CHECK taxonomy (tanpa migrasi). Bila ingin kategori khusus (`user`, `role`) diperlukan migrasi + perubahan konstanta FE (S1, ditunda).
4. Request yang mutasinya sukses tetapi penulisan audit gagal (D1 error) mengembalikan 500 untuk mutasi yang di-`await` setelah perubahan data terjadi; ini perilaku lama untuk hook yang sudah ada dan sama untuk hook baru (atomik penuh butuh `db.batch`, scope Blok 5).
5. Aksi reservasi/room sudah diaudit sejak Phase 4 dan tidak diubah (BE-023 tidak mencantumkannya).
