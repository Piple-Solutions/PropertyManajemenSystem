// Builds .tmp-audit/final/: one consolidated report + one detail file per finding + per-area reports.
// Reads only files inside .tmp-audit. Writes only inside .tmp-audit/final.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'final');
const FIND_DIR = path.join(OUT, 'findings');
const AREA_DIR = path.join(OUT, 'areas');
fs.mkdirSync(FIND_DIR, { recursive: true });
fs.mkdirSync(AREA_DIR, { recursive: true });
for (const d of [FIND_DIR, AREA_DIR]) for (const f of fs.readdirSync(d)) fs.rmSync(path.join(d, f), { force: true });

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ---------- metadata ----------
const TITLES = {
  'BE-001': 'Registrasi publik memberi akses operasional (auth bypass)',
  'BE-002': 'Tidak ada proteksi hirarki: Manager dapat menurunkan/mengunci Super Admin',
  'BE-003': 'Eskalasi hak lewat role.create + user.update (guard hanya cek permission.assign)',
  'BE-004': 'Kredensial default ikut di-seed (admin/manager/staff)',
  'BE-005': 'JWT_SECRET sama dengan placeholder, tanpa guard runtime',
  'BE-006': 'Tidak ada rate limiting pada endpoint auth',
  'BE-007': 'Role inactive tetap memberi permission',
  'BE-008': 'DEV_EXPOSE_RESET_TOKEN membocorkan token reset',
  'BE-009': 'Validasi input longgar (batas string/array, sales/breakdown tanpa zod, batas 100 bound parameter D1)',
  'BE-010': 'Enumerasi akun (409 register, timing login/forgot)',
  'BE-011': 'Penanganan token reset tidak atomik',
  'BE-012': 'Endpoint publik holidays: force=true dan kebocoran URL sumber',
  'BE-014': 'Hardening: workers_dev, security headers, logout tanpa revokasi',
  'BE-015': 'Double-booking (race pada cek ketersediaan)',
  'BE-016': 'Korupsi data saat edit reservasi gagal',
  'BE-017': 'Reservasi checked-out/cancelled dapat diedit dan di-reprice',
  'BE-018': 'Penulisan multi-baris non-atomik',
  'BE-019': 'Invoice dapat dihapus permanen; nomor invoice dipakai ulang',
  'BE-020': 'Bypass state machine invoice (status bisa diset langsung)',
  'BE-021': 'Invoice tidak direkonsiliasi dengan reservasi/pembayaran',
  'BE-022': 'Laporan menghitung invoice belum bayar sebagai omzet',
  'BE-023': 'Audit log tidak lengkap (user/role/permission, login gagal, nilai lama)',
  'BE-024': 'Kamar maintenance/inactive dapat dibooking; snapshot kamar dari klien',
  'BE-025': 'Validasi tanggal longgar dan pemotongan 60 malam',
  'BE-026': 'Zona waktu UTC vs WIB',
  'BE-027': 'N+1 query vs batas query D1 per invocation',
  'BE-028': 'Test suite merah karena fixture basi',
  'BE-029': 'Generator kode reservasi bentrok saat konkuren',
  'BE-030': 'Cancel menimpa total_amount',
  'BE-031': 'Tidak ada batas atas nominal uang/kuantitas',
  'BE-032': 'bcryptjs sync vs batas CPU Workers',
  'BE-033': 'Logging dan observability',
  'BE-034': 'Environment dan keamanan deploy',
  'FE-001': 'Modul finance di UI memakai data mock (tidak terhubung ke backend)',
  'FE-002': 'Daftar terpotong 100 baris tanpa urutan',
  'FE-003': 'Tidak ada penanganan 401/token kedaluwarsa',
  'FE-004': 'Kegagalan mutasi senyap',
  'FE-005': '"Hari ini" di-hardcode dan pergeseran tanggal akibat timezone',
  'FE-006': 'Form login ter-unmount saat submit',
  'FE-007': 'Cacat aksesibilitas (label input, modal)',
  'FE-008': 'Sourcemap produksi dan fallback API URL ke localhost',
  'FE-009': 'Advisory dependensi (xlsx, react-router)',
  'FE-010': 'Tipe `any` dan konfigurasi lint',
  'X-001': 'Override permission hanya di sisi klien',
  'X-005': 'Pesan user nonaktif menyesatkan',
  'X-006': 'Shortcut create memakai izin view',
};
const MERGED = {
  'X-002': 'FE-001',
  'X-003': 'FE-002',
  'BE-035': 'FE-002',
  'X-004': 'BE-001',
  'X-007': 'BE-026',
  'BE-013': 'BE-009',
};
const RC = {
  RC1: ['Pendaftaran publik dan bootstrap kredensial lemah', ['BE-001', 'BE-004', 'BE-005', 'BE-006', 'BE-008', 'BE-010']],
  RC2: ['Otorisasi tanpa hirarki/subset; status role diabaikan', ['BE-002', 'BE-003', 'BE-007', 'X-001']],
  RC3: ['Tidak ada atomicity / invariant di level DB (D1)', ['BE-015', 'BE-016', 'BE-018', 'BE-029', 'BE-030']],
  RC4: ['Tidak ada guard lifecycle/status', ['BE-017', 'BE-019', 'BE-020', 'BE-024']],
  RC5: ['Semantik uang dan laporan tidak terdefinisi', ['BE-021', 'BE-022', 'BE-031']],
  RC6: ['Audit trail tidak lengkap', ['BE-023', 'BE-033']],
  RC7: ['Validasi input dan tanggal longgar', ['BE-009', 'BE-025', 'BE-012', 'BE-011']],
  RC8: ['FE belum terintegrasi penuh; pagination salah', ['FE-001', 'FE-002', 'FE-003', 'FE-004', 'FE-005']],
  RC9: ['Zona waktu UTC vs WIB', ['BE-026', 'FE-005']],
  RC10: ['Batas platform dan operasi', ['BE-027', 'BE-032', 'BE-034', 'BE-014']],
  RC11: ['Kualitas, aksesibilitas, pengujian', ['BE-028', 'FE-006', 'FE-007', 'FE-008', 'FE-009', 'FE-010', 'X-005', 'X-006']],
};
const BATCH = {
  '0': ['Perbaiki fixture test', ['BE-028']],
  A: ['Perimeter keamanan (registrasi, kredensial, secret, rate limit)', ['BE-001', 'BE-004', 'BE-005', 'BE-006', 'BE-008']],
  B: ['Hirarki otorisasi dan role', ['BE-002', 'BE-003', 'BE-007']],
  C: ['Audit trail', ['BE-023']],
  D: ['Guard reservasi (status, kamar, tanggal)', ['BE-017', 'BE-024', 'BE-025']],
  E: ['Atomicity reservasi', ['BE-015', 'BE-016', 'BE-018', 'BE-029', 'BE-030']],
  F: ['Lifecycle invoice dan laporan', ['BE-019', 'BE-020', 'BE-022', 'BE-031']],
  G: ['Integrasi FE finance, pagination, session, tanggal', ['FE-001', 'FE-002', 'FE-003', 'FE-004', 'FE-005']],
};
const idToRC = {};
for (const [k, [, ids]] of Object.entries(RC)) for (const id of ids) (idToRC[id] ??= []).push(k);
const idToBatch = {};
for (const [k, [, ids]] of Object.entries(BATCH)) for (const id of ids) idToBatch[id] = k;

