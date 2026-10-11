# Contract snapshot FE <-> BE (dibuat di Blok 0, dari `frontend/src/services/*` dan `api.ts`)

Tes yang mengunci kontrak ini: `backend/tests/contract/frontend-contract.test.ts` (34 tes). Bagian Finance diisi/diperbarui di Blok 6.

## 1. Transport (`services/api.ts`)
- Base URL `VITE_API_URL` (fallback `http://localhost:8787`). Header `Content-Type: application/json`; `Authorization: Bearer <JWT>` bila `auth` true (default) dan token ada di `localStorage['pms_token']`.
- Respons 204 -> `undefined`. Respons non-2xx -> `ApiError(status, json.message || "Request failed with status N", json.errors)`. Network error -> `ApiError(0, ...)`.
- `apiErrorMessage`: jika `errors` ada, gabungkan semua pesan `errors[field][]` dengan spasi; kalau tidak, `message`.
- Envelope sukses: `{ data }`, list: `{ data, pagination: { page, pageSize, total } }`. Error: `{ message, errors? }`.
- Tidak ada penanganan 401 global (FE-003).

## 2. Endpoint yang dipanggil FE

| Service.method | Method + path | Body | Field respons yang dibaca | Error / catatan |
|---|---|---|---|---|
| auth.login | POST `/api/auth/login` (auth:false) | `{email,password}` | `data.token`, `data.user` (+`permissions`, `expiresIn`) | 401 -> `null` ("kredensial salah"); status lain throw |
| auth.logout | POST `/api/auth/logout` | - | - | error ditelan, token dihapus |
| auth.register | POST `/api/auth/register` (auth:false) | `{name,email,password}` | `data.token`, `data` | 409 -> `null`; **Blok 1: akan 403** (pesan Indonesia via `message`) |
| auth.restoreSession | GET `/api/auth/me` | - | `data.user` | error apa pun -> hapus token (FE-003) |
| auth.getMyPermissions | GET `/api/auth/me` | - | `data.permissions: string[]` | error -> `[]` |
| auth.changePassword | POST `/api/auth/change-password` | `{currentPassword,newPassword}` | - | error -> `false` |
| auth.forgotPassword | POST `/api/auth/forgot-password` (auth:false) | `{email}` | `data.message`, `data.resetToken?` | throw bila gagal |
| auth.resetPassword | POST `/api/auth/reset-password` (auth:false) | `{token,newPassword}` | - | error -> `false` |
| users.getAll | GET `/api/users?page=1&pageSize=100` | - | `data[]` | - |
| users.getById | GET `/api/users/:id` | - | `data` | error -> `undefined` |
| users.create | POST `/api/users` | `{name,email,password,roles[],status?}` | `data` | throw |
| users.update | PATCH `/api/users/:id` | `Partial<{name,email,roles[],status}>` | `data` | error -> `null` |
| users.delete | DELETE `/api/users/:id` | - | 204 | error -> `false` |
| users.toggleStatus | GET `/api/users/:id` lalu PATCH `/api/users/:id/status` | `{status}` | `data.status` | error -> `false` |
| roles.getAll | GET `/api/roles?page=1&pageSize=100` | - | `data[]` (permissions = array nama) | - |
| roles.getById | GET `/api/roles/:id` | - | `data` | -> `undefined` |
| roles.create | POST `/api/roles` | `{name,description?,permissions?,status?}` | `data` | throw |
| roles.update | PATCH `/api/roles/:id` lalu PUT `/api/roles/:id/permissions` | `{...}` / `{permissions[]}` | `data` | -> `null` |
| roles.delete | DELETE `/api/roles/:id` | - | 204 | -> `false` |
| permissions.getAll | GET `/api/permissions` | - | `data[]` {id,name,description,resource,action,group} | tanpa paging |
| rooms.getAll | GET `/api/rooms?page=1&pageSize=100` | - | `data[]` {id,roomNumber,roomTypeId,status,createdAt,updatedAt} | **terpotong 100 (FE-002)** |
| rooms.create/update/delete/toggle | POST/PATCH/DELETE `/api/rooms[/:id]`, PATCH `/:id/status` | `{roomNumber,roomTypeId,status?}` / `{status}` | `data` | update/delete/toggle error -> `null`/`false` |
| roomTypes.* | `/api/room-types` (sama pola) | `{name,description,capacity,facilities?,defaultRate,images?,status?}` | `data` (facilities/images array, defaultRate number) | getAll terpotong 100 |
| reservations.getAll | GET `/api/reservations?page=1&pageSize=100` | - | `data[]` ApiReservation | **terpotong 100 (FE-002)**; filter di klien |
| reservations.getById/getFullById | GET `/api/reservations/:id` | - | `data` | error -> `undefined` ("not found", FE-004) |
| reservations.create | POST `/api/reservations` | `{guestName,source,checkInDate,checkOutDate,notes?,rooms[{roomId,roomNumber,roomTypeName?}],pricing{mode,nightlyRates[{date,rate}],paymentType,dpType,dpPercentage?|dpFixedAmount?}}` | `data.id` | throw (422 `errors`, 409 `message`) |
| reservations.update | PATCH `/api/reservations/:id` | payload create LENGKAP (wizard selalu kirim semua field) | `data` | throw |
| reservations.cancel/checkIn/checkOut | POST `/api/reservations/:id/{cancel,check-in,check-out}` | - | - | error -> `false` (senyap, FE-004) |
| reservations.getAvailability | GET `/api/reservations/availability?checkIn&checkOut[&excludeId]` | - | `data.bookedRoomIds[]` | throw |
| reservations.getCalendar | GET `/api/reservations/calendar?from&to[&roomId][&status]` | - | `data[]` {id,reservationCode,guestName,source,checkInDate,checkOutDate,status,totalAmount,rooms[{roomId,roomNumber,roomTypeName}]} | error -> `[]`; interval setengah-terbuka `[from,to)` |
| activities.getAll/getByCategory/getByUser | GET `/api/activities?page=1&pageSize=100[&category|&userId]` | - | `data[]` | terpotong 100 |
| activities.getRecent | GET `/api/activities?page=1&pageSize=<limit>` | - | `data[]` | - |
| activities.getById | GET `/api/activities/:id` | - | `data` | -> `undefined` |
| dashboard.getOverview | GET `/api/dashboard/overview` | - | `data.today, reservations{total,todayCheckins,upcoming,checkedIn,byStatus{...}}, rooms{...}, occupancy{checkedIn,totalRooms,rate}, recent[]` | - |
| holidays.getForYear/getYear | GET `/api/public/holidays?year=YYYY[&force=true]` (auth:false) | - | `data.days[]`, `data.available`, `data.source`, ... | error -> `[]`/`null`. `holidayService` mendukung `options.force` (mengirim `force=true`) tetapi **tidak ada call site yang memakainya** (grep seluruh `frontend/src`) -> aman bagi BE-012 mengabaikan `force` |
| (public pages) | GET `/api/public/room-types` | - | `data[]` {id,name,description,capacity,facilities,...} | tanpa auth |

