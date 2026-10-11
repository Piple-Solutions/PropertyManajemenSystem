// Rewrites public pages' imports of shared components to the single barrel '@/components/public'.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const SHARED = ['Accordion', 'icons', 'OrnamentDivider', 'PageCta', 'PageHero', 'PlaceholderMedia', 'Reveal', 'RoomSkeleton', 'usePublicPage', 'useRoomTypes'];
const files = [
  'src/pages/HomePage.tsx',
  'src/pages/AboutPage.tsx',
  'src/pages/RoomTypesPage.tsx',
  'src/pages/GalleryPage.tsx',
  'src/pages/ContactPage.tsx',
  'src/pages/NotFoundPage.tsx',
];
for (const rel of files) {
  const p = path.join(root, rel);
  let s = fs.readFileSync(p, 'utf8');
  const names = [];
  s = s.replace(/^import \{([^}]+)\} from '@\/components\/public\/([A-Za-z]+)';\n/gm, (m, list, mod) => {
    if (!SHARED.includes(mod)) return m;
    list
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((x) => names.push(x));
    return '';
  });
  if (names.length === 0) throw new Error('no shared imports in ' + rel);
  const sorted = [...new Set(names)].sort((a, b) => a.localeCompare(b));
  const line = `import { ${sorted.join(', ')} } from '@/components/public';\n`;
  // place the barrel import after the content import / before the css import or other lines
  const cssIdx = s.indexOf("import '../styles/public.css';");
  if (cssIdx >= 0) s = s.slice(0, cssIdx) + line + s.slice(cssIdx);
  else {
    // NotFoundPage-style: insert after last import line
    const lines = s.split('\n');
    let last = 0;
    lines.forEach((l, i) => {
      if (l.startsWith('import ')) last = i;
    });
    lines.splice(last + 1, 0, line.trimEnd());
    s = lines.join('\n');
  }
  fs.writeFileSync(p, s);
  console.log('patched', rel, '->', sorted.join(', '));
}
