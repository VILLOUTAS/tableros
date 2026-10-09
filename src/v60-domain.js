import matrix from './matrix.v60.generated.js';
export const TAXONOMY60=matrix.trees;
const row=n=>matrix.rows.find(r=>r.row===n);
export const SERVICE_ROWS60={
 'SER-DIM-01':[45],'SER-DIM-03':[46],'SER-DIM-04':[47],'SER-DIM-02':[48],
 'SER-0038':[49],'SER-0037':[50],'SER-0035':[51],'SER-0036':[52],
 'SER-MOB-001':[53],'SER-MOB-002':[54],'SER-MOB-003':[55],
 'SER-NEO-02':[66],'SER-NEO-01':[67],'SER-PLA-01':[68,69],
 'SER-NEO-22':[71],'SER-PLA-21':[71],'SER-NEO-21':[72],
 'SER-NEO-24':[73],'SER-PLA-23':[73],
 '15-2026-0005':[77],'15-2026-0009':[77],'15-2026-0008':[77],
 'SER-0044':[111],
};
export function paths60(p){
 if(p.catalogPaths?.length)return p.catalogPaths;
 if(p.catalogPath?.length)return [p.catalogPath];
 if(p.productType==='service')return (SERVICE_ROWS60[p.sku]||[]).map(n=>row(n).path);
 let n;
 const text=[p.name,p.brand,p.categoryName,p.sourceCategory].join(' ').toUpperCase();
 if(p.productType==='edge'){
  const t=Number(p.thickness),index=t<=.45?0:t<2?1:2;
  if(p.taxonomyId==='tap-egr')n=/PETLITE/.test(text)?17:/TRUNATUR/.test(text)?19:18;
  else if(p.taxonomyId==='tap-chinos')n=20;
  else if(/MADERA/.test(text))n=21;
  else n=(/EGGER/.test(text)?11:14)+index;
 }else if(['stone','neolith'].includes(p.materialType)||/^(neo|cuarzo|granito)/.test(p.taxonomyId||'')){
  n=/FACHADA/.test(text)?25:/PALMETA/.test(text)||p.taxonomyId==='neo-palmeta'?26:/GRANITO/.test(text)?27:/CUARZO/.test(text)?28:Number(p.thickness)===6?24:23;
 }else if(p.productType==='accessory'){
  n=p.taxonomyId==='salice-bisagras'?29:p.taxonomyId==='salice-guias'?30:p.taxonomyId==='salice-elevacion'?31:p.taxonomyId==='salice-puertas'||/BORTOLUZZI/.test(text)?33:32;
 }else{
  n=p.taxonomyId==='tab-egr'?(/PETLITE/.test(text)?5:/TRUNATUR/.test(text)?7:6):p.taxonomyId==='tab-chinos'?8:/MADERA/.test(text)&&!/MELAMINA/.test(text)?9:p.taxonomyId==='tab-melamina'?(/EGGER/.test(text)?1:3)+(Number(p.thickness)===18?1:0):10;
 }
 return n?[row(n).path]:[];
}
export function leaf60(path){return matrix.rows.find(r=>r.path.join('/')===path.join('/'));}
export function decorate60(p){
 const paths=paths60(p);if(!paths.length)return p;
 return {...p,weightKey:p.weightKey||p.taxonomyId,catalogPaths:paths,catalogPath:paths[0],taxonomyId:leaf60(paths[0])?.id||p.taxonomyId,taskArea:p.taskArea||(p.productType==='service'?(/INSTALACION/.test(paths[0][2])?'installations':paths[0][1]==='TABLEROS'?'boards':paths[0][1]==='PLACAS'?'slabs':'installations'):undefined)};
}
export function quoteWorkAreas60(p){
 const areas=new Set(p.workType==='boards'||p.workType==='slabs'?[p.workType]:[]);
 for(const l of p.saleLines||[])if(l.productSnapshot?.productType==='service'){
  const item=decorate60(l.productSnapshot);if(item.taskArea)areas.add(item.taskArea);
 }
 return [...areas];
}
// Existing production services absent from the new matrix remain available for
// historical quotes, operational work and administration; they add no menu leaf.
export function newServices60(existing){
 const covered=new Set(existing.flatMap(p=>SERVICE_ROWS60[p.sku]||[]));
 return matrix.rows.filter(r=>r.path[0]==='SERVICIOS'&&!covered.has(r.row)).map(r=>{
  const label=r.path.slice(2).join(' · '),last=r.path.at(-1),unit=/\bML\b/.test(last)?'ml':/\bM2\b/.test(last)?'m²':r.row===73?'unidad':r.row>=66&&r.row<=69?'placa':r.row<=48?'tablero':r.row>=53&&r.row<=65||r.row>=90&&r.row<=116?'unidad':'gl';
  return {id:'v60-service-'+r.row,sku:'V6-SRV-'+String(r.row).padStart(3,'0'),provisionalCode:true,name:label,productType:'service',catalogRelease:'6.0',active:true,unit,unitPending:last==='FACHADAS'||r.row>=118,netPrice:null,minPrice:null,purchasePrice:null,pricingPending:true,description:'Servicio incorporado desde la matriz. Configurar código definitivo, unidad, costo, venta y venta mínima.',catalogPath:r.path,catalogPaths:[r.path],taxonomyId:r.id,taskArea:/INSTALACION/.test(r.path.slice(2).join(' '))?'installations':r.path[1]==='TABLEROS'?'boards':r.path[1]==='PLACAS'?'slabs':'installations'};
 });
}
export function laborPayables60(tasks,entries,operators,settlements=[],month=''){
 const taskMap=new Map(tasks.map(t=>[t.id,t])),paid=new Set(settlements.flatMap(s=>s.entryIds||[])),rows=new Map();
 for(const e of entries){const t=taskMap.get(e.taskId);if(!e.validated||!t)continue;
  const inPeriod=!month||e.date?.slice(0,7)===month,unpriced=e.payAmount==null,settled=paid.has(e.id),pending=!settled&&(unpriced||Number(e.payAmount)>0);
  if(!inPeriod&&!pending)continue;
  let r=rows.get(t.operatorId);if(!r){r={operatorId:t.operatorId,operator:operators.find(o=>o.id===t.operatorId)?.name||t.operator||t.operatorId,producedAmount:0,paidAmount:0,pendingAmount:0,missingRates:0,services:[],entries:[]};rows.set(t.operatorId,r);}
  const amount=Number(e.payAmount)||0;if(inPeriod)r.producedAmount+=amount;if(inPeriod&&settled)r.paidAmount+=amount;if(pending){r.pendingAmount+=amount;if(unpriced)r.missingRates++;}
  let service=r.services.find(s=>s.serviceSku===t.serviceSku);if(!service){service={serviceSku:t.serviceSku,name:t.name,unit:t.unit,quantity:0,pendingQuantity:0,pendingAmount:0,missingRates:0};r.services.push(service);}if(inPeriod)service.quantity+=Number(e.quantity)||0;if(pending){service.pendingQuantity+=Number(e.quantity)||0;service.pendingAmount+=amount;if(unpriced)service.missingRates++;}
  r.entries.push({id:e.id,quoteId:e.quoteId,date:e.date,serviceSku:t.serviceSku,name:t.name,unit:t.unit,quantity:e.quantity,amount:e.payAmount,status:unpriced?'unpriced':settled?'paid':amount===0?'zero':'pending'});
 }
 return [...rows.values()].sort((a,b)=>a.operator.localeCompare(b.operator,'es'));
}
