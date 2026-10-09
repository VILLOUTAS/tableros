import fs from 'node:fs';
import {createHash} from 'node:crypto';
import XLSX from 'xlsx';
const file=process.argv[2]||'catalog/MATRIZ_PRODUCTOS_SERVICIOS_V6.xlsx';
const w=XLSX.read(fs.readFileSync(file)),s=w.Sheets[w.SheetNames[0]];
// Expand only declared merged ranges: blank variant cells remain blank.
for(const m of s['!merges']||[]){const v=s[XLSX.utils.encode_cell(m.s)]?.v;for(let r=m.s.r;r<=m.e.r;r++)for(let c=m.s.c;c<=m.e.c;c++)s[XLSX.utils.encode_cell({r,c})]={t:'s',v};}
const rows=XLSX.utils.sheet_to_json(s,{header:1,defval:''}).flatMap((r,i)=>r.some(Boolean)?[{row:i+1,sourcePath:r.filter(Boolean).map(String),path:r.filter(Boolean).map(v=>String(v).replaceAll('BICELADO','BISELADO').replaceAll('DOMITORIO','DORMITORIO'))}]:[]);
const trees=[];
for(const r of rows){let children=trees;for(let i=0;i<r.path.length;i++){const prefix=r.path.slice(0,i+1),id='v60-'+createHash('sha1').update(prefix.join('/')).digest('hex').slice(0,12);let n=children.find(n=>n.id===id);if(!n){n={id,name:r.path[i],active:true,catalog:r.path[0]==='PRODUCTOS'?'products':'services',family:({'TABLEROS':'boards','PLACAS':'slabs','HERRAJES':'hardware'})[r.path[1]]||'other',children:[]};children.push(n);}if(i===r.path.length-1){r.id=id;n.sourceRow=r.row;}children=n.children;}}
fs.writeFileSync('src/matrix.v60.generated.js','// Generated from the corrected user matrix. No prices or official SKUs are inferred.\nexport default '+JSON.stringify({source:file,rows,trees},null,2)+';\n');
console.log(JSON.stringify({paths:rows.length,products:rows.filter(r=>r.path[0]==='PRODUCTOS').length,services:rows.filter(r=>r.path[0]==='SERVICIOS').length}));
