import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { calculateFreight,mergeConfig,monthlyDashboard,discountedLine,permitted,stripCosts,calculationSignature } from '../src/v5-domain.js';
import { parseMappedRows,parseText,transpose,readImportWorkbook } from '../src/v5-import.js';
import { createApplication } from '../server.mjs';
import { optimizeProject,createEdgeCodeMap } from '../src/logic.js';
import { materials,edgeBands } from '../src/data.js';
import * as XLSX from 'xlsx';

test('V5 interpreta cm sin intercambiar ejes, códigos de canto y veta por fila',()=>{
  const result=parseMappedRows([['Unid.','B','A','Veta','L1','A2'],[3,75.8,44.5,'T','x','2']],{mapping:{quantity:0,width:1,length:2,grain:3,top:4,right:5},units:'cm',materialId:'m',startRow:2,defaultType:'edge1',markerMap:{x:'selected','2':'edge2'},blankIsNone:true});
  assert.equal(result.issues.length,0);const p=result.pieces[0];assert.equal(p.length,445);assert.equal(p.width,758);assert.equal(p.quantity,3);assert.equal(p.grain,'transversal');assert.equal(p.edges.top,'edge1');assert.equal(p.edges.right,'edge2');
});
test('V5 importa una hoja transpuesta y distingue servicio de piedra de tapacanto',()=>{
  const input=transpose([['Nombre','L','A','Q','Borde'],['Cubierta',1800,600,1,'P']]);
  const result=parseMappedRows(input,{transpose:true,startRow:2,mapping:{name:0,length:1,width:2,quantity:3,top:4},workType:'slabs',units:'mm',materialId:'slab',defaultGrain:'sin-veta',markerMap:{p:'bevel'}});
  assert.equal(result.issues.length,0);assert.equal(result.pieces[0].finishes.top,'bevel');assert.equal(result.pieces[0].edges.top,null);
});
test('V5 exige interpretación de símbolos y bloquea tipos sin lados',()=>{
  const config={mapping:{length:0,width:1,quantity:2,edgeType:3,top:4},startRow:1,materialId:'m',defaultGrain:'longitudinal',typeMap:{pvc:'e'},markerMap:{x:'selected'}};
  assert.match(parseMappedRows([[500,300,2,'PVC','*']],config).issues[0].message,/símbolo/);
  assert.match(parseMappedRows([[500,300,2,'PVC','']],config).issues[0].message,/no lados marcados/);
  const okay=parseMappedRows([[500,300,2,'PVC',500]],{...config,numericPresence:true});assert.equal(okay.pieces[0].edges.top,'e');
});
test('V5 lee XLS binario, XLSX y celdas pegadas sin exigir plantilla',()=>{
  const rows=[['Largo','Ancho','Cantidad'],[445,758,2]],book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),'Medidas');
  for(const bookType of ['biff8','xlsx']){const data=XLSX.write(book,{type:'buffer',bookType});assert.deepEqual(readImportWorkbook(data)[0].rows,rows);}
  assert.deepEqual(parseText('Largo\tAncho\tCantidad\n445\t758\t2')[1],['445','758','2']);
});
test('V5 flete mixto toma el máximo final, ida y neto; nunca km inventados',()=>{
  const config=mergeConfig({communes:[{id:'c',name:'Comuna de prueba',roadKm:300,verified:true}]});
  const result=calculateFreight(config,'c',['boards','slabs','other']);assert.equal(result.net,60000);assert.equal(result.family,'other');assert.equal(result.vat,11400);
  assert.equal(calculateFreight(config,'desconocida',['boards']).net,null);
  assert.equal(calculateFreight({...config,communes:[{id:'c',roadKm:10,verified:false}]},'c',['boards']).net,null);
});
test('V5 descuentos topan en 50% y respetan el mayor entre costo y mínimo',()=>{
  assert.equal(discountedLine(100,1,99,{}).net,50);
  assert.equal(discountedLine(100,2,50,{purchasePrice:80,minPrice:70}).net,160);
  assert.equal(discountedLine(70,1,0,{minPrice:80}).belowFloor,true);
  assert.equal(permitted({roles:['produccion','finanzas']},'costs'),true);
  assert.equal(permitted({roles:['admin']},'costs'),false);
  assert.equal(permitted({roles:['finanzas']},'users'),false);
  const date=new Date();assert.deepEqual(stripCosts({price:100,purchasePrice:20,at:date},{roles:['cliente']}),{price:100,at:date});
});
test('V5 panel cuenta el primer despacho una vez, incluso después de entregado',()=>{
  const events={facturado_pagado:{at:'2026-09-10T15:00:00Z',net:100,sellerName:'Uno',families:{Tableros:100}},despacho:{at:'2026-09-12T15:00:00Z',boards:3,edgeMeters:8}};
  const current={workType:'boards',project:{status:'entregado'},milestones:events,history:[{milestones:events}]};
  const d=monthlyDashboard([current,{project:{status:'despacho'}}],'2026-09');assert.equal(d.netSales,100);assert.equal(d.boards,3);assert.equal(d.edgeMeters,8);assert.equal(d.undatedProduction,1);assert.equal(d.undatedSales,1);
});
test('V5 conserva cinco tipos de tapacanto con códigos estables en todas las hojas',()=>{
  const pieces=Array.from({length:5},(_,i)=>({edges:{top:`edge${i}`}}));const map=createEdgeCodeMap(pieces);assert.equal(map.edge4,'T5');assert.deepEqual(createEdgeCodeMap([...pieces].reverse(),map),map);
});

