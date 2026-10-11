# Catatan matriks role (Blok 0.6) — masukan untuk Blok 2 (BE-002/003/007)

Sumber: `backend/tests/golden/snapshots/role-matrix.json` (status HTTP pada kode TANPA perubahan).
Role seed: 001 Super Admin (26 izin), 002 Manager (19), 003 Staff (6), 004 Viewer (**status inactive**, 2 izin), 005 Reception (6).
Kolom = role target (001..005).

| Aktor | Aksi | 001 | 002 | 003 | 004 | 005 |
|---|---|---|---|---|---|---|
| Super Admin | semua aksi (create/assign/demote/deactivate/email/delete/copy role/set perms) | 2xx | 2xx | 2xx | 2xx | 2xx |
| Manager | createUserWithRole / assignRoleToStaffUser | **403** | 201/200 | 201/200 | 201/200 | 201/200 |
| Manager | demoteUserHoldingRole | **200 (cacat BE-002)** | 200 | 200 | 200 | 200 |
| Manager | deactivateUserHoldingRole | **200 (cacat BE-002)** | 200 | 200 | 200 | 200 |
| Manager | changeEmailOfUserHoldingRole | **200 (cacat BE-002)** | 200 | 200 | 200 | 200 |
| Manager | deleteUserHoldingRole | 403 | 403 | 403 | 403 | 403 (tak punya `user.delete`) |
| Manager | createRoleCopyingRole / setPermissionsOfCustomRoleToRole | 403 | 403 | 403 | 403 | 403 (tak punya `role.*`) |
| Staff, Reception | semua aksi | 403 | 403 | 403 | 403 | 403 |

## Sel yang BOLEH berubah di Blok 2 (hanya pada target yang lebih tinggi)
- Manager x {demote, deactivate, changeEmail} x role-001: 200 -> 403 (BE-002).
- Pemegang `role.create`+`user.update` (peran kustom, `known-unsafe.test.ts` BE-003): createRole/setPermissions dengan izin di luar miliknya -> 403.
- Last-admin: tak ada sel yang menghapus admin terakhir dalam matriks (Super Admin x delete role-001 mengenai user baru, bukan user-001); Blok 2 menambah tes khusus.

## Sel yang HARUS tetap (legitimate)
- Super Admin: semua 2xx (termasuk atas role-001 dari akun lain; tetap tak boleh deactivate/delete diri sendiri = 403 sudah ada di golden `users.json`).
- Manager: membuat user dengan role 002..005 (201), assign role 002..005 (200), demote/deactivate/ubah email pemegang role 002..005 (200).
- Manager tidak mendapat izin baru (tetap 403 pada delete user dan role.*).

## Risiko S3 yang terdeteksi
Tes yang ada memakai `role-004` (inactive) sebagai peran "viewer" dengan izin `room.view`/`reservation.view` (rooms.test.ts, reservations.test.ts, dashboard.test.ts). BE-007 akan mengubah hasil tes tersebut: fixture perlu role aktif pengganti. Ini bukan penguncian akun nyata (user-004 sendiri memang inactive), tetapi harus dikonfirmasi di Blok 2.
