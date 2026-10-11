// usage: node pixdiff.cjs <dirA> <dirB> [viewport ...]
const fs = require('fs');
const path = require('path');
const { PNG } = require('playwright-core/lib/utilsBundle');
const [a, b, ...vps] = process.argv.slice(2);
const list = vps.length ? vps : fs.readdirSync(a).filter((n) => fs.statSync(path.join(a, n)).isDirectory());
for (const vp of list) {
  const da = path.join(a, vp);
  const db = path.join(b, vp);
  if (!fs.existsSync(da) || !fs.existsSync(db)) continue;
  for (const f of fs.readdirSync(da).filter((n) => n.endsWith('.png'))) {
    const fb = path.join(db, f);
    if (!fs.existsSync(fb)) { console.log(`${vp}/${f}: missing in B`); continue; }
    const A = PNG.sync.read(fs.readFileSync(path.join(da, f)));
    const B = PNG.sync.read(fs.readFileSync(fb));
    if (A.width !== B.width || A.height !== B.height) {
      console.log(`${vp}/${f}: size ${A.width}x${A.height} -> ${B.width}x${B.height}`);
      continue;
    }
    let d = 0;
    for (let i = 0; i < A.data.length; i += 4) {
      if (A.data[i] !== B.data[i] || A.data[i + 1] !== B.data[i + 1] || A.data[i + 2] !== B.data[i + 2]) d++;
    }
    const pct = ((d / (A.width * A.height)) * 100).toFixed(3);
    console.log(`${vp}/${f}: ${d === 0 ? 'IDENTICAL' : `${d}px differ (${pct}%)`}`);
  }
}
