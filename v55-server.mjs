import {randomUUID} from 'node:crypto';
import {permitted,rolesOf,discountedLine,mergeConfig,stripCosts} from './src/v5-domain.js';
import {internalUser,validDate} from './src/v51-domain.js';
import {TAXONOMY55,WEIGHTS55,PRODUCTIVITY55,freight55,shippingLines,validateComponents,payAmount,productionReport,minuteRate,planWork,serviceDemand,materialCostLines,workingMinutes,productionReady} from './src/v55-domain.js';
import routes from './src/routes.v55.generated.js';
import catalog55 from './src/catalog.v55.generated.js';
import {fail} from './v5-server.mjs';
const now=()=>new Date().toISOString(),txt=(v,n=250)=>String(v??'').trim().slice(0,n);
const numeric=(v,label,min=0,max=1e10)=>{if(v===''||v==null||!Number.isFinite(Number(v))||Number(v)<min||Number(v)>max)throw fail('Revisa '+label+'.');return Number(v);};
const history=(old,user)=>[...(old?.history||[]),...(old?[{...old,history:undefined,archivedAt:now(),archivedBy:user.id}]:[])];
const staffRoles=['superadmin','admin','produccion','instalacion','logistica'];
export const canOperateArea=(user,area)=>rolesOf(user).some(r=>['superadmin','admin',area==='installations'?'instalacion':area==='dispatch'?'logistica':'produccion'].includes(r));
export const isAssigned=(user,p)=>p?.assignedOperatorIds?.includes(user?.id);
const locks=new WeakMap();
// Un único cierre, registro de avance o tarifa por vez. PostgreSQL usa un bloqueo
// transaccional para que esta garantía también se mantenga con varios procesos.
async function atomic(db,key,action){
 if(db.pool){const client=await db.pool.connect();try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[key]);
  const tx=Object.create(db);tx.pool=client;
  tx.getV5=async id=>(await client.query('SELECT payload FROM v5_documents WHERE id=$1',[id])).rows[0]?.payload;
  tx.putV5=async(id,payload)=>{await client.query('INSERT INTO v5_documents(id,payload) VALUES($1,$2::jsonb) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()',[id,JSON.stringify(payload)]);return payload;};
  tx.listV5=async prefix=>(await client.query('SELECT payload FROM v5_documents WHERE left(id,length($1))=$1',[prefix])).rows.map(r=>r.payload);
  const result=await action(tx);await client.query('COMMIT');return result;
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
 let map=locks.get(db);if(!map){map=new Map();locks.set(db,map);}const prior=map.get(key)||Promise.resolve();let release;const hold=new Promise(r=>release=r);map.set(key,prior.then(()=>hold));await prior;
 const docs=structuredClone(db.v5Documents),projects=structuredClone(db.projects);
 try{return await action(db);}catch(e){db.v5Documents=docs;db.projects=projects;throw e;}finally{release();}
}
export async function initializeV55(db){
 await atomic(db,'migration-v55',async tx=>{
  if(await tx.getV5('v55:migration'))return;
  const previous=await tx.getV5('config'),config=mergeConfig(previous),revisions=await tx.listCatalogRevisions();
  await tx.putV5('v55:config-before',previous||{});
  const known=new Set(TAXONOMY55.map(r=>r.id));
  const taxonomy=TAXONOMY55.map(r=>({...r,children:[...r.children,...(config.taxonomy.find(o=>o.id===r.id)?.children||[]).filter(c=>!r.children.some(n=>n.id===c.id))]}));
  taxonomy.push(...config.taxonomy.filter(r=>!known.has(r.id)&&!['aglomerados','mdf','otros-tableros','neolith','otras-placas','bisagras','guias','elevacion','servicios'].includes(r.id)));
  await tx.putV5('config',{...config,taxonomy,defaultKerf:config.defaultKerf??3,version:config.version+1});
  await tx.putV5('v55:settings',{version:1,routes,weights:WEIGHTS55,productWeights:{},productivity:PRODUCTIVITY55,componentRules:{},resourceTemplates:{}});
  await tx.putV5('v55:migration',{at:now(),release:'5.5',revisionIds:revisions.filter(r=>r.payload.catalogRelease!=='5.5').map(r=>r.id),sourceRows:catalog55.rows});
 });
}
export async function enrichCatalog55(catalog,db){
 const migration=await db.getV5('v55:migration'),archived=new Set(migration?.revisionIds||[]),all=[...catalog.materials,...catalog.edgeBands,...catalog.services,...catalog.accessories];
 for(const item of all){
  if(catalog55.aliases[item.id])item.successorId=catalog55.aliases[item.id];
  if(archived.has(item.id)){item.active=false;item.legacyCatalog=true;const parent=all.find(x=>x.id===item.replacesId);if(parent?.successorId&&parent.sku===item.sku&&parent.name===item.name)item.successorId=parent.successorId;}
 }
 // Costos y fotografías configurados por el negocio sobreviven al nuevo Excel.
 for(const previous of all.filter(i=>archived.has(i.id)&&i.successorId)){
  const next=all.find(i=>i.id===previous.successorId);if(!next)continue;
  for(const key of ['purchasePrice','servicePurchasePrice','supplierCode','image','imageKey'])if(previous[key]!=null&&previous[key]!=='')next[key]=previous[key];
 }
 return catalog;
}
export async function prepareSale55(p,catalog,config,user){
 const all=[...catalog.materials,...catalog.edgeBands,...catalog.services,...catalog.accessories];
 if(!Array.isArray(p.saleLines))p.saleLines=[];
 if(p.saleLines.length>500)throw fail('Máximo 500 líneas adicionales.');
 const lines=p.saleLines.map(l=>{
  const item=all.find(x=>x.id===l.productId&&x.active!==false);if(!item)throw fail('Producto no vigente en la venta adicional.');
  const quantity=numeric(l.quantity,'cantidad',.001,100000),price=Number(item.netPrice??item.price);
  if(!(price>0))throw fail('Configura el precio de '+item.sku+' antes de cotizar.');
  const discount=permitted(user,'discount')?numeric(l.discount||0,'descuento',0,50):0;
  return {productId:item.id,sku:item.sku,name:item.name,quantity,unit:item.unit,discount,productSnapshot:structuredClone(item),...discountedLine(price,quantity,discount,item),unitPrice:price};
 });
 const errors=validateComponents(lines,all,config.componentRules);if(errors.length)throw fail(errors.join(' '));
 p.saleLines=lines;
 if(p.delivery?.required){
  const quoted=freight55(config,p.delivery.communeId,shippingLines([p],catalog),permitted(user,'discount')?p.delivery.discount:0,true);
  if(quoted.status!=='quoted')throw fail(quoted.reason);
  if(!txt(p.delivery.street))throw fail('Indica la dirección de despacho.');
  p.delivery={required:true,communeId:p.delivery.communeId,street:txt(p.delivery.street,300),discount:quoted.requestedDiscount,quote:quoted};
 }else p.delivery={required:false,quote:{status:'pickup',net:0}};
 const result=p.calculationSnapshot,base=result.summary;
 const additionalNet=lines.reduce((n,l)=>n+l.net,0),shippingNet=p.delivery.quote.net||0;
 base.optimizationNet=base.net;base.additionalNet=Math.round(additionalNet);base.shippingNet=shippingNet;base.net=Math.round(base.optimizationNet+additionalNet+shippingNet);base.vat=Math.round(base.net*.19);base.total=base.net+base.vat;
 result.saleLines=lines;result.delivery=p.delivery;
}
async function costReport55(db,p){
 const resource=await db.getV5('resources:'+p.id)||{quoteId:p.id,version:0,lines:materialCostLines(p)},entries=(await db.listV5('entry:')).filter(e=>e.quoteId===p.id&&e.validated);
 const planned=resource.lines.reduce((n,l)=>n+(l.unitCost==null?0:l.plannedQuantity*l.unitCost),0),actual=resource.lines.reduce((n,l)=>n+(l.unitCost==null?0:l.actualQuantity*l.unitCost),0),labor=entries.reduce((n,e)=>n+(e.payAmount||0),0),missing=resource.lines.filter(l=>l.unitCost==null).map(l=>l.name).concat(entries.filter(e=>e.payAmount==null).map(e=>'Tarifa: '+e.serviceSku));
 return {...resource,groupId:p.groupId||p.id,projectName:p.project.projectName,plannedCost:planned,actualCost:actual+labor,laborCost:labor,netRevenue:p.summary?.net||0,margin:(p.summary?.net||0)-actual-labor,missingCosts:missing,complete:missing.length===0&&resource.lines.length>0};
}
export function registerV55Routes(app,{db,authenticate,csrf,buildCatalog,canReadProject}){
 const config=()=>db.getV5('v55:settings');
 const staff=(req,res,next)=>internalUser(req.auth.user)?next():res.status(403).json({error:'Acceso del equipo interno.'});
 const guard=action=>(req,res,next)=>permitted(req.auth.user,action)?next():res.status(403).json({error:'Sin permiso para esta operación.'});
 const project=async(req,id,store=db)=>{const p=await store.getProject(id);if(!p||!canReadProject(req.auth.user,p))throw fail('Proyecto no encontrado.',404);return p;};
 const record=async(store,p,changes)=>store.saveProject({id:p.id,ownerId:p.ownerId,assignedTo:p.assignedTo,project:p.project,payload:{...p,...changes},summary:p.summary,expectedVersion:p.rowVersion||0});
 const versioned=async(store,key,b,next,user)=>{const old=await store.getV5(key);if(Number(b.version||0)!==Number(old?.version||0))throw fail('El registro cambió. Actualiza antes de guardar.',409);const r={...next,version:(old?.version||0)+1,updatedAt:now(),updatedBy:user.id,history:history(old,user)};await store.putV5(key,r);return r;};
 app.get('/api/v55/public-settings',async(req,res)=>{const c=await config();res.json({version:c.version,routes:c.routes,weights:c.weights,productWeights:c.productWeights,componentRules:c.componentRules});});
 app.get('/api/v55/settings',authenticate,staff,async(req,res)=>res.json(stripCosts(await config(),req.auth.user)));
 app.patch('/api/v55/settings',authenticate,csrf,guard('settings'),async(req,res)=>{
  const b=req.body||{},allowed=['routes','weights','productWeights','productivity','componentRules','resourceTemplates'];
  if(Object.keys(b).some(k=>!allowed.includes(k)&&k!=='version'))throw fail('Parámetro desconocido.');
  const result=await atomic(db,'v55-settings',async tx=>{
   const old=await tx.getV5('v55:settings'),next={...old};
   if(b.routes){if(!Array.isArray(b.routes)||new Set(b.routes.map(r=>r.id)).size!==b.routes.length)throw fail('Comunas duplicadas.');next.routes=b.routes.map(r=>{if(!txt(r.id)||!txt(r.name))throw fail('Identifica cada comuna.');return {id:txt(r.id),name:txt(r.name),active:r.active!==false,local:!!r.local,ratePerKg:numeric(r.ratePerKg,'tarifa/kg'),minimumNet:numeric(r.minimumNet??(r.local?5000:15000),'cobro mínimo',r.local?5000:15000)};});}
   for(const field of ['weights','productWeights'])if(b[field]){next[field]={};for(const [k,v] of Object.entries(b[field]))if(v!==null&&v!=='')next[field][k]=numeric(v,'peso de '+k);}
   if(b.productivity){next.productivity={};for(const [sku,p] of Object.entries(b.productivity)){if(!['minute','hour','day'].includes(p.period))throw fail('Período de rendimiento inválido.');next.productivity[sku]={quantity:numeric(p.quantity,'rendimiento',.001),unit:txt(p.unit),period:p.period};}}
   if(b.componentRules){const cat=await buildCatalog(),skus=new Set([...cat.accessories,...cat.materials,...cat.services,...cat.edgeBands].filter(i=>i.active!==false).map(i=>i.sku));for(const [sku,rule] of Object.entries(b.componentRules)){if(!skus.has(sku))throw fail('Referencia desconocida: '+sku);for(const r of [...(rule.required||[]),...(rule.optional||[])]){if(!r.allowedSkus?.length||r.allowedSkus.some(s=>!skus.has(s)))throw fail('Complemento desconocido.');numeric(r.quantity,'cantidad de complemento',.001);}}next.componentRules=b.componentRules;}
   if(b.resourceTemplates){if(!permitted(req.auth.user,'costs')&&Object.values(old.resourceTemplates||{}).flat().some(l=>l.unitCost!=null))throw fail('Se requiere permiso específico para modificar plantillas con costos.',403);if(!permitted(req.auth.user,'costs'))for(const list of Object.values(b.resourceTemplates))for(const l of list)if(l.unitCost!=null&&l.unitCost!=='')throw fail('Se requiere permiso específico para configurar costos.',403);for(const list of Object.values(b.resourceTemplates))validateResources(list);next.resourceTemplates=b.resourceTemplates;}
   return versioned(tx,'v55:settings',b,next,req.auth.user);
  });res.json(stripCosts(result,req.auth.user));
 });
 app.patch('/api/v55/users/:id/permissions',authenticate,csrf,async(req,res)=>{
  if(!rolesOf(req.auth.user).includes('superadmin'))throw fail('Solo Superadministrador concede permisos específicos.',403);
  const u=await db.getUser(req.params.id);if(!u||!rolesOf(u).includes('admin'))throw fail('Selecciona un Administrador.');
  const permissions=[...new Set(req.body.permissions||[])];if(permissions.some(p=>!['users','costs'].includes(p)))throw fail('Permiso no reconocido.');
  await db.putV5('permissions:'+u.id,{permissions,updatedAt:now(),updatedBy:req.auth.user.id});res.json({permissions});
 });
 app.post('/api/v55/freight-preview',async(req,res)=>{
  const c=await config(),cat=await buildCatalog(),all=[...cat.materials,...cat.edgeBands,...cat.accessories,...cat.services];
  const lines=(Array.isArray(req.body.lines)?req.body.lines:[]).slice(0,500).map(l=>{const p=all.find(p=>p.id===l.productId&&p.active!==false);if(!p)throw fail('Producto no vigente.');return {...p,quantity:numeric(l.quantity,'cantidad',.001,100000)};});
  const result=freight55(c,req.body.communeId,lines,permitted(req.catalogUser,'discount')?req.body.discount:0,req.body.required!==false);res.json(result);
 });
 app.get('/api/v55/dispatches',authenticate,async(req,res)=>{
  const ids=new Set((await db.listProjects(req.auth.user)).map(p=>p.groupId||p.id));
  res.json({dispatches:(await db.listV5('dispatch:')).filter(d=>ids.has(d.groupId))});
 });
 app.post('/api/v55/dispatches',authenticate,csrf,staff,async(req,res)=>{
  const user=req.auth.user,b=req.body;if(!permitted(user,'dispatch')&&!permitted(user,'suggestDispatch'))throw fail('Tu perfil solo puede consultar despachos.',403);
  const projects=(await db.listProjects(user)).filter(p=>(p.groupId||p.id)===b.groupId);if(!projects.length)throw fail('Proyecto no encontrado.',404);
  const result=await atomic(db,'dispatch:'+b.groupId,async tx=>{
   const old=b.id?await tx.getV5('dispatch:'+b.id):null;if(b.id&&!old)throw fail('Despacho no encontrado.',404);if(old&&old.groupId!==b.groupId)throw fail('Proyecto inválido.');
   const confirm=permitted(user,'dispatch'),id=old?.id||randomUUID();
   if(!validDate(b.proposedDate||old?.proposedDate))throw fail('Indica la fecha sugerida.');
   if(!confirm&&['confirmedDate','status','invoiceNumber','invoiceDate'].some(k=>b[k]!==undefined&&b[k]!==old?.[k]))throw fail('Logística o Producción confirma el despacho.',403);
   if(b.confirmedDate&&!validDate(b.confirmedDate))throw fail('Fecha de confirmación inválida.');
   if(old?.invoiceNumber&&(b.requote||b.communeId&&b.communeId!==old.communeId||b.street&&b.street!==old.street))throw fail('El despacho facturado conserva su valorización.');
   const street=txt(b.street??old?.street,300),communeId=b.communeId??old?.communeId;
   if(!street)throw fail('Indica calle y número.');
   const priceChanged=!old||b.requote||communeId!==old.communeId||(permitted(user,'discount')&&b.discount!==undefined&&Number(b.discount)!==Number(old.quote?.requestedDiscount||0));
   if(old?.invoiceNumber&&priceChanged)throw fail('El despacho facturado conserva su valorización.');
   const quote=!priceChanged?old.quote:freight55(await config(),communeId,shippingLines(projects,await buildCatalog()),permitted(user,'discount')?b.discount:0);
   if(quote.status!=='quoted')throw fail(quote.reason);
   const status=confirm?(b.status||old?.status||'proposed'):'proposed';
   if(!['proposed','scheduled','dispatched','delivered','cancelled'].includes(status))throw fail('Estado inválido.');
   const confirmedDate=confirm?(b.confirmedDate??old?.confirmedDate??''):b.proposedDate!==old?.proposedDate?'':old?.confirmedDate||'';
   if(['scheduled','dispatched','delivered'].includes(status)&&!confirmedDate)throw fail('Confirma la fecha antes de programar.');
   const invoiceNumber=confirm?txt(b.invoiceNumber??old?.invoiceNumber):old?.invoiceNumber||'',invoiceDate=confirm?(b.invoiceDate??old?.invoiceDate??''):old?.invoiceDate||'';
   if(invoiceNumber&&!validDate(invoiceDate))throw fail('Falta la fecha de factura.');
   return versioned(tx,'dispatch:'+id,b,{id,release:'5.5',includedInQuote:projects.some(p=>p.delivery?.required),groupId:b.groupId,quoteIds:projects.map(p=>p.id),projectName:projects[0].project.projectName,clientName:projects[0].project.clientName,street,communeId,quote,status,proposedDate:b.proposedDate||old.proposedDate,proposedBy:confirm?old?.proposedBy||user.id:user.id,confirmedDate,confirmedBy:confirm&&confirmedDate?user.id:old?.confirmedBy||null,date:confirmedDate||b.proposedDate,invoiceNumber,invoiceDate,notes:txt(b.notes??old?.notes,2000),sellerName:projects[0].assignedName||projects[0].ownerName,createdAt:old?.createdAt||now()},user);
  });res.status(req.body.id?200:201).json({dispatch:result});
 });
 app.get('/api/v55/operations',authenticate,staff,async(req,res)=>{
  const ids=new Set((await db.listProjects(req.auth.user)).map(p=>p.id)),tasks=(await db.listV5('task:')).filter(t=>ids.has(t.quoteId));
  const own=rolesOf(req.auth.user).some(r=>['operador','instalador'].includes(r))&&!permitted(req.auth.user,'allProjects'),visibleTasks=own?tasks.filter(t=>t.assignedUserId===req.auth.user.id):tasks;
  const taskIds=new Set(visibleTasks.map(t=>t.id)),entries=(await db.listV5('entry:')).filter(e=>taskIds.has(e.taskId));
  res.json(stripCosts({tasks:visibleTasks,entries,operators:(await db.listV5('operator:')).filter(o=>!own||o.userId===req.auth.user.id),rates:permitted(req.auth.user,'payRates')?await db.listV5('pay-rate:'):[],people:permitted(req.auth.user,'tasks')?(await db.listUsers()).filter(u=>u.active&&rolesOf(u).some(r=>['operador','instalador'].includes(r))).map(u=>({id:u.id,name:u.fullName,roles:rolesOf(u)})):[]},req.auth.user));
 });
 app.post('/api/v55/operators',authenticate,csrf,guard('tasks'),async(req,res)=>{
  const b=req.body,areas=[...new Set(b.areas||[])];if(!txt(b.name)||!areas.length||areas.some(a=>!['boards','slabs','installations','dispatch'].includes(a)||!canOperateArea(req.auth.user,a)))throw fail('Revisa nombre y áreas autorizadas.',403);
  if(b.userId){const u=await db.getUser(b.userId);if(!u?.active||!rolesOf(u).some(r=>['operador','instalador'].includes(r)))throw fail('El acceso debe pertenecer a un Operador o Instalador activo.');}
  const id=b.id||randomUUID();const result=await atomic(db,'operator:'+id,async tx=>{
   const old=await tx.getV5('operator:'+id);if(old?.areas.some(a=>!canOperateArea(req.auth.user,a)))throw fail('Operador de otra área.',403);
   if(old?.userId!==b.userId&&(await tx.listV5('task:')).some(t=>t.operatorId===id&&t.status!=='completed'))throw fail('Cierra las tareas antes de cambiar la cuenta del operador.');
   return versioned(tx,'operator:'+id,b,{id,name:txt(b.name),areas,userId:b.userId||null,active:b.active!==false},req.auth.user);
  });res.json({operator:result});
 });
 app.post('/api/v55/pay-rates',authenticate,csrf,guard('payRates'),async(req,res)=>{
  const b=req.body,operator=await db.getV5('operator:'+b.operatorId),c=await buildCatalog();if(!operator||!c.services.some(s=>s.sku===b.serviceSku&&s.active!==false))throw fail('Operador o tarea inválida.');
  if(!['unit','hour','mixed'].includes(b.mode)||!validDate(b.effectiveDate))throw fail('Revisa modalidad y fecha de vigencia.');
  const rate={id:randomUUID(),operatorId:operator.id,serviceSku:b.serviceSku,mode:b.mode,unitRate:numeric(b.unitRate??0,'tarifa por unidad'),hourRate:numeric(b.hourRate??0,'tarifa por hora'),effectiveDate:b.effectiveDate,createdAt:now(),createdBy:req.auth.user.id};
  await db.putV5('pay-rate:'+rate.id,rate);res.status(201).json({rate});
 });
 app.post('/api/v55/tasks',authenticate,csrf,guard('tasks'),async(req,res)=>{
  const b=req.body,p=await project(req,b.quoteId);if(!canOperateArea(req.auth.user,b.area))throw fail('Área fuera de tus atribuciones.',403);
  if(!['facturado_pagado','produccion','despacho'].includes(p.project.status))throw fail('Primero debe estar facturado y pagado.');
  const o=await db.getV5('operator:'+b.operatorId),catalog=await buildCatalog(),service=catalog.services.find(s=>s.sku===b.serviceSku&&s.active!==false),c=await config();
  if(!o?.active||!o.areas.includes(b.area)||!service)throw fail('Selecciona un operador y un servicio del área.');
  if(b.area==='boards'&&p.workType!=='boards'||b.area==='slabs'&&p.workType!=='slabs')throw fail('El área no corresponde a esta cotización.');
  const quantity=numeric(b.quantity,'objetivo',.001,100000);if(!validDate(b.startDate)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.startTime||'08:00'))throw fail('Fecha/hora inválida.');
  const rate=minuteRate(c.productivity[service.sku]),minutes=rate?quantity/rate:numeric(b.plannedMinutes,'minutos planificados',1,540000),end=planWork(b.startDate,b.startTime||'08:00',minutes),id=b.id||randomUUID();
  const result=await atomic(db,'production:'+p.groupId,async tx=>{
   const old=await tx.getV5('task:'+id);if(old&&(old.quoteId!==p.id||old.area!==b.area))throw fail('No cambies el proyecto o área de una tarea.');
   if(old&&(await tx.listV5('entry:')).some(e=>e.taskId===id))throw fail('Una tarea con producción registrada conserva su asignación. Crea otra para el trabajo adicional.');
   const freshQuote=await tx.getProject(p.id),demand=serviceDemand(freshQuote)[service.sku]||0,allocatedQuantity=(await tx.listV5('task:')).filter(t=>t.quoteId===p.id&&t.serviceSku===service.sku&&t.id!==id).reduce((n,t)=>n+t.quantity,0);
   if(allocatedQuantity+quantity>demand+1e-8)throw fail('Las tareas de este servicio superan la cantidad cotizada ('+demand+'). Distribuye el objetivo entre operadores.');
   const task=await versioned(tx,'task:'+id,b,{id,quoteId:p.id,groupId:p.groupId||p.id,operatorId:o.id,assignedUserId:o.userId,operator:o.name,serviceSku:service.sku,name:service.name,area:b.area,unit:service.unit,quantity,required:b.required!==false,startDate:b.startDate,startTime:b.startTime||'08:00',plannedMinutes:minutes,plannedEndDate:end.date,plannedEndTime:end.time,status:'scheduled',actualEnd:null,notes:txt(b.notes,2000)},req.auth.user);
   const fresh=await tx.getProject(p.id),assigned=[...new Set((await tx.listV5('task:')).filter(t=>t.quoteId===p.id).map(t=>t.assignedUserId).filter(Boolean))];await record(tx,fresh,{assignedOperatorIds:assigned});return task;
  });res.json({task:result});
 });
 app.post('/api/v55/entries',authenticate,csrf,guard('tasks'),async(req,res)=>{
  const b=req.body,t=await db.getV5('task:'+b.taskId);if(!t)throw fail('Tarea no encontrada.',404);await project(req,t.quoteId);if(!canOperateArea(req.auth.user,t.area))throw fail('Área fuera de tus atribuciones.',403);
  const result=await atomic(db,'production:'+t.groupId,async tx=>{
   const task=await tx.getV5('task:'+t.id);if(task.status==='completed')throw fail('La tarea ya está cerrada.');
   if(!validDate(b.date))throw fail('Fecha inválida.');const quantity=numeric(b.quantity,'cantidad producida',.001),minutes=numeric(b.minutes,'minutos trabajados',0,540);
   const operatorTasks=new Set((await tx.listV5('task:')).filter(t=>t.operatorId===task.operatorId).map(t=>t.id)),dayEntries=(await tx.listV5('entry:')).filter(e=>operatorTasks.has(e.taskId)&&e.date===b.date&&e.validated);
   if(dayEntries.reduce((n,e)=>n+e.minutes,0)+minutes>workingMinutes(b.date))throw fail('El tiempo registrado supera la jornada disponible del operador.');
   const prior=(await tx.listV5('entry:')).filter(e=>e.taskId===task.id&&e.validated);if(prior.reduce((s,e)=>s+e.quantity,0)+quantity>task.quantity+1e-8)throw fail('El avance supera el objetivo. Separa el trabajo adicional.');
   const rates=(await tx.listV5('pay-rate:')).filter(r=>r.operatorId===t.operatorId&&r.serviceSku===t.serviceSku&&r.effectiveDate<=b.date).sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate)||b.createdAt.localeCompare(a.createdAt)),rate=rates[0]||null;
   if(rate?.mode!=='unit'&&rate&&minutes<=0)throw fail('La modalidad por hora necesita tiempo trabajado.');
   const entry={id:randomUUID(),taskId:t.id,quoteId:t.quoteId,operatorId:t.operatorId,serviceSku:t.serviceSku,date:b.date,quantity,minutes,validated:true,validatedBy:req.auth.user.id,validatedAt:now(),payRateSnapshot:rate,payAmount:payAmount(rate,quantity,minutes),notes:txt(b.notes,2000)};
   await tx.putV5('entry:'+entry.id,entry);await tx.putV5('task:'+task.id,{...task,status:'in_progress',version:task.version+1});return entry;
  });res.status(201).json(stripCosts({entry:result},req.auth.user));
 });
 app.post('/api/v55/tasks/:id/complete',authenticate,csrf,staff,async(req,res)=>{
  const t=await db.getV5('task:'+req.params.id);if(!t)throw fail('Tarea no encontrada.',404);await project(req,t.quoteId);
  if(t.assignedUserId!==req.auth.user.id&&!canOperateArea(req.auth.user,t.area))throw fail('Solo puedes cerrar tus tareas asignadas.',403);
  const result=await atomic(db,'production:'+t.groupId,async tx=>{
   const task=await tx.getV5('task:'+t.id);if(task.status==='completed')return {task,alreadyCompleted:true};
   if(Number(req.body.version)!==task.version)throw fail('La tarea cambió. Actualiza.',409);
   const entries=(await tx.listV5('entry:')).filter(e=>e.taskId===task.id&&e.validated);if(entries.reduce((s,e)=>s+e.quantity,0)+1e-8<task.quantity)throw fail('Producción debe validar la cantidad terminada antes del cierre.');
   const closed={...task,status:'completed',actualEnd:now(),closedBy:req.auth.user.id,version:task.version+1,history:history(task,req.auth.user)};await tx.putV5('task:'+task.id,closed);
   const tasks=(await tx.listV5('task:')).filter(t=>t.groupId===task.groupId&&t.required&&['boards','slabs'].includes(t.area));
   const siblings=(await tx.listProjects({role:'superadmin'})).filter(p=>(p.groupId||p.id)===task.groupId&&['boards','slabs'].includes(p.workType)&&p.pieces?.length);
   const complete=productionReady(siblings,tasks);
   const areaDone=(await tx.listV5('task:')).filter(t=>t.quoteId===task.quoteId&&t.area===task.area&&t.required).every(t=>t.status==='completed');
   if(areaDone)for(const schedule of (await tx.listV5('schedule:')).filter(s=>s.kind===task.area&&s.quoteIds.includes(task.quoteId))){const covered=(await tx.listV5('task:')).filter(t=>schedule.quoteIds.includes(t.quoteId)&&t.area===task.area&&t.required);if(covered.length&&covered.every(t=>t.status==='completed'))await tx.putV5('schedule:'+schedule.id,{...schedule,plannedEndDate:schedule.plannedEndDate||schedule.endDate,actualEnd:now(),status:'completed',version:schedule.version+1,history:history(schedule,req.auth.user)});}
   if(complete)for(const p of siblings.filter(p=>p.project.status==='produccion')){
    const s=p.summary||{},milestones={...p.milestones,despacho:{at:now(),by:req.auth.user.id,boards:p.workType==='boards'?s.boardCount||0:0,slabs:p.workType==='slabs'?s.boardCount||0:0,edgeMeters:s.edgeMeters||0,bevelMeters:s.finishMetersByType?.bevel||0,miter45Meters:s.finishMetersByType?.miter45||0}};
    p.project={...p.project,status:'despacho'};await record(tx,p,{actualProductionEnd:now(),milestones});
   }return {task:closed,productionComplete:complete};
  });res.json(result);
 });
 app.get('/api/v55/production-report',authenticate,staff,guard('reports'),async(req,res)=>{
  const ids=new Set((await db.listProjects(req.auth.user)).map(p=>p.id)),tasks=(await db.listV5('task:')).filter(t=>ids.has(t.quoteId)),entries=await db.listV5('entry:'),c=await config();
  const rows=productionReport(tasks,entries,await db.listV5('operator:'),c.productivity,txt(req.query.from,10),txt(req.query.to,10));
  if(!permitted(req.auth.user,'payRates')&&!permitted(req.auth.user,'costs'))for(const r of rows){delete r.payTotal;delete r.missingRates;}
  res.json({rows});
 });
 app.get('/api/v55/projects/:id/costs',authenticate,staff,async(req,res)=>{
  const p=await project(req,req.params.id);if(!permitted(req.auth.user,'costs')&&!permitted(req.auth.user,'resources'))throw fail('Sin acceso al control de insumos.',403);
  const report=await costReport55(db,p);
  res.json(stripCosts(report,req.auth.user));
 });
 app.get('/api/v55/groups/:id/costs',authenticate,staff,guard('costs'),async(req,res)=>{
  const quotes=(await db.listProjects(req.auth.user)).filter(p=>(p.groupId||p.id)===req.params.id);if(!quotes.length)throw fail('Proyecto no encontrado.',404);
  const reports=await Promise.all(quotes.map(p=>costReport55(db,p))),sum=k=>reports.reduce((n,r)=>n+Number(r[k]||0),0);
  res.json({group:true,groupId:req.params.id,projectName:quotes[0].project.projectName,quoteIds:quotes.map(p=>p.id),lines:reports.flatMap(r=>r.lines.map(l=>({...l,quoteId:r.quoteId}))),plannedCost:sum('plannedCost'),actualCost:sum('actualCost'),laborCost:sum('laborCost'),netRevenue:sum('netRevenue'),margin:sum('margin'),missingCosts:reports.flatMap(r=>r.missingCosts),complete:reports.every(r=>r.complete)});
 });
 app.post('/api/v55/projects/:id/costs',authenticate,csrf,staff,async(req,res)=>{
  const p=await project(req,req.params.id),user=req.auth.user,b=req.body;if(!permitted(user,'resources')&&!rolesOf(user).includes('superadmin')&&!(rolesOf(user).includes('admin')&&permitted(user,'costs')))throw fail('Sin permiso de insumos.',403);
  if(!['facturado_pagado','produccion','despacho','entregado'].includes(p.project.status)&&!rolesOf(user).some(r=>['superadmin','admin'].includes(r)))throw fail('Las etapas previas son de consulta.',403);
  validateResources(b.lines);const result=await atomic(db,'resources:'+p.id,async tx=>{
   const old=await tx.getV5('resources:'+p.id)||{quoteId:p.id,version:0,lines:materialCostLines(p)};const lines=b.lines.map(l=>{const before=old?.lines.find(o=>o.id===l.id);return {...l,id:l.id||randomUUID(),name:txt(l.name),serviceSku:txt(l.serviceSku),unit:txt(l.unit),unitCost:permitted(user,'costs')?(l.unitCost===''||l.unitCost==null?null:numeric(l.unitCost,'costo')):before?.unitCost??null,plannedQuantity:Number(l.plannedQuantity),actualQuantity:Number(l.actualQuantity)};});
   if(!permitted(user,'resources')&&JSON.stringify(lines.map(({unitCost,...l})=>l))!==JSON.stringify((old?.lines||[]).map(({unitCost,...l})=>l)))throw fail('Tu permiso permite actualizar costos, no consumos.',403);
   return versioned(tx,'resources:'+p.id,b,{quoteId:p.id,lines},user);
  });res.json(stripCosts(result,user));
 });
}
function validateResources(lines){if(!Array.isArray(lines)||lines.length>1000)throw fail('Listado de recursos inválido.');for(const l of lines){if(!txt(l.name)||!['input','asset','external','expense'].includes(l.kind))throw fail('Identifica el insumo, uso de activo o gasto.');numeric(l.plannedQuantity,'cantidad prevista');numeric(l.actualQuantity,'cantidad real');if(l.unitCost!==null&&l.unitCost!==undefined&&l.unitCost!=='')numeric(l.unitCost,'costo unitario');}}
