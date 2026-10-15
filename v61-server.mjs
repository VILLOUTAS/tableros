import {createHash,randomUUID} from 'node:crypto';
import {atomic} from './v55-server.mjs';
import {initializeV60} from './v60-server.mjs';
import {TAXONOMY61,OLD_SERVICE_ALIASES61,serviceDemand61} from './src/v61-domain.js';
import {permitted,rolesOf,stripCosts,taxonomyPaths} from './src/v5-domain.js';
import {validDate,normalizeSearch} from './src/v51-domain.js';
import {fail} from './v5-server.mjs';
const now=()=>new Date().toISOString(),paidStates=['facturado_pagado','produccion','despacho'],text=v=>String(v||'').trim(),number=(v,min=0)=>{if(v===''||v==null||!Number.isFinite(Number(v))||Number(v)<min)throw fail('Revisa la cantidad o tarifa.');return Number(v);};
export async function initializeV61(db){
 await initializeV60(db);
 await atomic(db,'migration-v61',async tx=>{
  if(await tx.getV5('v61:migration'))return;
  const config=await tx.getV5('config');await tx.putV5('v61:config-before',config);
  const taxonomy=structuredClone(TAXONOMY61),known=new Set(taxonomyPaths(TAXONOMY61).map(n=>n.id));
  for(const node of taxonomyPaths(config.taxonomy).filter(n=>!known.has(n.id)&&!n.children?.length&&!n.id.startsWith('v60-')))taxonomy.find(r=>r.catalog===(node.catalog||'products')).children.push({...node,children:[]});
  await tx.putV5('config',{...config,taxonomy,version:config.version+1});
  await tx.putV5('v61:migration',{release:'6.1',at:now(),source:'MATRIZ_PRODUCTOS_SERVICIOS_V6.1.xlsx',archivedServiceIds:(await tx.listCatalogRevisions()).filter(r=>r.productType==='service'&&r.payload.catalogRelease!=='6.1').map(r=>r.id)});
 });
}
export async function enrichCatalog61(catalog,db){
 const migration=await db.getV5('v61:migration'),archived=new Set(migration?.archivedServiceIds||[]);
 for(const p of catalog.services){
  if(p.catalogRelease!=='6.1'||archived.has(p.id)){
   p.active=false;p.legacyCatalog=true;
   const sku=OLD_SERVICE_ALIASES61[p.sku],next=catalog.services.find(s=>s.sku===sku&&s.active!==false);if(next&&next.unit===p.unit)p.successorId=next.id;
  }
 }
 for(const e of catalog.edgeBands.filter(e=>!e.legacyCatalog)){
  e.serviceSku=OLD_SERVICE_ALIASES61[e.serviceSku]||e.serviceSku;const svc=catalog.services.find(s=>s.sku===e.serviceSku&&s.active!==false);
  if(svc){e.serviceRate=svc.netPrice;e.serviceMinPrice=svc.minPrice;e.servicePurchasePrice=svc.purchasePrice;}
 }
 for(const m of catalog.materials.filter(m=>m.active!==false&&m.materialType==='stone'))m.cutServiceKey=/granito/i.test(m.name)?'graniteCutRate':'otherSlabCutRate';
 return catalog;
}
const keyOf=(quoteId,line)=>quoteId+'|'+line.sku+'|'+line.unit;
export async function syncOrder61(db,p,catalog){
 if(!paidStates.includes(p.project.status))return;
 await atomic(db,'production:'+(p.groupId||p.id),async tx=>{
  const demands=serviceDemand61(p,catalog),tasks=(await tx.listV5('task:')).filter(t=>t.quoteId===p.id),entries=await tx.listV5('entry:');
  for(const d of demands){
   const key=keyOf(p.id,d),id='auto-'+createHash('sha1').update(key).digest('hex').slice(0,22),existing=tasks.find(t=>t.id===id);
   const allocated=tasks.filter(t=>t.id!==id&&t.status!=='cancelled'&&(t.demandKey===key||(OLD_SERVICE_ALIASES61[t.serviceSku]||t.serviceSku)===d.sku&&t.unit===d.unit)).reduce((n,t)=>n+t.quantity,0);
   const quantity=Math.max(0,d.quantity-allocated),produced=entries.filter(e=>e.taskId===id&&e.validated).reduce((n,e)=>n+e.quantity,0);
   if(produced>quantity+1e-6)throw fail('La revisión reduce trabajo ya registrado: '+d.name+'.');
   if(existing){if(existing.quantity!==quantity||existing.groupId!==(p.groupId||p.id))await tx.putV5('task:'+id,{...existing,quantity,required:quantity>0,status:quantity===0?'cancelled':existing.status==='cancelled'?(existing.operatorId?'scheduled':'unassigned'):existing.status,groupId:p.groupId||p.id,version:existing.version+1,orderRevision:p.revisionNo});}
   else if(quantity>0)await tx.putV5('task:'+id,{id,quoteId:p.id,groupId:p.groupId||p.id,demandKey:key,auto:true,release:'6.1',operatorId:null,assignedUserId:null,operator:'Sin asignar',serviceSku:d.sku,name:d.name,area:d.area,unit:d.unit,quantity,required:true,status:'unassigned',actualEnd:null,version:1,orderRevision:p.revisionNo,serviceSnapshot:d.serviceSnapshot,payUnitRate:d.payUnitRate,createdAt:now()});
  }
  const keys=new Set(demands.map(d=>keyOf(p.id,d)));
  for(const t of tasks.filter(t=>t.auto&&!t.operatorId&&!keys.has(t.demandKey)&&t.status!=='cancelled')){
   if(entries.some(e=>e.taskId===t.id))throw fail('El servicio retirado tiene producción registrada.');
   await tx.putV5('task:'+t.id,{...t,status:'cancelled',required:false,quantity:0,version:t.version+1});
  }
 });
}
export async function validateOrderChange61(db,current,next,catalog){
 if(!current)return;
 const demand=serviceDemand61(next,catalog),tasks=(await db.listV5('task:')).filter(t=>t.quoteId===current.id&&t.status!=='cancelled'&&!t.uncoded),entries=await db.listV5('entry:');
 for(const t of tasks){const requested=demand.find(d=>d.sku===(OLD_SERVICE_ALIASES61[t.serviceSku]||t.serviceSku)&&d.unit===t.unit)?.quantity||0;const assigned=tasks.filter(x=>x.serviceSku===t.serviceSku&&x.unit===t.unit&&x.operatorId).reduce((n,x)=>n+x.quantity,0),done=entries.filter(e=>e.quoteId===current.id&&e.serviceSku===t.serviceSku&&e.validated).reduce((n,e)=>n+e.quantity,0);if(requested+1e-6<Math.max(assigned,done))throw fail('La modificación reduce servicios asignados o ejecutados. Revisa las tareas antes de cambiar el pedido.');}
}
export function registerV61Routes(app,{db,authenticate,csrf,buildCatalog,canReadProject}){
 const guard=action=>(req,res,next)=>permitted(req.auth.user,action)?next():res.status(403).json({error:'Sin permiso para esta operación.'});
 const getProject=async(req,id,store=db)=>{const p=await store.getProject(id);if(!p||!canReadProject(req.auth.user,p))throw fail('Proyecto no encontrado.',404);return p;};
 const taskFor=async(req,id)=>{const t=await db.getV5('task:'+id);if(!t)throw fail('Tarea no encontrada.',404);await getProject(req,t.quoteId);return t;};
 app.get('/api/v61/operations',authenticate,async(req,res)=>{
  const u=req.auth.user;if(!rolesOf(u).some(r=>!['cliente'].includes(r)))throw fail('Acceso interno.',403);
  const projects=await db.listProjects(u),catalog=await buildCatalog();for(const p of projects.filter(p=>paidStates.includes(p.project.status)))await syncOrder61(db,p,catalog);
  const ids=new Set(projects.map(p=>p.id)),own=rolesOf(u).some(r=>['operador','instalador'].includes(r))&&!permitted(u,'allProjects');
  const tasks=(await db.listV5('task:')).filter(t=>ids.has(t.quoteId)&&t.status!=='cancelled'&&(!own||t.assignedUserId===u.id)),taskIds=new Set(tasks.map(t=>t.id)),entries=(await db.listV5('entry:')).filter(e=>taskIds.has(e.taskId)),operators=(await db.listV5('operator:')).filter(o=>!own||o.userId===u.id);
  res.json(stripCosts({tasks,entries,operators,people:permitted(u,'tasks')?(await db.listUsers()).filter(u=>u.active&&rolesOf(u).some(r=>['operador','instalador'].includes(r))).map(u=>({id:u.id,name:u.fullName})):[],unassigned:tasks.filter(t=>!t.operatorId).length,pendingResponsible:entries.filter(e=>!e.operatorId).length},u));
 });
 app.post('/api/v61/operators',authenticate,csrf,guard('tasks'),async(req,res)=>{
  const b=req.body;if(!text(b.name)||!['operator','contractor'].includes(b.kind||'operator'))throw fail('Identifica al operador o subcontratista.');
  const areas=[...new Set(b.areas||[])];if(!areas.length||areas.some(a=>!['boards','slabs','installations'].includes(a)))throw fail('Selecciona las áreas de trabajo.');
  if(b.userId){const u=await db.getUser(b.userId);if(!u?.active||!rolesOf(u).some(r=>['operador','instalador'].includes(r)))throw fail('Cuenta de operador inválida.');}
  const id=b.id||randomUUID(),operator=await atomic(db,'operator:'+id,async tx=>{const old=await tx.getV5('operator:'+id);if(Number(b.version||0)!==Number(old?.version||0))throw fail('La ficha cambió. Actualiza.',409);
  if(old?.userId&&old.userId!==b.userId&&(await tx.listV5('task:')).some(t=>t.operatorId===id&&t.status!=='completed'))throw fail('Conserva la cuenta mientras existan tareas abiertas.');
  const operator={id,name:text(b.name).slice(0,150),kind:b.kind||'operator',areas,userId:b.userId||null,active:b.active!==false,version:(old?.version||0)+1,updatedAt:now(),updatedBy:req.auth.user.id};await tx.putV5('operator:'+id,operator);return operator;});res.json({operator});
 });
 app.post('/api/v61/tasks/:id/assign',authenticate,csrf,guard('tasks'),async(req,res)=>{
  const t=await taskFor(req,req.params.id),b=req.body,o=await db.getV5('operator:'+b.operatorId);if(!o?.active||!o.areas.includes(t.area))throw fail('Selecciona un responsable habilitado para este servicio.');
  const result=await atomic(db,'production:'+t.groupId,async tx=>{
   const task=await tx.getV5('task:'+t.id);if(task.status==='cancelled'||Number(b.version)!==task.version)throw fail('La tarea cambió. Actualiza.',409);
   const entries=(await tx.listV5('entry:')).filter(e=>e.taskId===t.id),produced=entries.filter(e=>e.validated).reduce((n,e)=>n+e.quantity,0),quantity=number(b.quantity??task.quantity,.001);
   if(quantity>task.quantity+1e-6||quantity+1e-6<produced)throw fail('La cantidad asignada debe cubrir lo realizado y no superar lo pendiente.');
   if(task.operatorId&&quantity<task.quantity-1e-6)throw fail('Para dividir el trabajo, asigna cantidades desde una tarea sin responsable.');
   if(task.operatorId&&entries.length)throw fail('Un trabajo con producción registrada conserva su responsable.');
   const split=quantity<task.quantity-1e-6,id=split?randomUUID():task.id,assigned={...task,id,quantity,auto:split?false:task.auto,operatorId:o.id,assignedUserId:o.userId,operator:o.name,status:task.status==='completed'?'completed':produced?'in_progress':'scheduled',version:split?1:task.version+1,assignedAt:now(),assignedBy:req.auth.user.id};
   if(split)await tx.putV5('task:'+task.id,{...task,quantity:task.quantity-quantity,version:task.version+1,status:'unassigned'});
   await tx.putV5('task:'+id,assigned);
   for(const e of entries){const rate=e.pendingUnitRate??task.payUnitRate;await tx.putV5('entry:'+e.id,{...e,taskId:id,operatorId:o.id,payRateSnapshot:rate==null?null:{mode:'unit',unitRate:rate,source:'service-matrix',sku:e.serviceSku},payAmount:rate==null?null:Math.round(e.quantity*rate),assignedAt:now(),assignedBy:req.auth.user.id});}
   const p=await tx.getProject(task.quoteId),users=[...new Set((await tx.listV5('task:')).filter(t=>t.quoteId===p.id&&t.status!=='cancelled').map(t=>t.assignedUserId).filter(Boolean))];
   await tx.saveProject({id:p.id,ownerId:p.ownerId,assignedTo:p.assignedTo,project:p.project,payload:{...p,assignedOperatorIds:users},summary:p.summary,expectedVersion:p.rowVersion||0});
   return assigned;
  });res.json(stripCosts({task:result},req.auth.user));
 });
 app.post('/api/v61/entries',authenticate,csrf,guard('tasks'),async(req,res)=>{
  const b=req.body,t=await taskFor(req,b.taskId),catalog=await buildCatalog();if(!validDate(b.date))throw fail('Fecha inválida.');const quantity=number(b.quantity,.001);
  const entry=await atomic(db,'production:'+t.groupId,async tx=>{
   const task=await tx.getV5('task:'+t.id);if(['completed','cancelled'].includes(task.status))throw fail('La tarea ya está cerrada.');
   const prior=(await tx.listV5('entry:')).filter(e=>e.taskId===t.id&&e.validated);if(prior.reduce((n,e)=>n+e.quantity,0)+quantity>task.quantity+1e-6)throw fail('El avance supera la cantidad del pedido.');
   const currentService=catalog.services.find(s=>s.sku===(OLD_SERVICE_ALIASES61[task.serviceSku]||task.serviceSku)&&s.active!==false&&s.unit===task.unit),rate=task.payUnitRate??task.serviceSnapshot?.payUnitRate??currentService?.payUnitRate??null,e={id:randomUUID(),taskId:t.id,quoteId:t.quoteId,operatorId:task.operatorId,serviceSku:task.serviceSku,date:b.date,quantity,minutes:0,validated:true,validatedBy:req.auth.user.id,validatedAt:now(),pendingUnitRate:rate,payRateSnapshot:task.operatorId&&rate!=null?{mode:'unit',unitRate:rate,source:'service-matrix',sku:t.serviceSku}:null,payAmount:task.operatorId&&rate!=null?Math.round(quantity*rate):null,notes:text(b.notes).slice(0,1000)};
   await tx.putV5('entry:'+e.id,e);await tx.putV5('task:'+t.id,{...task,payUnitRate:rate,status:'in_progress',version:task.version+1});return e;
  });res.status(201).json(stripCosts({entry},req.auth.user));
 });
 app.post('/api/v61/tasks/:id/complete',authenticate,csrf,async(req,res)=>{
  const t=await taskFor(req,req.params.id);if(!permitted(req.auth.user,'tasks')&&t.assignedUserId!==req.auth.user.id)throw fail('Solo puedes cerrar tareas asignadas.',403);
  const result=await atomic(db,'production:'+t.groupId,async tx=>{
   const task=await tx.getV5('task:'+t.id);if(task.status==='completed')return task;if(Number(req.body.version)!==task.version)throw fail('La tarea cambió. Actualiza.',409);
   const entries=await tx.listV5('entry:');if(entries.filter(e=>e.taskId===t.id&&e.validated).reduce((n,e)=>n+e.quantity,0)+1e-6<task.quantity)throw fail('Valida la cantidad realizada antes del cierre.');
   const closed={...task,status:'completed',actualEnd:now(),closedBy:req.auth.user.id,version:task.version+1};await tx.putV5('task:'+t.id,closed);
   const all=(await tx.listV5('task:')).filter(x=>x.groupId===t.groupId&&x.required&&x.status!=='cancelled'),complete=all.length&&all.every(x=>x.status==='completed');
   if(complete)for(const p of (await tx.listProjects({role:'superadmin'})).filter(p=>(p.groupId||p.id)===t.groupId&&p.project.status==='produccion'))await tx.saveProject({id:p.id,ownerId:p.ownerId,assignedTo:p.assignedTo,project:{...p.project,status:'despacho'},payload:{...p,actualProductionEnd:now(),milestones:{...p.milestones,despacho:{at:now(),by:req.auth.user.id,boards:p.workType==='boards'?p.summary?.boardCount||0:0,slabs:p.workType==='slabs'?p.summary?.boardCount||0:0,edgeMeters:p.summary?.edgeMeters||0,bevelMeters:p.summary?.finishMetersByType?.bevel||0,miter45Meters:p.summary?.finishMetersByType?.miter45||0}}},summary:p.summary,expectedVersion:p.rowVersion||0});
   for(const schedule of (await tx.listV5('schedule:')).filter(s=>s.quoteIds.includes(task.quoteId)&&s.kind===task.area)){const covered=all.filter(t=>schedule.quoteIds.includes(t.quoteId)&&t.area===schedule.kind);if(covered.length&&covered.every(t=>t.status==='completed'))await tx.putV5('schedule:'+schedule.id,{...schedule,status:'completed',actualEnd:now(),version:schedule.version+1});}
   return closed;
  });res.json(stripCosts({task:result},req.auth.user));
 });
 app.post('/api/v61/tasks/uncoded',authenticate,csrf,guard('tasks'),async(req,res)=>{
  const b=req.body,p=await getProject(req,b.quoteId);if(!paidStates.includes(p.project.status))throw fail('Primero debe estar facturado y pagado.');if(!text(b.name)||!text(b.unit)||!text(b.reason)||!['boards','slabs','installations'].includes(b.area))throw fail('Indica descripción, unidad, área y motivo del servicio no codificado.');
  const id=randomUUID(),task={id,quoteId:p.id,groupId:p.groupId||p.id,release:'6.1',uncoded:true,serviceSku:'NO-COD-'+id.slice(0,8).toUpperCase(),name:text(b.name).slice(0,200),unit:text(b.unit).slice(0,20),area:b.area,quantity:number(b.quantity,.001),operatorId:null,assignedUserId:null,operator:'Sin asignar',required:true,status:'unassigned',version:1,payUnitRate:permitted(req.auth.user,'payRates')&&b.payUnitRate!==''&&b.payUnitRate!=null?number(b.payUnitRate):null,reason:text(b.reason).slice(0,1000),createdAt:now(),createdBy:req.auth.user.id};await db.putV5('task:'+id,task);res.status(201).json(stripCosts({task},req.auth.user));
 });
 app.patch('/api/v61/tasks/:id/pay-rate',authenticate,csrf,guard('payRates'),async(req,res)=>{
  const t=await taskFor(req,req.params.id);if(!t.uncoded&&t.release==='6.1')throw fail('Los servicios codificados usan la tarifa de la matriz.');
  const rate=number(req.body.payUnitRate),task=await atomic(db,'production:'+t.groupId,async tx=>{
   const current=await tx.getV5('task:'+t.id);if(Number(req.body.version)!==current.version)throw fail('La tarea cambió. Actualiza.',409);
   if(current.payUnitRate!=null)throw fail('La excepción ya tiene una tarifa registrada.');
   const updated={...current,payUnitRate:rate,version:current.version+1,rateDefinedAt:now(),rateDefinedBy:req.auth.user.id};await tx.putV5('task:'+t.id,updated);
   for(const e of (await tx.listV5('entry:')).filter(e=>e.taskId===t.id&&e.payAmount==null&&e.pendingUnitRate==null))await tx.putV5('entry:'+e.id,{...e,pendingUnitRate:rate,payAmount:e.operatorId?Math.round(e.quantity*rate):null,payRateSnapshot:e.operatorId?{mode:'unit',unitRate:rate,source:'uncoded-service',sku:e.serviceSku}:null,rateDefinedAt:now(),rateDefinedBy:req.auth.user.id});
   return updated;
  });res.json(stripCosts({task},req.auth.user));
 });
 app.post('/api/v61/projects/:id/link',authenticate,csrf,guard('quote'),async(req,res)=>{
  const p=await getProject(req,req.params.id),target=await getProject(req,req.body.targetQuoteId);if(!['cotizacion','facturacion'].includes(p.project.status))throw fail('Vincula la cotización antes de facturar y programar su producción.');
  if(normalizeSearch(p.project.clientName)!==normalizeSearch(target.project.clientName)||(p.project.rut&&target.project.rut&&p.project.rut!==target.project.rut))throw fail('Las cotizaciones deben corresponder al mismo cliente.');
  if((p.groupId||p.id)!==p.id&&(p.groupId||p.id)!==(target.groupId||target.id))throw fail('La cotización ya pertenece a otro proyecto.');
  const groupId=target.groupId||target.id,saved=await db.saveProject({id:p.id,ownerId:p.ownerId,assignedTo:p.assignedTo,project:{...p.project,projectName:target.project.projectName},payload:{...p,groupId,linkedAt:now(),linkedBy:req.auth.user.id},summary:p.summary,expectedVersion:p.rowVersion||0});res.json({project:saved});
 });
 app.patch('/api/v61/services/:id/pay-rate',authenticate,csrf,guard('payRates'),async(req,res)=>{
  const catalog=await buildCatalog(),p=catalog.services.find(p=>p.id===req.params.id&&p.active!==false);if(!p)throw fail('Servicio no vigente.');
  const rate=number(req.body.payUnitRate),revision=await atomic(db,'catalog-service:'+p.sku,async tx=>{if((await tx.listCatalogRevisions()).some(r=>r.replacesId===p.id))throw fail('El servicio cambió. Actualiza el catálogo.',409);return tx.createCatalogRevision({id:'catalog-service-'+randomUUID(),productType:'service',sku:p.sku,payload:{...p,payUnitRate:rate,catalogRelease:'6.1'},replacesId:p.id,createdBy:req.auth.user.id});});res.json({revision:stripCosts(revision,req.auth.user)});
 });
}
