import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import {randomUUID} from 'node:crypto';
import {createApplication,PostgresStore} from '../server.mjs';
import {PGlite} from '@electric-sql/pglite';
import {initializeV51} from '../v51-server.mjs';
import catalog from '../src/catalog.v51.generated.js';
import currentCatalog from '../src/catalog.v55.generated.js';
import {optimizeProject} from '../src/logic.js';
import {effectiveConfig,FREIGHT51,TAXONOMY51,projectMatches} from '../src/v51-domain.js';
import {mergeConfig,calculateFreight} from '../src/v5-domain.js';
const m=currentCatalog.materials.find(m=>m.sku==='62-EGGER-1503'),edge=currentCatalog.edgeBands.find(e=>e.sku==='67-D-0015'),slab=currentCatalog.materials.find(m=>m.thickness===12&&m.materialType==='neolith');
const sample=()=>({workType:'boards',materialId:m.id,materialIds:[m.id],project:{projectName:'Cocina de prueba',clientName:'Cliente QA'},pieces:[{id:'p1',name:'Puerta',length:1000,width:300,quantity:2,grain:'sin-veta',edges:{top:edge.id}}],settings:{kerf:4.2}});
async function fixture(database){
  const {app,store}=await createApplication({useMemory:true,store:database}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
  const request=async(path,method='GET',body,headers={})=>{const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:r.status===204?null:await r.json(),headers:r.headers};};
  const setup=await request('/api/auth/setup','POST',{fullName:'Edmundo QA',email:'edmundo@villoutas.cl',password:'SoloPrueba2026!'});const headers={cookie:setup.headers.get('set-cookie').split(';')[0],'x-csrf-token':setup.body.csrfToken};
  const login=async(role)=>{const email=role+'@example.test';await store.createUser({id:randomUUID(),email,fullName:role,passwordHash:await bcrypt.hash('SoloPrueba2026!',4),role,roles:[role],active:true,mustChangePassword:false});const r=await request('/api/auth/login','POST',{email,password:'SoloPrueba2026!'});assert.equal(r.status,200,JSON.stringify(r.body));return {cookie:r.headers.get('set-cookie').split(';')[0],'x-csrf-token':r.body.csrfToken};};
  return {store,request,headers,login,close:()=>new Promise(r=>server.close(r))};
}
test('V5.1 catálogo: 471 referencias únicas, agrupación exacta, correcciones y formatos',()=>{
  const all=[...catalog.materials,...catalog.edgeBands,...catalog.services];assert.equal(all.length,471);assert.equal(new Set(all.map(p=>p.sku)).size,471);
  assert.equal(catalog.materials.find(m=>m.sku==='73-STYLE-CRTM').name,'STYLELITE - CARBON TRUMATTE - 2 CARAS');
  assert.match(catalog.materials.find(m=>m.sku==='73-STYLE-CBTM').name,/CINNABAR/);
  const lam=catalog.materials.find(m=>m.sku==='73-LAM-NA1121');assert.equal(lam.plateLength,1200);assert.equal(lam.plateWidth,1125);
  assert.equal(TAXONOMY51.length,6);assert.equal(all.every(p=>TAXONOMY51.some(t=>t.children.some(c=>c.id===p.taxonomyId))),true);
  assert.equal(catalog.edgeBands.every(e=>e.thickness>0),true);
  assert.equal(catalog.edgeBands.find(e=>e.sku==='66-R-0012').thickness,1.5);
  for(const stone of catalog.materials.filter(m=>m.materialType==='neolith')){assert.equal(stone.plateLength,3260);assert.equal(stone.plateWidth,stone.thickness===6?1560:1660);}
  // The old code referred to both white and Pietra: identity, not SKU alone, resolves it.
  assert.equal(catalog.aliases['62-egger-1502-1'],catalog.materials.find(x=>x.sku===m.sku).id);
});
test('V5.1 PostgreSQL: dimensiones atómicas, servicios y fechas históricas en calendarios',async()=>{
  const pg=await PGlite.create(),database=new PostgresStore('');await database.pool.end();
  const pool={query:async(sql,params)=>params?pg.query(sql,params):(await pg.exec(sql)).at(-1),connect:async()=>({...pool,release(){}})};database.pool=pool;
  let f;try{
    f=await fixture(database);
    const created=await f.request('/api/projects','POST',sample(),f.headers);assert.equal(created.status,201,JSON.stringify(created.body));const p=created.body.project;
    await database.updateProjectSchedule(p.id,'2026-10-07','2026-10-08');
    let r=await f.request('/api/v51/schedules','GET',undefined,f.headers);assert.equal(r.body.schedules[0].startDate,'2026-10-07');const event=r.body.schedules[0];
    r=await f.request('/api/v51/schedules','POST',{...event,startDate:'2026-10-09',endDate:'2026-10-10'},f.headers);assert.equal(r.status,201,JSON.stringify(r.body));
    r=await f.request('/api/v51/schedules','POST',event,f.headers);assert.equal(r.status,409);
    r=await f.request('/api/v51/schedules','GET',undefined,f.headers);assert.equal(r.body.schedules.length,1);assert.equal(r.body.schedules[0].startDate,'2026-10-09');
    r=await f.request('/api/v51/catalog/dimensions','POST',{ids:[m.id,slab.id],changes:{plateLength:3000}},f.headers);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.updated,2);
    assert.deepEqual((await database.getProject(p.id)).calculationSnapshot,p.calculationSnapshot);
    const rev=await database.listCatalogRevisions();assert.equal(rev.length,2);
    const untouched=currentCatalog.materials.find(x=>x.id!==m.id&&x.id!==slab.id&&!x.dimensionsPending);
    r=await f.request('/api/v51/catalog/dimensions','POST',{ids:[untouched.id,m.id],changes:{plateWidth:1200}},f.headers);assert.equal(r.status,409);assert.equal((await database.listCatalogRevisions()).length,2);
    const svc=currentCatalog.services.find(s=>s.sku==='SER-0038');
    r=await f.request('/api/admin/catalog/service/'+svc.id,'PATCH',{product:{netPrice:650}},f.headers);assert.equal(r.status,200,JSON.stringify(r.body));
    r=await f.request('/api/v5/config','GET',undefined,f.headers);assert.equal(r.body.services.edge04.price,650);
    await initializeV51(database);assert.equal((await database.listCatalogRevisions()).length,3);
  }finally{if(f)await f.close();await pg.close();}
});
test('V5.1 tapacanto: 102% material, 100% servicio y descuentos con mínimo independiente',()=>{
  const settings={...Object.fromEntries(Object.entries(effectiveConfig(mergeConfig(),catalog.services).services).map(([k,v])=>[k,v.price])),servicePolicies:effectiveConfig(mergeConfig(),catalog.services).services,calculationVersion:'5.1',kerf:3};
  const pieces=[{id:'p',materialId:m.id,length:1000,width:200,quantity:100,grain:'sin-veta',edges:{top:edge.id}}];
  const result=optimizeProject([m],pieces,[edge],settings),r=result.edgeSummaries[0];
  assert.equal(r.meters,100);assert.equal(r.materialMeters,102);assert.equal(r.wasteMeters,2);assert.equal(r.materialSubtotal,102*edge.price);assert.equal(r.serviceSubtotal,100*edge.serviceRate);assert.equal(result.summary.edgeMeters,100);
  assert.equal(result.priceLines.find(l=>l.kind==='edge').quantity,102);
  assert.equal(result.priceLines.find(l=>l.kind==='service'&&l.id===edge.id).quantity,100);
  const old=optimizeProject([m],pieces,[edge],{...settings,calculationVersion:'5.0'});assert.equal(old.edgeSummaries[0].materialMeters,100);
});
test('V5.1 flete solo ida y máximo entre familias; búsqueda tolera tildes',()=>{
  const config=mergeConfig({freightRates:FREIGHT51,communes:[{id:'c',name:'Comuna',roadKm:10,verified:true}]});
  assert.equal(calculateFreight(config,'c',['boards','acrylic','slabs']).net,21500);
  assert.equal(projectMatches({project:{clientName:'Muñoz',projectName:'Cocina'},assignedName:'Álvaro'},'munoz alvaro'),true);
});
test('V5.1 API respeta disco 2–5, mantiene historial y revisa dimensiones en bloque sin alterar cálculos',async()=>{
  const f=await fixture();try{
    let r=await f.request('/api/projects','POST',sample(),f.headers);assert.equal(r.status,201,JSON.stringify(r.body));let p=r.body.project;assert.equal(p.settings.kerf,4.2);assert.equal(p.settings.bladeThickness,undefined);
    const old=structuredClone(p);
    for(const kerf of [1.9,5.1,'abc']){r=await f.request('/api/projects','POST',{...sample(),settings:{kerf}},f.headers);assert.equal(r.status,400,JSON.stringify(r.body));}
    r=await f.request('/api/v51/catalog/dimensions','POST',{ids:[m.id,'does-not-exist'],changes:{plateLength:2700}},f.headers);assert.equal(r.status,409);assert.equal((await f.store.listCatalogRevisions()).length,0);
    r=await f.request('/api/v51/catalog/dimensions','POST',{ids:[m.id],changes:{plateLength:2700,plateWidth:1900}},f.headers);assert.equal(r.status,200,JSON.stringify(r.body));const revisedId=r.body.ids[0];
    r=await f.request(`/api/projects/${p.id}`,'PATCH',{comments:'Corrección descriptiva'},f.headers);assert.equal(r.status,200);assert.deepEqual(r.body.project.summary,old.summary);assert.deepEqual(r.body.project.calculationSnapshot,old.calculationSnapshot);p=r.body.project;
    r=await f.request(`/api/projects/${p.id}`,'PATCH',{pieces:p.pieces.map(x=>({...x,width:350}))},f.headers);assert.equal(r.status,200,JSON.stringify(r.body));p=r.body.project;assert.equal(p.revisionNo,2);assert.equal(p.materialId,revisedId);assert.equal(p.priceSnapshot.materials[0].plateWidth,1900);assert.deepEqual(p.history[0].calculationSnapshot,old.calculationSnapshot);
    r=await f.request('/api/v51/catalog/dimensions','POST',{ids:[m.id],changes:{plateLength:2800}},f.headers);assert.equal(r.status,409);
  }finally{await f.close();}
});
test('V5.1 agendas separadas, control de acceso, conflictos e historial sin cambiar nota de venta',async()=>{
  const f=await fixture();try{
    const first=await f.request('/api/projects','POST',sample(),f.headers),p=first.body.project;
    const stone=await f.request('/api/projects','POST',{...sample(),groupId:p.groupId,workType:'slabs',materialId:slab.id,materialIds:[slab.id],pieces:[{...sample().pieces[0],edges:{}}]},f.headers);assert.equal(stone.status,201,JSON.stringify(stone.body));const q=stone.body.project;
    const original=structuredClone(await f.store.getProject(p.id));let event;
    for(const [kind,quoteIds] of [['boards',[p.id]],['slabs',[q.id]],['installations',[p.id,q.id]]]){
      const r=await f.request('/api/v51/schedules','POST',{kind,quoteIds,startDate:'2026-10-06',endDate:'2026-10-07'},f.headers);assert.equal(r.status,201,JSON.stringify(r.body));event=r.body.schedule;
    }
    assert.deepEqual(await f.store.getProject(p.id),original);
    let r=await f.request('/api/v51/schedules','POST',{...event,startDate:'2026-10-05'},f.headers);assert.equal(r.status,200);assert.equal(r.body.schedule.history.length,1);
    r=await f.request('/api/v51/schedules','POST',event,f.headers);assert.equal(r.status,409);
    r=await f.request('/api/v51/schedules','POST',{kind:'slabs',quoteIds:[p.id],startDate:'2026-10-05'},f.headers);assert.equal(r.status,400);
    r=await f.request('/api/v51/schedules','POST',{kind:'boards',quoteIds:[p.id],startDate:'2026-02-30'},f.headers);assert.equal(r.status,400);
    for(const role of ['admin','comercial','produccion','instalacion','logistica','supervisor','finanzas','cliente']){
      const h=await f.login(role);const list=await f.request('/api/v51/schedules','GET',undefined,h);assert.equal(list.status,role==='cliente'?403:200,role);
      if(role==='comercial'){const write=await f.request('/api/v51/schedules','POST',{kind:'boards',quoteIds:[p.id],startDate:'2026-10-05'},h);assert.equal(write.status,403);}
      if(role==='cliente'){const cat=await f.request('/api/catalog','GET',undefined,h);assert.equal(/"(?:minPrice|purchasePrice|supplierCode|sourceId)"/.test(JSON.stringify(cat.body)),false);}
    }
    const publicCat=await f.request('/api/catalog');assert.equal(/"(?:minPrice|purchasePrice|supplierCode|sourceId)"/.test(JSON.stringify(publicCat.body)),false);
    assert.equal((await f.request('/api/v51/schedules')).status,401);
    const before=await f.store.getV5('config');await initializeV51(f.store);assert.deepEqual(await f.store.getV5('config'),before);
  }finally{await f.close();}
});
