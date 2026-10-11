// Inserts inner-pages.css into src/styles/public.css (before the Motion section) and extends the hover block.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const p = path.join(root, 'src', 'styles', 'public.css');
let s = fs.readFileSync(p, 'utf8');
const add = fs.readFileSync(path.join(__dirname, 'inner-pages.css'), 'utf8');
const marker = '/* ---------- Motion ---------- */';
if (!s.includes(marker)) throw new Error('marker missing');
if (s.includes('/* ---------- Inner pages ---------- */')) throw new Error('already added');
s = s.replace(marker, add + marker);

const hoverOld = '  .pub-room:hover,\n  .pub-quote:hover {\n    transform: translateY(-4px);\n  }\n}';
if (!s.includes(hoverOld)) throw new Error('hover block not found');
const hoverNew =
  '  .pub-room:hover,\n  .pub-quote:hover {\n    transform: translateY(-4px);\n  }\n\n' +
  '  .pub-btn--outline:hover {\n    background: var(--pub-bronze-dark);\n    border-color: var(--pub-bronze-dark);\n    color: #fff;\n  }\n\n' +
  '  .pub-chipbtn:hover:not([aria-pressed="true"]) {\n    border-color: var(--pub-bronze-dark);\n  }\n\n' +
  '  .pub-gt__btn .pub-media {\n    transition: transform 420ms var(--pub-ease);\n  }\n\n' +
  '  .pub-gt__btn:hover .pub-media {\n    transform: scale(1.04);\n  }\n\n' +
  '  .pub-quick__link:hover {\n    border-color: var(--pub-bronze-dark);\n    transform: translateY(-2px);\n  }\n}';
s = s.replace(hoverOld, hoverNew);
fs.writeFileSync(p, s);
console.log('ok', s.length);
