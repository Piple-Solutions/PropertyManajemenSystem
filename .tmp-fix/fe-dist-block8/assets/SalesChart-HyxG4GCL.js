import{c as i,j as s}from"./index-DT3DnHe1.js";/**
 * @license lucide-react v0.446.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const c=i("Banknote",[["rect",{width:"20",height:"12",x:"2",y:"6",rx:"2",key:"9lu3g6"}],["circle",{cx:"12",cy:"12",r:"2",key:"1c9p78"}],["path",{d:"M6 12h.01M18 12h.01",key:"113zkx"}]]);/**
 * @license lucide-react v0.446.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const d=i("ReceiptText",[["path",{d:"M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z",key:"q3az6g"}],["path",{d:"M14 8H8",key:"1l3xfs"}],["path",{d:"M16 12H8",key:"1fr5h0"}],["path",{d:"M13 16H8",key:"wsln4y"}]]);/**
 * @license lucide-react v0.446.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const h=i("TrendingDown",[["polyline",{points:"22 17 13.5 8.5 8.5 13.5 2 7",key:"1r2t7k"}],["polyline",{points:"16 17 22 17 22 11",key:"11uiuu"}]]);function g({data:l,formatCurrency:n,emptyMessage:t="Tidak ada data"}){if(l.length===0)return s.jsx("div",{style:{textAlign:"center",color:"#6B7881",padding:"24px",backgroundColor:"#FFFFFF",border:"1px solid #C7BBAB",borderRadius:"8px"},children:t});const a=Math.max(...l.map(e=>Math.max(e.sales,e.expenses)),1),o=l.reduce((e,p)=>e+p.sales,0),x=`Monthly sales versus expenses for ${l.length} month(s), total sales ${n(o)}.`;return s.jsxs("div",{role:"img","aria-label":x,style:{display:"flex",flexDirection:"column",gap:"8px"},children:[l.map(e=>s.jsxs("div",{className:"sc-row",children:[s.jsx("span",{className:"sc-label",style:{fontSize:"12px",color:"#6B7881",fontWeight:600},children:e.month}),s.jsxs("div",{className:"sc-bars",children:[s.jsx("div",{style:{flex:e.sales/a,height:"20px",backgroundColor:"#97764D",borderRadius:"4px",minWidth:e.sales>0?"4px":"0px"},title:`Sales: ${n(e.sales)}`}),s.jsx("div",{style:{flex:e.expenses/a,height:"20px",backgroundColor:"#6B7881",borderRadius:"4px",minWidth:e.expenses>0?"4px":"0px"},title:`Expenses: ${n(e.expenses)}`})]}),s.jsx("span",{className:"sc-value",style:{fontSize:"11px",color:"#232D36"},children:e.net!==void 0?`Net: ${n(e.net)}`:n(e.sales)})]},e.month)),s.jsxs("div",{className:"sc-legend",style:{fontSize:"12px",color:"#232D36"},children:[s.jsxs("span",{children:[s.jsx("span",{style:{display:"inline-block",width:"12px",height:"12px",backgroundColor:"#97764D",borderRadius:"4px",marginRight:"4px",verticalAlign:"middle"}})," Penjualan"]}),s.jsxs("span",{children:[s.jsx("span",{style:{display:"inline-block",width:"12px",height:"12px",backgroundColor:"#6B7881",borderRadius:"4px",marginRight:"4px",verticalAlign:"middle"}})," Pengeluaran"]})]})]})}export{c as B,d as R,g as S,h as T};
