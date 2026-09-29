import * as XLSX from 'xlsx';
import * as cpexcel from 'xlsx/dist/cpexcel.full.mjs';
XLSX.set_cptable(cpexcel);
export const IMPORT_FIELDS={name:'Nombre de pieza',quantity:'Cantidad',length:'Largo · eje L',width:'Ancho · eje A',grain:'Veta',material:'Material',edgeType:'Tipo de tapacanto / servicio',top:'L1 · Superior',bottom:'L2 · Inferior',left:'A1 · Izquierdo',right:'A2 · Derecho',longEdges:'Cantos eje L (1 o 2)',shortEdges:'Cantos eje A (1 o 2)',notes:'Observación'};
export const normalized=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
export function colLabel(index) {return XLSX.utils.encode_col(index);}
export function transpose(rows){return Array.from({length:Math.max(0,...rows.map(r=>r.length))},(_,c)=>rows.map(r=>r[c]??''));}
export function parseText(text) {
  const workbook=XLSX.read(text,{type:'string',raw:true});
  return sheetRows(workbook.Sheets[workbook.SheetNames[0]]);
}
export function sheetRows(sheet) {
  const cells=Object.entries(sheet).filter(([key,c])=>!key.startsWith('!')&&c?.v!==undefined&&c.v!=='');
  let maxRow=0,maxCol=0;
  for(const [address] of cells){const pos=XLSX.utils.decode_cell(address);maxRow=Math.max(maxRow,pos.r);maxCol=Math.max(maxCol,pos.c);}
  if(maxRow>19999||maxCol>299)throw new Error('La planilla supera 20.000 filas o 300 columnas con contenido. Copia el bloque de medidas o divide el archivo.');
  return XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:'',blankrows:true,range:{s:{r:0,c:0},e:{r:maxRow,c:maxCol}}});
}
export function readImportWorkbook(buffer) {
  const book=XLSX.read(buffer,{type:'array',cellDates:false,cellFormula:false});
  return book.SheetNames.map(name=>({name,rows:sheetRows(book.Sheets[name])}));
}
export function suggestMapping(rows,headerRow=1) {
  const aliases={name:['nombre','nombre pieza','pieza','descripcion'],quantity:['cantidad','unid','unid.','qty','cant'],length:['largo','medida a','longitud'],width:['ancho','medida b'],grain:['veta','sentido veta','sentido de veta'],material:['material','melamina','tablero'],edgeType:['tapacanto','tipo canto','tipo de tapacanto','servicio'],top:['l1','superior'],bottom:['l2','inferior'],left:['a1','izquierdo'],right:['a2','derecho'],notes:['observacion','observaciones','notas']};
  const row=rows[headerRow-1]||[];return Object.fromEntries(Object.entries(aliases).flatMap(([field,names])=>{const i=row.findIndex(x=>names.includes(normalized(x)));return i<0?[]:[[field,i]];}));
}
export function numberCell(value) {
  if(typeof value==='number')return value;
  const clean=String(value??'').trim().replace(/\s+/g,'').replace(',','.');
  if(!/^\d+(\.\d+)?$/.test(clean))return NaN;
  return Number(clean);
}
export function parseMappedRows(input, config) {
  const rows=config.transpose?transpose(input):input;
  const mapping=config.mapping||{},factor=config.units==='cm'?10:1,issues=[],pieces=[];
  if(mapping.length===undefined||mapping.length===''||mapping.width===undefined||mapping.width==='')return {pieces,issues:[{row:0,message:'Asigna las columnas Largo y Ancho.'}]};
  const lookup=(dict,value)=>dict?.[normalized(value)];
  const empty=value=>value===undefined||value===null||String(value).trim()==='';
  const skip=new Set(String(config.skipRows||'').split(/[;, ]/).map(Number));
  const markers=config.markerMap||{};
  const read=(row,field)=>mapping[field]===undefined||mapping[field]===''?'':row[Number(mapping[field])];
  const start=Math.max(1,Number(config.startRow)||2),end=Math.min(rows.length,Number(config.endRow)||rows.length);
  for(let index=start-1;index<end;index++) {
    const row=rows[index]||[],sourceRow=index+1;
    if(skip.has(sourceRow))continue;
    if(Object.values(mapping).filter(c=>c!==''&&c!==undefined).every(c=>empty(row[Number(c)])))continue;
    const errs=[];
    const length=numberCell(read(row,'length'))*factor,width=numberCell(read(row,'width'))*factor;
    const quantity=mapping.quantity===undefined||mapping.quantity===''?1:numberCell(read(row,'quantity'));
    if(!(length>0&&width>0))errs.push('Largo y ancho deben ser números positivos.');
    if(!Number.isInteger(quantity)||quantity<1)errs.push('Cantidad debe ser entera y mayor a cero.');
    const rawGrain=read(row,'grain');
    const grain=empty(rawGrain)?config.defaultGrain:lookup(config.grainMap||{l:'longitudinal',t:'transversal',sv:'sin-veta',longitudinal:'longitudinal',transversal:'transversal','sin veta':'sin-veta','sin-veta':'sin-veta'},rawGrain);
    if(!['longitudinal','transversal','sin-veta'].includes(grain))errs.push(`Define la veta «${rawGrain||'vacía'}».`);
    const rawMaterial=read(row,'material');
    const materialId=empty(rawMaterial)?config.materialId:lookup(config.materialMap,rawMaterial);
    if(!materialId)errs.push(`Asigna el material «${rawMaterial||'sin indicar'}».`);
    const rawType=read(row,'edgeType'),type=empty(rawType)?config.defaultType:lookup(config.typeMap,rawType);
    if(!empty(rawType)&&type===undefined)errs.push(`Asigna el tipo «${rawType}».`);
    const edges={top:null,bottom:null,left:null,right:null},finishes={top:'rough',bottom:'rough',left:'rough',right:'rough'};
    const assign=(side,kind)=>{
      if(config.workType==='slabs'){
        if(!['rough','bevel','miter45'].includes(kind))errs.push(`Servicio desconocido en ${side}.`);
        else finishes[side]=kind;
      }else edges[side]=kind||null;
    };
    const resolveMarker=(value,side)=>{
      const key=normalized(value);
      if((empty(value)||key==='0')&&config.blankIsNone!==false)return config.workType==='slabs'?'rough':null;
      let meaning=lookup(markers,value);
      if(meaning===undefined&&config.numericPresence&&Number.isFinite(numberCell(value))&&numberCell(value)>0)meaning='selected';
      if(meaning===undefined){errs.push(`Interpreta el símbolo «${value}» en ${side}.`);return undefined;}
      if(meaning==='none')return config.workType==='slabs'?'rough':null;
      if(meaning==='selected'){
        if(!type||type==='rough'){errs.push(`Selecciona el tipo para ${side}.`);return undefined;}
        return type;
      }
      return meaning;
    };
    for(const side of ['top','bottom','left','right'])if(mapping[side]!==undefined&&mapping[side]!==''){
      const resolved=resolveMarker(read(row,side),side);if(resolved!==undefined)assign(side,resolved);
    }
    for(const [field,a,b] of [['longEdges','top','bottom'],['shortEdges','left','right']])if(mapping[field]!==undefined&&mapping[field]!==''){
      const value=read(row,field),key=normalized(value);
      if((empty(value)||key==='0')&&config.blankIsNone!==false)continue;
      const count=Number(lookup(config.countMap,value));
      if(![0,1,2].includes(count)){errs.push(`Define si «${value}» significa 1 o 2 lados en ${field}.`);continue;}
      if(count&&!type){errs.push(`Selecciona el tipo de canto/servicio para ${field}.`);continue;}
      if(count>=1)assign(a,type);if(count===2)assign(b,type);
    }
    const anySide=Object.values(edges).some(Boolean)||Object.values(finishes).some(v=>v!=='rough');
    if(type&&type!=='rough'&&!anySide&&!config.allowTypeWithoutSides)errs.push('Hay tipo de canto/servicio pero no lados marcados; revisa la fila.');
    if(errs.length){issues.push({row:sourceRow,message:errs.join(' ')});continue;}
    pieces.push({id:`import-${sourceRow}-${Math.random().toString(36).slice(2,10)}`,name:String(read(row,'name')||`Pieza fila ${sourceRow}`),length,width,quantity,grain,materialId,
      measurementMode:config.measurementMode==='cut'?'cut':'finished',edges,finishes,notes:String(read(row,'notes')||''),sourceRow,sourceSheet:config.sheetName||'',sourceUnits:config.units||'mm'});
  }
  return {pieces,issues,totalUnits:pieces.reduce((n,p)=>n+p.quantity,0)};
}
