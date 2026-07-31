import test from "node:test";
import assert from "node:assert/strict";

import {
  assignPieceCodes,
  cutRateForMaterial,
  cutDimensions,
  drawCutPlan,
  edgeImportLabel,
  isBlankPieceImportRow,
  materialImportLabel,
  optimize,
  optimizeProject,
  parsePieceImportTable,
  pieceFitsMaterial,
  resolveCatalogReference,
  summarizeOptimizedPieces,
  summarizePlateLeftovers,
  summarizePlatePieces,
  validateRut,
} from "../src/logic.js";

const material = {
  plateLength: 2800,
  plateWidth: 2070,
  netPrice: 50000,
};

const edges = [
  { id: "pvc-1", thickness: 1, price: 500, serviceRate: 600 },
];

function piece(overrides = {}) {
  return {
    id: "p1",
    code: "P-001",
    name: "Costado",
    length: 720,
    width: 560,
    quantity: 1,
    grain: "longitudinal",
    edges: { top: "pvc-1", right: "pvc-1", bottom: null, left: null },
    notes: "",
    ...overrides,
  };
}

test("valida un RUT chileno con módulo 11", () => {
  assert.equal(validateRut("12.345.678-5"), true);
  assert.equal(validateRut("12.345.678-9"), false);
});

test("ignora filas dinámicas de Excel que todavía no tienen datos de pieza", () => {
  assert.equal(
    isBlankPieceImportRow([null, "", undefined, "  ", null, ""]),
    true,
  );
  assert.equal(
    isBlankPieceImportRow([null, "", "62-EGGER-1502", "", null]),
    false,
  );
});

test("resuelve tableros y tapacantos desde los selectores dinámicos de Excel", () => {
  const boards = [
    {
      id: "tablero-1",
      sku: "62-EGGER-1502",
      brand: "EGGER",
      name: "BLANCO LISA",
      thickness: 15,
      plateLength: 2600,
      plateWidth: 1830,
    },
    {
      id: "tablero-2",
      sku: "62-EGGER-1502",
      brand: "EGGER",
      name: "PIETRA GRIGIA NEGRO",
      thickness: 15,
      plateLength: 2600,
      plateWidth: 1830,
    },
  ];
  const importedBoard = resolveCatalogReference(
    boards,
    materialImportLabel(boards[1]),
    materialImportLabel,
  );
  assert.equal(importedBoard.id, "tablero-2");

  const importedEdge = resolveCatalogReference(
    [
      {
        id: "edge-1",
        sku: "67-D-0015",
        group: "PVC 1,5 mm",
        name: "BLANCO",
        supplierCode: "BL15",
      },
    ],
    "67-D-0015 · PVC 1,5 mm · BLANCO · BL15",
    edgeImportLabel,
  );
  assert.equal(importedEdge.id, "edge-1");
});

test("incorpora desde Excel piezas, medidas, cantidades, tableros y tapacantos", () => {
  const boards = [
    {
      id: "tablero-1",
      sku: "62-EGGER-1502",
      brand: "EGGER",
      name: "BLANCO LISA",
      thickness: 15,
      plateLength: 2600,
      plateWidth: 1830,
    },
    {
      id: "tablero-2",
      sku: "62-EGGER-1503",
      brand: "EGGER",
      name: "GRIS CACHMIRA",
      thickness: 15,
      plateLength: 2600,
      plateWidth: 1830,
    },
  ];
  const catalogEdges = [
    {
      id: "edge-1",
      sku: "67-D-0015",
      group: "PVC 1,5 mm",
      name: "BLANCO",
      supplierCode: "BL15",
    },
  ];
  const table = [
    [
      "codigo_opcional",
      "nombre_elemento_opcional",
      "tablero_seleccion",
      "largo",
      "ancho",
      "cantidad",
      "veta",
      "L1_tipo_tapacanto",
      "L1_tapacanto",
    ],
    [
      "",
      "Costado",
      materialImportLabel(boards[1]),
      "1.200",
      450,
      3,
      "longitudinal",
      "PVC 1,5 mm",
      edgeImportLabel(catalogEdges[0]),
    ],
  ];

  const imported = parsePieceImportTable(table, {
    catalogMaterials: boards,
    catalogEdges,
    fallbackMaterialId: "tablero-1",
    idFactory: () => "pieza-importada",
  });

  assert.deepEqual(imported.errors, []);
  assert.deepEqual(imported.materialIds, ["tablero-2"]);
  assert.equal(imported.rows.length, 1);
  assert.deepEqual(imported.rows[0], {
    id: "pieza-importada",
    code: "",
    name: "Costado",
    length: 1200,
    width: 450,
    quantity: 3,
    grain: "longitudinal",
    materialId: "tablero-2",
    notes: "",
    edges: { top: "edge-1", right: null, bottom: null, left: null },
  });
});

