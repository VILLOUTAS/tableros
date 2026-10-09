import {randomUUID} from 'node:crypto';
import {atomic,initializeV55} from './v55-server.mjs';
import {TAXONOMY60,decorate60,laborPayables60} from './src/v60-domain.js';
import {permitted,mergeConfig,taxonomyPaths} from './src/v5-domain.js';
import {validDate} from './src/v51-domain.js';
import {fail} from './v5-server.mjs';
import {TAXONOMY55} from './src/v55-domain.js';
export async function initializeV60(db){
 await initializeV55(db);
 await atomic(db,'migration-v60',async tx=>{
  if(await tx.getV5('v60:migration'))return;
  const previous=await tx.getV5('config');await tx.putV5('v60:config-before',previous||{});
  const config=mergeConfig(previous);
  const taxonomy=structuredClone(TAXONOMY60),baseline=new Set(taxonomyPaths(TAXONOMY55).map(n=>n.id));
  const custom=taxonomyPaths(config.taxonomy).filter(n=>!baseline.has(n.id)&&!n.children?.length);
  for(const node of custom){const kind=/serv|dim|inst|armado/.test(node.id)?'services':'products',root=taxonomy.find(r=>r.catalog===kind);root.children.push({...node,catalog:kind,children:[]});}
  await tx.putV5('config',{...config,taxonomy,version:config.version+1});
  await tx.putV5('v60:migration',{release:'6.0',at:new Date().toISOString(),source:'MATRIZ_PRODUCTOS_SERVICIOS_V6.xlsx'});
 });
}
export async function enrichCatalog60(catalog,db){
 const nodes=taxonomyPaths(mergeConfig(await db.getV5('config')).taxonomy);
 for(const key of ['materials','edgeBands','accessories','services'])catalog[key]=catalog[key].map(p=>{
  const configured=nodes.find(n=>n.id===p.taxonomyId&&n.catalog);
  const item=decorate60(configured?{...p,catalogPath:configured.path.split(' / '),catalogPaths:[configured.path.split(' / ')]}:p);
  if(nodes.find(n=>n.id===item.taxonomyId)?.active===false)item.active=false;
  if(key==='services')item.pricingPending=item.netPrice==null||item.minPrice==null||item.unitPending===true;
  return item;
 });
 return catalog;
}
export function registerV60Routes(app,{db,authenticate,csrf}){
 const guard=action=>(req,res,next)=>permitted(req.auth.user,action)?next():res.status(403).json({error:'Sin permiso para consultar o registrar pagos de mano de obra.'});
 app.get('/api/v60/labor-payables',authenticate,guard('laborPayables'),async(req,res)=>{
  const month=String(req.query.month||'');if(month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw fail('Mes inválido.');
  const ids=new Set((await db.listProjects(req.auth.user)).map(p=>p.id)),tasks=(await db.listV5('task:')).filter(t=>ids.has(t.quoteId));
  const rows=laborPayables60(tasks,await db.listV5('entry:'),await db.listV5('operator:'),await db.listV5('labor-payment:'),month);
  res.json({month,rows,totals:{producedAmount:rows.reduce((n,r)=>n+r.producedAmount,0),paidAmount:rows.reduce((n,r)=>n+r.paidAmount,0),pendingAmount:rows.reduce((n,r)=>n+r.pendingAmount,0),missingRates:rows.reduce((n,r)=>n+r.missingRates,0)}});
 });
 app.post('/api/v60/labor-payments',authenticate,csrf,guard('laborPayments'),async(req,res)=>{
  const b=req.body,entryIds=[...new Set(b.entryIds||[])];if(!Array.isArray(b.entryIds)||!entryIds.length||entryIds.length>1000||entryIds.some(id=>typeof id!=='string'))throw fail('Selecciona los registros que se pagaron.');
  if(!validDate(b.date)||!String(b.reference||'').trim())throw fail('Indica fecha y referencia del pago.');
  const result=await atomic(db,'labor-payments',async tx=>{
   const paid=new Set((await tx.listV5('labor-payment:')).flatMap(p=>p.entryIds));
   if(entryIds.some(id=>paid.has(id)))throw fail('Alguno de los registros ya fue pagado. Actualiza el resumen.',409);
   const entries=await Promise.all(entryIds.map(id=>tx.getV5('entry:'+id)));
   if(entries.some(e=>!e?.validated||e.payAmount==null||!Number.isFinite(Number(e.payAmount))||Number(e.payAmount)<=0))throw fail('Solo se pueden pagar registros validados con tarifa e importe positivo.');
   const visible=new Set((await tx.listProjects(req.auth.user)).map(p=>p.id));if(entries.some(e=>!visible.has(e.quoteId)))throw fail('Registro fuera de tus proyectos.',403);
   const payment={id:randomUUID(),entryIds,amount:entries.reduce((n,e)=>n+Number(e.payAmount),0),date:b.date,reference:String(b.reference).trim().slice(0,250),createdAt:new Date().toISOString(),createdBy:req.auth.user.id};
   await tx.putV5('labor-payment:'+payment.id,payment);return payment;
  });res.status(201).json({payment:result});
 });
}