const CONF_OVERRIDE = {
  'BE-004': 'Medium (kode terkonfirmasi; eksposur bergantung proses deploy)',
  'BE-009': 'High (batas 100 bound parameter D1 terdokumentasi)',
  'BE-027': 'High untuk batas terdokumentasi; plan akun tidak diketahui',
  'BE-032': 'Medium (diukur ±58 ms per operasi vs batas CPU Free 10 ms; plan tidak diketahui)',
  'BE-021': 'Medium (Suspected; mungkin batas scope yang diterima)',
  'BE-005': 'Medium (kesamaan nilai terkonfirmasi; status commit file tidak bisa diperiksa)',
};
const VERDICT = {
  'BE-001': 'Confirmed (PoC in-memory). Tidak ditemukan feature flag, approval, atau rate limit. Prasyarat: role-003 ada dengan izin tersebut (seed default; migrasi tidak membuat role).',
  'BE-002': 'Confirmed (PoC in-memory).',
  'BE-003': 'Confirmed (PoC in-memory), kondisional: butuh role kustom yang memegang role.create + user.update.',
  'BE-004': 'Confirmed di kode; eksposur bergantung apakah produksi di-seed dari skrip ini. Tetap High, confidence Medium.',
  'BE-007': 'Confirmed (PoC in-memory).',
  'BE-015': 'Confirmed (PoC dengan latency buatan 5 ms/query): offset 0-3 ms -> 201+500 (bentrok reservation_code, bukan guard overlap); offset 6-30 ms -> 201+201 dengan dua booking untuk kamar+malam yang sama.',
  'BE-016': 'Confirmed (PoC). Dipertimbangkan Critical, dipertahankan High karena satu record dan dapat dipulihkan dengan menyimpan ulang.',
  'BE-017': 'Confirmed (PoC in-memory).',
  'BE-018': 'Confirmed (PoC): pay dan cancel sama-sama 200; baris akhir Completed/Paid.',
  'BE-019': 'Confirmed (PoC in-memory).',
  'BE-020': 'Confirmed (PoC in-memory).',
  'BE-022': 'Confirmed (PoC in-memory).',
  'BE-023': 'Confirmed (PoC in-memory): empat mutasi -> 0 baris activities.',
  'BE-024': 'Confirmed (PoC in-memory).',
  'BE-025': 'Confirmed (PoC in-memory + probe Date di Node).',
  'BE-029': 'Confirmed (PoC): dua create paralel ke kamar berbeda -> 201 + 500.',
  'FE-001': 'Confirmed (kode): tidak ada referensi /api/invoices|expenses|sales|reports di seluruh frontend/src.',
  'FE-002': 'Confirmed (kode): ReservationListPage.tsx:230 memakai getAll() (page=1,pageSize=100) lalu filter di klien; backend tanpa ORDER BY.',
  'BE-013': 'Refuted sebagai eksploitasi: FE publik tidak merender `images`. Celah validasi digabung ke BE-009.',
  'BE-032': 'Confirmed risiko: bcryptjs cost 10 diukur ±58 ms per operasi di Node; batas CPU Workers Free 10 ms (dokumentasi Cloudflare).',
  'BE-027': 'Confirmed risiko: batas D1 50 (Free) / 1000 (Paid) query per invocation (dokumentasi Cloudflare).',
};
const TIER_DEFAULT = (sev) =>
  sev === 'Critical' || sev === 'High'
    ? 'Confirmed (pembacaan ulang adversarial).'
    : 'Dari pembacaan kode (tidak diverifikasi ulang secara terpisah).';