async function sessionFixture(){
  const {app,store}=await createApplication({useMemory:true});const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  const request=async(path,method='GET',body,headers={})=>{const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,headers:r.headers,body:r.status===204?null:await r.json()};};
  const auth=await request('/api/auth/setup','POST',{email:'edmundo@villoutas.cl',fullName:'Edmundo Prueba',password:'SoloPrueba2026!'});
  const headers={cookie:auth.headers.get('set-cookie').split(';')[0],'x-csrf-token':auth.body.csrfToken};
  return {store,request,headers,user:auth.body.user,close:()=>new Promise(r=>server.close(r))};
}
const sample=()=>({project:{projectName:'Cocina',clientName:'Cliente prueba',status:'cotizacion'},workType:'boards',materialId:materials.find(m=>m.id==='62-egger-1502-1').id,
  pieces:[{id:'piece-one',name:'Puerta',length:445,width:758,quantity:1,grain:'longitudinal',edges:{}}],settings:{calculationVersion:'5.0',boardDiscount:99,edgeDiscount:99,servicesDiscount:99},summary:{net:1,total:1}});

test('V5 API calcula precios, crea revisiones inmutables y rechaza sobrescritura simultánea',async()=>{
 const f=await sessionFixture();try{
  let r=await f.request('/api/projects','POST',sample(),f.headers);assert.equal(r.status,201,JSON.stringify(r.body));let p=r.body.project;
  assert.notEqual(p.summary.net,1);assert.equal(p.revisionNo,1);assert.equal(p.settings.boardDiscount,50);assert.ok(p.calculationSnapshot.plates.length);
  const original=structuredClone(p);r=await f.request(`/api/projects/${p.id}`,'PATCH',{expectedUpdatedAt:p.updatedAt,project:{projectName:'Nombre corregido'},comments:'Solo comentario',summary:{net:1}},f.headers);
  assert.equal(r.status,200,JSON.stringify(r.body));p=r.body.project;assert.equal(p.revisionNo,1);assert.deepEqual(p.calculationSnapshot,original.calculationSnapshot);assert.deepEqual(p.summary,original.summary);
  const changedPieces=p.pieces.map(x=>({...x,length:500}));r=await f.request(`/api/projects/${p.id}`,'PATCH',{expectedUpdatedAt:p.updatedAt,pieces:changedPieces},f.headers);assert.equal(r.status,200,JSON.stringify(r.body));p=r.body.project;
  assert.equal(p.revisionNo,2);assert.equal(p.history.length,1);assert.equal(p.history[0].pieces[0].length,445);assert.equal(p.history[0].summary.net,original.summary.net);
  const conflict=await f.request(`/api/projects/${p.id}`,'PATCH',{expectedUpdatedAt:original.updatedAt,comments:'Obsoleto'},f.headers);assert.equal(conflict.status,409);
  const histories=await f.request(`/api/projects/${p.id}/revisions`,'GET',undefined,f.headers);assert.equal(histories.body.revisions.length,2);
  const raw=f.store.projects.get(p.id);assert.equal(raw.pieces[0].length,500);
 }finally{await f.close();}
});
test('V5 preserva un proyecto V3 al editar metadatos y archiva su precio al revisar medidas',async()=>{
 const f=await sessionFixture();try{
  const id=randomUUID(),legacy={id,ownerId:f.user.id,project:{projectName:'Antiguo',clientName:'Cliente',status:'cotizacion'},payload:{workType:'boards',materialId:'62-egger-1502-1',materialIds:['62-egger-1502-1'],pieces:[{name:'Pieza',length:500,width:400,quantity:2,grain:'sin-veta'}],settings:{}},summary:{net:32123,vat:6103,total:38226}};
  const saved=await f.store.saveProject(legacy);
  let response=await f.request(`/api/projects/${id}`,'PATCH',{project:{clientName:'Cliente corregido'}},f.headers);assert.equal(response.status,200);assert.deepEqual(response.body.project.summary,legacy.summary);assert.deepEqual(response.body.project.settings,{});assert.equal(response.body.project.revisionNo,1);
  response=await f.request(`/api/projects/${id}`,'PATCH',{pieces:legacy.payload.pieces.map(p=>({...p,length:600}))},f.headers);assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.project.settings.calculationVersion,'6.0');assert.deepEqual(response.body.project.history[0].summary,legacy.summary);assert.deepEqual(response.body.project.history[0].settings,{});
 }finally{await f.close();}
});
test('V5 agrupa tableros y placas, protege flete facturado y no revela costos públicos',async()=>{
 const f=await sessionFixture();try{
  const catalog=await f.request('/api/catalog');assert.equal(JSON.stringify(catalog.body).includes('purchasePrice'),false);assert.equal(JSON.stringify(catalog.body).includes('minPrice'),false);
  const a=await f.request('/api/projects','POST',sample(),f.headers);const p=a.body.project;
  const stone={...sample(),groupId:p.groupId,workType:'slabs',materialId:'v51-15-2022-1009',materialCustomizations:{'v51-15-2022-1009':{color:'Color libre'}},pieces:[{name:'Cubierta',length:1600,width:700,quantity:1,grain:'sin-veta',edges:{},finishes:{top:'bevel',right:'miter45'}}]};
  const b=await f.request('/api/projects','POST',stone,f.headers);assert.equal(b.status,201,JSON.stringify(b.body));assert.equal(b.body.project.groupId,p.groupId);assert.equal(b.body.project.calculationSnapshot.plates[0].usablePlateLength,3200);assert.equal(b.body.project.calculationSnapshot.plates[0].usablePlateWidth,1600);
  await f.request('/api/v5/config','PATCH',{communes:[{id:'test',name:'Comuna',roadKm:10,verified:true}]},f.headers);
  const body={groupId:p.groupId,communeId:'concepcion',street:'Calle 123',proposedDate:'2026-10-05',confirmedDate:'2026-10-05',status:'scheduled',invoiceNumber:'F1',invoiceDate:'2026-09-15'};
  const d=await f.request('/api/v55/dispatches','POST',body,f.headers);assert.equal(d.status,201,JSON.stringify(d.body));assert.ok(d.body.dispatch.quote.net>=5000);
  const denied=await f.request('/api/v55/dispatches','POST',{...body,id:d.body.dispatch.id,street:'Otra calle'},f.headers);assert.equal(denied.status,400);
  const acc=await f.request('/api/admin/catalog','POST',{productType:'accessory',product:{sku:'B-TEST',name:'Bisagra prueba',categoryId:'bisagras',categoryName:'Bisagras',netPrice:1000,stock:0}},f.headers);assert.equal(acc.status,201);assert.ok(acc.body.catalog.accessories.some(p=>p.sku==='B-TEST'));
 }finally{await f.close();}
});
