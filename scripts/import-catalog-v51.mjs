import fs from 'node:fs';
import * as XLSX from 'xlsx';
import {materials as oldMaterials,edgeBands as oldEdges} from '../src/catalog.generated.js';
import {TAXONOMY51,normalizeSearch} from '../src/v51-domain.js';
const file=process.argv[2]||'catalog/PRODUCTOS_20260930.xlsx';
const book=XLSX.read(fs.readFileSync(file),{type:'buffer'});
const rows=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{defval:''});
const categories=TAXONOMY51.flatMap(root=>root.children.map(c=>({...c,parentId:root.id,parentName:root.name,icon:root.family==='slabs'?'◆':'▤'})));
const groups={'DESPACHO':'despachos','DIM. PLACAS':'dim-placas','DIM.TABLEROS':'dim-tableros','SERV. PLACAS':'inst-placas','SERV. TABLEROS':'servicio-tableros','NEOLITH 06MM':'neo-06','NEOLITH 12MM':'neo-12','SERVICIOS DE MUEBLERIA':'armado','OTROS TABLEROS':'tab-otros','TABLEROS MELAMINAS':'tab-melamina','TABLEROS EGR DECOR':'tab-egr','TABLEROS CHINOS':'tab-chinos','TAPACANTOS':'tap-general','TAPACANTOS EGR':'tap-egr','TAPACANTOS CHINOS':'tap-chinos'};
const slug=s=>normalizeSearch(s).replace(/[^a-z0-9]+/g,'-');
const cleanName=s=>normalizeSearch(s).replace(/tapacanto|melamina|stylelite|trumat(te)?|trugloss|trunatur|egger|mdf|placa|tablero|egr|petlite|chino|acrilico|alternativa|original|metro|2 caras|1 cara|2c|1c|\(50m\)|\d+[.,]?\d*\s*mm|\bmt\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const materials=[],edges=[],services=[],seen=new Set(),notes=[];
for(const [index,row] of rows.entries()) {
  const sourceRow=index+2, sku=sourceRow===275?'73-STYLE-CRTM':String(row.Referencia).trim();
  if(seen.has(sku))throw new Error('SKU duplicado '+sku);seen.add(sku);
  const tax=groups[row['Familia de productos']],category=categories.find(c=>c.id===tax);if(!category)throw new Error('Familia desconocida');
  const name=String(row.Nombre).trim(), description=String(row.Descripción).trim();
  const item={id:'v51-'+slug(sku),sku,name,description,categoryId:tax,taxonomyId:tax,categoryName:category.name,sourceCategory:row['Familia de productos'],parentCategory:category.parentName,netPrice:Number(row['Precio base de venta']),minPrice:Number(row['Precio mínimo']),supplierCode:String(row['Código de barras']),purchasePrice:null,stock:null,active:true,catalogRelease:'5.1',sourceRow,unit:'unidad',image:'',texture:'#ece8df'};
  item.imageKey='foto-v51-'+sku;
  if(sku.startsWith('SER')) {
    item.unit=/DESPACHO/.test(name)?'km':/ML|LINEAL|TAPACANTO/.test(name)?'ml':/CORTE/.test(name)?'placa':'unidad';
    item.pricePending=item.netPrice===0;services.push(item);continue;
  }
  if(category.parentId==='tapacantos') {
    let match=(name+' '+description).match(/(0[.,]4[05]?|1[.,]5|1[.,]0|2[.,]0|[12])\s*MM/i);
    item.thickness=match?Number(match[1].replace(',','.')):0;
    if(!item.thickness){const m=name.match(/(0[.,]4[05]?|1[.,]5|1[.,]0|2[.,]0|[12])\s*[xX]\s*23\s*MM/i);item.thickness=m?Number(m[1].replace(',','.')):0;}
    if(!item.thickness){const m=description.match(/23\s*x\s*(\d+[.,]?\d*)\s*mm/i);item.thickness=m?Number(m[1].replace(',','.')):0;}
    if(!item.thickness)throw new Error('Espesor de tapacanto no reconocido: '+sku);
    const old=oldEdges.find(e=>e.sku===sku&&Math.abs(e.thickness-item.thickness)<0.06&&cleanName(e.name)===cleanName(name));
    item.material=/ABS/.test(description)?'ABS':old?.material||'PVC';item.group=item.material+' '+item.thickness+' mm';item.price=item.netPrice;delete item.netPrice;
    item.unit='ml';item.color=old?.color||'#8c8c8c';item.style=item.thickness>=1?'double':'solid';
    const rate=item.thickness<=0.5?'SER-0038':item.thickness<=1?'SER-0037':item.thickness<=1.5?'SER-0035':'SER-0036';
    item.serviceSku=rate;const svc=rows.find(r=>r.Referencia===rate);item.serviceRate=Number(svc['Precio base de venta']);item.serviceMinPrice=Number(svc['Precio mínimo']);item.servicePurchasePrice=null;
    if(old)item.purchasePrice=old.purchasePrice;
    edges.push(item);continue;
  }
  item.materialType=category.parentId==='placas'?'neolith':'board';
  item.grainRequired=!/blanco|black|white|gris|negro|carbon|alabaster|dove|slate/.test(normalizeSearch(name));
  item.perimeterTrim=item.materialType==='neolith'?30:10;
  if(item.materialType==='neolith') {
    item.thickness=tax==='neo-06'?6:12;item.plateLength=3260;item.plateWidth=item.thickness===6?1560:1660;item.noEdgeBands=true;item.grainRequired=true;item.brand='NEOLITH';item.customColor=false;
    item.name=name.replace(/30X15|31x16|32X1(?=\s)/g,item.thickness===6?'32x15':'32x16');
  } else {
    item.brand=/STYLELITE|PETLITE|TRUNATUR/.exec(name)?.[0]||(tax==='tab-melamina'?(/EGGER/.test(name)?'EGGER':'OTRA MARCA'):tax==='tab-chinos'?'CHINO ACRILICO':'OTROS');
    const nums=description.match(/(\d{4})\s*x\s*(\d{4})(?:\s*x\s*(\d+(?:[.,]\d+)?))?/i);
    item.plateLength=nums?Number(nums[1]):0;item.plateWidth=nums?Number(nums[2]):0;item.thickness=nums?.[3]?Number(nums[3].replace(',','.')):Number(name.match(/(\d+[.,]?\d*)\s*MM/i)?.[1]?.replace(',','.'))||0;
    if(tax==='tab-chinos'){item.plateLength=2800;item.plateWidth=1220;item.thickness=18;}
    if(sku.startsWith('73-LAM-')&&/LAMITECH/.test(name)){item.plateLength=1200;item.plateWidth=1125;item.description='1200 × 1125 mm · 1,35 m² por lámina. Espesor por configurar.';}
    if(sku==='73-LAM-0001'){item.plateLength=2440;item.plateWidth=1220;item.thickness=0.8;}
    if(!item.plateLength&&description.includes('/')){const d=description.match(/(\d+)mm\s*\/\s*(\d+)mm\s*\/\s*(\d+)mm/i);if(d){item.plateLength=Number(d[3]);item.plateWidth=Number(d[2]);item.thickness=/\d+-\d+mm/.test(description)?0:Number(d[1]);}}
    if(!item.plateLength||!item.plateWidth||!item.thickness){item.dimensionsPending=true;notes.push({sku,name,reason:'Completar formato o espesor antes de optimizar'});}
    const old=oldMaterials.find(m=>m.sku===sku&&m.thickness===item.thickness&&cleanName(m.name)===cleanName(name));
    if(old){item.purchasePrice=old.purchasePrice;item.image=old.image;item.imageKey=old.sku;item.grainRequired=old.grainRequired;}
  }
  item.cutServiceKey=item.materialType==='neolith'?'stoneCutPerPlateRate':item.brand==='STYLELITE'?'styleliteCutRate':['PETLITE','TRUNATUR','CHINO ACRILICO'].includes(item.brand)?'acrylicCutRate':'melamineCutRate';
  item.format=`${item.plateLength} × ${item.plateWidth} × ${item.thickness||'?'} mm`;materials.push(item);
}
const aliases={};
for(const [olds,news] of [[oldMaterials,materials],[oldEdges,edges]])for(const old of olds){
  let candidates=news.filter(n=>Math.abs(n.thickness-old.thickness)<0.06&&cleanName(n.name)===cleanName(old.name));
  const exact=candidates.filter(n=>n.sku===old.sku);if(exact.length===1)candidates=exact;
  if(candidates.length===1)aliases[old.id]=candidates[0].id;
}
const data={source:'PRODUCTOS PARA OPTIMIZADOR COMPLETO AL 20260930.xlsx',release:'5.1',rows:rows.length,materials,edgeBands:edges,services,categories,aliases,notes};
fs.writeFileSync('src/catalog.v51.generated.js','// Generado desde el catálogo 2026-09-30; conserva el catálogo histórico por separado.\nexport default '+JSON.stringify(data,null,2)+';\n');
console.log(JSON.stringify({rows:rows.length,materials:materials.length,edges:edges.length,services:services.length,aliases:Object.keys(aliases).length,notes},null,2));
