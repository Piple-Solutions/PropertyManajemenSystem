const fs = require('fs');
const path = require('path');
const p = path.resolve(__dirname, '..', 'src/pages/RoomTypesPage.tsx');
let s = fs.readFileSync(p, 'utf8');
const rep = (a, b) => {
  if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 60));
  s = s.replace(a, b);
};
rep("            {loaded && sample ? <p className=\"pub-body pub-muted\">{list.sampleNote}</p> : null}\n", "");
rep("          {loaded && rooms.length > BATCH ? (", "          {/* Below the list on purpose: it appears after load and must not push the cards down. */}\n          {loaded && sample ? <p className=\"pub-muted pub-listnote\">{list.sampleNote}</p> : null}\n\n          {loaded && rooms.length > BATCH ? (");
fs.writeFileSync(p, s);

const c = path.resolve(__dirname, '..', 'src/styles/public.css');
let css = fs.readFileSync(c, 'utf8');
const anchor = '.pub-more {\n  display: grid;';
if (!css.includes(anchor)) throw new Error('css anchor');
css = css.replace(anchor, '.pub-listnote {\n  margin: var(--pub-gap) 0 0;\n  color: var(--pub-ink-soft);\n  text-align: center;\n}\n\n' + anchor);
fs.writeFileSync(c, css);
console.log('ok');
