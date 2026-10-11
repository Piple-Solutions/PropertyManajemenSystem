// Collapse the shared public modules into kit.tsx: delete old files, repoint imports.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'src/components/public');
const OLD = ['Accordion.tsx', 'icons.ts', 'OrnamentDivider.tsx', 'PageCta.tsx', 'PageHero.tsx', 'PlaceholderMedia.tsx', 'Reveal.tsx', 'RoomSkeleton.tsx', 'usePublicPage.ts', 'useRoomTypes.ts', 'index.ts'];
for (const f of OLD) {
  const p = path.join(dir, f);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.log('deleted', f);
  }
}
const edits = [
  ['src/pages/HomePage.tsx', "'@/components/public'", "'@/components/public/kit'"],
  ['src/pages/AboutPage.tsx', "'@/components/public'", "'@/components/public/kit'"],
  ['src/pages/RoomTypesPage.tsx', "'@/components/public'", "'@/components/public/kit'"],
  ['src/pages/GalleryPage.tsx', "'@/components/public'", "'@/components/public/kit'"],
  ['src/pages/ContactPage.tsx', "'@/components/public'", "'@/components/public/kit'"],
  ['src/pages/NotFoundPage.tsx', "'@/components/public'", "'@/components/public/kit'"],
  ['src/components/public/PublicChrome.tsx', "from './index'", "from './kit'"],
  ['src/components/public/Lightbox.tsx', "from './PlaceholderMedia'", "from './kit'"],
];
for (const [rel, a, b] of edits) {
  const p = path.join(root, rel);
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes(a)) throw new Error('missing in ' + rel + ': ' + a);
  s = s.split(a).join(b);
  fs.writeFileSync(p, s);
  console.log('patched', rel);
}
