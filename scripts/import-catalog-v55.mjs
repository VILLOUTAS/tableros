import fs from 'node:fs';
import * as XLSX from 'xlsx';
import old from '../src/catalog.v51.generated.js';
import {TAXONOMY55,slug,normalize} from '../src/v55-domain.js';
const file=process.argv[2]||'catalog/PRODUCTOS_V5.5.xlsx';
const wb=XLSX.read(fs.readFileSync(file),{type:'buffer'}),rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});
const categories=TAXONOMY55.flatMap(root=>root.children.map(c=>({...c,parentId:root.id,parentName:root.name,icon:root.family==='slabs'?'◆':'▤'})));
const materials=[],edgeBands=[],services=[],accessories=[],notes=[],seen=new Set(),aliases={};
const identity=s=>normalize(s).replace(/\s+/g,' ').replace(/[^a-z0-9]/g,'');
function category(row){const n=normalize(row.Nombre),sub=row.Subcategoria;
 if(row.Categoria==='HERRAJES')return sub.includes('BISAGRAS')||/bisagra|cubrecazoleta|cubre cazoleta/.test(n)?'salice-bisagras':sub.includes('GUIDE')?'salice-guias':sub.includes('ELEVACION')?'salice-elevacion':sub.includes('BORTOLUZZI')||/puerta|slide|slider/.test(n)?'salice-puertas':/lineabox/.test(n)?'salice-lineabox':/excessories/.test(n)||row.Referencia.includes('EX-')?'salice-excessories':/organiza/.test(n)?'salice-organizadores':/\bpin\b/.test(n)?'salice-pin':'salice-otros';
 if(row.Categoria==='PLACAS')return sub==='OTRAS PLACAS'?(/granito/.test(n)?'granito-20':/18mm/.test(n)?'cuarzo-18':'cuarzo-20'):sub.includes('PALMETA')?'neo-palmeta':sub.includes('06')?'neo-06':'neo-12';
 if(row.Categoria==='TABLEROS'){const edge=/^tapacanto/.test(n);return sub.includes('MELAMINA')?(edge?'tap-general':'tab-melamina'):sub.includes('EGR')?(edge?'tap-egr':'tab-egr'):(edge?'tap-chinos':/chino|mdf/.test(n)?'tab-chinos':'tab-otros');}
 return sub==='DIM. PLACAS'?'dim-placas':sub==='DIM.TABLEROS'?'dim-tableros':sub==='SERV. TABLEROS'?'servicio-tableros':sub==='SERV. FABRICACION PLACAS'?'fabricacion-placas':sub==='SERV. FABRICACION'?'armado':'inst-placas';
}
for(const [i,row] of rows.entries()){
 const sku=String(row.Referencia),name=String(row.Nombre).trim(),description=String(row.Descripción||'').trim(),tax=category(row),c=categories.find(c=>c.id===tax);
 if(!sku||seen.has(sku)||!c)throw Error('Referencia o familia inválida, fila '+(i+2));seen.add(sku);
 const type=row.Categoria==='HERRAJES'?'accessory':row.Categoria.startsWith('SERVICIOS')?'service':/^TAPACANTO/i.test(name)?'edge':'board';
 const p={id:'v55-'+slug(sku),sku,name,description,productType:type,categoryId:tax,taxonomyId:tax,categoryName:c.name,parentCategory:c.parentName,sourceCategory:row.Categoria,sourceSubcategory:row.Subcategoria,sourceRow:i+2,netPrice:Number(row['Precio base de venta']),minPrice:Number(row['Precio mínimo']),purchasePrice:null,stock:null,active:true,catalogRelease:'5.5',unit:'unidad',image:'',imageKey:'foto-v55-'+sku,texture:'#ece8df'};
 const prev=[...old.materials,...old.edgeBands,...old.services].find(x=>x.sku===sku&&identity(x.name)===identity(name));
 if(prev){for(const k of ['purchasePrice','supplierCode','image','imageKey','grainRequired'])if(prev[k]!=null)p[k]=prev[k];aliases[prev.id]=p.id;}
 if(type==='service'){
  p.unit=/RANURADO|CORTE NEOLITH (06|12)MM|CORTE PLACAS CUARZO/.test(name)?'placa':/TAPACANTO|45°|LINEAL|FREGADERO/.test(name)?'ml':/CORTE TABLERO/.test(name)?'tablero':/PERFORACION/.test(name)?'unidad':'gl';p.pricePending=p.netPrice===0;p.includesMaterial=/FREGADERO/.test(name);services.push(p);
 }else if(type==='accessory'){
  const n=normalize(name+' '+description),hinge=sku.startsWith('18-BI-')&&/bisagra/.test(normalize(name))&&!/cobertura|refuerzo|funda|escuadra/.test(normalize(name)),base=sku.startsWith('18-BA-')&&/base/.test(normalize(name));
  p.hardwareType=hinge?'hinge':base?'base':/acoplamiento/.test(n)?'coupler':/cubrecazoleta|cubre cazoleta/.test(n)?'cupCover':/cubretornillo|placa.*logo/.test(n)?'cover':tax==='salice-guias'?'guide':tax==='salice-elevacion'?(/kit/.test(n)?'liftKit':'liftPart'):/kit|sistema completo/.test(n)?'system':'accessory';
  p.finish=/titanio/.test(normalize(name))?'titanium':/niquel/.test(normalize(name))?'nickel':null;p.series=/\b800\b/.test(normalize(name))?'800':null;
  if(!p.finish&&/acabado niquelado/i.test(description))p.finish='nickel';
  if(hinge){p.weightKey='hinge';p.unit=/\(\s*par\)/.test(normalize(name))?'par':'unidad';p.compatibilityPending=/air|conecta|perfil/.test(n);}
  if(p.hardwareType==='guide'){p.weightKey='guidePair';p.unit='par';const coupler=/f70|progressa|progresa/.test(n)?'18-GU-PA7':'18-GU-PAG';p.componentRule={required:[{label:'acoplamiento',allowedSkus:[coupler],quantity:1}]};}
  if(p.hardwareType==='liftKit'){p.weightKey='liftSystem';p.completeKit=true;}
  // Los mecanismos sueltos necesitan una relación técnica aprobada; una tapa no es un mecanismo.
  if(p.hardwareType==='liftPart'&&/mecanismo|evolift - (puerta|simple)|wind - sistema/.test(normalize(name))&&!/tapa|barra estabilizadora/.test(normalize(name)))p.compatibilityPending=true;
  if(p.hardwareType==='system'){p.weightKey='otherSystem';p.unit='sistema';}
  accessories.push(p);
 }else if(type==='edge'){
  const text=name+' '+description,match=text.match(/(0[.,]4[05]?|1[.,]5|1[.,]0|2[.,]0|[12])\s*MM/i)||text.match(/(0[.,]4[05]?|1[.,]5|1[.,]0|2[.,]0|[12])\s*[xX]\s*23/i)||text.match(/23\s*x\s*(\d+[.,]?\d*)\s*mm/i);
  p.thickness=match?Number(match[1].replace(',','.')):prev?.thickness||0;if(!p.thickness)throw Error('Espesor de canto desconocido '+sku);
  p.price=p.netPrice;delete p.netPrice;p.material=/ABS/.test(text)?'ABS':prev?.material||'PVC';p.group=p.material+' '+p.thickness+' mm';p.unit='ml';p.color=prev?.color||'#888888';p.style=p.thickness>=1?'double':'solid';p.serviceSku=p.thickness<=.45?'SER-0038':p.thickness<=1?'SER-0037':p.thickness<=1.5?'SER-0035':'SER-0036';edgeBands.push(p);
 }else{
  const stone=row.Categoria==='PLACAS';p.materialType=stone?(tax.startsWith('neo')?'neolith':'stone'):'board';p.customColor=false;p.noEdgeBands=stone;p.grainRequired=prev?.grainRequired??!/(blanco|white|black|negro|gris|carbon|dove)/i.test(name);p.perimeterTrim=stone?30:10;p.brand=stone?(tax.startsWith('neo')?'NEOLITH':/GRANITO/.test(name)?'GRANITO':'CUARZO'):(/STYLELITE|PETLITE|STYLELEX|TRUNATUR|LAMITECH|EGGER/.exec(name)?.[0]||'OTROS');
  const dim=description.match(/(\d{4})\s*(?:mm)?\s*x\s*(\d{4})\s*(?:mm)?(?:\s*x\s*(\d+(?:[.,]\d+)?))?/i);
  p.plateLength=dim?Number(dim[1]):0;p.plateWidth=dim?Number(dim[2]):0;p.thickness=dim?.[3]?Number(dim[3].replace(',','.')):Number(name.match(/(\d+[.,]?\d*)\s*MM/i)?.[1]?.replace(',','.'))||0;
  if(['neo-06','neo-12'].includes(tax)){p.thickness=tax==='neo-06'?6:12;p.plateLength=3260;p.plateWidth=p.thickness===6?1560:1660;}
  if(sku==='73-LAM-RL1351'||sku==='73-LAM-NA1121'){p.plateLength=1200;p.plateWidth=1125;}
  if(sku==='73-LAM-0001'){p.plateLength=2440;p.plateWidth=1220;p.thickness=8;}
  if(!p.plateLength&&prev?.plateLength&&!prev.dimensionsPending){p.plateLength=prev.plateLength;p.plateWidth=prev.plateWidth;p.thickness=p.thickness||prev.thickness;}
  if(tax==='neo-palmeta'){const metres=name.match(/(1[.,]\d+)\s*x\s*(1[.,]\d+)/i);if(metres){p.plateLength=Number(metres[1].replace(',','.'))*1000;p.plateWidth=Number(metres[2].replace(',','.'))*1000;}const d=description.match(/(\d+)\s*x\s*(\d+)\s*(?:x\s*(\d+))?/i);if(d){p.plateLength=Number(d[1]);p.plateWidth=Number(d[2]);p.thickness=Number(d[3])||p.thickness;}}
  p.cutServiceKey=stone?(tax==='neo-06'?'neolith6CutRate':tax.startsWith('neo')?'stoneCutPerPlateRate':'otherSlabCutRate'):/^LAMINA/i.test(name)?'acrylicCutRate':tax==='tab-egr'||tax==='tab-chinos'?'styleliteCutRate':tax==='tab-melamina'?'melamineCutRate':'specialCutRate';
  p.dimensionsPending=!(p.plateLength>0&&p.plateWidth>0&&p.thickness>0);if(p.dimensionsPending)notes.push({sku,name,reason:'Completar dimensiones/espesor antes de optimizar'});
  p.format=`${p.plateLength||'?'} × ${p.plateWidth||'?'} × ${p.thickness||'?'} mm`;materials.push(p);
 }
}
for(const e of edgeBands){const s=services.find(s=>s.sku===e.serviceSku);e.serviceRate=s.netPrice;e.serviceMinPrice=s.minPrice;e.servicePurchasePrice=null;}
for(const p of accessories.filter(p=>p.hardwareType==='hinge'&&!p.compatibilityPending)){
 const series800=['18-BI-8STRN','18-BI-8STCN'].includes(p.sku);p.series=series800?'800':'standard';
 const bases=accessories.filter(b=>b.hardwareType==='base'&&(series800?['18-BA-C8A1AN0','18-BA-C8T1AN0','18-BA-C8A1AN3','18-BA-C8T1AN3'].includes(b.sku):b.series!=='800')&&b.finish===p.finish);
 if(!p.finish||!bases.length){p.compatibilityPending=true;continue;}
 p.componentRule={required:[{label:'base',allowedSkus:bases.map(b=>b.sku),quantity:1},{label:'placa metálica con logo',allowedSkus:[p.finish==='titanium'?'18-AC-2006':'18-AC-2000'],quantity:1}],optional:[{label:'cubrecazoleta',allowedSkus:[p.finish==='titanium'?'18-AC-CCT':'18-AC-CN'],quantity:1}]};
}
// Identidad y medidas, nunca solamente el código: Carbon reutiliza el código de Cinnabar.
for(const [prior,next] of [[old.materials,materials],[old.edgeBands,edgeBands]])for(const p of prior){
 if(aliases[p.id])continue;let matches=next.filter(n=>identity(n.name)===identity(p.name)&&n.plateLength===p.plateLength&&n.plateWidth===p.plateWidth&&n.thickness===p.thickness);
 if(matches.length===1)aliases[p.id]=matches[0].id;
}
const data={release:'5.5',source:file,rows:rows.length,materials,edgeBands,services,accessories,categories,aliases,notes};
fs.writeFileSync('src/catalog.v55.generated.js','// Fuente: catálogo revisado por el titular. No importar este archivo en el cliente.\nexport default '+JSON.stringify(data,null,2)+';\n');
console.log(JSON.stringify({rows:rows.length,materials:materials.length,edges:edgeBands.length,services:services.length,hardware:accessories.length,aliases:Object.keys(aliases).length,dimensionsPending:notes.length}));
