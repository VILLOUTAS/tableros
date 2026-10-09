import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {PGlite} from '@electric-sql/pglite';
import {createApplication,PostgresStore,canReadProject} from '../server.mjs';
import {initializeV55} from '../v55-server.mjs';
import catalog from '../src/catalog.v55.generated.js';
import old from '../src/catalog.v51.generated.js';
import routes from '../src/routes.v55.generated.js';
import {WEIGHTS55,PRODUCTIVITY55,freight55,planWork,dailyTarget,validateComponents,payAmount,shippingLines,serviceDemand} from '../src/v55-domain.js';
import {optimizeProject} from '../src/logic.js';
import {effectiveConfig} from '../src/v51-domain.js';
import {mergeConfig} from '../src/v5-domain.js';
const material=catalog.materials.find(p=>p.sku==='62-EGGER-1503'),edge=catalog.edgeBands.find(p=>p.sku==='67-D-0015');
const sample=()=>({project:{projectName:'Cocina V55',clientName:'Prueba'},workType:'boards',materialIds:[material.id],materialId:material.id,pieces:[{id:'p',name:'Puerta',length:1000,width:400,quantity:2,grain:'sin-veta',edges:{top:edge.id}}],settings:{kerf:3}});
const shipping={version:1,routes,weights:WEIGHTS55,productWeights:{}};
async function fixture(store){
 const result=await createApplication({useMemory:true,store}),server=result.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}`,request=async(path,method='GET',body,headers={})=>{const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,headers:r.headers,body:r.status===204?null:await r.json()};};
 const setup=await request('/api/auth/setup','POST',{fullName:'QA V55',email:'edmundo@villoutas.cl',password:'Only-Test-2026!'});assert.equal(setup.status,201,JSON.stringify(setup.body));
 const headers={cookie:setup.headers.get('set-cookie').split(';')[0],'x-csrf-token':setup.body.csrfToken};
 const login=async(role)=>{const id=randomUUID(),email=id+'@example.test';await result.store.createUser({id,email,fullName:role,passwordHash:await bcrypt.hash('Only-Test-2026!',4),role,roles:[role],active:true,mustChangePassword:false});const a=await request('/api/auth/login','POST',{email,password:'Only-Test-2026!'});assert.equal(a.status,200);return {id,headers:{cookie:a.headers.get('set-cookie').split(';')[0],'x-csrf-token':a.body.csrfToken}};};
 const ok=async(path,method,body,h=headers,status=200)=>{const r=await request(path,method,body,h);assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
 return {request,ok,headers,login,store:result.store,close:()=>new Promise(r=>server.close(r))};
}
test('V5.5 importa 868 referencias y conserva identidades de Carbon y Cinnabar',()=>{
 const all=[...catalog.materials,...catalog.edgeBands,...catalog.services,...catalog.accessories];assert.equal(all.length,868);assert.equal(new Set(all.map(p=>p.sku)).size,868);assert.equal(catalog.accessories.length,356);assert.equal(catalog.edgeBands.length,150);
 const carbon=catalog.materials.find(p=>p.sku==='73-STYLE-CBTM');assert.match(carbon.name,/CARBON/);assert.equal(catalog.aliases['v51-73-style-crtm'],carbon.id);assert.match(catalog.materials.find(p=>p.id===catalog.aliases['v51-73-style-cbtm']).name,/CINNABAR/);
 assert.equal(catalog.materials.find(p=>p.sku==='73-LAM-0001').thickness,8);assert.equal(catalog.materials.find(p=>p.sku==='73-LAM-NA1121').plateWidth,1125);assert.equal(catalog.services.find(s=>s.sku==='SER-NEO-23').unit,'placa');
 assert.equal(catalog.edgeBands.filter(p=>p.thickness===.45).every(p=>p.serviceSku==='SER-0038'),true);
 assert.equal(catalog.materials.filter(p=>['PETLITE','TRUNATUR','STYLELEX'].includes(p.brand)).every(p=>p.cutServiceKey==='styleliteCutRate'),true);
});
test('V5.5 merma material 105%, servicio 100%; motores históricos 102% y 100%',()=>{
 const c=effectiveConfig(mergeConfig(),catalog.services),s={kerf:3,servicePolicies:c.services,...Object.fromEntries(Object.entries(c.services).map(([k,p])=>[k,p.price]))};
 for(const [version,factor] of [['5.5',1.05],['5.1',1.02],['5.0',1]]){const r=optimizeProject([material],sample().pieces,[edge],{...s,calculationVersion:version});assert.equal(r.edgeSummaries[0].materialMeters,2*factor);assert.equal(r.edgeSummaries[0].serviceSubtotal,2*edge.serviceRate);assert.equal(r.summary.edgeMeters,2);}
});
test('V5.5 despacho conserva tarifas, recargo, descuento y mínimos sin piso de costo',()=>{
 assert.equal(routes.length,68);assert.equal(routes.find(r=>r.id==='puerto-montt').ratePerKg,441.35555555555555);
 const lines=[{...material,quantity:10}];const q=freight55(shipping,'concepcion',lines,50);assert.equal(q.reference,11400);assert.equal(q.salesValue,13680);assert.equal(q.net,6840);assert.ok(q.net<q.reference);
 for(const c of routes.filter(r=>r.local)){assert.equal(freight55(shipping,c.id,[{...material,quantity:1}],50).net,5000);}
 const r=freight55(shipping,'puerto-montt',[{...material,quantity:1}],50);assert.equal(r.net,15889);assert.equal(r.total,r.net+r.vat);
 assert.equal(freight55(shipping,'not-enabled',lines).status,'pending');assert.equal(freight55(shipping,'concepcion',[{sku:'UNKNOWN',quantity:1}]).status,'pending');assert.equal(freight55(shipping,'',[],0,false).net,0);
 assert.equal(freight55(shipping,'concepcion',[{sku:'system',weightKey:'otherSystem',quantity:1}]).weightKg,50);
});
test('V5.5 jornada por persona, viernes proporcional y colación excluida',()=>{
 assert.equal(dailyTarget(PRODUCTIVITY55['SER-DIM-01'],'2026-10-05'),30);assert.equal(dailyTarget(PRODUCTIVITY55['SER-DIM-01'],'2026-10-09'),20);assert.equal(dailyTarget(PRODUCTIVITY55['SER-DIM-01'],'2026-10-10'),0);
 assert.deepEqual(planWork('2026-10-08','13:00',120),{date:'2026-10-08',time:'15:30'});assert.deepEqual(planWork('2026-10-09','13:00',120),{date:'2026-10-12',time:'09:00'});assert.equal(payAmount({mode:'unit',unitRate:250},8,100),2000);
});
test('V5.5 Salice exige base por acabado/serie, cubierta metálica y acoplamiento específico',()=>{
 const h=catalog.accessories.find(p=>p.sku==='18-BI-8STRN'),b=catalog.accessories.find(p=>p.sku==='18-BA-C8A1AN0'),cover=catalog.accessories.find(p=>p.sku==='18-AC-2000'),line=(p,n=2)=>({productId:p.id,quantity:n});
 assert.equal(validateComponents([line(h),line(b),line(cover)],catalog.accessories).length,0);assert.ok(validateComponents([line(h),line(b)],catalog.accessories).some(e=>e.includes('placa metálica')));
 const wrong=catalog.accessories.find(p=>p.hardwareType==='base'&&p.series!=='800'&&p.finish==='nickel');assert.ok(validateComponents([line(h),line(wrong),line(cover)],catalog.accessories).some(e=>e.includes('base')));
 const titanium=catalog.accessories.find(p=>p.hardwareType==='hinge'&&p.finish==='titanium'&&p.componentRule);assert.ok(validateComponents([line(titanium),line(wrong),line(cover)],catalog.accessories).length>=2);
 const guide=catalog.accessories.find(p=>p.componentRule?.required.some(r=>r.allowedSkus.includes('18-GU-PA7')));assert.ok(guide);assert.ok(validateComponents([line(guide)],catalog.accessories).length);
 const lift=catalog.accessories.find(p=>p.sku==='18-SE-ESSDD'),coverLift=catalog.accessories.find(p=>p.sku==='18-SE-ESTDB');assert.equal(lift.compatibilityPending,true);assert.equal(coverLift.compatibilityPending,undefined);assert.ok(validateComponents([line(lift)],catalog.accessories).length);assert.equal(validateComponents([line(lift),line(coverLift)],catalog.accessories,{[lift.sku]:{required:[{label:'tapa',allowedSkus:[coverLift.sku],quantity:1}]}}).length,0);
});
test('V5.5 API recalcula material/peso con sobrantes y mantiene toda cotización histórica',async()=>{
 const f=await fixture();try{
  const p=(await f.ok('/api/projects','POST',{...sample(),delivery:{required:true,communeId:'concepcion',street:'Calle 123',discount:50}},f.headers,201)).project;
  assert.equal(p.settings.calculationVersion,'6.0');assert.equal(p.delivery.quote.weightKg,p.summary.boardCount*60+2.1*.01);assert.equal(p.summary.shippingNet,5000);
  const original=structuredClone(p),revised=(await f.ok('/api/projects/'+p.id,'PATCH',{pieces:p.pieces.map(p=>({...p,width:450}))})).project;
  assert.deepEqual(revised.history[0].summary,original.summary);assert.deepEqual(revised.history[0].calculationSnapshot,original.calculationSnapshot);
  const metadata=(await f.ok('/api/projects/'+p.id,'PATCH',{comments:'Solo metadatos'})).project;assert.deepEqual(metadata.summary,revised.summary);assert.equal(metadata.revisionNo,2);
  const historic={...original,id:randomUUID(),settings:{...original.settings,calculationVersion:'5.1'},summary:{...original.summary,net:1234},calculationSnapshot:{...original.calculationSnapshot,summary:{...original.summary,net:1234}}};f.store.projects.set(historic.id,historic);
  await initializeV55(f.store);const saved=(await f.ok('/api/projects/'+historic.id,'PATCH',{comments:'Histórico'})).project;assert.equal(saved.summary.net,1234);assert.equal(saved.settings.calculationVersion,'5.1');
 }finally{await f.close();}
});
test('V5.5 catálogo adicional vende servicios por placa y valida complementos en el servidor',async()=>{
 const f=await fixture();try{
  const s=catalog.services.find(s=>s.sku==='SER-NEO-23');const p=(await f.ok('/api/projects','POST',{project:{projectName:'Ranurado',clientName:'Prueba'},workType:'hardware',saleLines:[{productId:s.id,quantity:2}]},f.headers,201)).project;assert.equal(p.summary.net,s.netPrice*2);assert.equal(p.saleLines[0].unit,'placa');
  const h=catalog.accessories.find(p=>p.sku==='18-BI-8STRN');const bad=await f.request('/api/projects','POST',{project:{clientName:'Prueba'},workType:'hardware',saleLines:[{productId:h.id,quantity:2}]},f.headers);assert.equal(bad.status,400);assert.match(bad.body.error,/base/);
 }finally{await f.close();}
});
test('V5.5 permisos: Comercial propio/asignado, Operador asignado, Supervisión y Finanzas sin edición',async()=>{
 const f=await fixture();try{
  const p=(await f.ok('/api/projects','POST',sample(),f.headers,201)).project;
  for(const role of ['comercial','operador','instalador','supervisor','finanzas','logistica','instalacion']){const u=await f.login(role);const list=await f.ok('/api/projects','GET',undefined,u.headers);assert.equal(list.projects.length,['comercial','operador','instalador'].includes(role)?0:1,role);
   const write=await f.request('/api/projects/'+p.id,'PATCH',{comments:'No autorizado'},u.headers);assert.ok([403,404].includes(write.status),role);
   const params=await f.request('/api/v55/settings','PATCH',{version:1,weights:{}},u.headers);assert.equal(params.status,403,role);
  }
  const publicCatalog=(await f.request('/api/catalog')).body;assert.equal(JSON.stringify(publicCatalog).includes('minPrice'),false);assert.equal(JSON.stringify(publicCatalog).includes('supplierCode'),false);
 }finally{await f.close();}
});
test('V5.5 despacho: comercial propone, logística confirma, versiones y facturas preservadas',async()=>{
 const f=await fixture();try{
  const commercial=await f.login('comercial'),logistics=await f.login('logistica'),p=(await f.ok('/api/projects','POST',sample(),commercial.headers,201)).project;
  let d=(await f.ok('/api/v55/dispatches','POST',{groupId:p.groupId,street:'Calle 123',communeId:'concepcion',proposedDate:'2026-10-06'},commercial.headers,201)).dispatch;assert.equal(d.status,'proposed');
  const bad=await f.request('/api/v55/dispatches','POST',{...d,confirmedDate:'2026-10-07',status:'scheduled'},commercial.headers);assert.equal(bad.status,403);
  d=(await f.ok('/api/v55/dispatches','POST',{...d,confirmedDate:'2026-10-07',status:'scheduled',invoiceNumber:'123',invoiceDate:'2026-10-06'},logistics.headers)).dispatch;
  assert.equal(d.confirmedDate,'2026-10-07');assert.equal(d.history.length,1);
  const reprice=await f.request('/api/v55/dispatches','POST',{...d,requote:true},logistics.headers);assert.equal(reprice.status,400);
  const discount=await f.request('/api/v55/dispatches','POST',{...d,discount:50},f.headers);assert.equal(discount.status,400);
 }finally{await f.close();}
});
test('V5.5 producción distribuida, pagos congelados y cierre limitado a tarea asignada',async()=>{
 const f=await fixture();try{
  const operator=await f.login('operador'),other=await f.login('operador'),finance=await f.login('finanzas');let p=(await f.ok('/api/projects','POST',sample(),f.headers,201)).project;
  p=(await f.ok('/api/projects/'+p.id,'PATCH',{project:{status:'facturado_pagado'},invoiceNumber:'10'})).project;p=(await f.ok('/api/projects/'+p.id,'PATCH',{project:{status:'produccion'}})).project;
  const o=(await f.ok('/api/v55/operators','POST',{name:'Operador 1',userId:operator.id,areas:['boards']})).operator;
  await f.ok('/api/v55/pay-rates','POST',{operatorId:o.id,serviceSku:'SER-0038',mode:'unit',unitRate:200,hourRate:0,effectiveDate:'2026-10-01'},finance.headers,201);
  const common={quoteId:p.id,area:'boards',operatorId:o.id,startDate:'2026-10-05',startTime:'08:00'};
  const t=(await f.ok('/api/v55/tasks','POST',{...common,serviceSku:'SER-0038',quantity:2})).task;
  const cut=(await f.ok('/api/v55/tasks','POST',{...common,serviceSku:'SER-DIM-01',quantity:p.summary.boardCount})).task;
  assert.equal((await f.ok('/api/projects','GET',undefined,operator.headers)).projects.length,1);assert.equal((await f.ok('/api/projects','GET',undefined,other.headers)).projects.length,0);
  assert.equal((await f.request('/api/v55/tasks','POST',{...common,serviceSku:'SER-0038',quantity:1},f.headers)).status,400);
  assert.equal((await f.request('/api/v55/tasks/'+t.id+'/complete','POST',{version:t.version},operator.headers)).status,400);
  const e=(await f.ok('/api/v55/entries','POST',{taskId:t.id,date:'2026-10-05',quantity:2,minutes:2},f.headers,201)).entry;assert.equal(e.payAmount,400);
  const ownOperations=await f.ok('/api/v55/operations','GET',undefined,operator.headers);assert.equal(ownOperations.entries.length,1);assert.equal('payAmount' in ownOperations.entries[0],false);assert.equal('payRateSnapshot' in ownOperations.entries[0],false);
  await f.ok('/api/v55/pay-rates','POST',{operatorId:o.id,serviceSku:'SER-0038',mode:'unit',unitRate:999,hourRate:0,effectiveDate:'2026-10-01'},finance.headers,201);assert.equal((await f.store.getV5('entry:'+e.id)).payAmount,400);
  await f.ok('/api/v55/tasks/'+t.id+'/complete','POST',{version:t.version+1},operator.headers);assert.equal((await f.store.getProject(p.id)).project.status,'produccion');
  await f.ok('/api/v55/entries','POST',{taskId:cut.id,date:'2026-10-05',quantity:cut.quantity,minutes:18},f.headers,201);
  await f.ok('/api/v55/tasks/'+cut.id+'/complete','POST',{version:cut.version+1},operator.headers);assert.equal((await f.store.getProject(p.id)).project.status,'despacho');assert.ok((await f.store.getProject(p.id)).actualProductionEnd);
  assert.equal((await f.request('/api/projects/'+p.id,'PATCH',{invoiceNumber:'HACK'},operator.headers)).status,403);
  const costs=await f.ok('/api/v55/projects/'+p.id+'/costs');assert.equal(costs.laborCost,400);assert.ok(costs.missingCosts.some(n=>n.includes('SER-DIM-01')));
 }finally{await f.close();}
});
test('V5.5 PostgreSQL migra sin duplicar ni borrar datos, con configuración concurrente protegida',async()=>{
 const pg=await PGlite.create(),db=new PostgresStore('');await db.pool.end();const pool={query:async(sql,params)=>params?pg.query(sql,params):(await pg.exec(sql)).at(-1),connect:async()=>({...pool,release(){}})};db.pool=pool;let f;
 try{f=await fixture(db);const p=(await f.ok('/api/projects','POST',sample(),f.headers,201)).project,c=await f.ok('/api/v55/settings');await f.ok('/api/v55/settings','PATCH',{version:c.version,productWeights:{[material.sku]:65}});assert.equal((await f.request('/api/v55/settings','PATCH',{version:c.version,productWeights:{}},f.headers)).status,409);await initializeV55(db);assert.equal((await db.getV5('v55:settings')).productWeights[material.sku],65);assert.deepEqual((await db.getProject(p.id)).summary,p.summary);}
 finally{if(f)await f.close();await pg.close();}
});
test('V5.5 aplica el disco configurado y consolida costos sin revelarlos a producción',async()=>{
 const f=await fixture();try{
  const cfg=await f.ok('/api/v5/config');await f.ok('/api/v5/config','PATCH',{version:cfg.version,defaultKerf:3.5});
  const a=sample();delete a.settings.kerf;const p=(await f.ok('/api/projects','POST',a,f.headers,201)).project;assert.equal(p.settings.kerf,3.5);
  const s=catalog.services.find(s=>s.sku==='SER-NEO-23'),q=(await f.ok('/api/projects','POST',{project:{projectName:'Servicios asociados',clientName:'Prueba'},groupId:p.groupId,workType:'hardware',saleLines:[{productId:s.id,quantity:2}]},f.headers,201)).project;
  const lines=[{id:'insumo1',name:'Adhesivo',kind:'input',unit:'kg',plannedQuantity:2,actualQuantity:3,unitCost:1000,serviceSku:s.sku}];await f.ok('/api/v55/projects/'+q.id+'/costs','POST',{version:0,lines});
  const consolidated=await f.ok('/api/v55/groups/'+p.groupId+'/costs');assert.equal(consolidated.quoteIds.length,2);assert.equal(consolidated.netRevenue,p.summary.net+q.summary.net);assert.ok(consolidated.actualCost>=3000);
  const settings=await f.ok('/api/v55/settings');await f.ok('/api/v55/settings','PATCH',{version:settings.version,resourceTemplates:{[s.sku]:lines}});
  const production=await f.login('produccion');const view=await f.ok('/api/v55/projects/'+q.id+'/costs','GET',undefined,production.headers);assert.equal('unitCost' in view.lines[0],false);assert.equal('actualCost' in view,false);
  const masked=await f.ok('/api/v55/settings','GET',undefined,production.headers);assert.equal(JSON.stringify(masked).includes('unitCost'),false);
 }finally{await f.close();}
});
