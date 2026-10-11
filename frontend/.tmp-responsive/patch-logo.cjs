// Replaces the temporary SVG brand (BrandRoof) in header + footer with the real logo images.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

// ---- PublicChrome.tsx ----
let p = path.join(root, 'src/components/public/PublicChrome.tsx');
let s = fs.readFileSync(p, 'utf8');
const rep = (a, b) => {
  if (!s.includes(a)) throw new Error('missing in PublicChrome: ' + a.slice(0, 70));
  s = s.replace(a, b);
};
rep("import { OrnamentDivider } from './kit';\n", "import { logo } from './brand';\nimport { OrnamentDivider } from './kit';\n");

// remove the BrandRoof helper component
const start = s.indexOf('/** Small roofline mark used by the header brand and the footer wordmark. */');
const end = s.indexOf('export function PublicHeader()');
if (start < 0 || end < 0) throw new Error('BrandRoof block not found');
s = s.slice(0, start) + s.slice(end);

rep(
  '            <BrandRoof className="pub-brand__roof" />\n            <span>{site.shortName}</span>\n',
  '            {/* Both variants are in the DOM; CSS shows the one that fits the header state. */}\n' +
    '            <img\n              className="pub-brand__logo pub-brand__logo--white"\n              src={logo.white.src}\n              width={logo.white.width}\n              height={logo.white.height}\n              alt=""\n              decoding="async"\n            />\n' +
    '            <img\n              className="pub-brand__logo pub-brand__logo--brown"\n              src={logo.brown.src}\n              width={logo.brown.width}\n              height={logo.brown.height}\n              alt=""\n              decoding="async"\n              fetchPriority="low"\n            />\n',
);
rep(
  '              <div className="pub-footer__wordmark">\n                <BrandRoof className="pub-footer__roof" />\n                <span>{site.name}</span>\n              </div>\n',
  '              <img\n                className="pub-footer__logo"\n                src={logo.white.src}\n                width={logo.white.width}\n                height={logo.white.height}\n                alt={site.name}\n                loading="lazy"\n                decoding="async"\n              />\n',
);
fs.writeFileSync(p, s);

// ---- public.css ----
p = path.join(root, 'src/styles/public.css');
s = fs.readFileSync(p, 'utf8');
rep(
  '.pub-brand {\n  display: inline-flex;\n  align-items: center;\n  gap: 10px;\n  min-height: 44px;\n  color: inherit;\n  text-decoration: none;\n  font-family: var(--pub-font-display);\n  font-size: 1.25rem;\n  font-weight: 600;\n  letter-spacing: -0.01em;\n}\n\n.pub-brand__roof {\n  flex-shrink: 0;\n  color: var(--pub-bronze-200);\n}\n\n.pub-header[data-solid=\'true\'] .pub-brand__roof {\n  color: var(--pub-bronze);\n}\n\n.pub-header[data-open=\'true\'] .pub-brand__roof {\n  color: var(--pub-bronze-200);\n}\n',
  '.pub-brand {\n  display: inline-flex;\n  align-items: center;\n  min-height: 44px;\n  color: inherit;\n  text-decoration: none;\n}\n\n' +
    '/* The two logo files differ slightly in aspect ratio, so both sit in the same fixed\n   box (object-fit: contain): swapping them never moves the nav or the CTA. */\n' +
    '.pub-brand__logo {\n  display: block;\n  height: var(--pub-logo-h);\n  width: calc(var(--pub-logo-h) * 1.86);\n  object-fit: contain;\n  object-position: left center;\n}\n\n' +
    '/* White artwork on the transparent header and while the menu is open; brown once the header is solid. */\n' +
    '.pub-brand__logo--brown,\n.pub-header[data-solid=\'true\'] .pub-brand__logo--white {\n  display: none;\n}\n\n' +
    '.pub-header[data-solid=\'true\'] .pub-brand__logo--brown {\n  display: block;\n}\n\n' +
    '.pub-header[data-open=\'true\'] .pub-brand__logo--white {\n  display: block;\n}\n\n' +
    '.pub-header[data-open=\'true\'] .pub-brand__logo--brown {\n  display: none;\n}\n',
);
rep(
  '.pub-footer__wordmark {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  margin: 0;\n  font-family: var(--pub-font-display);\n  font-size: clamp(1.25rem, 1.1rem + 0.6vw, 1.5rem);\n  font-weight: 600;\n  letter-spacing: -0.01em;\n  color: #fff;\n}\n\n.pub-footer__roof {\n  flex-shrink: 0;\n  color: var(--pub-bronze-200);\n}\n',
  '.pub-footer__logo {\n  display: block;\n  width: clamp(132px, 38vw, 168px);\n  height: auto;\n}\n',
);
rep('  --pub-header-h: 64px;\n', '  --pub-header-h: 64px;\n  --pub-logo-h: 46px;\n');
rep('  .pub-root {\n    --pub-header-h: 72px;\n  }', '  .pub-root {\n    --pub-header-h: 72px;\n    --pub-logo-h: 54px;\n  }');
fs.writeFileSync(p, s);
console.log('ok');
