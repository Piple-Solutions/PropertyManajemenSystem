// useRoomTypes: format prices with ONE cached Intl.NumberFormat instead of constructing one per room.
const fs = require('fs');
const path = require('path');
const p = path.resolve(__dirname, '..', 'src/components/public/kit.tsx');
let s = fs.readFileSync(p, 'utf8');
const rep = (a, b) => {
  if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 70));
  s = s.replace(a, b);
};
rep("import { formatCurrency } from '@/utils/currencyUtils';\n", '');
rep(
  "export interface RoomItem {",
  "/**\n * Same output as utils/currencyUtils.formatCurrency (IDR, no decimals), but the formatter\n * is built once: constructing an Intl.NumberFormat per room is slow on phones.\n */\nlet idrFormat: Intl.NumberFormat | null = null;\nfunction formatIdr(amount: number): string {\n  idrFormat ??= new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 });\n  return idrFormat.format(amount);\n}\n\nexport interface RoomItem {",
);
rep("          price: formatCurrency(r.defaultRate),", "          price: formatIdr(r.defaultRate),");
fs.writeFileSync(p, s);
console.log('ok');
