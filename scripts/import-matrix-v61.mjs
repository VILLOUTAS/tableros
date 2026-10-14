import fs from 'node:fs';
import {createHash} from 'node:crypto';
import XLSX from 'xlsx';
import prior from '../src/matrix.v60.generated.js';
const source=process.argv[2]||'catalog/MATRIZ_PRODUCTOS_SERVICIOS_V6.1.xlsx',w=XLSX.read(fs.readFileSync(source));
const s=w.Sheets.SERVICIOS,services=[];
for(const m of s['!merges']||[]){const value=s[XLSX.utils.encode_cell(m.s)]?.v;for(let r=m.s.r;r<=m.e.r;r++)for(let c=m.s.c;c<=m.e.c;c++)s[XLSX.utils.encode_cell({r,c})]={t:'s',v:value};}
const pathId=path=>'v60-'+createHash('sha1').update(path.join('/')).digest('hex').slice(0,12);
const servicesTree={id:pathId(['SERVICIOS']),name:'SERVICIOS',active:true,catalog:'services',family:'other',children:[]};
for(let r=3;r<=XLSX.utils.decode_range(s['!ref']).e.r;r++){
 const value=c=>s[XLSX.utils.encode_cell({r,c})]?.v,sku=String(value(5)||'').trim();if(!sku)continue;
 const path=Array.from({length:5},(_,c)=>String(value(c)||'').trim().replaceAll('BICELADO','BISELADO').replaceAll('DOMITORIO','DORMITORIO')).filter(Boolean),unit=String(value(6)||'').trim().toLowerCase().replace('un','unidad').replace('m2','m²');
 const service={id:'v61-'+sku.toLowerCase(),sku,name:path.at(-1),unit,netPrice:Number(value(7)),minPrice:Number(value(8)),payUnitRate:Number(value(9)),purchasePrice:null,productType:'service',catalogRelease:'6.1',active:true,pricingPending:false,taskArea:/INSTALACION/.test(path[2])?'installations':path[1]==='TABLEROS'?'boards':path[1]==='PLACAS'?'slabs':'installations',catalogPath:path,catalogPaths:[path],taxonomyId:pathId(path),categoryId:pathId(path),categoryName:path.slice(-2).join(' · '),sourceRow:r+1};
 if([service.netPrice,service.minPrice,service.payUnitRate].some(v=>!Number.isFinite(v)||v<0)||service.minPrice>service.netPrice)throw Error('Precios inválidos en fila '+(r+1));
 services.push(service);let node=servicesTree;
 for(let i=1;i<path.length;i++){const id=pathId(path.slice(0,i+1));let child=node.children.find(n=>n.id===id);if(!child){child={id,name:path[i],catalog:'services',family:service.taskArea,active:true,children:[]};node.children.push(child);}node=child;}
}
if(new Set(services.map(s=>s.sku)).size!==services.length)throw Error('Código duplicado.');
fs.writeFileSync('src/services.v61.generated.js','// Generated from the user matrix; amounts are per the stated sales/production unit.\nexport default '+JSON.stringify({source,services,taxonomy:[prior.trees.find(r=>r.catalog==='products'),servicesTree]},null,2)+';\n');
fs.writeFileSync('src/matrix.v61.generated.js','export default '+JSON.stringify([prior.trees.find(r=>r.catalog==='products'),servicesTree],null,2)+';\n');
console.log(JSON.stringify({services:services.length,unique:services.length}));
