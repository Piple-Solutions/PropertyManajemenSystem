const fs = require('fs');
let p = 'src/components/public/PublicChrome.tsx';
let s = fs.readFileSync(p, 'utf8');

s = s.replace("import logoWhite from '../../../assets/LogoWhite.png';\n", '');

// drop useNearViewport helper
const a = s.indexOf('/** True once the element is within `margin`');
const b = s.indexOf('export function PublicFooter()');
if (a < 0 || b < 0) throw new Error('markers');
s = s.slice(0, a) + s.slice(b);

s = s.replace(
`  const footerRef = useRef<HTMLElement>(null);
  const farAway = useScrolledPast(farRef);
  // The 124 KB logo is only requested when the footer is about to be seen, so it
  // never competes with the hero and page chunks on a slow connection.
  const showLogo = useNearViewport(footerRef, '480px 0px');
`,
`  const farAway = useScrolledPast(farRef);
`);
s = s.replace(' ref={footerRef}>', '>');

const imgStart = s.indexOf('              {showLogo ? (');
const imgEnd = s.indexOf('              <p>{site.tagline}</p>');
if (imgStart < 0 || imgEnd < 0) throw new Error('img markers');
s = s.slice(0, imgStart) +
`              <p className="pub-footer__wordmark">
                <BrandRoof className="pub-footer__roof" />
                <span>{site.name}</span>
              </p>
` + s.slice(imgEnd);

// shared roof mark
s = s.replace(
`export function PublicHeader() {`,
`/** Small roofline mark used by the header brand and the footer wordmark. */
function BrandRoof({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 28 20" width="28" height="20" focusable="false" aria-hidden="true">
      <path
        d="M2 18H26M6 18L9 12H19L22 18M10 12L12.5 7H15.5L18 12M14 7V3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PublicHeader() {`);
const hs = s.indexOf('            <svg className="pub-brand__roof"');
const he = s.indexOf('            <span>{site.shortName}</span>');
if (hs < 0 || he < 0) throw new Error('header markers');
s = s.slice(0, hs) + '            <BrandRoof className="pub-brand__roof" />\n' + s.slice(he);
fs.writeFileSync(p, s);

p = 'src/styles/public.css';
s = fs.readFileSync(p, 'utf8');
s = s.replace(
`.pub-footer__logo {
  display: block;
  width: 168px;
  height: auto;
}`,
`.pub-footer__wordmark {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  font-family: var(--pub-font-display);
  font-size: clamp(1.25rem, 1.1rem + 0.6vw, 1.5rem);
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #fff;
}

.pub-footer__roof {
  flex-shrink: 0;
  color: var(--pub-bronze-200);
}`);
fs.writeFileSync(p, s);
console.log('patched');