## 3. Layanan finance: TIDAK memanggil API (FE-001)
`invoiceService`, `expenseService`, `salesService`, `reportService` memakai JSON mock in-memory; tidak ada panggilan ke `/api/invoices|expenses|sales|reports`. Kontrak BE-nya dikunci oleh golden test (`tests/golden/finance.golden.test.ts`) dan contract test (endpoint ada, 403 untuk Staff, 200 untuk Admin). Dokumentasi kontrak baru ditulis di Blok 6.

## 4. Status reservasi vs UI edit (input untuk BE-017 / Blok 4)
- `ReservationDetailPage.tsx:273-305`: tombol **Check In** hanya `reserved`, **Check Out** hanya `checked-in`, **Cancel** hanya `reserved`.
- Tombol **Edit** (ikon pensil -> `ReservationWizardModal`) tampil untuk **SEMUA status** (reserved, checked-in, checked-out, cancelled). Tidak ada gating status di wizard.
- `utils/reservationDraft.ts:saveReservationDraft` -> `reservationService.update(id, payload)` dengan payload LENGKAP (`guestName, source, checkInDate, checkOutDate, notes, rooms[], pricing{...}`) bahkan bila hanya catatan yang berubah.
- Konsekuensi untuk Blok 4: guard BE-017 tidak boleh menolak PATCH yang isi finansial/tanggal/kamarnya TIDAK berubah (bandingkan nilai dengan data tersimpan), kalau tidak, FE tidak bisa menyimpan catatan/nama tamu pada status non-reserved. Bila tetap ingin memblokir semua edit non-reserved -> **S2** (kontradiksi call site FE).
- Tes: `contract: reservation edit UI vs status` mengunci bahwa payload tak berubah pada checked-in/checked-out/cancelled diterima (200) hari ini.

## 5. Ukuran halaman & batas
- Semua list FE memakai `pageSize=100` (maks BE = 100). `pageSize>100` -> 422. Default BE `pageSize=10`.
- Reservasi ke-101+, kamar ke-101+, dst. tidak terlihat di FE (FE-002); tidak ada `ORDER BY` eksplisit di BE (BE-035).

## 6. Perubahan perilaku yang SUDAH dijadwalkan (bukan regresi)
| Finding | Blok | Perubahan yang terlihat klien |
|---|---|---|
| BE-001 | 1 | `POST /api/auth/register` -> 403 + pesan Indonesia (sebelumnya 201 + token) |
| BE-008 | 1 | `resetToken` hanya muncul untuk origin localhost |
| BE-012 | 1 | `force` diabaikan, URL sumber tidak di-echo (terverifikasi: tidak ada call site FE yang memakai `force`; URL sumber juga tidak dibaca FE selain field `source` yang tetap ada) |
| BE-002/003/007 | 2 | aksi atas role yang lebih tinggi ditolak 403; role inactive tidak memberi izin |
| BE-017/024/025 | 4 | edit finansial pada status non-reserved ditolak 409; kamar non-active 422; tanggal 2026-02-31 / stay > 60 malam 422 |
| BE-019/020 | 6 | delete invoice non-Draft 409; status invoice tak bisa diset via create/PATCH |

