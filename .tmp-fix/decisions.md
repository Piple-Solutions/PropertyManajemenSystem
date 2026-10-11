# decisions.md (append-only)

| # | Blok | Keputusan | Alasan | Default dari rules? |
|---|---|---|---|---|
| D-001 | 0 | Fixture BE-028 diperbaiki dengan MEMBUAT blocker/reservasi nyata lewat API pada kamar seed yang ada, bukan mengubah seed/mock JSON | Rules: hanya fixture tes; seed berasal dari frontend mock (di luar scope) | ya (4A Blok 0) |
| D-002 | 0 | Golden memakai `toMatchFileSnapshot` + jam beku + normalisasi id; perilaku cacat dipisah ke `known-unsafe.test.ts` dengan peta blok pembalik | Happy-path golden tidak boleh pernah diubah; tes cacat adalah bukti baseline dan menjadi tes regresi | ya (7 Testing 1) |
| D-003 | 0 | Shim `batch` dibuat transaksional dan sinkron (satu transaksi sqlite), `meta.changes` per statement | D1 `db.batch` = transaksi; dibutuhkan Blok 5 | ya (7 Testing 4) |
| D-004 | 0 | Anggaran query dicatat per endpoint (hanya boleh turun); daftar reservasi 51 statement pada 15 baris dicatat sebagai temuan | BE-027 | ya |
| D-005 | 0 | Tes contract "edit status" memakai reservasi yang dibuat via API (bukan seed) karena seed merujuk kamar yang tidak ada | Seed drift | — |

## Dijadwalkan untuk gerbang berikutnya (belum diputuskan)
- Blok 2: role-004 (inactive) dipakai sebagai "viewer" di tes yang ada -> perlu role aktif pengganti di fixture saat BE-007 diterapkan (S3/S4).
- Blok 4: edit FE tersedia untuk semua status dengan payload lengkap -> guard berbasis perbandingan nilai (S2 bila ingin blokir total).
- Blok 1: BE-012 aman untuk `force` (tak ada call site FE). Periksa field `source`/`sourceUpdated` pada respons holidays (dipakai tipe FE `HolidayYear`) sebelum menyembunyikan URL.

| D-006 | 1 | Register ditolak 403 via konstanta in-code SEBELUM validasi (tanpa 409) | Rules 4A Blok 1; mencegah enumerasi email | ya |
| D-007 | 1 | Deteksi placeholder berbasis fragmen, bukan nilai literal; hanya non-localhost; secret pendek hanya warn | Rules 4A BE-005 | ya |
| D-008 | 1 | Limiter per instance app (per isolate): 20 login-gagal/10 mnt per IP+email, 10 forgot/10 mnt, 20 reset-gagal/10 mnt per IP | generous, aman NAT | ya |
| D-009 | 1 | Guard seed menerima flag CLI ATAU env PMS_ALLOW_DEFAULT_CREDENTIALS=1 karena seed-local.mjs di luar scope tulis | menjaga db:seed:local tetap bisa dipakai | trade-off, dilaporkan |
| D-010 | 1 | BE-012: field source dipertahankan bernilai "upstream"; error generik | tidak boleh menghapus/retype field | ya |
| D-011 | 2 | Super Admin = pemegang role id `role-001`: dikecualikan dari aturan subset, role kebal inactive, tak bisa dinonaktifkan/dihapus, wajib menyimpan izin inti user.*/role.*/permission.* | lockout safety (rules 6) | ya |
| D-012 | 2 | Aturan subset diterapkan penuh: role user-admin murni tak bisa membagikan role yang izinnya tak ia pegang; fixture `rbac.test.ts` disesuaikan (assertion tetap) | rules 4A Blok 2 "permission-superset"; tidak ada role seed yang terblokir | ya, DITANDAI untuk pemilik |
| D-013 | 2 | Super Admin aktif terakhir boleh mengubah email/nama MILIKNYA sendiri; perubahan email oleh orang lain ditolak | homestay dengan satu admin harus bisa mengganti email default; mencegah pembajakan identitas | interpretasi, DITANDAI |
| D-014 | 2 | Assignment role berstatus inactive tetap diterima (hanya tidak memberi izin) | menolak akan mengubah sel matriks yang sah | ya |
| D-015 | 2 | Izin target dihitung dari semua role-nya apa pun statusnya (konservatif) | mencegah eskalasi lewat reaktivasi role | ya |
| D-016 | 2 | Fixture "viewer" di reservations/rooms test memakai role aktif baru, bukan role-004 | BE-007; S3 dinilai tidak terpicu (pemegang role-004 di seed hanya user inactive) | ya |

