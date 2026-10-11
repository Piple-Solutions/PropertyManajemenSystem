const [a,b]=process.argv.slice(2);
const A=require('./'+a+'/metrics.json'),B=require('./'+b+'/metrics.json');
const k=r=>r.viewport+'|'+r.page;const mb=Object.fromEntries(B.map(r=>[k(r),r]));
console.log('vp|page | html | smallText | inputMin | smallTargets | overflow | docH');
for(const r of A){const n=mb[k(r)];if(!n)continue;
 console.log(`${r.viewport}|${r.page} | ${r.htmlFont}->${n.htmlFont} | ${r.smallText}->${n.smallText} | ${r.inputMin}->${n.inputMin} | ${r.smallTargets}->${n.smallTargets} | ${r.pageOverflow}->${n.pageOverflow} | ${r.docHeight}->${n.docHeight}`);}
