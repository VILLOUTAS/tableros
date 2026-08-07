export {
  catalogMeta,
  categories,
  edgeBands,
  materials,
} from "./catalog.generated.js";

export const statusLabels = {
  cotizacion: "Cotización",
  facturacion: "Facturación",
  facturado_pagado: "Facturado y pagado",
  produccion: "Producción",
  despacho: "Despacho",
  entregado: "Entregado",
};

export const grainLabels = {
  longitudinal: "Longitudinal",
  transversal: "Transversal",
  "sin-veta": "Sin veta",
};

export const sides = [
  ["top", "L1 · Superior"],
  ["bottom", "L2 · Inferior"],
  ["left", "A1 · Izquierdo"],
  ["right", "A2 · Derecho"],
];
