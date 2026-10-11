// Reveal: elements already on screen at mount are shown instantly (no fade).
// A running opacity transition keeps Chrome from registering the text as an LCP candidate until it ends.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

let p = path.join(root, 'src/components/public/Reveal.tsx');
let s = fs.readFileSync(p, 'utf8');
const rep = (a, b) => {
  if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 50));
  s = s.replace(a, b);
};
rep("  const [shown, setShown] = useState(false);", "  // 'now': already on screen at mount (no transition); 'in': scrolled into view (fades in).\n  const [state, setState] = useState<'hidden' | 'now' | 'in'>('hidden');");
rep("    if (!enhanced) {\n      setShown(true);\n      return undefined;\n    }", "    if (!enhanced) {\n      setState('now');\n      return undefined;\n    }");
rep("    // Already on screen at mount: reveal before first paint (no flash).", "    // Already on screen at mount: reveal before first paint, without a transition.");
rep("      setShown(true);\n      return undefined;\n    }\n    return observeOnce(el, () => setShown(true));", "      setState('now');\n      return undefined;\n    }\n    return observeOnce(el, () => setState('in'));");
rep("className={`pub-reveal${shown ? ' is-in' : ''}${className ? ` ${className}` : ''}`}", "className={`pub-reveal${state === 'hidden' ? '' : ' is-in'}${state === 'now' ? ' is-now' : ''}${className ? ` ${className}` : ''}`}");
fs.writeFileSync(p, s);

p = path.join(root, 'src/styles/public.css');
s = fs.readFileSync(p, 'utf8');
rep(".pub-js .pub-reveal.is-in {\n  opacity: 1;\n  transform: none;\n  transition: opacity var(--pub-dur) var(--pub-ease), transform var(--pub-dur) var(--pub-ease);\n  transition-delay: calc(var(--pub-stagger) * var(--pub-i, 0));\n}",
    ".pub-js .pub-reveal.is-in {\n  opacity: 1;\n  transform: none;\n  transition: opacity var(--pub-dur) var(--pub-ease), transform var(--pub-dur) var(--pub-ease);\n  transition-delay: calc(var(--pub-stagger) * var(--pub-i, 0));\n}\n\n/* Already visible at load: no fade (a running transition delays LCP). */\n.pub-js .pub-reveal.is-now {\n  transition: none;\n}");
fs.writeFileSync(p, s);
console.log('ok');
