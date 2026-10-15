import test from 'node:test';
import assert from 'node:assert/strict';
import {crm51View,v51} from '../src/v51-ui.js';

test('CRM muestra pedidos listos sin exigir programación ni confundir retiro con transporte',()=>{
 const previous={mode:v51.mode,kind:v51.kind,schedules:v51.schedules,search:v51.search};
 try{
  Object.assign(v51,{mode:'states',kind:'boards',schedules:[],search:''});
  const projects=[false,true].map((required,i)=>({id:'ready-quote-'+i,groupId:'group-'+i,workType:'boards',quoteName:'Tableros',project:{projectName:'Listo '+i,clientName:'Cliente QA',status:'despacho'},delivery:{required}}));
  const ctx={user:{role:'produccion'},projects,canEditRecord:()=>true,statusEntries:()=>[['produccion','Producción'],['despacho','Despacho']]};
  const board=crm51View(ctx);assert.match(board,/Pedidos procesados, revisados y listos para entrega o carga/);assert.equal((board.match(/Procesado y revisado · listo para entrega o carga/g)||[]).length,2);assert.doesNotMatch(board,/Producción sin programar|data-v51="schedule-quote"/);
  v51.mode='calendar';const calendar=crm51View(ctx);assert.match(calendar,/Producción sin programar · 0/);assert.doesNotMatch(calendar,/data-v5="open-quote"/);
 }finally{Object.assign(v51,previous);}
});
