const fs = require('fs');
const d = JSON.parse(fs.readFileSync('.tmp-responsive/baseline/metrics.json', 'utf8'));
console.log('PAGES:', d.pages.map((p) => p.name).join(', '));
console.log('NOTES:', JSON.stringify(d.skipped, null, 1));
for (const m of d.metrics) {
  const s = m.sidebar || {};
  console.log(
    `${m.viewport} ${m.page} html=${m.htmlFont} body=${m.bodyFont} ` +
    `pgOverflow=${m.pageOverflow} side=${s.widthPx}/${s.shareOfViewport} ` +
    `wide=${m.wideElementsTotal} smallT=${m.smallTargets} smallTxt=${m.smallTextNodes} ` +
    `inputMin=${m.inputFontsMin} in<16=${m.inputBelow16}`
  );
}
console.log('\n--- WIDE ELEMENT DETAILS (mobile/tablet, pageOverflow=true or wide>0) ---');
for (const m of d.metrics) {
  if (m.pageOverflow || m.wideElementsTotal > 0) {
    console.log(`${m.viewport} ${m.page}: overflow=${m.pageOverflow} wide=${JSON.stringify(m.wideElements.slice(0, 4))}`);
  }
}
console.log('\n--- SMALL TEXT TOP (mobile 375/430, smallTextNodes>0) ---');
for (const m of d.metrics) {
  if ((m.viewport.startsWith('375') || m.viewport.startsWith('430')) && m.smallTextNodes > 0) {
    console.log(`${m.viewport} ${m.page}: n=${m.smallTextNodes} top=${JSON.stringify(m.topSmallText)}`);
  }
}
console.log('\n--- SMALL TARGET SAMPLES (375 dashboard/calendar/rooms) ---');
for (const m of d.metrics) {
  if (m.viewport.startsWith('375') && ['dashboard', 'reservation-calendar', 'room-list', 'reservation-list'].includes(m.page)) {
    console.log(`${m.page}: n=${m.smallTargets} samples=${JSON.stringify(m.smallTargetSamples)}`);
  }
}
