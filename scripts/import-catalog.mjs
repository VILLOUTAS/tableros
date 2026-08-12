import { mkdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import readXlsxFile from "read-excel-file/node";

const input = resolve(process.argv[2] || "catalog/TABLEROS_PARA_COTIZADOR.xlsx");
const output = resolve(process.argv[3] || "src/catalog.generated.js");

const preferredSheet = "Sheet0";
const sheets = await readXlsxFile(input);
const table =
  sheets.find((sheet) => sheet.sheet === preferredSheet)?.data ||
  sheets.at(-1)?.data ||
  [];
const headers = table[0].map((value) => String(value || "").trim());
const rows = table.slice(1).map((row) =>
  Object.fromEntries(
    headers.map((header, index) => [header, row[index] ?? ""]),
  ),
);

const categoryMap = {
  "MELAMINA 15MM - EGGER": {
    id: "melamina-15",
    name: "Melamina EGGER 15 mm",
    icon: "▤",
  },
  "MELAMINA 18MM - EGGER": {
    id: "melamina-18",
    name: "Melamina EGGER 18 mm",
    icon: "▥",
  },
  "MELAMINA 15MM - MASISA": {
    id: "melamina-masisa-15",
    name: "Melamina MASISA 15 mm",
    icon: "▤",
  },
  "MELAMINA 18MM - MASISA": {
    id: "melamina-masisa-18",
    name: "Melamina MASISA 18 mm",
    icon: "▥",
  },
  "TABLERO EGR DECOR": {
    id: "egr",
    name: "Tableros EGR Decor",
    icon: "◫",
  },
  "OTRO TABLERO": {
    id: "otros",
    name: "Otros tableros",
    icon: "▧",
  },
};

const edgeCategories = new Set([
  "TAPACANTO ABS",
  "TAPACANTO EGR",
  "TAPACANTO PVC 0,4MM",
  "TAPACANTO PVC 1,5MM",
  "TAPACANTO PVC 2,0MM",
]);

const normalize = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const slug = (value) =>
  normalize(value).replaceAll(" ", "-").replace(/^-|-$/g, "") || "producto";

function dimensions(row) {
  const description = String(row["Descripción"] || "");
  const match = description.match(
    /(\d{4})\s*x\s*(\d{4})(?:\s*x\s*(\d{1,2}))?/i,
  );
  const category = String(row.Categoria || "");
  if (match) {
    return {
      plateLength: Number(match[1]),
      plateWidth: Number(match[2]),
      thickness:
        Number(match[3]) ||
        (category.includes("15MM") ? 15 : category.includes("18MM") ? 18 : 17),
    };
  }
  return { plateLength: 2800, plateWidth: 1220, thickness: 18 };
}

function colorFor(value) {
  let hash = 0;
  for (const char of String(value)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  const saturation = 16 + ((hash >> 5) % 24);
  const lightness = 58 + ((hash >> 11) % 25);
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function edgeThickness(row) {
  const value = `${row.Categoria} ${row.Marca} ${row["Descripción"]}`;
  const match = value.match(/(?:^|\D)(0[,.]4|1[,.]0|1[,.]5|2[,.]0|2)\s*(?:mm)?/i);
  if (match) return Number(match[1].replace(",", "."));
  if (String(row.Categoria).includes("EGR")) return 1;
  if (String(row.Categoria).includes("ABS")) return 2;
  return 0.4;
}

function serviceRate(thickness) {
  if (thickness <= 0.4) return 500;
  if (thickness <= 1) return 600;
  if (thickness <= 1.5) return 700;
  return 850;
}

function styleFor(thickness) {
  if (thickness <= 0.4) return "solid";
  if (thickness <= 1) return "dashdot";
  if (thickness <= 1.5) return "dashed";
  return "double";
}

const rawEdges = rows.filter((row) => edgeCategories.has(String(row.Categoria)));
const edgeBands = rawEdges.map((row, index) => {
  const thickness = edgeThickness(row);
  const sku = String(row.Codigo || `TAP-${index + 1}`);
  const material = String(row.Categoria).includes("ABS")
    ? "ABS"
    : String(row.Categoria).includes("EGR")
      ? "EGR"
      : "PVC";
  return {
    id: `${slug(sku)}-${index + 1}`,
    group: `${material} ${String(thickness).replace(".", ",")} mm`,
    material,
    thickness,
    sku,
    name: String(row.Producto || row["Descripción"] || sku).trim(),
    description: String(row["Descripción"] || "").trim(),
    color: colorFor(row.Producto || sku),
    price: Number(row["Precio base de venta neto"]) || 0,
    minPrice: Number(row["Precio mínimo Neto"]) || 0,
    purchasePrice: Number(row["Precio de compra Neto"]) || 0,
    supplierCode: String(row["Código de Proveedor"] || "").trim(),
    serviceRate: serviceRate(thickness),
    style: styleFor(thickness),
  };
});

const tokenSet = (value) =>
  new Set(normalize(value).split(" ").filter((token) => token.length > 2));

function suggestedEdgeId(row) {
  const productTokens = tokenSet(row.Producto);
  let best = null;
  for (const edge of edgeBands) {
    const edgeTokens = tokenSet(edge.name);
    const score = [...productTokens].filter((token) => edgeTokens.has(token)).length;
    if (score > (best?.score ?? 0)) best = { id: edge.id, score };
  }
  return best?.id ?? edgeBands[0]?.id ?? "";
}

const materials = rows
  .filter((row) => categoryMap[String(row.Categoria)])
  .map((row, index) => {
    const sku = String(row.Codigo || `TAB-${index + 1}`);
    const baseColor = colorFor(row.Producto || sku);
    const name = String(row.Producto || sku).trim();
    const flat = normalize(name);
    const grainRequired = !/(blanco|negro|gris|grafito|cromo|lisa|mate|metal|alto brillo)/.test(
      flat,
    );
    return {
      id: `${slug(sku)}-${index + 1}`,
      categoryId: categoryMap[String(row.Categoria)].id,
      sourceCategory: String(row.Categoria),
      brand: String(row.Marca || "Sin marca").trim(),
      sku,
      name,
      description: String(row["Descripción"] || "").trim(),
      ...dimensions(row),
      netPrice: Number(row["Precio base de venta neto"]) || 0,
      minPrice: Number(row["Precio mínimo Neto"]) || 0,
      purchasePrice: Number(row["Precio de compra Neto"]) || 0,
      supplierCode: String(row["Código de Proveedor"] || "").trim(),
      sourceId: String(row.Id || ""),
      image: `/materiales/${slug(sku)}.jpg`,
      texture: `linear-gradient(135deg, ${baseColor}, color-mix(in srgb, ${baseColor} 70%, white))`,
      grainRequired,
      suggestedEdgeId: suggestedEdgeId(row),
    };
  });

const categories = Object.values(categoryMap).map((category) => ({
  ...category,
  count: materials.filter((material) => material.categoryId === category.id).length,
}));

const source = `// Archivo generado automáticamente desde ${basename(input)}.
// Para regenerarlo: npm run catalog:import
export const catalogMeta = ${JSON.stringify(
  {
    source: basename(input),
    sheet: preferredSheet,
    importedAt: new Date().toISOString(),
    materials: materials.length,
    edgeBands: edgeBands.length,
  },
  null,
  2,
)};

export const categories = ${JSON.stringify(categories, null, 2)};

export const materials = ${JSON.stringify(materials, null, 2)};

export const edgeBands = ${JSON.stringify(edgeBands, null, 2)};
`;

mkdirSync(resolve(output, ".."), { recursive: true });
writeFileSync(output, source);
console.log(
  `Catálogo generado: ${materials.length} tableros y ${edgeBands.length} tapacantos.`,
);
