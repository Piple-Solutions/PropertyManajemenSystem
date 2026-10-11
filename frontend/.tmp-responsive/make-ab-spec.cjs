// Derives public-perf-ab.spec.ts from public-perf.spec.ts: configurable origin/dist, stubbed Google Fonts, 5 runs.
const fs = require('fs');
const path = require('path');
const dir = __dirname;
let s = fs.readFileSync(path.join(dir, 'public-perf.spec.ts'), 'utf8');

s = s.replace('const RUNS = 3;', "const RUNS = Number(process.env.PERF_RUNS || 5);\nconst ORIGIN = process.env.PERF_ORIGIN || 'http://localhost:5173';\nconst DIST_DIR = process.env.PERF_DIST || 'dist';");
s = s.replace("const dist = path.resolve(process.cwd(), 'dist');", 'const dist = path.resolve(process.cwd(), DIST_DIR);');
s = s.split("baseURL: 'http://localhost:5173',").join('baseURL: ORIGIN,');
s = s.replace("const page = await ctx.newPage();", "await ctx.route(/fonts\\.(googleapis|gstatic)\\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));\n      const page = await ctx.newPage();");
s = s.replace(".filter((r) => r.url.startsWith('http://localhost:5173'))", '.filter((r) => r.url.startsWith(ORIGIN))');
fs.writeFileSync(path.join(dir, 'public-perf-ab.spec.ts'), s);
console.log('ok', s.includes('ORIGIN'), s.includes('ctx.route'));
