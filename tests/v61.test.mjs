import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {PGlite} from '@electric-sql/pglite';
import {createApplication,PostgresStore} from '../server.mjs';
import {initializeV61} from '../v61-server.mjs';
import matrix from '../src/services.v61.generated.js';
import {serviceDemand61,gridHeaders61} from '../src/v61-domain.js';
import {parseMappedRows,suggestMapping} from '../src/v5-import.js';
async function fixture(store){
 const result=await createApplication({useMemory:true,store}),server=result.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 const request=async(path,method='GET',body,headers={})=>{const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,headers:r.headers,body:r.status===204?null:await r.json()};};
 const setup=await request('/api/auth/setup','POST',{fullName:'QA V61',email:'edmundo@villoutas.cl',password:'Only-Test-2026!'});assert.equal(setup.status,201);const headers={cookie:setup.headers.get('set-cookie').split(';')[0],'x-csrf-token':setup.body.csrfToken};
 const ok=async(path,method='GET',body,h=headers,status=200)=>{const r=await request(path,method,body,h);assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
 const login=async role=>{const id=randomUUID(),email=id+'@example.test';await result.store.createUser({id,email,fullName:role,passwordHash:await bcrypt.hash('Only-Test-2026!',4),role,roles:[role],active:true,mustChangePassword:false});const a=await request('/api/auth/login','POST',{email,password:'Only-Test-2026!'});assert.equal(a.status,200);return {id,headers:{cookie:a.headers.get('set-cookie').split(';')[0],'x-csrf-token':a.body.csrfToken}};};
 const catalog=(await request('/api/catalog')).body,svc=sku=>catalog.services.find(s=>s.sku===sku&&s.active),m=catalog.materials.find(m=>m.sku==='62-EGGER-1503'&&m.active),e=catalog.edgeBands.find(e=>e.sku==='67-D-0015'&&e.active);
 const board=()=>({project:{projectName:'Tableros QA',clientName:'Cliente QA'},workType:'boards',materialId:m.id,materialIds:[m.id],pieces:[{id:'p',name:'Puerta',length:1000,width:400,quantity:2,grain:'sin-veta',edges:{top:e.id}}],settings:{kerf:3}});
 const sale=async(sku,quantity=3)=> (await ok('/api/projects','POST',{project:{projectName:'Servicios QA',clientName:'Cliente QA'},quoteKind:'services',workType:'hardware',saleLines:[{productId:svc(sku).id,quantity}]},headers,201)).project;
 const paid=async p=>(await ok('/api/projects/'+p.id,'PATCH',{project:{status:'facturado_pagado'},invoiceNumber:'QA'})).project;
 return {request,ok,headers,login,store:result.store,catalog,svc,m,e,board,sale,paid,close:()=>new Promise(r=>server.close(r))};
}
test('V6.1 matriz completa, precios privados por permiso y códigos anteriores conservados',async()=>{
 const f=await fixture();try{
  const active=f.catalog.services.filter(s=>s.active);assert.equal(active.length,104);assert.equal(new Set(active.map(s=>s.sku)).size,104);
  assert.equal(active.every(s=>s.netPrice!=null&&!s.pricingPending),true);assert.equal(JSON.stringify(active).includes('payUnitRate'),false);assert.equal(JSON.stringify(active).includes('minPrice'),false);
  const internal=(await f.ok('/api/catalog','GET',undefined,f.headers)).services.filter(s=>s.active);for(const s of matrix.services){const r=internal.find(p=>p.sku===s.sku);assert.equal(r.netPrice,s.netPrice);assert.equal(r.minPrice,s.minPrice);assert.equal(r.payUnitRate,s.payUnitRate);assert.equal(r.purchasePrice,null);}
  assert.ok(f.catalog.services.some(s=>s.sku==='SER-NEO-23'&&!s.active));assert.equal(f.svc('SER-PLC-NEO-04').unit,'ml');assert.equal(f.svc('SER-HER-SAL-05').unit,'par');
 }finally{await f.close();}
});
test('V6.1 placas completas cobran base; metros lineales solo como servicio separado y acabados según material',async()=>{
 const f=await fixture();try{
  for(const [type,thickness,sku,base,bevel] of [['neolith',6,'SER-PLC-DIM-01',50000,12500],['neolith',12,'SER-PLC-DIM-02',75000,12500],['stone',18,'SER-PLC-DIM-03',60000,12000]]){
   const m=f.catalog.materials.find(m=>m.active&&m.materialType===type&&m.thickness===thickness&&!m.dimensionsPending);assert.ok(m);
   const p=(await f.ok('/api/projects','POST',{project:{projectName:'Placas QA',clientName:'Cliente QA'},workType:'slabs',materialId:m.id,materialIds:[m.id],pieces:[{name:'Cubierta',length:1000,width:400,quantity:1,grain:'sin-veta',edges:{},finishes:{top:'bevel'}}]},f.headers,201)).project;
   assert.equal(p.summary.cuttingSubtotal,base*p.summary.boardCount);assert.equal(p.summary.finishSubtotal,bevel);assert.equal(p.summary.net,base*p.summary.boardCount+bevel);
   const demands=serviceDemand61(p);assert.ok(demands.some(d=>d.sku===sku&&d.unit==='placa'));assert.equal(demands.some(d=>d.sku==='SER-PLC-NEO-01'||d.sku==='SER-PLA-OTRA-01'),false);
  }
  const standalone=await f.sale('SER-PLC-NEO-01',3);assert.equal(standalone.summary.net,10500);assert.equal(standalone.saleLines[0].unit,'ml');await f.paid(standalone);const task=(await f.ok('/api/v61/operations')).tasks.find(t=>t.quoteId===standalone.id);assert.equal(task.quantity,3);assert.equal(task.payUnitRate,500);
 }finally{await f.close();}
});
test('V6.1 tareas automáticas, producción sin responsable y asignación posterior conserva cantidad y tarifa',async()=>{
 const f=await fixture();try{
  let p=await f.paid(await f.sale('SER-PLC-NEO-01',4));p=(await f.ok('/api/projects/'+p.id,'PATCH',{project:{status:'produccion'}})).project;
  let [seed]=(await f.ok('/api/v61/operations')).tasks;assert.equal(seed.operatorId,null);assert.equal(seed.quantity,4);
  const e=(await f.ok('/api/v61/entries','POST',{taskId:seed.id,date:'2026-10-13',quantity:2},f.headers,201)).entry;assert.equal(e.payAmount,null);assert.equal(e.pendingUnitRate,500);assert.equal(e.minutes,0);
  const logistics=await f.login('logistica'),report=await f.ok('/api/v60/labor-payables?month=2026-10','GET',undefined,logistics.headers);assert.equal(report.totals.pendingResponsible,1);
  assert.equal((await f.request('/api/v60/labor-payments','POST',{entryIds:[e.id],date:'2026-10-14',reference:'QA'},f.headers)).status,400);
  await f.ok('/api/v61/services/'+f.svc(seed.serviceSku).id+'/pay-rate','PATCH',{payUnitRate:999});
  const responsible=(await f.ok('/api/v61/operators','POST',{name:'Subcontratista QA',kind:'contractor',areas:['slabs']})).operator;
  seed=(await f.ok('/api/v61/operations')).tasks[0];assert.equal((await f.request('/api/v61/tasks/'+seed.id+'/assign','POST',{operatorId:responsible.id,quantity:1,version:seed.version},f.headers)).status,400);
  const assigned=(await f.ok('/api/v61/tasks/'+seed.id+'/assign','POST',{operatorId:responsible.id,quantity:2,version:seed.version})).task;
  const saved=await f.store.getV5('entry:'+e.id);assert.equal(saved.taskId,assigned.id);assert.equal(saved.operatorId,responsible.id);assert.equal(saved.payAmount,1000);assert.equal(saved.payRateSnapshot.unitRate,500);
  const tasks=(await f.ok('/api/v61/operations')).tasks;assert.equal(tasks.length,2);assert.equal(tasks.reduce((n,t)=>n+t.quantity,0),4);assert.equal(tasks.find(t=>!t.operatorId).quantity,2);
  await f.ok('/api/v61/tasks/'+assigned.id+'/complete','POST',{version:assigned.version});assert.equal((await f.store.getProject(p.id)).project.status,'produccion');
  const remaining=tasks.find(t=>!t.operatorId);await f.ok('/api/v61/entries','POST',{taskId:remaining.id,date:'2026-10-13',quantity:2},f.headers,201);await f.ok('/api/v61/tasks/'+remaining.id+'/complete','POST',{version:remaining.version+1});assert.equal((await f.store.getProject(p.id)).project.status,'despacho');
  const closed=await f.store.getV5('task:'+remaining.id);await f.ok('/api/v61/tasks/'+closed.id+'/assign','POST',{operatorId:responsible.id,quantity:2,version:closed.version});assert.equal((await f.ok('/api/v60/labor-payables?month=2026-10')).totals.pendingAmount,2000);
 }finally{await f.close();}
});
test('V6.1 no sobredimensiona tareas de tapacanto, protege avances concurrentes y no acepta redefinición manual',async()=>{
 const f=await fixture();try{
  const p=await f.paid((await f.ok('/api/projects','POST',f.board(),f.headers,201)).project),tasks=(await f.ok('/api/v61/operations')).tasks;assert.equal(tasks.length,2);assert.equal(p.calculationSnapshot.edgeSummaries[0].materialMeters,2.1);const t=tasks.find(t=>t.serviceSku==='SER-TAB-DIM-05');assert.equal(t.quantity,2);
  assert.equal((await f.request('/api/v55/tasks','POST',{quoteId:p.id},f.headers)).status,409);
  const results=await Promise.all([1,2].map(()=>f.request('/api/v61/entries','POST',{taskId:t.id,date:'2026-10-13',quantity:2},f.headers)));assert.deepEqual(results.map(r=>r.status).sort(),[201,400]);
  assert.equal((await f.request('/api/projects/'+p.id,'PATCH',{pieces:p.pieces.map(x=>({...x,quantity:1}))},f.headers)).status,400);assert.equal((await f.store.getProject(p.id)).summary.net,p.summary.net);
  const operator=await f.login('operador');assert.equal((await f.request('/api/v61/entries','POST',{taskId:t.id,date:'2026-10-13',quantity:1},operator.headers)).status,403);
 }finally{await f.close();}
});
test('V6.1 cotización paralela se vincula por cliente sin alterar precios ni historial y productos solos no generan tareas',async()=>{
 const f=await fixture();try{
  const target=(await f.ok('/api/projects','POST',f.board(),f.headers,201)).project,sku=f.catalog.accessories.find(p=>p.active&&!p.componentRule&&!p.compatibilityPending);
  assert.ok(sku);const p=(await f.ok('/api/projects','POST',{project:{projectName:'Productos QA',clientName:'Cliente QA'},quoteKind:'products',workType:'hardware',saleLines:[{productId:sku.id,quantity:1}]},f.headers,201)).project;
  const linked=(await f.ok('/api/v61/projects/'+p.id+'/link','POST',{targetQuoteId:target.id})).project;assert.equal(linked.groupId,target.groupId);assert.deepEqual(linked.summary,p.summary);assert.deepEqual(linked.saleLines,p.saleLines);assert.deepEqual(linked.history,p.history);
  await f.paid(linked);assert.equal((await f.ok('/api/v61/operations')).tasks.length,0);
  const other=await f.sale('SER-PLC-NEO-01');await f.ok('/api/projects/'+other.id,'PATCH',{project:{clientName:'Otro Cliente'}});assert.equal((await f.request('/api/v61/projects/'+other.id+'/link','POST',{targetQuoteId:target.id},f.headers)).status,400);
 }finally{await f.close();}
});
test('V6.1 plantilla de pegado conserva ejes, reconoce las cuatro columnas de lados y valida sin truncar medidas',()=>{
 const rows=[gridHeaders61,['M','Puerta',2,'373,1','400,2','E','X','','X','']],mapping=suggestMapping(rows);
 const p=parseMappedRows(rows,{mapping,materialMap:{m:'material'},typeMap:{e:'edge'},markerMap:{x:'selected'},defaultGrain:'sin-veta',units:'mm',startRow:2});assert.deepEqual(p.issues,[]);assert.equal(p.pieces[0].length,373.1);assert.equal(p.pieces[0].width,400.2);assert.equal(p.pieces[0].edges.top,'edge');assert.equal(p.pieces[0].edges.left,'edge');assert.equal(p.pieces[0].edges.bottom,null);
});
test('V6.1 excepción sin tarifa se valoriza explícitamente sin modificar pagos anteriores',async()=>{
 const f=await fixture();try{
  const p=await f.paid(await f.sale('SER-PLC-NEO-01',1)),logistics=await f.login('logistica'),finance=await f.login('finanzas');
  const task=(await f.ok('/api/v61/tasks/uncoded','POST',{quoteId:p.id,name:'Ajuste especial',unit:'unidad',quantity:2,area:'slabs',reason:'Reparación adicional aprobada'},logistics.headers,201)).task;
  const o=(await f.ok('/api/v61/operators','POST',{name:'Responsable QA',areas:['slabs']})).operator,assigned=(await f.ok('/api/v61/tasks/'+task.id+'/assign','POST',{operatorId:o.id,version:task.version})).task;
  const e=(await f.ok('/api/v61/entries','POST',{taskId:task.id,date:'2026-10-13',quantity:2},f.headers,201)).entry;assert.equal(e.payAmount,null);
  assert.equal((await f.request('/api/v61/tasks/'+task.id+'/pay-rate','PATCH',{payUnitRate:800,version:assigned.version+1},logistics.headers)).status,403);
  const update=(await f.ok('/api/v61/tasks/'+task.id+'/pay-rate','PATCH',{payUnitRate:800,version:assigned.version+1},finance.headers)).task;assert.equal((await f.store.getV5('entry:'+e.id)).payAmount,1600);
  assert.equal((await f.request('/api/v61/tasks/'+task.id+'/pay-rate','PATCH',{payUnitRate:900,version:update.version},finance.headers)).status,400);assert.equal((await f.store.getV5('entry:'+e.id)).payAmount,1600);
 }finally{await f.close();}
});
test('V6.1 avance de tarea antigua usa tarifa por unidad compatible y conserva registros antiguos',async()=>{
 const f=await fixture();try{
  const p=await f.paid((await f.ok('/api/projects','POST',f.board(),f.headers,201)).project),seed=(await f.ok('/api/v61/operations')).tasks.find(t=>t.serviceSku==='SER-TAB-DIM-05');
  const t={...seed,id:'historical-task',release:'5.5',auto:false,operatorId:'historical-operator',serviceSku:'SER-0038',quantity:2,payUnitRate:null,serviceSnapshot:null};await f.store.putV5('task:'+seed.id,{...seed,status:'cancelled',quantity:0,required:false});await f.store.putV5('task:'+t.id,t);
  const historical={id:'prior-entry',taskId:t.id,quoteId:p.id,serviceSku:t.serviceSku,operatorId:t.operatorId,date:'2026-09-01',quantity:1,minutes:90,payRateSnapshot:{mode:'mixed',unitRate:90,hourRate:4000},payAmount:6090,validated:true};await f.store.putV5('entry:'+historical.id,historical);
  const next=(await f.ok('/api/v61/entries','POST',{taskId:t.id,date:'2026-10-13',quantity:1},f.headers,201)).entry;assert.equal(next.payAmount,100);assert.deepEqual(await f.store.getV5('entry:'+historical.id),historical);assert.equal((await f.ok('/api/v61/operations')).tasks.filter(x=>x.serviceSku==='SER-TAB-DIM-05'&&x.status!=='cancelled').length,0);
 }finally{await f.close();}
});
test('V6.1 PostgreSQL migración repetible preserva datos previos, dimensiones, operadores y pagos',async()=>{
 const pg=await PGlite.create(),db=new PostgresStore('');await db.pool.end();const pool={query:async(sql,params)=>params?pg.query(sql,params):(await pg.exec(sql)).at(-1),connect:async()=>({...pool,release(){}})};db.pool=pool;let f;
 try{
  f=await fixture(db);const p=(await f.ok('/api/projects','POST',f.board(),f.headers,201)).project;
  await db.putV5('entry:historic',{id:'historic',date:'2026-09-01',quantity:2,payAmount:12345,payRateSnapshot:{mode:'mixed',unitRate:100,hourRate:900},validated:true});await db.putV5('operator:historic',{id:'historic',name:'Anterior',areas:['boards'],active:true});const c=await db.getV5('config');await db.putV5('config',{...c,defaultKerf:4.25});
  await f.ok('/api/v51/catalog/dimensions','POST',{ids:[f.m.id],changes:{plateLength:3000}});const before=await db.getProject(p.id),user=(await db.listUsers())[0];await initializeV61(db);await initializeV61(db);
  assert.deepEqual(await db.getProject(p.id),before);assert.deepEqual((await db.listUsers())[0],user);assert.equal((await db.getV5('config')).defaultKerf,4.25);assert.equal((await db.getV5('entry:historic')).payAmount,12345);assert.equal((await db.getV5('operator:historic')).name,'Anterior');assert.equal((await db.listCatalogRevisions()).length,1);assert.equal((await db.getV5('v61:migration')).release,'6.1');
 }finally{if(f)await f.close();await pg.close();}
});