## 7. Kontrak Finance setelah Blok 6 (untuk integrasi FE berikutnya; FE belum memanggil endpoint ini)
Semua error memakai `{ message, errors? }`; status 401/403/404/409/422 seperti biasa.

| Endpoint | Perubahan Blok 6 | Catatan untuk FE |
|---|---|---|
| `POST /api/invoices` | `invoiceStatus`/`paymentStatus` hanya boleh `Draft`/`Pending` (atau tidak dikirim). Nilai lain -> **422** `errors.invoiceStatus` atau `errors.paymentStatus`: "Status invoice tidak dapat diatur lewat create/update. Gunakan endpoint send, pay, atau cancel." | Form tidak boleh mengirim status Completed/Paid/Sent; ubah status lewat aksi. |
| `PATCH /api/invoices/:id` | Status yang dikirim harus SAMA dengan nilai tersimpan (no-op), selain itu **422**. Field lain (tamu, item, diskon, tanggal, nomor) tidak berubah; invoice Completed/Cancelled tetap 409. | Boleh mengirim objek lengkap. Invoice Sent tetap bisa diedit (D-033). |
| `POST /api/invoices/:id/send`, `/pay`, `/cancel` | Sama; kini UPDATE bersyarat: pemenang 200, yang kalah 409. | Satu-satunya cara memindah status. `pay` => Completed + Paid. |
| `DELETE /api/invoices/:id` | Hanya Draft (204). Sent, Completed, Cancelled -> **409** dengan pesan agar membatalkan (cancel). | UI "Hapus" hanya untuk Draft; selain itu tawarkan "Batalkan". |
| `GET /api/sales`, `/api/sales/breakdown`, `/api/reports/summary`, `/api/reports/top-invoices` | **Tidak berubah** (bentuk dan angka). totalSales/totalIncome/netRevenue tetap menghitung semua invoice non-Cancelled, termasuk Draft/Sent. | Beri label "ditagihkan (billed)", bukan "diterima". |
| `GET /api/reports/revenue?start&end[&categories]` (BARU, finance.report.view) | `{ start, end, billedTotal, paidTotal, unpaidTotal, billedCount, paidCount, unpaidCount, totalExpenses, netBilled, netPaid }`. Billed = non-Cancelled dalam rentang; paid = paymentStatus Paid; batas tanggal inklusif. | Pakai `paidTotal`/`netPaid` untuk "pendapatan diterima". |
| `GET /api/sales/summary?start&end[&source]` (BARU, finance.sales.view) | `{ billedTotal, paidTotal, unpaidTotal, count, paidCount, bySource: [{source, billedTotal, paidTotal, count}] }` | Tanpa paging. |
| Batas nilai | quantity 1..10.000, unitPrice 0..10.000.000.000, subtotal invoice <= 1.000.000.000.000 (422 "Total invoice melebihi batas..."), amount expense 1..10.000.000.000, tarif per malam dan DP tetap <= 10.000.000.000 | Data seed terbesar: Rp45 juta (expense), 28 x Rp1,2 juta (invoice). |
| Overdue / Partial | Tidak dapat lagi diset lewat create/PATCH (tidak ada endpoint aksi untuk itu). Nilai tersimpan tetap dibaca. | Pelunasan sebagian butuh keputusan produk (BE-021). |

## 8. Finance: yang DIPANGGIL FE sejak Blok 9B (dikunci `tests/contract/finance-frontend-contract.test.ts`)
| Service.method | Request | Dibaca |
|---|---|---|
| invoice.getAll / getAllIfPermitted | GET `/api/invoices?page=N&pageSize=100` (semua halaman) | baris Invoice; 403 -> `[]` (IfPermitted) |
| invoice.getById | GET `/api/invoices/:id` | `data`; 404 -> `undefined` |
| invoice.getNextNumber | GET `/api/invoices/next-number?date=YYYY-MM-DD` | `data.invoiceNumber` |
| invoice.create | POST `/api/invoices` `{invoiceNumber?, reservationId?, guestName, source, invoiceDate, items[{description,quantity,unitPrice}], discount}` (+ status hanya bila kombinasi tak punya aksi) lalu opsional POST `/:id/send|pay|cancel` | `data` |
| invoice.update | GET `/:id`, PATCH `/:id` (field sama, tanpa status), opsional aksi | `data` |
| invoice.delete | DELETE `/:id` | 204; 409 `message` |
| invoice.send / markPaid / cancel | POST `/:id/send` / `/pay` / `/cancel` | 200; 409 `message` |
| expense.getAll / getAllIfPermitted | GET `/api/expenses?page=N&pageSize=100` | baris Expense |
| expense.create | POST `/api/expenses` `{date, category, description, amount, status?}` | `data`; 422 `errors` |
| sales.getAll / getAllIfPermitted | GET `/api/sales?page=N&pageSize=100` | baris Sale |
Tidak dipakai FE: `/api/sales/breakdown`, `/api/sales/summary`, `/api/reports/*` (tersedia untuk pekerjaan berikutnya).
