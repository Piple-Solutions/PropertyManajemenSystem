# Audit R2 — Laporan Akhir
**Proyek:** PMS Internal Homestay Joglo Seruni Syariah
**Tanggal:** 2026-10-11
**Auditor:** Second-pass read-only audit setelah remediasi Blok 0–10

---

## 1. Ringkasan Eksekutif

| Area | Status | Catatan |
|---|---|---|
| Security | **Good** | Register 403, RBAC superset, guard Super Admin, rate limiter best-effort |
| Business logic | **Good** | Invoice lifecycle, reservation guards, atomic writes, double-booking prevention |
| Data integrity | **Good** | Schema constraints, indexes, transactions, conditional updates |
| Reliability | **Good** | Error handling konsisten, PII masking, waitUntil untuk audit |
| Frontend logic | **Good** | 401 handling, returnTo safety, fetchAllPages cap, useAsyncData cancellation |
| FE-BE contract | **Good** | Semua endpoint match, field names konsisten, error handling seragam |

**Top 5 risiko:**
1. **R2-BE-001** (Medium): Guard Super Admin andalkan pesan error D1 — batch rollback aman, tapi user dapat 500 bukan 403 jika format berbeda.
2. **R2-FE-007** (Medium): `toLocalISODate` timezone-dependent — tanggal bisa salah jika browser staff bukan WIB.
3. **R2-BE-007** (Medium): Audit metadata tidak di-maskPii saat dibaca — amounts dan nama user terlihat di audit feed.
4. **R2-FE-001** (Low): `navigate(0)` reload halaman setelah aksi invoice — UX issue.
5. **R2-BE-005** (Low): Rate limiter bisa di-bypass via X-Forwarded-For jika worker diakses langsung.

**Kesimpulan:** Remediasi solid. **0 Critical, 0 High findings baru.** Semua temuan pre-existing atau documented limitations.

---

## 2. Independent Baseline versus Handover Claims

| Pemeriksaan | Handover | Audit R2 | Selisih |
|---|---|---|---|
| Backend `tsc --noEmit` | lulus | lulus | tidak ada |
| Backend `vitest run` | 456/0 (33 file) | 456/0 (33 file) | tidak ada |
| Frontend `tsc --noEmit` | lulus | lulus | tidak ada |
| Frontend ESLint | 43/308 | 43/308 | tidak ada |
| Frontend build | 1.838.796 B, 89 file | 1.838.796 B, 89 file | tidak ada |

---

## 3. Claims-to-Verify Table

| # | Klaim | Cara verifikasi | Hasil |
|---|---|---|---|
| C-01 | Register selalu 403 | routes/auth.ts:95 — `PUBLIC_REGISTRATION_ENABLED = false` | ✅ Confirmed |
| C-02 | Query counts per endpoint | query-budget.test.ts — semua budget dipatuhi | ✅ Confirmed |
| C-03 | Golden happy-path unchanged | Hash comparison — hanya role-matrix.json (3 sel) | ✅ Confirmed |
| C-04 | No config/env/dep changes | Hash comparison vs snapshot-block-0 | ✅ Confirmed |
| C-05 | Role inactive no permissions | identity.ts:76 — filter `status === 'active' \|\| id === role-001` | ✅ Confirmed |
| C-06 | Guard Super Admin + D1 error risk | authz.ts:128-145 — guard ada, error message dependency | ✅ Confirmed |
| C-07 | Overlap + conditional insert | reservationService.ts:246-255, 511-541 | ✅ Confirmed |
| C-08 | Invoice lifecycle | invoiceService.ts:378-402, 410-426, 429-485 | ✅ Confirmed |
| C-09 | jwtSecretGuard + isLocalhost | security.ts:27-34, 70-81; index.ts:59-62 | ✅ Confirmed |
| C-10 | Rate limiter IP+email | security.ts:101-106, 118-163; routes/auth.ts:48-55 | ✅ Confirmed |
| C-11 | Audit + PII masking | audit.ts:29-50, 57-69 | ✅ Confirmed |
| C-12 | Limits, LIKE escape, WIB today | validation.ts, sql.ts, time.ts | ✅ Confirmed |
| C-13 | 401 global + returnTo safe | api.ts:53-78, 98-130; returnTo.ts:9-14 | ✅ Confirmed |
| C-14 | fetchAllPages + FE-BE contract | api.ts:152-171; contract tests | ✅ Confirmed |
| C-15 | UI neutrality | Hash comparison vs snapshot-block-8/9b/10 | ✅ Confirmed |

