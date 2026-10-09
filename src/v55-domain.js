// Reglas compartidas V5.5. Los cálculos anteriores conservan sus motores.
export const VERSION55='5.5';
export const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export const slug=v=>normalize(v).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const group=(id,name,family,children)=>({id,name,family,active:true,children:children.map(([id,name])=>({id,name,family,active:true}))});
export const TAXONOMY55=[
  group('tableros','TABLEROS','boards',[['tab-melamina','Tableros de Melamina'],['tab-egr','Tableros EGR Decor'],['tab-chinos','Tableros Chinos'],['tab-otros','Otros Tableros']]),
  group('tapacantos','TAPACANTOS','boards',[['tap-general','Tapacantos'],['tap-egr','Tapacantos EGR'],['tap-chinos','Tapacantos Chinos']]),
  group('placas','PLACAS','slabs',[['neo-06','Neolith de 06mm'],['neo-12','Neolith de 12mm'],['neo-palmeta','Neolith Palmetas'],['cuarzo-18','Cuarzo 18mm'],['cuarzo-20','Cuarzo 20mm'],['granito-20','Granito 20mm']]),
  group('serv-tableros','SERVICIOS PARA TABLEROS','boards',[['dim-tableros','Dimensionados de Tableros'],['servicio-tableros','Servicios para Tableros']]),
  group('serv-placas','SERVICIOS PARA PLACAS','slabs',[['dim-placas','Dimensionados de Placas'],['servicio-placas','Servicios de Placas']]),
  group('otros-servicios','OTROS SERVICIOS','other',[['despachos','Despachos'],['armado','Fabricación y armado de muebles'],['fabricacion-placas','Fabricación de placas'],['inst-muebles','Instalación de muebles'],['inst-placas','Instalación de placas']]),
  group('herrajes','HERRAJES SALICE','hardware',[['salice-bisagras','Bisagras, bases y accesorios'],['salice-guias','Guías y acoplamientos'],['salice-elevacion','Sistemas de elevación'],['salice-puertas','Sistemas de puertas'],['salice-lineabox','Lineabox'],['salice-excessories','Excessories'],['salice-organizadores','Organizadores'],['salice-pin','PIN'],['salice-otros','Perfiles, Push y Smove']]),
];
export const SERVICE_KEYS55={melamineCutRate:'SER-DIM-01',acrylicCutRate:'SER-DIM-02',styleliteCutRate:'SER-DIM-03',specialCutRate:'SER-DIM-04',stoneCutPerPlateRate:'SER-NEO-01',neolith6CutRate:'SER-NEO-02',otherSlabCutRate:'SER-PLA-01',stoneBevelRate:'SER-NEO-22',otherSlabBevelRate:'SER-PLA-21',stoneMiter45Rate:'SER-NEO-21',edge04:'SER-0038',edge10:'SER-0037',edge15:'SER-0035',edge20:'SER-0036'};
export const PRODUCTIVITY55=Object.fromEntries([
  ['SER-0038',1,'ml','minute'],['SER-0037',1,'ml','minute'],['SER-0035',1,'ml','minute'],['SER-0036',1,'ml','minute'],
  ['SER-NEO-02',8,'placa','day'],['SER-NEO-01',6,'placa','day'],['SER-NEO-21',4,'ml','hour'],['SER-NEO-22',2,'ml','hour'],
  ['SER-PLA-01',8,'placa','day'],['SER-PLA-21',4,'ml','hour'],['SER-NEO-23',.5,'placa','day'],['SER-PLA-22',.5,'placa','day'],
  ['SER-NEO-24',1,'unidad','hour'],['SER-PLA-23',1,'unidad','hour'],['SER-112',1,'gl','day'],
  ['SER-DIM-02',5,'tablero','day'],['SER-DIM-01',30,'tablero','day'],['SER-DIM-04',10,'tablero','day'],['SER-DIM-03',20,'tablero','day'],
].map(([sku,quantity,unit,period])=>[sku,{quantity,unit,period}]));
export const WEIGHTS55={'tab-melamina':60,'tab-egr':70,'tab-chinos':80,'tab-otros':80,'tap-general':.01,'tap-egr':.01,'tap-chinos':.01,'neo-06':90,'neo-12':180,'cuarzo-18':140,'granito-20':150,hinge:.05,guidePair:1,liftSystem:2,otherSystem:50};
export const minuteRate=p=>!p?null:Number(p.quantity)/(p.period==='minute'?1:p.period==='hour'?60:540);
export function workingMinutes(date){const day=new Date(date+'T12:00:00Z').getUTCDay();return day===0||day===6?0:day===5?360:540;}
export const dailyTarget=(policy,date)=>(minuteRate(policy)||0)*workingMinutes(date);
export function planWork(startDate,startTime,minutes){
  let date=new Date(startDate+'T00:00:00Z'),remaining=Number(minutes),cursor=Number(startTime.split(':')[0])*60+Number(startTime.split(':')[1]);
  if(!Number.isFinite(remaining)||remaining<0||remaining>540*1000)throw Error('Duración fuera de rango.');
  for(let guard=0;guard<1500;guard++){
    const day=date.getUTCDay(),slots=day===0||day===6?[]:day===5?[[480,840]]:[[480,840],[870,1050]];
    for(const [a,b] of slots){cursor=Math.max(a,cursor);if(cursor>=b)continue;if(remaining<=b-cursor){const end=cursor+Math.ceil(remaining);return {date:date.toISOString().slice(0,10),time:String(Math.floor(end/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0')};}remaining-=b-cursor;cursor=b;}
    date.setUTCDate(date.getUTCDate()+1);cursor=480;
  }throw Error('No se pudo programar el término.');
}
export function weightFor(item,config){
  const override=config.productWeights?.[item.sku];
  if(override!==undefined&&override!==null&&override!=='')return Number(override);
  if(item.productType==='service')return item.includesMaterial?null:0;
  const key=item.weightKey||item.taxonomyId;
  return config.weights?.[key]??null;
}
export function freight55(config,communeId,lines=[],discount=0,delivery=true){
  if(!delivery)return {status:'pickup',net:0,vat:0,total:0,weightKg:0,release:'5.5'};
  const commune=config.routes?.find(c=>c.id===communeId&&c.active!==false);
  if(!commune)return {status:'pending',net:null,reason:'Selecciona una comuna habilitada.'};
  if(!lines.length)return {status:'pending',net:null,reason:'Agrega los productos a despachar.'};
  const missing=[],detail=[];let weightKg=0;
  for(const l of lines){
    if(!(Number(l.quantity)>0))continue;
    const kg=weightFor(l,config);
    if(kg===null||!Number.isFinite(kg)||kg<0){missing.push(l.sku);continue;}
    const weight=kg*Number(l.quantity);weightKg+=weight;detail.push({sku:l.sku,quantity:Number(l.quantity),kgPerUnit:kg,weightKg:weight});
  }
  if(missing.length)return {status:'pending',net:null,missing:[...new Set(missing)],weightKg,reason:'Falta configurar el peso de: '+[...new Set(missing)].join(', ')};
  const reference=weightKg*Number(commune.ratePerKg),salesValue=reference*1.2,requestedDiscount=Math.max(0,Math.min(50,Number(discount)||0));
  const minimumNet=Number(commune.minimumNet??(commune.local?5000:15000));
  const net=Math.max(minimumNet,Math.round(salesValue*(1-requestedDiscount/100))),vat=Math.round(net*.19);
  return {status:'quoted',release:'5.5',communeId,commune:commune.name,ratePerKg:Number(commune.ratePerKg),weightKg,detail,reference,salesValue,markup:1.2,requestedDiscount,effectiveDiscount:salesValue>0?Math.max(0,(1-net/salesValue)*100):0,minimumNet,net,vat,total:net+vat,configVersion:config.version,basis:'Productos completos utilizados, incluidos retazos y sobrantes'};
}
export function shippingLines(projects,catalog){
  const all=[...catalog.materials,...catalog.edgeBands,...catalog.accessories,...catalog.services],lines=[];
  for(const p of projects){
    const snap=p.calculationSnapshot||{};
    for(const row of snap.materialSummaries||[]){const m=p.priceSnapshot?.materials?.find(m=>m.id===row.materialId)||all.find(m=>m.id===row.materialId);if(m)lines.push({...m,quantity:row.boardCount});}
    for(const row of snap.edgeSummaries||[]){const e=p.priceSnapshot?.edgeBands?.find(e=>e.id===row.edgeId)||all.find(e=>e.id===row.edgeId);if(e)lines.push({...e,quantity:row.materialMeters??row.meters});}
    for(const row of p.saleLines||[]){if(row.includedInSystem)continue;const item=row.productSnapshot||all.find(i=>i.id===row.productId);if(item)lines.push({...item,quantity:row.quantity,weightKey:row.weightKey||item.weightKey});}
  }
  return lines;
}
export function validateComponents(lines,catalog,rules={}){
  const errors=[],items=new Map(catalog.map(p=>[p.id,p])),totals=new Map();
  for(const l of lines)totals.set(l.productId,(totals.get(l.productId)||0)+Number(l.quantity));
  const reserved=new Map();
  for(const l of lines){const p=items.get(l.productId);if(!p)continue;const rule=rules[p.sku]||p.componentRule;
    if(p.compatibilityPending&&!rule){errors.push('Configura los complementos compatibles de '+p.sku+'.');continue;}
    for(const req of rule?.required||[]){
      const ids=catalog.filter(c=>req.allowedSkus.includes(c.sku)).map(c=>c.id);let need=Number(l.quantity)*Number(req.quantity||1);
      for(const id of ids){const available=Math.max(0,(totals.get(id)||0)-(reserved.get(id)||0)),used=Math.min(need,available);reserved.set(id,(reserved.get(id)||0)+used);need-=used;}
      if(need>1e-8)errors.push(`${p.sku}: falta ${req.label} compatible (${need} ${req.unit||'unidad(es)'}).`);
    }
  }return errors;
}
export function payAmount(rate,quantity,minutes){
  if(!rate)return null;
  return Math.round((rate.mode==='hour'?0:quantity*Number(rate.unitRate||0))+(rate.mode==='unit'?0:minutes/60*Number(rate.hourRate||0)));
}
export function productionReport(tasks,entries,operators,policies,from,to){
  const rows=[];
  for(const e of entries.filter(e=>(!from||e.date>=from)&&(!to||e.date<=to)&&e.validated)){
    const t=tasks.find(t=>t.id===e.taskId);if(!t)continue;
    let r=rows.find(r=>r.operatorId===t.operatorId&&r.serviceSku===t.serviceSku);
    if(!r){r={operatorId:t.operatorId,operator:operators.find(o=>o.id===t.operatorId)?.name||t.operatorId,serviceSku:t.serviceSku,unit:policies[t.serviceSku]?.unit||t.unit,quantity:0,minutes:0,payTotal:0,missingRates:0,expectedMinutes:0,projects:[]};rows.push(r);}
    r.quantity+=e.quantity;r.minutes+=e.minutes;r.expectedMinutes+=minuteRate(policies[t.serviceSku])?e.quantity/minuteRate(policies[t.serviceSku]):0;
    if(e.payAmount===null)r.missingRates++;else r.payTotal+=Number(e.payAmount)||0;
    if(!r.projects.includes(t.quoteId))r.projects.push(t.quoteId);
  }return rows.map(r=>({...r,performancePercent:r.minutes?100*r.expectedMinutes/r.minutes:null}));
}
export function serviceDemand(project){
  const demand={},add=(sku,n)=>{if(sku)demand[sku]=(demand[sku]||0)+Number(n||0);},snap=project.calculationSnapshot||{};
  for(const r of snap.materialSummaries||[]){const m=project.priceSnapshot?.materials?.find(m=>m.id===r.materialId);add(SERVICE_KEYS55[m?.cutServiceKey]||(r.isStone?'SER-NEO-01':'SER-DIM-01'),r.boardCount);}
  for(const r of snap.edgeSummaries||[]){const e=project.priceSnapshot?.edgeBands?.find(e=>e.id===r.edgeId);add(e?.serviceSku,r.meters);}
  for(const r of snap.finishSummaries||[])add(r.finishId==='miter45'?'SER-NEO-21':project.priceSnapshot?.materials?.every(m=>m.materialType==='stone')?'SER-PLA-21':'SER-NEO-22',r.meters);
  for(const l of project.saleLines||[])if(l.productSnapshot?.productType==='service')add(l.sku,l.quantity);
  return demand;
}
export function materialCostLines(project){
 const lines=[],snap=project.calculationSnapshot||{};
 const add=(p,quantity)=>{if(p)lines.push({id:'auto:'+p.id,source:'quote',kind:'input',serviceSku:'',sku:p.sku,name:p.name,unit:p.unit||'unidad',plannedQuantity:quantity,actualQuantity:quantity,unitCost:p.purchasePrice??null});};
 for(const r of snap.materialSummaries||[]){const p=project.priceSnapshot?.materials?.find(p=>p.id===r.materialId);if(!r.isStone||project.settings?.includeStoneMaterial)add(p,r.boardCount);}
 for(const r of snap.edgeSummaries||[])add(project.priceSnapshot?.edgeBands?.find(p=>p.id===r.edgeId),r.materialMeters??r.meters);
 for(const l of project.saleLines||[])if(l.productSnapshot?.productType!=='service')add(l.productSnapshot,l.quantity);
 return lines;
}
export function productionReady(projects,tasks){
 const required=tasks.filter(t=>t.required&&['boards','slabs','installations'].includes(t.area));
 if(!required.length||required.some(t=>t.status!=='completed'))return false;
 return projects.every(p=>Object.entries(serviceDemand(p)).every(([sku,quantity])=>required.filter(t=>t.quoteId===p.id&&t.serviceSku===sku).reduce((s,t)=>s+t.quantity,0)+1e-8>=quantity));
}
