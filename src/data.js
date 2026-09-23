import {
  catalogMeta,
  categories as generatedCategories,
  edgeBands,
  materials as generatedMaterials,
} from "./catalog.generated.js";

export { catalogMeta, edgeBands };

export const categories = [
  ...generatedCategories,
  {
    id: "neolith",
    name: "Neolith",
    icon: "◆",
    count: 2,
  },
];

export const materials = [
  ...generatedMaterials,
  {
    id: "neolith-12-1600x3200",
    categoryId: "neolith",
    sourceCategory: "NEOLITH",
    materialType: "neolith",
    brand: "NEOLITH",
    sku: "NEOLITH-12-1600X3200",
    name: "Neolith 12 mm",
    description:
      "Plancha nominal 3200 x 1600 mm. El color y el precio se definen por proyecto.",
    plateLength: 3200,
    plateWidth: 1600,
    thickness: 12,
    netPrice: 0,
    minPrice: 0,
    purchasePrice: 0,
    image: "",
    texture: "linear-gradient(135deg, #d8d4cd, #f3f1ed)",
    grainRequired: true,
    suggestedEdgeId: "",
    customColor: true,
    noEdgeBands: true,
    perimeterTrim: 30,
  },
  {
    id: "neolith-6-1500x3200",
    categoryId: "neolith",
    sourceCategory: "NEOLITH",
    materialType: "neolith",
    brand: "NEOLITH",
    sku: "NEOLITH-6-1500X3200",
    name: "Neolith 6 mm",
    description:
      "Plancha nominal 3200 x 1500 mm. El color y el precio se definen por proyecto.",
    plateLength: 3200,
    plateWidth: 1500,
    thickness: 6,
    netPrice: 0,
    minPrice: 0,
    purchasePrice: 0,
    image: "",
    texture: "linear-gradient(135deg, #cfd2d2, #f6f7f7)",
    grainRequired: true,
    suggestedEdgeId: "",
    customColor: true,
    noEdgeBands: true,
    perimeterTrim: 30,
  },
];

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