| D-017 | 3 | Event user/role/permission dicatat di category `system` (action `user_*`/`role_*`), login gagal di `authentication`/`login_failed` | CHECK taxonomy tabel activities; tanpa migrasi | ya |
| D-018 | 3 | Before/after sebagai metadata datar string `before_*`/`after_*`; create invoice/expense tidak diubah | menjaga golden audit-rows; kontrak metadata string-only | ya |
| D-019 | 3 | Failed login: email dimasker, `user_id='anonymous'` bila akun tak dikenal; ditulis via waitUntil (fallback await); 429 tidak mencatat | PII-minim, tahan flood | ya |
| D-020 | 3 | Hook baru memakai `writeAudit` (1 statement) bukan `recordActivity` (2) | hemat statement | ya |

| D-021 | 4 | Hanya checked-out & cancelled yang membekukan tanggal/kamar/harga/DP; checked-in tetap boleh (perpanjang menginap). Guest/source/notes selalu boleh. Satu konstanta LOCKED_STATUSES | rules 4A "block only unsafe ones"; FE edit semua status; BE-017 menyebut terminal saja | interpretasi, DITANDAI untuk pemilik (S2 bila ingin kunci checked-in) |
| D-022 | 4 | Payload tak berubah pada status terkunci diterima (perbandingan nilai); tidak menulis ulang rooms/rates/total | wizard selalu kirim payload lengkap; data tersimpan tidak boleh berubah | ya |
| D-023 | 4 | Kamar harus aktif untuk: booking baru, kamar yang ditambahkan, dan SEMUA kamar bila tanggal berubah; kamar lama tetap boleh untuk edit non-okupansi; id legacy yang tak ada di `rooms` dilewati | wizard menyimpan catatan setelah kamar masuk maintenance harus tetap berhasil | ya |
| D-024 | 4 | Snapshot kamar: nilai server untuk kamar baru; snapshot lama dipertahankan untuk kamar yang sudah ada | riwayat tidak ditulis ulang (Phase 3) | ya |
| D-025 | 4 | Validasi tanggal nyata di `dateString` (juga invoice/expense/calendar/availability); batas 60 malam hanya untuk create dan perubahan tanggal | "hanya request baru/berubah" | ya |

| D-026 | 5 | Double-booking dicegah dengan `INSERT ... SELECT ... WHERE NOT EXISTS(overlap)` + batch; TANPA tabel `room_nights` | rules 5 (hanya jaminan D1 terdokumentasi); S1 tidak diperlukan | ya |
| D-027 | 5 | Batch dijalankan lewat `D1Database.batch` (via `db.$client`), SQL dikompilasi drizzle; bukan `db.batch` drizzle | drizzle 0.45.3 gagal mem-batch SQL mentah berparameter; dependency tak boleh diubah | temuan teknis |
| D-028 | 5 | Edit: guard yang sama (status tervalidasi + tidak bentrok) di setiap statement batch; header pertama | all-or-nothing tanpa kolom versi | ya |
| D-029 | 5 | Batas 60 kamar per reservasi (422) | menjaga <= 100 bound parameter | teknis |
| D-030 | 5 | Kode reservasi tetap count+1; retry saat UNIQUE (maks 8, sufiks acak setelah 4) | happy path identik; tanpa tabel counter | ya |
| D-031 | 5 | Tulis multi-baris invoice/user/role juga dijadikan batch; transisi status invoice bersyarat | BE-018 | ya |

| D-032 | 6 | Angka billed vs paid lewat endpoint BARU (`/reports/revenue`, `/sales/summary`), bukan field tambahan di respons lama | golden snapshot respons lama tidak boleh diubah; field legacy tetap | interpretasi "additive", DITANDAI |
| D-033 | 6 | Invoice Sent TIDAK dikunci terhadap edit field non-status (hanya status yang dikunci) | rules 4B hanya menyebut status/delete; before/after kini ada di audit (Blok 3); mengunci Sent perlu keputusan produk | DITANDAI untuk pemilik |
| D-034 | 6 | Status pada create/PATCH: nilai default/sama dengan tersimpan diterima (no-op), nilai lain 422 (bukan diabaikan diam-diam) | form FE mengirim objek lengkap; menolak jelas lebih aman daripada mengabaikan | ya |
| D-035 | 6 | Delete hanya Draft; Cancelled juga 409 (disimpan sebagai riwayat) | rules 4B | ya |
| D-036 | 6 | Batas: qty 10.000, harga/jumlah/tarif/DP Rp10 miliar, subtotal invoice Rp1 triliun | jauh di atas data seed (maks Rp45 juta), jauh di bawah 2^53 | ya |

