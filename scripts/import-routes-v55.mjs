import fs from 'node:fs';
import * as XLSX from 'xlsx';
import {slug} from '../src/v55-domain.js';
const wb=XLSX.read(fs.readFileSync(process.argv[2]||'catalog/RUTAS_V5.5.xlsx'),{type:'buffer'});
const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1}),routes=[];
for(const [i,r] of rows.slice(1).entries()){
 if(!r[1])continue;
 const local=r[1]==='GRAN CONCEPCION',names=local?['Concepción','Chiguayante','Hualqui','Talcahuano','Hualpén','San Pedro de la Paz','Tomé','Penco']:[String(r[1])];
 if(!(Number(r[8])>=0))throw Error('Tarifa inválida: fila '+(i+2));
 for(const name of names)routes.push({id:slug(name),name,ratePerKg:Number(r[8]),local,minimumNet:local?5000:15000,active:true,sourceRow:i+2,sourceDestination:r[1],roadKm:Number(r[2])});
}
if(new Set(routes.map(r=>r.id)).size!==routes.length)throw Error('Destinos duplicados.');
fs.writeFileSync('src/routes.v55.generated.js','// Columna I del archivo original, sin recalcular tarifas.\nexport default '+JSON.stringify(routes,null,2)+';\n');
console.log(routes.length+' comunas habilitadas. Solo se usa como semilla de primera instalación V5.5.');
