const fs = require('fs');
const path = require('path');
const p = path.resolve(__dirname, '..', 'src/components/public/Lightbox.tsx');
let s = fs.readFileSync(p, 'utf8');
const rep = (a, b) => {
  if (!s.includes(a)) throw new Error('missing: ' + a);
  s = s.split(a).join(b);
};
rep("import { ChevronLeft, ChevronRight, X } from 'lucide-react';\n", "import { X } from 'lucide-react';\n");
rep("const SWIPE_PX = 50;\n", "const SWIPE_PX = 50;\n\n/** Inline chevrons: the lucide modules would each add a separate request on /gallery. */\nfunction Chevron({ dir }: { dir: 'left' | 'right' }) {\n  return (\n    <svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"2\" strokeLinecap=\"round\" strokeLinejoin=\"round\" aria-hidden=\"true\" focusable=\"false\">\n      <path d={dir === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />\n    </svg>\n  );\n}\n");
rep("<ChevronLeft size={24} aria-hidden=\"true\" />", "<Chevron dir=\"left\" />");
rep("<ChevronRight size={24} aria-hidden=\"true\" />", "<Chevron dir=\"right\" />");
fs.writeFileSync(p, s);
console.log('ok');