| D-037 | 7 | ORDER BY eksplisit meniru urutan efektif planner: `rowid`, kecuali filter rentang/tanggal saja -> (kolom tanggal, rowid); BUKAN newest-first | rules 4B BE-035 | ya |
| D-038 | 7 | `rowid` sebagai tie-breaker unik | satu-satunya kunci unik yang mempertahankan urutan sisip historis (created_at seed tidak monoton) | DITANDAI (risiko VACUUM/import) |
| D-039 | 7 | "Hari ini" = Asia/Jakarta (UTC+7) di dashboard, next-number, tahun kode reservasi; timestamp tersimpan tetap UTC | BE-026 | ya |
| D-040 | 7 | Batas: nama 100, email 254, password 128, deskripsi 500/2000, item invoice 100, kamar 60, izin 200, kategori 20, pencarian 100, page 100.000 | jauh di atas data seed (terpanjang 53 karakter, array 26) | ya |
| D-041 | 7 | LIKE memakai ESCAPE: `%`/`_` literal | BE-009 | ya |
| D-042 | 7 | Rentang calendar tidak dibatasi 62 hari | di luar daftar Blok 7; statement sudah konstan | DITANDAI |

| D-043 | 8 | 401 handling lewat handler terdaftar di api.ts (AuthProvider -> LOGOUT) + ProtectedRoute `returnTo`, bukan redirect keras `window.location` | tanpa reload, tanpa loop, tetap di router | ya |
| D-044 | 8 | `returnTo` hanya path internal; tidak pernah `//`, skema, atau halaman auth | open-redirect safe | ya |
| D-045 | 8 | `fetchAllPages` cap: 20 halaman (2.000 baris); activities 10 halaman (1.000 terbaru) | batasi request storm; log audit tumbuh | DITANDAI |
| D-046 | 8 | FE-004: pemilik memilih opsi (a) — `ErrorState` yang sudah ada, inline, hanya saat error. Aksi check-in/out/cancel menolak dengan ApiError; method aditif `fetchFullById`; `getFullById`/`getById` lain tidak diubah (banyak call site tanpa catch) | S5 dijawab pemilik | DISETUJUI PEMILIK |
| D-047 | 8 | Login: hanya 401 "Invalid email or password" -> null; pesan 401/429 lain diteruskan | X-005 tanpa teks baru | ya |

| D-048 | 9B | U1=a ErrorState, U2=A1 (status form -> aksi di service), U3=b Loading, U4=a banner feedback hanya sukses | keputusan pemilik pada gerbang 9A | DISETUJUI PEMILIK |
| D-049 | 9B | Kombinasi status tanpa aksi dikirim DENGAN status agar backend menolak dengan pesannya sendiri | tanpa teks baru; tidak ada yang tersimpan | ya |
| D-050 | 9B | Layar yang dilihat semua pengguna (dashboard, daftar reservasi, popup hari) memakai `getAllIfPermitted`: 403 -> kosong, tanpa error | Staff tidak punya izin finance | ya |
| D-051 | 9B | Sales/Report memakai `getAllIfPermitted` untuk daftar yang butuh izin lain | role parsial tidak boleh mendapat halaman error penuh | DITANDAI (laporan bisa kosong untuk role report-only) |
| D-052 | 9B | Form invoice baru mengambil nomor dari `/invoices/next-number`; fallback placeholder bila gagal | server pengalokasi nomor | ya |
| D-053 | 9B | `salesService.create` dihapus (tidak pernah dipakai; sales tidak bisa ditulis) | - | ya |
| D-054 | 10 | Guard Super Admin terakhir sebagai statement terakhir batch (INSERT bersyarat yang melanggar NOT NULL bila tak ada Super Admin aktif) | cek-lalu-tulis kalah pada mutual-demote konkuren; tanpa skema baru; +1 statement hanya di jalur langka | DITANDAI (pesan error D1 nyata belum diverifikasi) |
| D-055 | 10 | Shim `batch` menerima statement terbungkus (AsyncLocalStorage) | harness latency PoC audit tidak bisa dijalankan tanpa itu; `.tmp-audit` tidak boleh diedit | ya |
| D-056 | 10 | 7 div pembungkus ber-style di sekitar ErrorState/Loading dicabut | pelanggaran netralitas UI; jarak = keputusan UI pemilik | DITANDAI |
