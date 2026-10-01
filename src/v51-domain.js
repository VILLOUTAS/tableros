export const RELEASE = '5.1';
export const isV51 = settings => settings?.calculationVersion === RELEASE;
export const normalizeSearch = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export const internalUser = user => (user?.roles || [user?.role]).some(r => ['superadmin','admin','comercial','produccion','instalacion','logistica','supervisor','finanzas'].includes(r));
export const canSchedule = (user, kind) => (user?.roles || [user?.role]).some(r => ['superadmin','admin',kind === 'installations' ? 'instalacion' : 'produccion'].includes(r));
export const CALENDARS = {boards:'Tableros',slabs:'Placas',installations:'Instalaciones'};
export const SCHEDULE_STATES = {scheduled:'Programado',in_progress:'En ejecución',completed:'Terminado',cancelled:'Anulado'};
const root = (id,name,family,children) => ({id,name,family,active:true,children:children.map(([id,name,future])=>({id,name,family,active:!future,comingSoon:!!future}))});
export const TAXONOMY51 = [
  root('tableros','TABLEROS','boards', [['tab-melamina','Tableros de Melamina'],['tab-egr','Tableros Egr Decor'],['tab-chinos','Tableros Chinos'],['tab-otros','Otros Tableros']]),
  root('tapacantos','TAPACANTOS','boards', [['tap-general','Tapacantos'],['tap-egr','Tapacantos EGR'],['tap-chinos','Tapacantos Chinos']]),
  root('placas','PLACAS','slabs', [['neo-06','Neolith de 06mm'],['neo-12','Neolith de 12mm'],['cuarzo-18','Cuarzo 18mm',true],['granito-20','Granito 20mm',true]]),
  root('serv-tableros','SERVICIOS PARA TABLEROS','boards', [['dim-tableros','Dimensionados de Tableros'],['servicio-tableros','Servicios para Tableros']]),
  root('serv-placas','SERVICIOS PARA PLACAS','slabs', [['dim-placas','Dimensionados de Placas'],['servicio-placas','Servicios de Placas']]),
  root('otros-servicios','OTROS SERVICIOS','other', [['despachos','Despachos'],['armado','Armado de Muebles'],['inst-muebles','Servicios de Instalacion de Muebles'],['inst-placas','Servicios de Instalacion de Placas']]),
];
export const SERVICE_KEYS = {melamineCutRate:'SER-0043',acrylicCutRate:'SER-0042',styleliteCutRate:'SER-0032',stoneCutPerPlateRate:'SER-0041',stoneBevelRate:'SER-0039',stoneMiter45Rate:'SER-0040',edge04:'SER-0038',edge10:'SER-0037',edge15:'SER-0035',edge20:'SER-0036'};
export const FREIGHT_NAMES = {boards:'Melamina / otros tableros',acrylic:'Acrílico / EGR Decor',slabs:'Placas Neolith',hardware:'Salice',other:'Otros'};
export const FREIGHT51 = {boards:{base:10000,perKm:200},acrylic:{base:10000,perKm:120},slabs:{base:20000,perKm:150},hardware:{base:7500,perKm:50},other:{base:0,perKm:200}};
export function kerfValue(value, fallback=3) {
  const number = value === undefined || value === null || value === '' ? Number(fallback) : Number(value);
  if (!Number.isFinite(number) || number < 2 || number > 5) throw Object.assign(new Error('El consumo de disco debe estar entre 2 y 5 mm.'),{status:400});
  return number;
}
export function serviceKeyFor(material) {
  if (['stone','neolith'].includes(material.materialType)) return 'stoneCutPerPlateRate';
  if (material.cutServiceKey) return material.cutServiceKey;
  const text=normalizeSearch(material.name+' '+material.brand+' '+material.categoryName);
  return /stylelite/.test(text)?'styleliteCutRate':/acrilico|petlite|trunatur/.test(text)?'acrylicCutRate':'melamineCutRate';
}
export function effectiveConfig(config, services=[]) {
  const policies={...config.services};
  for(const [key,sku] of Object.entries(SERVICE_KEYS)) {
    const item=services.find(s=>s.sku===sku && s.active!==false);
    if(item) policies[key]={name:item.name,sku,price:item.netPrice,minPrice:item.minPrice,purchasePrice:item.purchasePrice,discountLimit:item.discountLimit};
  }
  return {...config,services:policies};
}
export function freightFamilies(projects, materials) {
  return [...new Set(projects.flatMap(p=>p.workType==='slabs'?['slabs']:(p.materialIds||[p.materialId]).map(id=>{
    const m=materials.find(x=>x.id===id)||p.priceSnapshot?.materials?.find(x=>x.id===id)||{};
    return m.taxonomyId==='tab-egr'||m.taxonomyId==='tab-chinos'||/acrilico|stylelite|petlite|trunatur/.test(normalizeSearch(m.brand))?'acrylic':'boards';
  })))];
}
export function successor(item, collection) {
  let current=item; const visited=new Set();
  while(current && !visited.has(current.id)) {
    visited.add(current.id);
    const next=collection.find(x=>x.replacesId===current.id) || collection.find(x=>x.id===current.successorId);
    if(!next) break;
    current=next;
  }
  return current;
}
export function updateQuoteProducts(quote, materials, edges) {
  const map={};
  for(const id of quote.materialIds||[quote.materialId]) {
    const old=materials.find(m=>m.id===id), next=successor(old,materials);
    if(!next||next.active===false) throw Object.assign(new Error(`Selecciona el producto vigente para ${old?.sku||id} · ${old?.name||''}. Su referencia histórica se conserva.`),{status:400});
    map[id]=next.id;
  }
  const edgeMap={};
  for(const p of quote.pieces||[]) for(const id of Object.values(p.edges||{}).filter(Boolean)) {
    const next=successor(edges.find(e=>e.id===id),edges);
    if(!next||next.active===false) throw Object.assign(new Error(`Selecciona el tapacanto vigente para ${edges.find(e=>e.id===id)?.sku||id}.`),{status:400});
    edgeMap[id]=next.id;
  }
  quote.materialIds=[...new Set(Object.values(map))]; quote.materialId=map[quote.materialId]||quote.materialIds[0];
  quote.pieces=(quote.pieces||[]).map(p=>({...p,materialId:map[p.materialId]||quote.materialId,edges:Object.fromEntries(Object.entries(p.edges||{}).map(([side,id])=>[side,edgeMap[id]||id]))}));
  quote.materialCustomizations=Object.fromEntries(Object.entries(quote.materialCustomizations||{}).map(([id,v])=>[map[id]||id,v]));
  quote.edgeCodeMap=Object.fromEntries(Object.entries(quote.edgeCodeMap||{}).map(([id,code])=>[edgeMap[id]||id,code]));
  return quote;
}
export function projectMatches(p, term) {
  const haystack=normalizeSearch([p.project?.projectName,p.project?.clientName,p.ownerName,p.assignedName,p.quoteName,p.id,p.invoiceNumber].join(' '));
  return normalizeSearch(term).split(/\s+/).every(word=>haystack.includes(word));
}
export function validDate(value) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;
  const date=new Date(value+'T12:00:00Z');return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;
}
