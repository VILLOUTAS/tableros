import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {PGlite} from '@electric-sql/pglite';
import {createApplication,PostgresStore} from '../server.mjs';
import {initializeV60} from '../v60-server.mjs';
import catalog from '../src/catalog.v55.generated.js';
import matrix from '../src/matrix.v60.generated.js';
import {TAXONOMY60,decorate60,newServices60,laborPayables60,quoteWorkAreas60} from '../src/v60-domain.js';
import {permitted} from '../src/v5-domain.js';
import {updateQuoteProducts} from '../src/v51-domain.js';
import {optimizeProject} from '../src/logic.js';
async function fixture(store){
 const result=await createApplication({useMemory:true,store}),server=result.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const request=async(path,method='GET',body,headers={})=>{const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,headers:r.headers,body:await r.json()};};
 const setup=await request('/api/auth/setup','POST',{fullName:'Prueba V60',email:'edmundo@villoutas.cl',password:'Only-Test-2026!'});assert.equal(setup.status,201,JSON.stringify(setup.body));
 const headers={cookie:setup.headers.get('set-cookie').split(';')[0],'x-csrf-token':setup.body.csrfToken};
 let loginIndex=0;
 const login=async role=>{const id=randomUUID(),email=id+'@example.test';await result.store.createUser({id,email,fullName:role,passwordHash:await bcrypt.hash('Only-Test-2026!',4),role,roles:[role],active:true,mustChangePassword:false});const a=await request('/api/auth/login','POST',{email,password:'Only-Test-2026!'},{'x-forwarded-for':'10.0.0.'+(++loginIndex)});assert.equal(a.status,200);return {id,headers:{cookie:a.headers.get('set-cookie').split(';')[0],'x-csrf-token':a.body.csrfToken}};};
 const ok=async(path,method,body,h=headers,status=200)=>{const r=await request(path,method,body,h);assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
 return {request,ok,headers,login,store:result.store,close:()=>new Promise(r=>server.close(r))};
}
test('V6 matriz exacta, tapacantos en Tableros, servicios y despachos separados',()=>{
 assert.equal(matrix.rows.length,123);assert.equal(matrix.rows.filter(r=>r.path[0]==='PRODUCTOS').length,43);assert.equal(matrix.rows.filter(r=>r.path[0]==='SERVICIOS').length,80);
 assert.deepEqual(TAXONOMY60.map(r=>r.name),['PRODUCTOS','SERVICIOS']);assert.equal(JSON.stringify(TAXONOMY60).includes('DESPACHO'),false);
 for(const p of [...catalog.materials,...catalog.edgeBands,...catalog.accessories]){const mapped=decorate60(p);assert.equal(mapped.catalogPath[0],'PRODUCTOS',p.sku);assert.ok(mapped.weightKey,p.sku);}
 for(const p of catalog.edgeBands)assert.equal(decorate60(p).catalogPath[1],'TABLEROS');
 const added=newServices60(catalog.services);assert.ok(added.some(s=>s.catalogPath[1]==='DISEÑO'));assert.ok(added.every(s=>s.netPrice===null&&s.minPrice===null&&s.purchasePrice===null&&s.provisionalCode));
 assert.equal(decorate60(catalog.services.find(s=>s.sku==='SER-0038')).taskArea,'boards');
});
test('V6 conserva cálculo histórico y nuevo motor usa 105% material, 100% servicio',()=>{
 const m=catalog.materials.find(p=>p.sku==='62-EGGER-1503'),e=catalog.edgeBands.find(p=>p.sku==='67-D-0015');
 for(const [version,factor] of [['6.0',1.05],['5.5',1.05],['5.1',1.02],['5.0',1]]){
  const r=optimizeProject([m],[{name:'Puerta',length:1000,width:400,quantity:2,grain:'sin-veta',edges:{top:e.id}}],[e],{kerf:3,calculationVersion:version});assert.equal(r.edgeSummaries[0].materialMeters,2*factor);assert.equal(r.edgeSummaries[0].serviceSubtotal,2*e.serviceRate);
 }
 const old={id:'old',sku:'CODE',name:'Gris Cachémira',active:false},current={id:'new',sku:'CODE',name:'Gris Cachemira',active:true};
 const q=updateQuoteProducts({materialId:'old',materialIds:['old'],pieces:[{materialId:'old',edges:{}}]},[old,current],[]);assert.equal(q.materialId,'new');assert.equal(q.pieces[0].materialId,'new');
 assert.throws(()=>updateQuoteProducts({materialId:'old',materialIds:['old'],pieces:[]},[old],[]),e=>e.message==='Selecciona un producto para esta pieza.'&&e.materialId==='old');
});
test('V6 saldo incluye pendientes anteriores y excluye producción no validada; no inventa tarifas',()=>{
 const t=[{id:'t',operatorId:'o',serviceSku:'S',unit:'ml',name:'Tapacanto'}];
 const entries=[{id:'old',taskId:'t',date:'2026-09-01',quantity:2,payAmount:200,validated:true},{id:'paid',taskId:'t',date:'2026-10-01',quantity:3,payAmount:300,validated:true},{id:'missing',taskId:'t',date:'2026-10-02',quantity:4,payAmount:null,validated:true},{id:'unvalidated',taskId:'t',date:'2026-10-02',quantity:100,payAmount:99999,validated:false}];
 const [r]=laborPayables60(t,entries,[{id:'o',name:'Operador'}],[{entryIds:['paid']}],'2026-10');assert.equal(r.producedAmount,300);assert.equal(r.paidAmount,300);assert.equal(r.pendingAmount,200);assert.equal(r.missingRates,1);assert.equal(r.services[0].quantity,7);assert.equal(r.services[0].pendingQuantity,6);
 for(const role of ['superadmin','admin','logistica','finanzas'])assert.equal(permitted({role},'laborPayables'),true);
 for(const role of ['comercial','produccion','instalacion','supervisor','operador','instalador','cliente'])assert.equal(permitted({role},'laborPayables'),false);
 assert.equal(permitted({role:'logistica'},'laborPayments'),false);
});
test('V6 servicios configurables, tareas de instalador, costos y tarifas independientes; pago no duplicable',async()=>{
 const f=await fixture();try{
  const c=(await f.request('/api/catalog')).body.services,placeholder=c.find(s=>s.id==='v60-service-62');assert.ok(placeholder);assert.equal(placeholder.pricingPending,true);assert.equal('minPrice' in placeholder,false);
  assert.equal((await f.request('/api/projects','POST',{project:{projectName:'Instalación',clientName:'Cliente'},workType:'hardware',saleLines:[{productId:placeholder.id,quantity:2}]},f.headers)).status,400);
  const admin=await f.login('admin'),logistics=await f.login('logistica'),finance=await f.login('finanzas'),installer=await f.login('instalador');
  const configured=await f.ok('/api/admin/catalog/service/'+placeholder.id,'PATCH',{product:{sku:'SER-INST-BASE',netPrice:25000,minPrice:15000,purchasePrice:8000,unit:'unidad',unitPending:false}},f.headers);
  const svc=configured.catalog.services.find(s=>s.sku==='SER-INST-BASE');assert.equal(svc.pricingPending,false);assert.equal(svc.purchasePrice,8000);assert.equal(svc.taskArea,'installations');
  const updated=await f.ok('/api/admin/catalog/service/'+svc.id,'PATCH',{product:{netPrice:26000,minPrice:16000,purchasePrice:123}},admin.headers);const s=updated.catalog.services.find(s=>s.sku==='SER-INST-BASE'&&s.active);assert.equal(s.minPrice,16000);assert.equal('purchasePrice' in s,false);assert.equal((await f.store.listCatalogRevisions()).find(r=>r.id===s.id).payload.purchasePrice,8000);
  let p=(await f.ok('/api/projects','POST',{project:{projectName:'Instalación',clientName:'Cliente'},workType:'hardware',saleLines:[{productId:s.id,quantity:2}]},f.headers,201)).project;assert.equal(p.summary.net,52000);assert.deepEqual(quoteWorkAreas60(p),['installations']);
  p=(await f.ok('/api/projects/'+p.id,'PATCH',{project:{status:'facturado_pagado'},invoiceNumber:'1'})).project;p=(await f.ok('/api/projects/'+p.id,'PATCH',{project:{status:'produccion'}})).project;
  const o=(await f.ok('/api/v55/operators','POST',{name:'Instalador de prueba',userId:installer.id,areas:['installations']})).operator;
  await f.ok('/api/v55/pay-rates','POST',{operatorId:o.id,serviceSku:'SER-INST-BASE',mode:'unit',unitRate:6000,hourRate:0,effectiveDate:'2026-10-01'},finance.headers,201);
  const task=(await f.ok('/api/v55/tasks','POST',{quoteId:p.id,area:'installations',operatorId:o.id,serviceSku:'SER-INST-BASE',quantity:2,startDate:'2026-10-05',startTime:'08:00',plannedMinutes:60})).task;
  const entry=(await f.ok('/api/v55/entries','POST',{taskId:task.id,date:'2026-10-05',quantity:2,minutes:60},f.headers,201)).entry;assert.equal(entry.payAmount,12000);
  const frozen=structuredClone(await f.store.getProject(p.id));
  for(const u of [admin,logistics,finance]){const report=await f.ok('/api/v60/labor-payables?month=2026-10','GET',undefined,u.headers);assert.equal(report.totals.pendingAmount,12000);assert.equal(report.rows[0].entries[0].amount,12000);assert.equal(JSON.stringify(report).includes('purchasePrice'),false);}
  for(const role of ['comercial','supervisor','produccion','instalacion','operador','cliente']){const u=await f.login(role);assert.equal((await f.request('/api/v60/labor-payables','GET',undefined,u.headers)).status,403);}
  const body={entryIds:[entry.id],date:'2026-10-06',reference:'Transferencia de prueba'};
  assert.equal((await f.request('/api/v60/labor-payments','POST',body,logistics.headers)).status,403);
  const results=await Promise.all([f.request('/api/v60/labor-payments','POST',body,finance.headers),f.request('/api/v60/labor-payments','POST',body,finance.headers)]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  assert.equal((await f.ok('/api/v60/labor-payables?month=2026-10','GET',undefined,logistics.headers)).totals.pendingAmount,0);
  assert.equal((await f.store.getV5('entry:'+entry.id)).payAmount,12000);assert.deepEqual(await f.store.getProject(p.id),frozen);
  await f.ok('/api/v55/tasks/'+task.id+'/complete','POST',{version:task.version+1},installer.headers);assert.equal((await f.store.getProject(p.id)).project.status,'despacho');
  const revision=await f.ok('/api/admin/catalog/service/'+s.id,'PATCH',{product:{netPrice:30000}},f.headers);assert.ok(revision);assert.equal((await f.store.getProject(p.id)).summary.net,52000);
 }finally{await f.close();}
});
test('V6 PostgreSQL migra idempotente sin tocar cotizaciones, usuarios ni pagos anteriores',async()=>{
 const pg=await PGlite.create(),db=new PostgresStore('');await db.pool.end();const pool={query:async(sql,params)=>params?pg.query(sql,params):(await pg.exec(sql)).at(-1),connect:async()=>({...pool,release(){}})};db.pool=pool;let f;
 try{f=await fixture(db);await db.putV5('entry:legacy',{id:'legacy',date:'2026-09-01',quantity:2,payAmount:100,validated:true});const conf=await db.getV5('config');await db.putV5('config',{...conf,defaultKerf:4});await initializeV60(db);assert.equal((await db.getV5('config')).defaultKerf,4);assert.equal((await db.getV5('entry:legacy')).payAmount,100);assert.equal((await db.listUsers()).length,1);assert.equal((await db.getV5('v60:migration')).release,'6.0');}
 finally{if(f)await f.close();await pg.close();}
});