test("acepta piezas Excel sin nombre y explica filas inválidas", () => {
  const boards = [
    {
      id: "tablero-1",
      sku: "TAB-1",
      brand: "MARCA",
      name: "BLANCO",
      thickness: 15,
      plateLength: 2600,
      plateWidth: 1830,
    },
  ];
  const table = [
    ["tablero_seleccion", "largo", "ancho", "cantidad"],
    [materialImportLabel(boards[0]), 600, 400, 2],
    [materialImportLabel(boards[0]), 9000, 400, 1],
  ];
  let sequence = 0;
  const imported = parsePieceImportTable(table, {
    catalogMaterials: boards,
    idFactory: () => `pieza-${++sequence}`,
  });

  assert.equal(imported.rows.length, 1);
  assert.equal(imported.rows[0].name, "");
  assert.equal(imported.rows[0].length, 600);
  assert.equal(imported.rows[0].width, 400);
  assert.equal(imported.rows[0].quantity, 2);
  assert.match(imported.errors[0], /Fila 3: la pieza excede la plancha/);
});

test("descuenta el tapacanto según el lado", () => {
  assert.deepEqual(cutDimensions(piece(), edges), {
    cutLength: 719,
    cutWidth: 559,
  });
});

test("limita las piezas a las dimensiones del tablero y respeta la veta", () => {
  assert.equal(
    pieceFitsMaterial(
      { length: 2800, width: 2070, grain: "longitudinal" },
      material,
    ),
    true,
  );
  assert.equal(
    pieceFitsMaterial(
      { length: 2801, width: 2070, grain: "longitudinal" },
      material,
    ),
    false,
  );
  assert.equal(
    pieceFitsMaterial(
      { length: 2000, width: 2500, grain: "longitudinal" },
      material,
    ),
    false,
  );
  assert.equal(
    pieceFitsMaterial(
      { length: 2000, width: 2500, grain: "transversal" },
      material,
    ),
    true,
  );
  assert.equal(
    pieceFitsMaterial(
      { length: 2500, width: 2000, grain: "sin-veta" },
      material,
    ),
    true,
  );
});

test("genera franjas longitudinales y subtotales separados", () => {
  const result = optimize(
    material,
    [piece({ quantity: 2 })],
    edges,
    { kerf: 2, cutRatePerBoard: 900, optimizationMode: "longitudinal" },
  );
  assert.equal(result.plates.length, 1);
  assert.equal(result.plates[0].strips.length, 1);
  assert.equal(result.plates[0].pieces.length, 2);
  assert.equal(result.summary.boardSubtotal, 50000);
  assert.ok(result.summary.edgeSubtotal > 0);
  assert.equal(result.summary.cuttingSubtotal, 900);
  assert.ok(result.summary.bandingSubtotal > 0);
  assert.equal(
    Math.round(result.summary.total),
    Math.round(result.summary.net * 1.19),
  );
});

test("aplica descuentos diferenciados a tableros, tapacantos y servicios", () => {
  const result = optimize(material, [piece()], edges, {
    kerf: 2,
    cutRatePerBoard: 1000,
    boardDiscount: 10,
    edgeDiscount: 20,
    servicesDiscount: 30,
  });
  const summary = result.summary;
  assert.equal(summary.boardDiscountAmount, summary.boardSubtotal * 0.1);
  assert.equal(summary.edgeDiscountAmount, summary.edgeSubtotal * 0.2);
  assert.equal(
    summary.servicesDiscountAmount,
    summary.servicesSubtotal * 0.3,
  );
  assert.equal(
    summary.net,
    summary.boardSubtotal +
      summary.edgeSubtotal +
      summary.servicesSubtotal -
      summary.discountTotal,
  );
});

test("el modo sin prioridad evalúa ambos ejes de primer corte", () => {
  const result = optimize(
    { plateLength: 1200, plateWidth: 800, netPrice: 10000 },
    [
      piece({
        id: "p2",
        length: 700,
        width: 500,
        grain: "sin-veta",
        edges: {},
      }),
    ],
    [],
    { kerf: 2, cutRatePerBoard: 1000, optimizationMode: "free" },
  );
  assert.ok(["longitudinal", "transversal"].includes(result.plates[0].cutAxis));
});

