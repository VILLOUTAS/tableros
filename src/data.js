export {
  catalogMeta,
  categories,
  edgeBands,
  materials,
} from "./catalog.generated.js";

export const statusLabels = {
  cotizacion: "Cotización",
  venta: "Venta",
  produccion: "Producción",
};

export const grainLabels = {
  longitudinal: "Longitudinal",
  transversal: "Transversal",
  "sin-veta": "Sin veta",
};

export const sides = [
  ["top", "Superior"],
  ["right", "Derecho"],
  ["bottom", "Inferior"],
  ["left", "Izquierdo"],
];
