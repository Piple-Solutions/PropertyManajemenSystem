// Compare baseline build (_basebuild/dist) vs current dist with content-hash suffixes normalised,
// so a changed entry hash does not make every dependent chunk look different.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const norm = (buf) => buf.toString('utf8').replace(/-[A-Za-z0-9_-]{8}\.(js|css|png)/g, '.$1');
const baseName = (f) => f.replace(/-[A-Za-z0-9_-]{8}\.(js|css|png)$/, '.$1');
const load = (dir) => {
  const out = new Map();
  for (const f of fs.readdirSync(dir)) {
    if (/\.map$/.test(f)) continue;
    const buf = fs.readFileSync(path.join(dir, f));
    out.set(baseName(f), crypto.createHash('sha1').update(norm(buf)).digest('hex'));
  }
  return out;
};
const a = load('.tmp-responsive/_basebuild/dist/assets');
const b = load('dist/assets');
const same = [], diff = [], onlyA = [], onlyB = [];
for (const [k, v] of a) { if (!b.has(k)) onlyA.push(k); else if (b.get(k) === v) same.push(k); else diff.push(k); }
for (const k of b.keys()) if (!a.has(k)) onlyB.push(k);
console.log('identical:', same.length);
console.log('DIFFERENT:', diff.join(', ') || 'none');
console.log('only baseline:', onlyA.join(', ') || 'none');
console.log('only current:', onlyB.join(', ') || 'none');
