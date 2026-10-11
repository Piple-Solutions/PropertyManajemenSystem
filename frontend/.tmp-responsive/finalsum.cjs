const B=require('./baseline/metrics.json').metrics, F=require('./final/metrics.json');
const pages=['dashboard','reservation-list','reservation-calendar','reservation-wizard-new','room-list','invoice-list','user-list','contact-public'];
for (const vp of ['375x812','768x1024','1024x768','1440x900']) {
  console.log('\n'+vp);
  console.log('page | html | pageOverflow(inner) | sidebarShare | targets<44 | text<12 | input<16(min px) | docHeight');
  for (const p of pages) {
    const b=B.find(r=>r.viewport===vp&&r.page===p), f=F.find(r=>r.viewport===vp&&r.page===p);
    if(!f) continue;
    const bs=b?.sidebar?.visible?b.sidebar.shareOfViewport:'-';
    console.log(`${p} | ${b?.htmlFont??'-'}->${f.htmlFont} | ${b?.pageOverflow??'-'}->${f.pageOverflow} | ${bs}->${f.sideShare} | ${b?.smallTargets??'-'}->${f.smallTargets} | ${b?.smallTextNodes??'-'}->${f.smallText} | ${b?.inputFontsMin??'-'}->${f.inputMin} | ${'-'}->${f.docHeight}`);
  }
}
