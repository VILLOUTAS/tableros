import {randomUUID} from 'node:crypto';
import {mergeConfig,permitted} from './src/v5-domain.js';
import {TAXONOMY51,FREIGHT51,internalUser,canSchedule,validDate,CALENDARS,SCHEDULE_STATES} from './src/v51-domain.js';
import {fail} from './v5-server.mjs';

export async function initializeV51(db) {
  if(!await db.getV5('v51:catalog-migration')) {
    const previous=await db.getV5('config'), config=mergeConfig(previous), revisions=await db.listCatalogRevisions();
    await db.putV5('v51:config-before',previous||{});
    await db.putV5('config',{...config,taxonomy:TAXONOMY51,freightRates:FREIGHT51,defaultKerf:3,version:(config.version||0)+1});
    await db.putV5('v51:catalog-migration',{at:new Date().toISOString(),revisionIds:revisions.filter(r=>r.payload?.catalogRelease!=='5.1').map(r=>r.id)});
  }
  if(db.pool)await db.pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS catalog_v51_single_successor ON catalog_product_revisions(replaces_id) WHERE replaces_id IS NOT NULL AND payload->>'catalogRelease'='5.1'`);
}

async function putSchedule(db,id,payload,expectedVersion) {
  if(db.pool) {
    const saved=await db.pool.query(`INSERT INTO v5_documents(id,payload) VALUES($1,$2::jsonb)
      ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()
      WHERE COALESCE((v5_documents.payload->>'version')::int,0)=$3 RETURNING payload`,[id,JSON.stringify(payload),expectedVersion]);
    if(!saved.rows.length)throw fail('Otra persona cambió esta programación. Actualiza el calendario.',409);
  } else {
    const old=await db.getV5(id);
    if(old&&old.version!==expectedVersion)throw fail('Otra persona cambió esta programación. Actualiza el calendario.',409);
    await db.putV5(id,payload);
  }
}
function oldSchedules(projects,schedules) {
  const dateOnly=value=>(value instanceof Date?value.toISOString():String(value)).slice(0,10);
  return projects.filter(p=>p.executionDate&&!schedules.some(e=>e.legacyQuoteId===p.id)).map(p=>({id:'legacy:'+p.id,legacyQuoteId:p.id,groupId:p.groupId||p.id,quoteIds:[p.id],kind:p.workType==='slabs'?'slabs':'boards',title:p.quoteName||p.project.projectName,startDate:dateOnly(p.executionDate),endDate:dateOnly(p.deliveryDate||p.executionDate),status:['despacho','entregado'].includes(p.project.status)?'completed':p.project.status==='produccion'?'in_progress':'scheduled',version:0,legacy:true}));
}
export function registerV51Routes(app,{db,authenticate,csrf,buildCatalog,normalizeCatalogProduct,catalogProductError}) {
  const staff=(req,res,next)=>internalUser(req.auth.user)?next():res.status(403).json({error:'Acceso exclusivo del equipo interno.'});
  app.get('/api/v51/schedules',authenticate,staff,async(req,res)=>{
    const projects=await db.listProjects(req.auth.user),ids=new Set(projects.map(p=>p.id));
    const schedules=(await db.listV5('schedule:')).filter(s=>s.quoteIds.some(id=>ids.has(id)));
    res.json({schedules:[...schedules,...oldSchedules(projects,schedules)]});
  });
  app.post('/api/v51/schedules',authenticate,csrf,staff,async(req,res)=>{
    const b=req.body||{};if(!CALENDARS[b.kind]||!canSchedule(req.auth.user,b.kind))throw fail('Tu perfil puede consultar esta agenda, pero no programarla.',403);
    const projects=await db.listProjects(req.auth.user),quoteIds=[...new Set(Array.isArray(b.quoteIds)?b.quoteIds:[])];
    if(!quoteIds.length)throw fail('Selecciona al menos una cotización.');
    const selected=quoteIds.map(id=>projects.find(p=>p.id===id));
    if(selected.some(p=>!p))throw fail('Cotización no encontrada.',404);
    const groupId=selected[0].groupId||selected[0].id;
    if(selected.some(p=>(p.groupId||p.id)!==groupId))throw fail('Las cotizaciones deben pertenecer al mismo proyecto.');
    if(b.kind!=='installations'&&selected.some(p=>(p.workType||'boards')!==b.kind))throw fail('Selecciona cotizaciones de la agenda indicada.');
    if(!validDate(b.startDate)||!validDate(b.endDate||b.startDate)||(b.endDate&&b.endDate<b.startDate))throw fail('Revisa las fechas de inicio y término.');
    if(!SCHEDULE_STATES[b.status||'scheduled'])throw fail('Estado de programación inválido.');
    const legacyId=String(b.id||'').startsWith('legacy:')?String(b.id).slice(7):null;
    if(legacyId&&!quoteIds.includes(legacyId))throw fail('La programación histórica pertenece a otra cotización.');
    const id=legacyId?'legacy-'+legacyId:b.id||randomUUID(),current=await db.getV5('schedule:'+id);
    if(b.id&&!legacyId&&!current)throw fail('Programación no encontrada.',404);
    if(current&&(current.kind!==b.kind||current.groupId!==groupId))throw fail('Conserva el proyecto y la agenda de esta programación.');
    const expected=Number(b.version||0);if(current&&expected!==current.version)throw fail('Otra persona cambió esta programación. Actualiza el calendario.',409);
    const {history,...previous}=current||{};
    const next={id,groupId,quoteIds,kind:b.kind,title:String(b.title||selected[0].quoteName||selected[0].project.projectName).slice(0,160),startDate:b.startDate,endDate:b.endDate||b.startDate,status:b.status||'scheduled',responsible:String(b.responsible||'').slice(0,160),notes:String(b.notes||'').slice(0,3000),legacyQuoteId:current?.legacyQuoteId||legacyId||null,version:expected+1,updatedAt:new Date().toISOString(),updatedBy:req.auth.user.id,history:[...(history||[]),...(current?[previous]:[])]};
    await putSchedule(db,'schedule:'+id,next,expected);res.status(current?200:201).json({schedule:next});
  });
  app.post('/api/v51/catalog/dimensions',authenticate,csrf,async(req,res)=>{
    if(!permitted(req.auth.user,'products'))throw fail('No puedes editar dimensiones.',403);
    const {ids,changes={}}=req.body||{};
    if(!Array.isArray(ids)||!ids.length||ids.length>500||new Set(ids).size!==ids.length)throw fail('Selecciona entre 1 y 500 productos diferentes.');
    const allowed=['plateLength','plateWidth','thickness','perimeterTrim'];
    if(!Object.keys(changes).length||Object.keys(changes).some(k=>!allowed.includes(k)))throw fail('Selecciona los parámetros dimensionales a modificar.');
    for(const [key,v] of Object.entries(changes))if(!Number.isFinite(Number(v))||(key==='perimeterTrim'?Number(v)<0:Number(v)<=0))throw fail('Las dimensiones deben ser mayores que cero.');
    const catalog=await buildCatalog(),existing=await db.listCatalogRevisions(),superseded=new Set(existing.map(r=>r.replacesId));
    const batch=ids.map(id=>{
      const current=catalog.materials.find(m=>m.id===id);
      if(!current||current.legacyCatalog||superseded.has(id))throw fail('Un producto seleccionado ya cambió. Actualiza el catálogo.',409);
      const product=normalizeCatalogProduct('board',changes,current),error=catalogProductError('board',product);
      if(error)throw fail(current.sku+': '+error);
      if(product.plateLength<=product.perimeterTrim*2||product.plateWidth<=product.perimeterTrim*2)throw fail('El despunte debe dejar una superficie útil positiva.');
      return {id:'catalog-board-'+randomUUID(),productType:'board',sku:product.sku,payload:product,replacesId:id,createdBy:req.auth.user.id};
    });
    if(db.pool) {
      const client=await db.pool.connect();
      try {
        await client.query('BEGIN');
        for(const r of batch){
          await client.query('UPDATE catalog_product_revisions SET active=FALSE WHERE id=$1',[r.replacesId]);
          await client.query(`INSERT INTO catalog_product_revisions(id,product_type,sku,payload,active,replaces_id,created_by) VALUES($1,'board',$2,$3::jsonb,TRUE,$4,$5)`,[r.id,r.sku,JSON.stringify(r.payload),r.replacesId,r.createdBy]);
        }
        await client.query('COMMIT');
      }catch(e){await client.query('ROLLBACK');if(e.code==='23505')throw fail('Un producto cambió durante la edición. Actualiza el catálogo.',409);throw e;}finally{client.release();}
    } else {for(const r of batch)await db.createCatalogRevision(r);}
    res.json({updated:batch.length,ids:batch.map(r=>r.id)});
  });
}
