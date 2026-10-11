// Replaces the duplicated RoomSkeleton in Home and Rooms pages with the shared component.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const block = /function RoomSkeleton\(\) \{[\s\S]*?\n\}\n\n/;
for (const rel of ['src/pages/HomePage.tsx', 'src/pages/RoomTypesPage.tsx']) {
  const p = path.join(root, rel);
  let s = fs.readFileSync(p, 'utf8');
  if (!block.test(s)) throw new Error('skeleton not found in ' + rel);
  s = s.replace(block, '');
  s = s.replace("import { Reveal } from '@/components/public/Reveal';\n", "import { Reveal } from '@/components/public/Reveal';\nimport { RoomSkeleton } from '@/components/public/RoomSkeleton';\n");
  if (!s.includes("RoomSkeleton } from")) throw new Error('import not added in ' + rel);
  // PlaceholderMedia still used for the cards
  fs.writeFileSync(p, s);
  console.log('patched', rel);
}
