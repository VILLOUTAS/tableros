import { randomUUID } from 'node:crypto';
import { optimizeProject, isStoneMaterial, createEdgeCodeMap } from './src/logic.js';
import { V5, mergeConfig, permitted, stripCosts, publicCatalogItem, calculateFreight, monthlyDashboard, calculationSignature } from './src/v5-domain.js';

export const SUPER_EMAIL = 'edmundo@villoutas.cl';
export const fail = (message,status=400) => Object.assign(new Error(message),{status});
export function technicalSignature(p={}) {
  return calculationSignature(p);
}
export async function initializeV5(db) {
  if(db.pool) {
    await db.pool.query(`
      ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
      ALTER TABLE app_users ADD CONSTRAINT app_users_role_check CHECK(role IN ('superadmin','admin','comercial','produccion','instalacion','logistica','supervisor','finanzas','cliente'));
      ALTER TABLE catalog_product_revisions DROP CONSTRAINT IF EXISTS catalog_product_revisions_product_type_check;
      ALTER TABLE catalog_product_revisions ADD CONSTRAINT catalog_product_revisions_product_type_check CHECK(product_type IN ('board','edge','accessory'));
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS row_version BIGINT NOT NULL DEFAULT 0;
      CREATE TABLE IF NOT EXISTS v5_documents (id TEXT PRIMARY KEY,payload JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
      UPDATE app_users SET role='superadmin',roles=array_append(roles,'superadmin')
        WHERE lower(email)='edmundo@villoutas.cl' AND ('admin'=ANY(roles) OR role='admin') AND NOT ('superadmin'=ANY(roles));
    `);
    db.getV5 = async id => (await db.pool.query('SELECT payload FROM v5_documents WHERE id=$1',[id])).rows[0]?.payload;
    db.putV5 = async (id,payload) => {await db.pool.query('INSERT INTO v5_documents(id,payload) VALUES($1,$2::jsonb) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()',[id,JSON.stringify(payload)]);return payload;};
    db.listV5 = async prefix => (await db.pool.query('SELECT payload FROM v5_documents WHERE left(id,length($1))=$1',[prefix])).rows.map(r=>r.payload);
  } else {
    db.v5Documents ||= new Map();
    db.getV5=async id=>structuredClone(db.v5Documents.get(id));
    db.putV5=async(id,payload)=>{db.v5Documents.set(id,structuredClone(payload));return payload;};
    db.listV5=async prefix=>[...db.v5Documents].filter(([id])=>id.startsWith(prefix)).map(([,p])=>structuredClone(p));
    const owner=await db.findUserByEmail(SUPER_EMAIL);
    if(owner?.roles?.includes('admin')) await db.updateUser(owner.id,{role:'superadmin',roles:[...new Set([...owner.roles,'superadmin'])]});
  }
}
export function visibleCatalog(catalog,user) {
  return {...catalog,materials:catalog.materials.map(i=>publicCatalogItem(i,user)),edgeBands:catalog.edgeBands.map(i=>publicCatalogItem(i,user)),accessories:(catalog.accessories||[]).map(i=>publicCatalogItem(i,user))};
}
export function settingsV5(settings, config, user) {
  const c=mergeConfig(config);
  const clean={calculationVersion:V5,bladeThickness:3,kerf:3,perimeterTrim:10,neolithTrim:30,
    optimizationMode:['longitudinal','free'].includes(settings?.optimizationMode)?settings.optimizationMode:'longitudinal'};
  for(const [key,policy] of Object.entries(c.services)) clean[key]=Number(policy.price)||0;
  clean.servicePolicies=structuredClone(c.services);
  for(const key of ['boardDiscount','edgeDiscount','servicesDiscount']) clean[key]=permitted(user,'discount')?Math.max(0,Math.min(50,Number(settings?.[key])||0)):0;
  return clean;
}
function selectedSnapshot(p,catalog) {
  const selected=p.materialIds.map(id=>catalog.materials.find(m=>m.id===id)).filter(Boolean).map(m=>({...m,name:p.materialCustomizations?.[m.id]?.color||m.name,netPrice:isStoneMaterial(m)?0:m.netPrice}));
  const edgeIds=new Set(p.pieces.flatMap(piece=>Object.values(piece.edges||{})).filter(Boolean));
  return {materials:selected,edgeBands:catalog.edgeBands.filter(e=>edgeIds.has(e.id))};
}
function historicalSnapshot(current,catalog) {
  if(current.calculationSnapshot) return current.calculationSnapshot;
  const prices=current.priceSnapshot||selectedSnapshot({...current,materialIds:current.materialIds||[current.materialId],pieces:current.pieces||[]},catalog);
  const result=optimizeProject(prices.materials,current.pieces||[],prices.edgeBands,current.settings||{calculationVersion:'legacy-v3'});
  // V3/V4 nunca almacenaron los planos. Se reconstruyen con su motor original,
  // pero el resumen monetario guardado siempre prevalece sobre la reconstrucción.
  if(current.summary) result.summary=structuredClone(current.summary);
  result.historicalReconstruction=true;
  return result;
}
export async function prepareProjectV5(record,current,user,catalog,config,db,body={}) {
  const p=record.payload;
  const changed=!current||technicalSignature(p)!==technicalSignature(current);
  if(current && body.expectedUpdatedAt && new Date(body.expectedUpdatedAt).getTime()!==new Date(current.updatedAt).getTime()) throw fail('Otra persona actualizó esta cotización. Vuelve a abrirla antes de guardar.',409);
  const requestedVersion=body.expectedRowVersion??body.rowVersion;
  if(current && requestedVersion!==undefined && Number(requestedVersion)!==Number(current.rowVersion||0))throw fail('Otra persona actualizó esta cotización. Vuelve a abrirla antes de guardar.',409);
  record.expectedUpdatedAt=current?.updatedAt||null;
  record.expectedVersion=current?Number(current.rowVersion||0):null;
  p.groupId=current?.groupId||current?.id||body.groupId||record.id;
  if(!current && body.groupId && body.groupId!==record.id) {
    const siblings=(await db.listProjects(user)).filter(q=>(q.groupId||q.id)===body.groupId);
    if(!siblings.length) throw fail('No tienes acceso al proyecto seleccionado.',403);
  }
  p.quoteName=String(body.quoteName??current?.quoteName??(p.workType==='slabs'?'Placas':'Tableros')).slice(0,160);
  p.comments=String(body.comments??current?.comments??'').slice(0,10000);
  p.history=structuredClone(current?.history||[]);
  p.revisionNo=current?.revisionNo||1;
  p.milestones=structuredClone(current?.milestones||{});
  if(changed) {
    if(!p.pieces.length || !p.materialIds.length) throw fail('Agrega un material y al menos una pieza.');
    if(p.pieces.length>3000||p.pieces.reduce((s,x)=>s+Number(x.quantity),0)>10000) throw fail('Divide esta importación: máximo 3.000 filas y 10.000 piezas por cotización.');
    if(current) {
      const {history,...archive}=current;
      archive.calculationSnapshot=historicalSnapshot(current,catalog);
      p.history.push({...archive,archivedAt:new Date().toISOString(),archivedBy:user?.id||null});
      p.revisionNo=(current.revisionNo||1)+1;
    }
    p.settings=settingsV5(p.settings,config,user);
    p.priceSnapshot=selectedSnapshot(p,catalog);
    for(const m of p.priceSnapshot.materials) {
      const previouslySelected=current?.materialIds?.includes(m.id);
      if(m.active===false && !previouslySelected) throw fail(`El producto ${m.sku} está inactivo.`);
      if(!isStoneMaterial(m)&&!(m.netPrice>0)) throw fail(`Configura el precio de venta de ${m.sku} antes de cotizar.`);
    }
    p.calculationSnapshot=optimizeProject(p.priceSnapshot.materials,p.pieces,p.priceSnapshot.edgeBands,p.settings);
    if(p.calculationSnapshot.warnings?.length) throw fail(p.calculationSnapshot.warnings.join(' '));
    p.edgeCodeMap=createEdgeCodeMap(p.pieces,current?.edgeCodeMap||p.edgeCodeMap);
    record.summary=p.calculationSnapshot.summary;
    p.calculatedAt=new Date().toISOString();p.calculatedBy=user?.id||null;
  } else {
    p.settings=current.settings;
    p.priceSnapshot=current.priceSnapshot;
    p.calculationSnapshot=current.calculationSnapshot;
    p.edgeCodeMap=current.edgeCodeMap;
    p.calculatedAt=current.calculatedAt;p.calculatedBy=current.calculatedBy;
    record.summary=current.summary;
  }
  const status=record.project.status;
  if(current && status!==current.project.status && !p.milestones[status]) {
    const seller=record.assignedTo?await db.getUser(record.assignedTo):null;
    const s=record.summary||{};
    const family=p.workType==='slabs'?'Placas':'Tableros';
    p.milestones[status]={at:new Date().toISOString(),net:Number(s.net)||0,sellerName:seller?.fullName||current.assignedName||current.ownerName||'Sin comercial',families:{[family]:Number(s.net)||0},revisionNo:p.revisionNo,
      boards:p.workType==='slabs'?0:Number(s.boardCount)||0,slabs:p.workType==='slabs'?Number(s.boardCount)||0:0,
      edgeMeters:Number(s.edgeMeters)||0,bevelMeters:Number(s.finishMetersByType?.bevel)||0,miter45Meters:Number(s.finishMetersByType?.miter45)||0};
  }
  return record;
}