---

## 4. Findings Table (sorted by severity)

| ID | Sev | Conf | file:line | Issue | Impact | Fix | Effort | New/Pre-existing |
|---|---|---|---|---|---|---|---|---|
| R2-BE-001 | Medium | High | authz.ts:128-145 | Guard Super Admin andalkan pesan error D1 | Batch rollback aman, user dapat 500 bukan 403 | Tambah fallback: batch gagal + target SA terakhir → 403 | S | Pre-existing |
| R2-BE-007 | Medium | Medium | activities.ts:21, audit.ts:71-76 | Audit metadata tidak di-maskPii | Amounts dan nama user terlihat di audit feed | Mask amounts jika perlu | S | Pre-existing |
| R2-FE-007 | Medium | High | localDate.ts:9-10 | toLocalISODate timezone-dependent | **Tanggal salah jika browser bukan WIB** | Tambah comment atau library | S/M | Pre-existing |
| R2-BE-002 | Low | High | security.ts:101-106 | clientAddress fallback X-Forwarded-For spoofable | Rate limit bypass jika direct access | Hapus fallback | S | Pre-existing |
| R2-BE-003 | Low | High | invoiceService.ts:81-104 | allocateInvoiceNumber fallback collision | 500 jika UNIQUE violation tidak match | Sama R2-BE-001 | S | Pre-existing |
| R2-BE-004 | Low | High | reservationService.ts:424-438 | generateUniqueCode fallback collision | Sama R2-BE-003 | Sama | S | Pre-existing |
| R2-BE-005 | Low | High | security.ts:27-34 | isLocalhostUrl potensial bypass | Token exposure jika absolute URL | Cloudflare normalisasi | S | Pre-existing |
| R2-BE-006 | Low | High | activityService.ts:109 | Activities ORDER BY tidak deterministik | Urutan beda untuk event bersamaan | Tambah rowid tiebreaker | S | Pre-existing |
| R2-BE-008 | Low | High | activities.ts:21 | Tidak ada permission finance vs reservation audit | Role activity.view lihat semua kategori | Sudah benar untuk sekarang | S | Pre-existing |
| R2-BE-009 | Low | High | dashboardService.ts:61-63 | Komentar stale "Finance backend deferred" | Cosmetic | Update komentar | S | Pre-existing |
| R2-FE-001 | Low | High | InvoiceDetailPage.tsx:37 | navigate(0) reload halaman | UX degradation | Ganti dengan reload() | S | Pre-existing |
| R2-FE-005 | Low | High | DashboardPage.tsx:76 | Komentar stale | Cosmetic | Update komentar | S | Pre-existing |

**Total: 0 Critical, 0 High, 3 Medium, 9 Low, 6 N/A.**

---

## 5. Per-Fix Verdicts from Blok 2

