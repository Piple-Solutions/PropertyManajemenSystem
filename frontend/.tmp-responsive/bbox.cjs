const fs=require('fs');const {PNG}=require('playwright-core/lib/utilsBundle');
const [a,b]=process.argv.slice(2);
const A=PNG.sync.read(fs.readFileSync(a)),B=PNG.sync.read(fs.readFileSync(b));
let x0=1e9,y0=1e9,x1=-1,y1=-1,n=0;const rows={};
for(let y=0;y<A.height;y++)for(let x=0;x<A.width;x++){const i=(y*A.width+x)*4;
 if(A.data[i]!==B.data[i]||A.data[i+1]!==B.data[i+1]||A.data[i+2]!==B.data[i+2]){n++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);rows[y]=(rows[y]||0)+1;}}
console.log({n,x0,y0,x1,y1});
const ys=Object.keys(rows).map(Number);console.log('y range count',ys.length, ys.slice(0,10));