test("optimiza y subtotaliza por separado los tableros de un proyecto", () => {
  const materials = [
    { ...material, id: "tablero-a", sku: "A", name: "Tablero A" },
    {
      ...material,
      id: "tablero-b",
      sku: "B",
      name: "Tablero B",
      netPrice: 70000,
    },
  ];
  const result = optimizeProject(
    materials,
    [
      piece({ id: "p-a", materialId: "tablero-a", edges: {} }),
      piece({ id: "p-b", materialId: "tablero-b", edges: {} }),
    ],
    [],
    { kerf: 2, cutRatePerBoard: 900, optimizationMode: "longitudinal" },
  );

  assert.equal(result.materialSummaries.length, 2);
  assert.equal(result.plates.length, 2);
  assert.deepEqual(
    result.plates.map((plate) => plate.materialId),
    ["tablero-a", "tablero-b"],
  );
  assert.equal(result.summary.boardCount, 2);
  assert.equal(result.summary.boardSubtotal, 120000);
  assert.equal(result.summary.cuttingSubtotal, 21000);
  assert.equal(
    result.summary.total,
    result.summary.net * 1.19,
  );
  assert.equal(summarizePlatePieces(result.plates[0])[0].quantity, 1);
  const optimizedPieces = summarizeOptimizedPieces(
    result.plates,
    [
      piece({ id: "p-a", materialId: "tablero-a", edges: {} }),
      piece({ id: "p-b", materialId: "tablero-b", edges: {} }),
    ],
    [],
  );
  assert.equal(optimizedPieces.length, 2);
  assert.equal(optimizedPieces[0].optimizedQuantity, 1);
  assert.match(optimizedPieces[0].plates[0], /A · Placa 1/);
});

test("asigna códigos al generar producción, calcula corte y codifica retazos", () => {
  const pieces = [
    piece({ id: "sin-codigo-1", code: "" }),
    piece({ id: "existente", code: "P-010" }),
    piece({ id: "sin-codigo-2", code: "" }),
  ];
  assignPieceCodes(pieces);
  assert.deepEqual(
    pieces.map((item) => item.code),
    ["P-001", "P-010", "P-002"],
  );
  assert.equal(
    cutRateForMaterial({ categoryId: "melamina-15" }),
    7500,
  );
  assert.equal(cutRateForMaterial({ categoryId: "egr-17" }), 10500);

  const result = optimizeProject(
    [{ ...material, id: "tablero", sku: "TAB", categoryId: "melamina-15" }],
    [piece({ id: "pieza", materialId: "tablero", edges: {} })],
    [],
    { kerf: 2 },
  );
  assert.equal(result.summary.cuttingSubtotal, 7500);
  const leftovers = summarizePlateLeftovers(result.plates[0]);
  assert.ok(leftovers.length > 0);
  assert.match(leftovers[0].code, /^RET-01-/);
});

test("agrupa las repeticiones de una pieza dentro de cada placa", () => {
  const result = optimize(
    material,
    [piece({ id: "repetida", quantity: 3, edges: {} })],
    [],
    { kerf: 2, cutRatePerBoard: 900, optimizationMode: "longitudinal" },
  );
  const rows = summarizePlatePieces(result.plates[0]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].code, "P-001");
  assert.equal(rows[0].quantity, 3);
});

test("la hoja de producción mantiene plano, listado, retazos y controles C/E/S", () => {
  const board = {
    ...material,
    id: "tablero-qa",
    sku: "QA-001",
    brand: "CASA DISEÑO",
    name: "TABLERO DE PRUEBA",
    thickness: 18,
  };
  const result = optimize(board, [piece({ quantity: 2 })], edges, {
    kerf: 2,
    optimizationMode: "longitudinal",
  });
  const plate = {
    ...result.plates[0],
    materialPlateIndex: 1,
    leftovers: [
      {
        code: "RET-QA-001",
        x: 1500,
        y: 1200,
        width: 300,
        height: 250,
      },
    ],
  };
  const drawnText = [];
  const context = new Proxy(
    {
      measureText(value) {
        return { width: String(value).length * 5.5 };
      },
      fillText(value) {
        drawnText.push(String(value));
      },
    },
    {
      get(target, property) {
        if (property in target) return target[property];
        return () => {};
      },
      set(target, property, value) {
        target[property] = value;
        return true;
      },
    },
  );
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
  };
  drawCutPlan(canvas, plate, board, edges, null, {
    projectId: "COT-QA",
    project: {
      projectName: "Cocina QA",
      clientName: "Cliente QA",
      status: "produccion",
    },
    statusLabel: "Producción",
    createdBy: "Operador QA",
    generatedAt: "31-07-2026",
  });
  assert.ok(drawnText.includes("PIEZAS Y RETAZOS DE ESTA PLACA"));
  assert.ok(drawnText.includes("C"));
  assert.ok(drawnText.includes("E"));
  assert.ok(drawnText.includes("S"));
  assert.ok(drawnText.some((value) => value.includes("RET-QA-001")));
  assert.ok(canvas.width >= 1400);
  assert.ok(canvas.height >= 900);
});
