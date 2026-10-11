# Laporan Blok 2 — Authorization Hierarchy (Opus 5.5, High)

**Status: SELESAI.** Backend `tsc --noEmit` lulus; `vitest run`: **322 lulus / 0 gagal (26 file)** (Blok 1: 304).
**Snapshot:** `snapshot-block-2\` (dibuat SEBELUM edit pertama; berisi `src`, `tests`, `scripts`, `README.md` kondisi akhir Blok 1).
**Restore (satu baris):** `Remove-Item backend\src,backend\tests -Recurse -Force; Copy-Item .tmp-fix\snapshot-block-2\backend\* backend\ -Recurse -Force`

## 1. Model yang diterapkan
Hirarki berbasis **superset izin** (bukan peringkat role), di `src/services/authz.ts`:
1. Aktor boleh mengubah user/role hanya bila aktor memegang SEMUA izin target (izin target dihitung dari semua role-nya, apa pun status role: konservatif).
2. Aktor hanya boleh MEMBERI (assign role / menempelkan izin) apa yang ia pegang sendiri.
3. `POST /roles` dengan `permissions` tidak kosong butuh `permission.assign` + subset. Role kosong tetap cukup `role.create`.
4. Role Super Admin (`role-001`) adalah akar kepercayaan: pemegangnya dikecualikan dari aturan subset; role itu tidak pernah berhenti memberi izin (kebal `inactive`), tidak bisa dinonaktifkan/dihapus, dan harus tetap punya izin inti `user.*`, `role.*`, `permission.*`.
5. Super Admin AKTIF terakhir tidak bisa dihapus, dinonaktifkan, diturunkan (kehilangan `role-001`), atau diubah emailnya oleh orang lain. Ia tetap boleh mengubah nama/email miliknya sendiri.
6. Self-lockout: nonaktifkan diri sendiri kini juga ditolak lewat `PATCH /users/:id {status}` (sebelumnya hanya lewat `/status`).
7. BE-007: `loadAuthContext` hanya menggabungkan izin dari role `active` (+ `role-001`). `user.roles` dan bentuk respons tidak berubah.
Semua penolakan: `403` dengan pesan Indonesia dalam bentuk `{ message }` yang sudah ada.

## 2. Per temuan
| ID | Status | Sebelum -> sesudah | Bukti |
|---|---|---|---|
| BE-002 | FIXED | Manager demote/deactivate/ubah email/rename Super Admin: 200 -> 403; hapus/turunkan admin terakhir: 2xx -> 403 | `tests/authorization.test.ts` (8 tes), matriks role, `known-unsafe` (2 tes dibalik) |
| BE-003 | FIXED | `role.create` menempelkan izin: 201 -> 403; assign role berizin lebih: 200 -> 403; `PUT /roles/:id/permissions` di luar milik aktor: 200 -> 403; edit/hapus role yang lebih tinggi: 2xx -> 403 | 5 tes + `known-unsafe` |
| BE-007 | FIXED | role inactive tetap memberi izin -> tidak memberi apa pun; reaktivasi memulihkan; Super Admin kebal | 4 tes + `known-unsafe` |

Catatan protokol: tes regresi baru ditulis sebelum kode, tetapi TIDAK dijalankan dalam keadaan gagal lebih dulu; bukti "gagal sebelum perbaikan" adalah tes `known-unsafe` Blok 0 (lulus pada kode lama, dibalik sekarang) dan PoC audit.

## 3. Oracle: matriks role seed (160 sel)
Hanya 3 sel berubah, persis yang diprediksi `role-matrix-notes.md`: **Manager x {demote, deactivate, changeEmail} x role-001: 200 -> 403**. 157 sel lain identik. Baseline disimpan sebagai `tests/golden/snapshots/role-matrix.block0.json` dan tes baru memastikan selisihnya HANYA 3 sel itu.
Operasi sah yang tetap berjalan (diuji): Super Admin mengelola siapa pun; Manager membuat/mengubah/menonaktifkan/mengganti role Staff, Reception, Viewer, dan Manager lain; edit diri sendiri.

## 4. Tes lama yang berubah (semuanya menguji perilaku cacat atau memakai fixture yang bergantung padanya)
| Berkas | Perubahan | Alasan |
|---|---|---|
| `golden/known-unsafe.test.ts` | 4 tes BE-002/003/007 dibalik menjadi "FIXED in Block 2" | sesuai peta flip Blok 0 |
| `golden/snapshots/role-matrix.json` | 3 sel 200 -> 403 (+ baseline `.block0.json`, + tes selisih) | BE-002 |
| `reservations.test.ts`, `rooms.test.ts` | fixture "viewer" memakai role AKTIF baru (izin sama) alih-alih `role-004` yang inactive | BE-007; assertion tidak berubah |
| `rbac.test.ts` | fixture role `UserManager` kini juga memegang izin Staff yang ia bagikan | BE-003 (lihat keputusan D-012); assertion tidak berubah |
Golden happy-path (12 snapshot), contract (34), query budget (26): **tidak diubah, lulus**.
Satu koreksi selama pengerjaan: guard "role Super Admin tidak bisa dihapus" semula mendahului cek "role masih dipakai" dan mengubah 409 yang sudah ada menjadi 403; urutannya dikembalikan sehingga `DELETE /roles/role-001` tetap 409 seperti sebelumnya.

## 5. PERUBAHAN PERILAKU YANG PERLU DIKETAHUI PEMILIK
1. **Role "admin pengguna" murni (hanya `user.*`) tidak bisa lagi membagikan role yang izinnya tidak ia pegang** (mis. Staff), dan tidak bisa mengubah user yang memegang izin di luar miliknya. Ini konsekuensi langsung aturan subset yang diwajibkan rules 4A. Di seed tidak ada role seperti itu (Manager memegang superset Staff/Reception/Viewer), jadi tidak ada operasi seed yang terblokir. Bila kelak dibuat role HR-only, beri juga izin yang akan ia bagikan, atau lakukan lewat Super Admin.
2. **Role `Viewer` (`role-004`) berstatus inactive di seed**: pemegangnya sekarang tidak punya izin sama sekali sampai role diaktifkan (`PATCH /roles/role-004 {status:"active"}`). Satu-satunya pemegang di seed adalah `user-004` yang memang user inactive. Periksa D1 produksi: bila ada user aktif yang hanya memegang role inactive, mereka akan kehilangan akses setelah deploy.
3. Super Admin dikenali lewat id role `role-001`. Bila D1 produksi tidak memiliki role dengan id itu, tidak ada pengecualian maupun proteksi admin-terakhir (aturan subset tetap berlaku untuk semua).

## 6. Biaya query (hanya pada mutasi user/role; jalur baca dan anggaran tidak berubah)
| Mutasi | Aktor Super Admin | Aktor lain |
|---|---|---|
| PATCH user (nama/email) | +0 | +1 (izin target) |
| PATCH user status inactive / roles tanpa role-001 / DELETE user | +1 (role target), +1 bila target Super Admin aktif | +1, +1 bila target Super Admin aktif |
| assign role (create/PUT/PATCH roles) | +0 | 1 query batched (`inArray`) menggantikan N query per role |
| PATCH role | +0 (query izin dipindah, bukan ditambah) | +0 |
| PUT role permissions / DELETE role | +0 | +1 |

## 7. Matriks otorisasi endpoint (rute yang disentuh)
| Endpoint | Izin rute | Pemeriksaan service baru |
|---|---|---|
| POST /api/users | user.create | role yang diberikan ⊆ izin aktor |
| PATCH /api/users/:id | user.update | target ⊆ aktor; role baru ⊆ aktor; admin-terakhir; self-deactivate |
| PATCH /api/users/:id/status | user.update | target ⊆ aktor; admin-terakhir; self-deactivate |
| PUT /api/users/:id/roles | user.update | target ⊆ aktor; role baru ⊆ aktor; admin-terakhir |
| DELETE /api/users/:id | user.delete | target ⊆ aktor; admin-terakhir; self-delete |
| POST /api/roles | role.create | izin tidak kosong => permission.assign + subset |
| PATCH /api/roles/:id | role.update | role ⊆ aktor; role-001 tak bisa inactive |
| PUT /api/roles/:id/permissions | permission.assign | izin baru ⊆ aktor; role ⊆ aktor; izin inti role-001 |
| DELETE /api/roles/:id | role.delete | role ⊆ aktor; role-001 tak bisa dihapus (setelah cek "masih dipakai" 409) |
GET tidak berubah.

## 8. Risiko residual
- Proteksi admin-terakhir adalah "cek lalu tulis" lintas `await`: dua Super Admin yang saling menurunkan dalam milidetik yang sama bisa lolos. Peluang sangat kecil (butuh dua admin bertindak bersamaan); perbaikan atomik butuh statement bersyarat tambahan dan dapat dikerjakan bersama Blok 5 bila diinginkan.
- Role yang ditetapkan ke user tetap boleh berstatus inactive (hanya tidak memberi izin); menolak assignment role inactive akan mengubah sel matriks yang sah.
- FE: `userService.getUserPermissions` menghitung gabungan izin role di klien tanpa melihat status role (hanya tampilan; backend yang menegakkan). X-001 tetap deferred.
- Frontend tidak diubah; pesan 403 baru diteruskan lewat `message` (sebagian service FE masih menelan error menjadi `null`/`false`, FE-004 di Blok 8).

## 9. Berkas yang berubah
`src/services/authz.ts` (baru), `src/services/userService.ts`, `src/services/roleService.ts`, `src/services/identity.ts`, `src/routes/users.ts`, `src/routes/roles.ts`; tes: `tests/authorization.test.ts` (baru, 17 tes), `tests/golden/role-matrix.test.ts` (+1 tes), `tests/golden/snapshots/role-matrix.json`, `role-matrix.block0.json` (baru), `tests/golden/known-unsafe.test.ts`, `tests/rbac.test.ts`, `tests/reservations.test.ts`, `tests/rooms.test.ts`.
Tidak ada perubahan: frontend, config, migrations, dependency, `.tmp-audit`.
