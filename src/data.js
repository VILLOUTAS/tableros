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
    id: "mdf-delgados",
    name: "MDF · Delgados una cara",
    icon: "▤",
    count: 18,
  },
  {
    id: "neolith",
    name: "Neolith",
    icon: "◆",
    count: 2,
  },
];

export const materials = [
  ...generatedMaterials,
  ...[
    ...[2.8,3].flatMap(thickness=>['Blanco','Negro','Gris Humo','Cerezo','Cedro','Coigüe Chocolate','Haya','Peral'].map(color=>({thickness,color,plateLength:2440,plateWidth:1520}))),
    ...['Blanco Unicolor','Nogal Amazónico'].map(color=>({thickness:3,color,plateLength:2500,plateWidth:1830})),
  ].map((item,index)=>({
    ...item,id:`mdf-una-cara-v5-${index+1}`,sku:`MDF-1C-${item.plateWidth}-${item.thickness}-${index+1}`,
    name:`MDF una cara · ${item.color} · ${item.thickness} mm`,colorName:item.color,
    categoryId:'mdf-delgados',taxonomyId:'mdf-4',sourceCategory:'MDF Delgados una cara',materialType:'board',
    brand:'Por definir',supplier:'',stock:null,netPrice:0,purchasePrice:0,minPrice:0,active:false,
    grainRequired:!['Blanco','Blanco Unicolor','Negro','Gris Humo'].includes(item.color),
    image:'',texture:'#ece8df',suggestedEdgeId:'',perimeterTrim:10,
    description:'Formato solicitado para catálogo V5. Completar proveedor y precio antes de activar.',
  })),
  {
    id: "neolith-12-1600x3200",
    categoryId: "neolith",
    sourceCategory: "NEOLITH",
    materialType: "neolith",
    brand: "NEOLITH",
    sku: "NEOLITH-12-1600X3200",
    name: "Neolith 12 mm",
    description:
      "Placa de fábrica 3260 x 1660 mm. Después del despunte perimetral de 30 mm por lado, la superficie útil es 3200 x 1600 mm.",
    plateLength: 3260,
    plateWidth: 1660,
    usablePlateLength: 3200,
    usablePlateWidth: 1600,
    factoryPerimeterAllowance: 30,
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
      "Placa de fábrica 3260 x 1560 mm. Después del despunte perimetral de 30 mm por lado, la superficie útil es 3200 x 1500 mm.",
    plateLength: 3260,
    plateWidth: 1560,
    usablePlateLength: 3200,
    usablePlateWidth: 1500,
    factoryPerimeterAllowance: 30,
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