export function registerV5Routes(app,{db,authenticate,csrf,canReadProject}) {
  const allowed=action=>(req,res,next)=>permitted(req.auth.user,action)?next():res.status(403).json({error:'Tu perfil no permite esta operación.'});
  const publicConfig=(config,user)=>({...config,services:Object.fromEntries(Object.entries(config.services).map(([key,policy])=>[key,publicCatalogItem(policy,user)]))});
  app.get('/api/v5/config',authenticate,async(req,res)=>res.json(stripCosts(publicConfig(mergeConfig(await db.getV5('config')),req.auth.user),req.auth.user)));
  app.get('/api/v5/public-config',async(req,res)=>res.json(stripCosts(publicConfig(mergeConfig(await db.getV5('config')),null),null)));
  app.patch('/api/v5/config',authenticate,csrf,async(req,res)=>{
    const current=mergeConfig(await db.getV5('config')),b=req.body||{},user=req.auth.user;
    if(b.taxonomy && !permitted(user,'categories')) throw fail('Sin permiso para modificar categorías.',403);
    if(Object.keys(b).some(k=>!['taxonomy','services','version'].includes(k))&&!permitted(user,'settings')) throw fail('Solo el superadministrador puede configurar despachos e indicadores.',403);
    if(b.services&&!permitted(user,'salesPrices')&&!permitted(user,'costs'))throw fail('Sin permiso para modificar servicios.',403);
    if(b.services) for(const [key,entry] of Object.entries(b.services)) {
      if(!current.services[key])throw fail('Servicio no reconocido.');
      if(!permitted(user,'costs')){entry.purchasePrice=current.services[key].purchasePrice;entry.minPrice=current.services[key].minPrice;}
      if(!permitted(user,'salesPrices'))entry.price=current.services[key].price;
      for(const field of ['price','minPrice','purchasePrice'])if(!Number.isFinite(Number(entry[field]))||Number(entry[field])<0)throw fail('Los valores del servicio deben ser positivos o cero.');
      b.services[key]={name:current.services[key].name,price:Number(entry.price),minPrice:Number(entry.minPrice),purchasePrice:Number(entry.purchasePrice)};
    }
    if(b.communes) for(const c of b.communes)if(!c.id||!c.name||!Number.isFinite(Number(c.roadKm))||Number(c.roadKm)<0)throw fail('Revisa comuna y kilómetros por carretera.');
    if(b.freightRates)for(const r of Object.values(b.freightRates))if(!Number.isFinite(Number(r.base))||!Number.isFinite(Number(r.perKm))||r.base<0||r.perKm<0)throw fail('Tarifa de despacho inválida.');
    const next=mergeConfig({...current,...b,services:{...current.services,...b.services},version:current.version+1});
    await db.putV5('config',next);res.json(stripCosts(next,user));
  });
  app.get('/api/v5/dashboard',authenticate,allowed('reports'),async(req,res)=>{
    const config=mergeConfig(await db.getV5('config'));
    const projects=await db.listProjects(req.auth.user);
    const ids=new Set(projects.map(p=>p.groupId||p.id));
    const dispatches=(await db.listV5('dispatch:')).filter(d=>permitted(req.auth.user,'allProjects')||ids.has(d.groupId));
    res.json(monthlyDashboard(projects,String(req.query.month||'').slice(0,7),config.salesBasis,dispatches));
  });
  app.get('/api/projects/:id/revisions',authenticate,async(req,res)=>{
    const p=await db.getProject(req.params.id);if(!p||!canReadProject(req.auth.user,p))throw fail('Cotización no encontrada.',404);
    res.json(stripCosts({revisions:[...(p.history||[]),p].map(({history,...revision})=>revision)},req.auth.user));
  });
  app.get('/api/v5/dispatches',authenticate,async(req,res)=>{
    const groups=new Set((await db.listProjects(req.auth.user)).map(p=>p.groupId||p.id));
    res.json({dispatches:(await db.listV5('dispatch:')).filter(d=>permitted(req.auth.user,'allProjects')||groups.has(d.groupId))});
  });
  app.post('/api/v5/dispatches',authenticate,csrf,allowed('dispatch'),async(req,res)=>{
    const b=req.body,config=mergeConfig(await db.getV5('config'));
    const projects=(await db.listProjects(req.auth.user)).filter(p=>(p.groupId||p.id)===b.groupId);
    if(!projects.length)throw fail('Selecciona un proyecto al que tengas acceso.');
    if(String(b.street||'').trim().length<3||!b.communeId)throw fail('Ingresa calle y comuna.');
    const previous=b.id?await db.getV5(`dispatch:${b.id}`):null;
    if(previous && previous.groupId!==b.groupId)throw fail('El despacho pertenece a otro proyecto.',409);
    const addressChanged=!previous||previous.street!==b.street||previous.communeId!==b.communeId||JSON.stringify(previous.families)!==JSON.stringify(b.families);
    if(previous?.invoiceNumber&&addressChanged)throw fail('El flete facturado conserva su valorización. Crea un despacho adicional.');
    const quote=addressChanged||b.requote?calculateFreight(config,b.communeId,b.families):previous.quote;
    if(previous?.invoiceNumber&&b.requote)throw fail('No se puede recalcular un despacho facturado.');
    const status=['pending','scheduled','dispatched','delivered','cancelled'].includes(b.status)?b.status:'pending';
    if(quote.status!=='quoted'&&status!=='pending'&&status!=='cancelled')throw fail('Configura la distancia y valoriza el despacho antes de programarlo.');
    if(b.invoiceNumber && !/^\d{4}-\d{2}-\d{2}$/.test(b.invoiceDate||''))throw fail('Indica la fecha de la factura.');
    const record={id:previous?.id||randomUUID(),groupId:b.groupId,projectName:projects[0].project.projectName,clientName:projects[0].project.clientName,
      street:String(b.street).slice(0,300),communeId:b.communeId,families:b.families,quote,status,date:b.date||'',notes:String(b.notes||'').slice(0,2000),
      invoiceNumber:String(b.invoiceNumber||''),invoiceDate:b.invoiceDate||'',sellerName:projects[0].assignedName||projects[0].ownerName,
      createdAt:previous?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),updatedBy:req.auth.user.id};
    await db.putV5(`dispatch:${record.id}`,record);res.status(previous?200:201).json({dispatch:record});
  });
}
