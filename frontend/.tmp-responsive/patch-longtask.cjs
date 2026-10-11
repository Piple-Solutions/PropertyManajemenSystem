// Experiment: Reveal no longer reads layout in a layout effect (that forced the whole page's
// first style/layout inside the commit task). Above-the-fold groups opt in with `immediate`.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
let p = path.join(root, 'src/components/public/kit.tsx');
let s = fs.readFileSync(p, 'utf8');
const rep = (a, b) => {
  if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 70));
  s = s.replace(a, b);
};
rep(
  "interface RevealProps {\n  as?: ElementType;",
  "interface RevealProps {\n  as?: ElementType;\n  /** Known to be above the fold at every viewport: shown at mount, no observer, no layout read. */\n  immediate?: boolean;",
);
rep(
  "export function Reveal({ as: Tag = 'div', delay = 0, className = '', style, children }: RevealProps) {",
  "export function Reveal({ as: Tag = 'div', immediate = false, delay = 0, className = '', style, children }: RevealProps) {",
);
rep(
  "    if (!enhanced) {\n      setState('now');\n      return undefined;\n    }\n    // Already on screen at mount: reveal before first paint, without a transition.\n    const rect = el.getBoundingClientRect();\n    if (rect.top < window.innerHeight * 0.94 && rect.bottom > 0) {\n      setState('now');\n      return undefined;\n    }\n    return observeOnce(el, () => setState('in'));\n  }, [enhanced]);",
  "    if (!enhanced || immediate) {\n      setState('now');\n      return undefined;\n    }\n    // No geometry read here: it would force the whole page's first layout inside this\n    // commit task. The shared observer reports elements that are already in view too.\n    return observeOnce(el, () => setState('in'));\n  }, [enhanced, immediate]);",
);
fs.writeFileSync(p, s);

// above-the-fold groups
const edits = [
  ['src/pages/HomePage.tsx', '          <Reveal>\n            <AvailabilityForm />', '          <Reveal immediate>\n            <AvailabilityForm />'],
  ['src/pages/AboutPage.tsx', '          <Reveal className="pub-about__copy">', '          <Reveal immediate className="pub-about__copy">'],
  ['src/pages/AboutPage.tsx', '          <Reveal delay={2} className="pub-about__visual pub-about__visual--page">', '          <Reveal immediate delay={2} className="pub-about__visual pub-about__visual--page">'],
  ['src/pages/RoomTypesPage.tsx', '          <Reveal className="pub-sh">\n            <h2 id="rooms-list-title"', '          <Reveal immediate className="pub-sh">\n            <h2 id="rooms-list-title"'],
  ['src/pages/RoomTypesPage.tsx', '          <Reveal as="ul" className="pub-rooms pub-rooms--page">', '          <Reveal as="ul" immediate className="pub-rooms pub-rooms--page">'],
  ['src/pages/ContactPage.tsx', '          <Reveal className="pub-contact__info">', '          <Reveal immediate className="pub-contact__info">'],
  ['src/pages/ContactPage.tsx', '          <Reveal delay={2} className="pub-contact__map">', '          <Reveal immediate delay={2} className="pub-contact__map">'],
];
for (const [rel, a, b] of edits) {
  const f = path.join(root, rel);
  let t = fs.readFileSync(f, 'utf8');
  if (!t.includes(a)) throw new Error('missing in ' + rel + ': ' + a.slice(0, 60));
  t = t.replace(a, b);
  fs.writeFileSync(f, t);
}
console.log('ok');
