// Compare current tree with .tmp-responsive/snapshot-public-start by SHA-1 (no git).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const snap = '.tmp-responsive/snapshot-public-start';
const h = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const walk = (d, base, out = []) => {
  for (const n of fs.readdirSync(d)) {
    const p = path.join(d, n);
    if (fs.statSync(p).isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
};
const files = new Set([...walk(snap, snap), ...walk('src', '.')]);
for (const r of ['index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.node.json', 'vite.config.ts', 'postcss.config.js', 'tailwind.config.ts', 'playwright.config.ts', 'eslint.config.js']) files.add(r);
const changed = [];
const added = [];
for (const f of files) {
  const a = path.join(snap, f);
  const ea = fs.existsSync(a);
  const eb = fs.existsSync(f);
  if (!ea && eb) added.push(f);
  else if (ea && !eb) changed.push('DELETED ' + f);
  else if (ea && eb && h(a) !== h(f)) changed.push(f);
}
console.log('CHANGED (' + changed.length + '):\n' + changed.join('\n'));
console.log('ADDED (' + added.length + '):\n' + added.join('\n'));
const e2eNewer = fs.readdirSync('e2e').filter((n) => fs.statSync(path.join('e2e', n)).mtimeMs > fs.statSync(path.join(snap, 'package.json')).mtimeMs);
console.log('e2e files modified after snapshot:', e2eNewer.length ? e2eNewer.join(',') : 'none');
