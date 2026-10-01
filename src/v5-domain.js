import { RELEASE, internalUser } from './v51-domain.js';
export const V5 = RELEASE;
export function calculationSignature(p={}) {
  const settings=p.settings||{};
  return JSON.stringify({materialIds:p.materialIds?.length?p.materialIds:[p.materialId],
    custom:Object.entries(p.materialCustomizations||{}).sort(([a],[b])=>a.localeCompare(b)),
    pieces:(p.pieces||[]).map(x=>[x.materialId||p.materialId,Number(x.length),Number(x.width),Number(x.quantity),x.grain,x.measurementMode||'finished',
      ['top','bottom','left','right'].map(side=>x.edges?.[side]||null),['top','bottom','left','right'].map(side=>x.finishes?.[side]||'rough')]),
    settings:['calculationVersion','kerf','perimeterTrim','neolithTrim','optimizationMode','boardDiscount','edgeDiscount','servicesDiscount','melamineCutRate','specialCutRate','stoneCutPerPlateRate','stoneBevelRate','stoneMiter45Rate','includeStoneMaterial','acrylicCutRate','styleliteCutRate'].map(k=>[k,settings[k]??null])});
}
export const ROLE_LABELS = {
  superadmin: 'Superadministrador', admin: 'Administrador', comercial: 'Comercial',
  produccion: 'Producción', instalacion: 'Instalación', logistica: 'Logística',
  supervisor: 'Supervisor', finanzas: 'Finanzas', cliente: 'Cliente',
};
export const rolesOf = (user = {}) => [...new Set((Array.isArray(user?.roles) ? user.roles : [user?.role]).filter(r => ROLE_LABELS[r]))];
export function permitted(user, action) {
  const roles = rolesOf(user);
  if (roles.includes('superadmin')) return true;
  const grants = {
    users: [], settings: [], costs: ['finanzas'], reports: ['admin','finanzas','supervisor','comercial','produccion','logistica'],
    catalog: ['admin','produccion','finanzas'], categories: ['admin'], salesPrices: ['admin'],
    products: ['admin','produccion'], quote: ['admin','comercial','cliente'], discount: ['admin','comercial'],
    dispatch: ['admin','logistica','produccion'], allProjects: ['admin','produccion','logistica','supervisor','finanzas','comercial','instalacion'],
  };
  return (grants[action] || []).some(r => roles.includes(r));
}
const children = (prefix, names) => names.map((name, index) => ({id: `${prefix}-${index+1}`, name, active: true}));
export const DEFAULT_TAXONOMY = [
  {id:'aglomerados',name:'Tableros Aglomerados',family:'boards',active:true,children:children('ag',['Melaminas Egger 15mm','Melaminas Egger 18mm','Melaminas otras marcas 15mm','Melaminas otras marcas 18mm'])},
  {id:'mdf',name:'Tableros MDF',family:'boards',active:true,children:children('mdf',['Stylelite','Petlite','Trunatur','Delgados una cara'])},
  {id:'otros-tableros',name:'Otros Tableros',family:'boards',active:true,children:children('ot',['Maderas','Chinos'])},
  {id:'neolith',name:'Neolith',family:'slabs',active:true,children:children('neo',['06mm','12mm'])},
  {id:'otras-placas',name:'Otras Placas',family:'slabs',active:true,children:children('op',['Granito','Cuarzo'])},
  {id:'bisagras',name:'Bisagras',family:'hardware',active:true,children:children('bi',['Estándar','Titanio','Grandes Espesores','Económica s800','Conecta','Perfil Metálico','Air','Especiales'])},
  {id:'guias',name:'Guías Correderas',family:'hardware',active:true,children:['Futura','Progresa','Shelf'].map((name,index)=>({id:`gu-${index}`,name,active:true,children:children(`gu-${index}`,['Cierre Suave','Cierre Push'])}))},
  {id:'elevacion',name:'Sistemas de Elevación',family:'hardware',active:true,children:children('el',['Evolift Simple','Evolift Doble','Evolift Paralelo','Wind','Pacta'])},
  {id:'tapacantos',name:'Tapacantos',family:'boards',active:true,children:children('ta',['PVC','ABS','Otros'])},
  {id:'servicios',name:'Servicios',family:'other',active:true,children:children('se',['Corte','Tapacanteado','Terminaciones de piedra'])},
];
export function taxonomyPaths(nodes=DEFAULT_TAXONOMY, prefix=[], enabled=true) {
  return nodes.flatMap(n => [{...n,active:enabled&&n.active!==false,path:[...prefix,n.name].join(' / ')},...taxonomyPaths(n.children||[],[...prefix,n.name],enabled&&n.active!==false)]);
}
export const DEFAULT_CONFIG = {
  version: 1,
  origin: {label:'Casa Diseño · Bodega',address:'53GC+2J, 4030000 Concepción, Bío Bío',mapsUrl:'https://share.google/aCra9fXf5faxsNuYB'},
  freightRates: {boards:{base:10000,perKm:100},slabs:{base:20000,perKm:100},hardware:{base:7500,perKm:50},other:{base:0,perKm:200}},
  communes: [], // Se cargan distancias viales verificadas. Nunca distancias inventadas ni en línea recta.
  taxonomy: DEFAULT_TAXONOMY,
  services: {
    melamineCutRate:{name:'Corte melamina',price:7500,minPrice:0,purchasePrice:0},
    specialCutRate:{name:'Corte otros tableros',price:10500,minPrice:0,purchasePrice:0},
    stoneCutPerPlateRate:{name:'Corte por placa',price:75000,minPrice:0,purchasePrice:0},
    stoneBevelRate:{name:'Biselado / Pulido',price:12500,minPrice:0,purchasePrice:0},
    stoneMiter45Rate:{name:'Corte 45°',price:7500,minPrice:0,purchasePrice:0},
  },
  salesBasis: 'facturado_pagado',
};
export function mergeConfig(value={}) {
  return {...structuredClone(DEFAULT_CONFIG),...value,
    origin:{...DEFAULT_CONFIG.origin,...value.origin},
    freightRates:{...DEFAULT_CONFIG.freightRates,...value.freightRates},
    services:{...DEFAULT_CONFIG.services,...value.services},
    taxonomy:Array.isArray(value.taxonomy)?value.taxonomy:structuredClone(DEFAULT_TAXONOMY),
    communes:Array.isArray(value.communes)?value.communes:[],
  };
}
export function discountLimit(price, item={}) {
  if (Number.isFinite(item.discountLimit)) return Math.max(0,Math.min(50,item.discountLimit));
  if (!(price>0)) return 0;
  const floor = Math.max(0,Number(item.minPrice)||0,Number(item.purchasePrice)||0);
  return Math.max(0,Math.min(50,(price-floor)/price*100));
}
export function discountedLine(price, quantity, requested, policy={}) {
  const limit=discountLimit(price,policy);
  const applied=Math.min(limit,Math.max(0,Number(requested)||0),50);
  const gross=Number(price||0)*Number(quantity||0);
  const belowFloor=Number(price)<Math.max(Number(policy.minPrice)||0,Number(policy.purchasePrice)||0);
  return {gross,discountPercent:applied,discountAmount:gross*applied/100,net:gross*(1-applied/100),limit,belowFloor};
}
export function calculateFreight(config, communeId, families=[]) {
  const c=mergeConfig(config), commune=c.communes.find(x=>x.id===communeId&&x.active!==false);
  if (!commune || !Number.isFinite(Number(commune.roadKm)) || commune.roadKm==='' || Number(commune.roadKm)<0 || !commune.verified) return {status:'pending',net:null,reason:'Falta una distancia por carretera verificada para esta comuna.'};
  const unique=[...new Set(families.filter(x=>c.freightRates[x]))];
  if(!unique.length) return {status:'pending',net:null,reason:'Selecciona al menos una familia.'};
  const candidates=unique.map(family=>({family,net:Math.round(Number(c.freightRates[family].base)+Number(c.freightRates[family].perKm)*Number(commune.roadKm))}));
  const selected=candidates.reduce((a,b)=>b.net>a.net?b:a);
  return {status:'quoted',net:selected.net,vat:Math.round(selected.net*0.19),total:Math.round(selected.net*1.19),family:selected.family,candidates,roadKm:Number(commune.roadKm),communeId:commune.id,commune:commune.name,origin:{...c.origin},basis:'Centro de la comuna · carretera · solo ida',configVersion:c.version};
}
export function monthInChile(date) {
  if(!date || Number.isNaN(new Date(date).getTime())) return '';
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit'}).formatToParts(new Date(date));
  return `${parts.find(x=>x.type==='year').value}-${parts.find(x=>x.type==='month').value}`;
}
export function monthlyDashboard(projects, month, salesBasis='facturado_pagado', dispatches=[]) {
  const sales={}, families={}, result={month,salesBasis,netSales:0,boards:0,slabs:0,edgeMeters:0,bevelMeters:0,miter45Meters:0,undatedSales:0,undatedProduction:0};
  for(const p of projects){
    const salesEvent=p.milestones?.[salesBasis];
    if(salesEvent && monthInChile(salesEvent.at)===month){
      const net=Number(salesEvent.net)||0, seller=salesEvent.sellerName||p.assignedName||p.ownerName||'Sin comercial';
      sales[seller]=(sales[seller]||0)+net; result.netSales+=net;
      for(const [family,amount] of Object.entries(salesEvent.families||{[p.workType==='slabs'?'Placas':'Tableros']:net})) families[family]=(families[family]||0)+Number(amount||0);
    } else if(!salesEvent && ['facturado_pagado','produccion','despacho','entregado'].includes(p.project?.status)) result.undatedSales++;
    const production=p.milestones?.despacho;
    if(production && monthInChile(production.at)===month){
      for(const field of ['boards','slabs','edgeMeters','bevelMeters','miter45Meters']) result[field]+=Number(production[field])||0;
    } else if(!production && ['despacho','entregado'].includes(p.project?.status)) result.undatedProduction++;
  }
  // Fletes son una familia independiente; no se suman por cada cotización del envío.
  for(const d of dispatches){if(d.invoiceDate && d.invoiceNumber && monthInChile(`${d.invoiceDate}T12:00:00-03:00`)===month && d.status!=='cancelled'){
    const net=Number(d.quote?.net)||0;result.netSales+=net;families.Despachos=(families.Despachos||0)+net;sales[d.sellerName||'Despachos']=(sales[d.sellerName||'Despachos']||0)+net;
  }}
  return {...result,sales,families};
}
export function publicCatalogItem(item,user) {
  const copy={...item};
  copy.discountLimit=permitted(user,'discount')?discountLimit(Number(item.netPrice??item.price)||0,item):0;
  copy.serviceDiscountLimit=permitted(user,'discount')?discountLimit(Number(item.serviceRate)||0,{minPrice:item.serviceMinPrice,purchasePrice:item.servicePurchasePrice}):0;
  if(!permitted(user,'costs')) for(const key of ['purchasePrice','minPrice','servicePurchasePrice','serviceMinPrice']) delete copy[key];
  if(!internalUser(user)) for(const key of ['supplierCode','sourceId','originCode','barcode']) delete copy[key];
  return copy;
}
export function stripCosts(value,user) {
  if(permitted(user,'costs'))return value;
  if(value instanceof Date)return value;
  if(Array.isArray(value))return value.map(x=>stripCosts(x,user));
  if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['purchasePrice','minPrice','servicePurchasePrice','serviceMinPrice','costSnapshot',...(!internalUser(user)?['supplierCode','sourceId','originCode','barcode']:[])].includes(key)).map(([key,v])=>[key,stripCosts(v,user)]));
  return value;
}