// ---------- parse findings ----------
const FILES = [
  ['be-security.md', '01-backend-security-authorization.md', 'Backend: keamanan dan otorisasi (Block 2)'],
  ['be-logic.md', '02-backend-business-logic-data-integrity.md', 'Backend: business logic dan data integrity (Block 3)'],
  ['be-infra.md', '03-backend-reliability-infra.md', 'Backend: reliability dan infrastruktur (Block 4)'],
  ['fe.md', '04-frontend.md', 'Frontend (Block 4)'],
  ['contract.md', '05-fe-be-contract.md', 'Kontrak FE-BE (Block 4)'],
];
const HEAD = /^#{2,3} ((?:BE|FE|X)-\d{3}) \| (.+)$/;
const sections = {};
for (const [src] of FILES) {
  const lines = read(path.join('findings', src)).split(/\r?\n/);
  let cur = null;
  for (const line of lines) {
    const m = HEAD.exec(line);
    if (m) {
      cur = { id: m[1], head: m[2].split(' | ').map((s) => s.trim()), body: [], src };
      sections[cur.id] = cur;
      continue;
    }
    if (/^#{1,3} /.test(line)) {
      cur = null;
      continue;
    }
    if (cur) cur.body.push(line);
  }
}
for (const s of Object.values(sections)) {
  s.text = s.body.join('\n').replace(/\n-{3,}\s*$/g, '').trim();
}

// ---------- PoC ----------
const poc = {};
try {
  const out = read('poc/out.txt');
  for (const line of out.split(/\r?\n/)) {
    const m = /^POC\|([^|]+)\|(.*)$/.exec(line.trim());
    if (!m) continue;
    let ids = m[1].split('/').map((s) => (s.startsWith('BE-') ? s : 'BE-' + s));
    ids = ids.map((s) => s.replace(/[a-z]$/, ''));
    let data;
    try {
      data = JSON.stringify(JSON.parse(m[2]), null, 2);
    } catch {
      data = m[2];
    }
    for (const id of ids) (poc[id] ??= []).push({ label: m[1], data });
  }
} catch {
  /* no poc output */
}

// ---------- unique list ----------
const uniqueIds = Object.keys(sections).filter((id) => !MERGED[id]);
const sevRank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const sevOf = (id) => sections[id].head[0].replace(/\(.*\)/, '').trim();
uniqueIds.sort((a, b) => sevRank[sevOf(a)] - sevRank[sevOf(b)] || a.localeCompare(b));
const mergedInto = {};
for (const [from, to] of Object.entries(MERGED)) (mergedInto[to] ??= []).push(from);

