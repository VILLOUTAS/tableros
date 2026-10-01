import { discountedLine } from './v5-domain.js';
import { isV51, serviceKeyFor } from './v51-domain.js';

// Se aplica exclusivamente a V5. Los motores históricos conservan sus reglas.
export function priceV5(result, materials, edges, settings) {
  const lines = [], policies = settings.servicePolicies || {};
  const add = (kind, id, name, price, qty, requested, policy) => {
    if (!qty) return;
    lines.push({kind,id,name,quantity:qty,unitPrice:price,...discountedLine(price,qty,requested,policy)});
  };
  for (const row of result.materialSummaries) {
    const material = materials.find(m => m.id === row.materialId) || {};
    if(!row.isStone||row.unitPrice>0) add('board', row.materialId, row.name, row.unitPrice, row.boardCount, settings.boardDiscount, material);
    const key = isV51(settings)?serviceKeyFor(material):row.isStone ? 'stoneCutPerPlateRate' : (row.cutRatePerBoard === Number(settings.melamineCutRate) ? 'melamineCutRate' : 'specialCutRate');
    add('service', key, `Corte · ${row.name}`, row.cutRatePerBoard, row.boardCount, settings.servicesDiscount, policies[key]);
  }
  for (const row of result.edgeSummaries) {
    const edge = edges.find(e => e.id === row.edgeId) || {};
    add('edge', row.edgeId, row.name, row.unitPrice, row.materialMeters??row.meters, settings.edgeDiscount, edge);
    add('service', row.edgeId, `Instalación · ${row.name}`, row.serviceRate, row.meters, settings.servicesDiscount,
      {purchasePrice:edge.servicePurchasePrice,minPrice:edge.serviceMinPrice,discountLimit:edge.serviceDiscountLimit});
  }
  for (const row of result.finishSummaries) {
    const key = row.finishId === 'bevel' ? 'stoneBevelRate' : 'stoneMiter45Rate';
    add('service', key, row.name, row.unitPrice, row.meters, settings.servicesDiscount, policies[key]);
  }
  const s = result.summary;
  for (const [kind, field, subtotal] of [['board','boardDiscount','boardSubtotal'],['edge','edgeDiscount','edgeSubtotal'],['service','servicesDiscount','servicesSubtotal']]) {
    s[`${field}Amount`] = lines.filter(l=>l.kind===kind).reduce((sum,l)=>sum+l.discountAmount,0);
    s[field] = s[subtotal] ? s[`${field}Amount`]/s[subtotal]*100 : 0;
  }
  s.discountTotal = s.boardDiscountAmount+s.edgeDiscountAmount+s.servicesDiscountAmount;
  s.net = Math.round(lines.reduce((sum,l)=>sum+l.net,0));
  s.vat = Math.round(s.net*0.19); s.total = s.net+s.vat;
  result.priceLines=lines;
  for(const line of lines) if(line.belowFloor)result.warnings.push(`Revisa el precio de ${line.name}: está bajo su costo o mínimo de venta.`);
  return result;
}