| Fix | Verdict |
|---|---|
| BE-001 Register 403 | ✅ Correct |
| BE-002 Super Admin guard | ✅ Correct |
| BE-003 Permission superset | ✅ Correct |
| BE-004 Seed credentials guard | ✅ Correct |
| BE-005 jwtSecretGuard | ✅ Correct |
| BE-006 Rate limiter | ✅ Correct |
| BE-007 Role inactive | ✅ Correct |
| BE-008 Reset token localhost | ✅ Correct |
| BE-011 Reset token claim | ✅ Correct |
| BE-012 Holidays force | ✅ Correct |
| BE-014 Security headers | ✅ Correct |
| BE-015 Overlap prevention | ✅ Correct |
| BE-016 Edit atomicity | ✅ Correct |
| BE-017 Locked statuses | ✅ Correct |
| BE-018 Multi-row batch | ✅ Correct |
| BE-019 Delete Draft only | ✅ Correct |
| BE-020 Status via actions | ✅ Correct |
| BE-022 Billed/paid endpoints | ✅ Correct |
| BE-023 Audit trail | ✅ Correct |
| BE-024 Room active check | ✅ Correct |
| BE-025 Date validation | ✅ Correct |
| BE-026 WIB today | ✅ Correct |
| BE-027 N+1 removal | ✅ Correct |
| BE-029 Reservation code retry | ✅ Correct |
| BE-031 Money bounds | ✅ Correct |
| BE-033 PII masking | ✅ Correct |
| BE-035 ORDER BY explicit | ✅ Correct |
| FE-001 Finance API | ✅ Correct |
| FE-002 fetchAllPages | ✅ Correct |
| FE-003 401 global | ✅ Correct |
| FE-004 ErrorState inline | ✅ Correct |
| FE-005 Local dates | ✅ Correct |
| FE-006 Local submit state | ✅ Correct |
| FE-008 Sourcemap hidden | ✅ Correct |
| FE-010 ESLint globals | ✅ Correct |

---

## 6. Known Items: Status Changed

**Tidak ada known items yang statusnya berubah.** Semua confirmed fixed.

---

## 7. Must Fix Before Staging / Before Production

### Before Staging (3 fix batches)
| Batch | Scope | Files | Test |
|---|---|---|---|
| 1 | Fallback guard Super Admin | authz.ts | Unit test: mock D1 error → verify 403 |
| 2 | Mask amounts di audit | audit.ts, routes/activities.ts | Unit test: verify metadata masked |
| 3 | Timezone comment/library | localDate.ts | Unit test: verify date in WIB |

### Before Production (10 kondisi)
1. **JWT_SECRET** produksi bukan placeholder
2. **Super Admin aktif** minimal 1 di D1 produksi
3. **finance.expense.\*** granted ke role yang perlu
4. **Akun default** dinonaktifkan/diubah password
5. **workers_dev: false** setelah custom domain aktif
6. **Observability** diaktifkan
7. **Environment separation** (D1 staging ≠ production)
8. **Rate limiting nyata** (Cloudflare WAF/Rate Limiting)
9. **Email reset password** (saat ini token hanya di-return untuk localhost)
10. **E2E tests** dijalankan di lingkungan terisolasi

---

## 8. Staging Test Plan

1. `GET /api/health` → 200
2. `POST /api/auth/register` → 403, tidak ada akun dibuat
3. Login admin → 200 + JWT
4. `GET /api/auth/me` → daftar izin lengkap
5. **Double-booking**: 2 request concurrent kamar sama → 1×201, 1×409
6. **Super Admin guard**: demote SA terakhir → 403 (bukan 500)
7. **Rate limiter**: 20 failed login IP+email sama → 429
8. **Invoice lifecycle**: Create Draft → send → pay → verify transitions
9. **Reservation locked**: Edit checked-out → 409
10. **Finance permissions**: Staff → GET /api/expenses → 403

---

## 9. What I Did NOT Review or Could Not Verify

### Tidak Direview
- Visual/design/responsive/accessibility-markup
- Playwright e2E specs
- Performance/load testing
- Browser compatibility
- Mobile responsiveness

### Tidak Diverifikasi (Keterbatasan)
- D1 error message format (guard Super Admin)
- D1 batch atomicity nyata (semua bukti dari shim)
- Concurrent double-booking di D1 (diuji di shim)
- Browser timezone (toLocalISODate benar jika WIB)
- Rate limiter effectiveness (per-isolate)

### Skipped for Safety
- Semua git/wrangler commands
- Migrations/seeds
- Playwright e2E
- npm install
- Network calls ke production

---

## Go / No-Go

| Target | Verdict | Kondisi |
|---|---|---|
| **Staging** | **GO** | 3 fix batches diterapkan + 10 staging tests lulus |
| **Production** | **CONDITIONAL GO** | 10 kondisi before production terpenuhi + 3 fix batches diterapkan |

---

**Akhir laporan Audit R2.**