const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
for (const id of uniqueIds) counts[sevOf(id)] += 1;

// ---------- per-finding files ----------
const link = (id) => (sections[id] && !MERGED[id] ? `[${id}](findings/${id}.md)` : id);
const lines2 = [];
for (const id of uniqueIds) {
  const s = sections[id];
  const [sev, conf0, area, loc] = s.head;
  const conf = CONF_OVERRIDE[id] || conf0;
  const effort = (/\*\*Effort:\*\*\s*([^|\n]+)/.exec(s.text) || [, 'n/a'])[1].trim();
  const verdict = VERDICT[id] || TIER_DEFAULT(sev);
  const rcs = (idToRC[id] || []).map((k) => `${k} (${RC[k][0]})`).join('; ') || '-';
  const batch = idToBatch[id] ? `Batch ${idToBatch[id]}: ${BATCH[idToBatch[id]][0]}` : 'Backlog (Medium/Low, tidak masuk batch wajib)';
  let md = '';
  md += `# ${id} — ${TITLES[id] || area}\n\n`;
  md += '| Field | Nilai |\n|---|---|\n';
  md += `| Severity (final) | **${sev}** |\n`;
  md += `| Confidence | ${conf} |\n`;
  md += `| Kategori | ${area} |\n`;
  md += `| Lokasi | ${loc || '-'} |\n`;
  md += `| Status verifikasi | ${verdict} |\n`;
  md += `| Kelompok akar masalah | ${rcs} |\n`;
  md += `| Batch perbaikan | ${batch} |\n`;
  md += `| Effort | ${effort} |\n`;
  md += `| Sumber | areas/${FILES.find((f) => f[0] === s.src)[1]} |\n\n`;
  md += '## Detail temuan\n\n';
  md += `${s.text}\n\n`;
  if (poc[id]) {
    md += '## Bukti PoC (in-memory, tanpa menyentuh data nyata)\n\n';
    md += 'Sumber: `.tmp-audit/poc/verify.poc.test.ts`, keluaran mentah `.tmp-audit/poc/out.txt`.\n\n';
    for (const p of poc[id]) {
      md += `Keluaran \`${p.label}\`:\n\n\`\`\`json\n${p.data}\n\`\`\`\n\n`;
    }
  }
  if (mergedInto[id]) {
    md += '## Item yang digabung ke temuan ini\n\n';
    for (const m of mergedInto[id]) {
      md += `### ${m} — ${sections[m].head.slice(2, 3).join('')}\n\n`;
      md += `Severity awal: ${sections[m].head[0]}. ${VERDICT[m] ? 'Verifikasi: ' + VERDICT[m] : ''}\n\n`;
      md += `${sections[m].text}\n\n`;
    }
  }
  md += '---\nDokumen ini dihasilkan dari laporan audit read-only. Isi teknis di atas dipertahankan dalam bahasa aslinya (Inggris) agar istilah dan kutipan kode tetap presisi.\n';
  fs.writeFileSync(path.join(FIND_DIR, `${id}.md`), md);
  lines2.push({ id, sev, conf, area, loc, effort, title: TITLES[id] || area });
}

// ---------- per-area copies ----------
for (const [src, dst, label] of FILES) {
  const body = read(path.join('findings', src));
  fs.writeFileSync(
    path.join(AREA_DIR, dst),
    `<!-- ${label}. Salinan laporan detail per area dari .tmp-audit/findings/${src}. Detail per temuan ada di ../findings/. -->\n\n${body}`,
  );
}
fs.writeFileSync(path.join(AREA_DIR, '06-endpoint-inventory.md'), read('endpoints.md'));
fs.writeFileSync(path.join(AREA_DIR, '07-verification-log.md'), read('verification.md'));
fs.writeFileSync(path.join(AREA_DIR, '08-initial-audit-plan.md'), read('audit-plan.md'));

// ---------- consolidated report ----------
let main = read('audit-report.md');
main = main.replace('| BE-018 (+BE-029) |', '| BE-018 |').replace('| BE-007 (+X-001 sebagian) |', '| BE-007 |');
// linkify finding IDs in the findings table (section 3)
main = main.replace(/^\| ((?:BE|FE|X)-\d{3})( \([^)]*\))? \|/gm, (m, id, extra) =>
  sections[id] && !MERGED[id] ? `| [${id}](findings/${id}.md)${extra || ''} |` : m,
);

const idx = [];
idx.push('| ID | Severity | Confidence | Judul | File detail |');
idx.push('|---|---|---|---|---|');
for (const f of lines2) idx.push(`| ${f.id} | ${f.sev} | ${f.conf.split(' (')[0]} | ${f.title} | [findings/${f.id}.md](findings/${f.id}.md) |`);

const mergedTable = ['| ID digabung | Digabung ke | Catatan |', '|---|---|---|'];
for (const [from, to] of Object.entries(MERGED)) {
  mergedTable.push(`| ${from} | [${to}](findings/${to}.md) | ${VERDICT[from] ? VERDICT[from] : 'Akar masalah sama; isi detail ada di file ' + to + '.'} |`);
}

const pocAll = fs.existsSync(path.join(ROOT, 'poc/out.txt'))
  ? read('poc/out.txt').split(/\r?\n/).filter((l) => l.startsWith('POC|')).join('\n')
  : '(tidak ada)';

let doc = '';
doc += '# AUDIT PMS — Laporan Gabungan (satu file)\n\n';
doc += '> Homestay Joglo Seruni Syariah — backend (Cloudflare Workers + D1) dan frontend (React/Vite). Audit read-only.\n\n';
doc += `**Hasil akhir:** ${uniqueIds.length} temuan unik — ${counts.Critical} Critical, ${counts.High} High, ${counts.Medium} Medium, ${counts.Low} Low.\n\n`;
doc += '## Struktur paket laporan\n\n';
doc += '| Lokasi | Isi |\n|---|---|\n';
doc += '| `AUDIT-PMS-REPORT.md` (file ini) | Laporan gabungan: ringkasan, tabel temuan, matriks otorisasi, akar masalah, rencana perbaikan, cross-check, test yang kurang, batasan, baseline tooling, dan lampiran |\n';
doc += `| \`findings/<ID>.md\` | ${uniqueIds.length} file, satu per temuan (detail, trace, bukti PoC, fix minimal, batch) |\n`;
doc += '| `areas/*.md` | Laporan detail per area (5 area) + inventaris endpoint, log verifikasi, rencana awal audit |\n\n';
doc += '## Daftar isi\n\n';
doc += '1. Ringkasan eksekutif\n2. Stack dan arsitektur\n3. Tabel temuan\n4. Matriks otorisasi endpoint\n5. Kelompok akar masalah\n6. Wajib diperbaiki sebelum produksi\n7. Cross-check audit frontend lama\n8. Test yang belum ada\n9. Tidak ditinjau / dilewati\n10. Baseline tooling\n- Lampiran A: Indeks file detail\n- Lampiran B: Temuan yang digabung\n- Lampiran C: Inventaris endpoint\n- Lampiran D: Log verifikasi adversarial\n- Lampiran E: Keluaran mentah PoC\n- Lampiran F: Rencana awal audit\n\n---\n\n';
doc += main.replace(/^# .*\n/, '').replace(/^Cakupan:/m, 'Cakupan:');
doc += '\n\n---\n\n## Lampiran A — Indeks file detail per temuan\n\n' + idx.join('\n') + '\n';
doc += '\n## Lampiran B — Temuan yang digabung (deduplikasi akar masalah)\n\n' + mergedTable.join('\n') + '\n';
doc += '\n## Lampiran C — Inventaris endpoint (Block 1)\n\n' + read('endpoints.md').replace(/^# .*\n/, '') + '\n';
doc += '\n## Lampiran D — Log verifikasi adversarial (Block 5.1)\n\n' + read('verification.md').replace(/^# .*\n/, '').replace(/^## /gm, '### ') + '\n';
doc += '\n## Lampiran E — Keluaran mentah PoC\n\nPoC dijalankan terhadap SQLite in-memory milik harness test proyek (`.tmp-audit/poc/verify.poc.test.ts`). Tidak menyentuh data nyata, Cloudflare, atau jaringan.\n\n```\n' + pocAll + '\n```\n';
doc += '\n## Lampiran F — Rencana awal audit (hipotesis Block 1)\n\n' + read('audit-plan.md').replace(/^# .*\n/, '') + '\n';
fs.writeFileSync(path.join(OUT, 'AUDIT-PMS-REPORT.md'), doc);

console.log(JSON.stringify({ unique: uniqueIds.length, counts, findingFiles: fs.readdirSync(FIND_DIR).length, areaFiles: fs.readdirSync(AREA_DIR).length, missingTitles: uniqueIds.filter((i) => !TITLES[i]), pocIds: Object.keys(poc) }));
