const sides = ["top", "right", "bottom", "left"];

export function isBlankPieceImportRow(values = []) {
  return values.every((value) => String(value ?? "").trim() === "");
}

function normalizeCatalogReference(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function materialImportLabel(material = {}) {
  return [
    material.sku,
    material.brand,
    material.name,
    `${material.thickness} mm`,
    `${material.plateLength}x${material.plateWidth}`,
  ]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .join(" · ");
}

export function edgeImportLabel(edge = {}) {
  return [
    edge.sku,
    edge.group,
    edge.name,
    edge.supplierCode || edge.id,
  ]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .join(" · ");
}

export function resolveCatalogReference(items = [], reference, labelBuilder) {
  const target = normalizeCatalogReference(reference);
  if (!target) return null;

  const exact = items.find((item) => {
    const aliases = [
      item.id,
      item.sku,
      item.name,
      typeof labelBuilder === "function" ? labelBuilder(item) : "",
    ];
    return aliases.some(
      (alias) => normalizeCatalogReference(alias) === target,
    );
  });
  if (exact) return exact;

  const skuMatches = items.filter((item) => {
    const sku = normalizeCatalogReference(item.sku);
    if (!sku) return false;
    return (
      target.startsWith(`${sku} · `) ||
      target.startsWith(`${sku} - `) ||
      target === sku ||
      target.split(" ").includes(sku)
    );
  });
  if (skuMatches.length === 1) return skuMatches[0];

  const labelMatches = items.filter((item) => {
    const label = normalizeCatalogReference(
      typeof labelBuilder === "function" ? labelBuilder(item) : "",
    );
    return label && (label.includes(target) || target.includes(label));
  });
  return labelMatches.length === 1 ? labelMatches[0] : null;
}

export function normalizeImportHeader(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pickImportValue(row, names) {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      normalizeImportHeader(key),
      value,
    ]),
  );
  return names
    .map(normalizeImportHeader)
    .map((name) => normalized[name])
    .find((value) => value !== undefined);
}

function parseImportNumber(value) {
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim().replace(/\s+/g, "");
  if (!text) return Number.NaN;
  if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) {
    return Number(text.replaceAll(".", ""));
  }
  if (/^-?\d{1,3}(,\d{3})+$/.test(text)) {
    return Number(text.replaceAll(",", ""));
  }
  if (text.includes(",") && text.includes(".")) {
    return Number(text.replaceAll(".", "").replace(",", "."));
  }
  return Number(text.replace(",", "."));
}

function defaultImportId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `pieza-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const requiredPieceHeaderGroups = [
  ["largo", "length", "largo mm", "largo pieza", "largo pieza mm"],
  ["ancho", "width", "ancho mm", "ancho pieza", "ancho pieza mm"],
  ["cantidad", "qty", "cant", "unidades", "unidad", "ud"],
];

function pieceImportHeaderRowIndex(table = []) {
  return table.slice(0, 25).findIndex((candidate) => {
    const normalized = new Set(candidate.map(normalizeImportHeader));
    return requiredPieceHeaderGroups.every((aliases) =>
      aliases.some((alias) => normalized.has(normalizeImportHeader(alias))),
    );
  });
}

export function parsePieceImportTable(
  table = [],
  {
    catalogMaterials = [],
    catalogEdges = [],
    fallbackMaterialId = "",
    idFactory = defaultImportId,
  } = {},
) {
  if (!Array.isArray(table) || !table.length) {
    return {
      rows: [],
      errors: ["La hoja de piezas está vacía."],
      issues: [{ row: 0, field: "archivo", message: "La hoja de piezas está vacía." }],
      materialIds: [],
      totalRows: 0,
      blankRows: 0,
      rejectedRows: 0,
      headerRow: 0,
    };
  }

  const headerRowIndex = pieceImportHeaderRowIndex(table);
  if (headerRowIndex < 0) {
    const message =
      "No se reconocen las columnas Largo, Ancho y Cantidad. Usa la plantilla descargada desde el cotizador.";
    return {
      rows: [],
      errors: [message],
      issues: [{ row: 0, field: "encabezados", message }],
      materialIds: [],
      totalRows: Math.max(0, table.length - 1),
      blankRows: 0,
      rejectedRows: Math.max(0, table.length - 1),
      headerRow: 0,
    };
  }

  const headers = table[headerRowIndex].map((value) => String(value ?? ""));
  const normalizedHeaders = new Set(headers.map(normalizeImportHeader));
  if (
    requiredPieceHeaderGroups.some(
      (aliases) =>
        !aliases.some((alias) =>
          normalizedHeaders.has(normalizeImportHeader(alias)),
        ),
    )
  ) {
    return {
      rows: [],
      errors: [
        "No se reconocen las columnas Largo, Ancho y Cantidad. Usa la plantilla descargada desde el cotizador.",
      ],
      issues: [{
        row: headerRowIndex + 1,
        field: "encabezados",
        message:
          "No se reconocen las columnas Largo, Ancho y Cantidad. Usa la plantilla descargada desde el cotizador.",
      }],
      materialIds: [],
      totalRows: Math.max(0, table.length - headerRowIndex - 1),
      blankRows: 0,
      rejectedRows: Math.max(0, table.length - headerRowIndex - 1),
      headerRow: headerRowIndex + 1,
    };
  }

  const sourceRows = table.slice(headerRowIndex + 1).map((row) =>
    Object.fromEntries(
      headers.map((header, index) => [header, row[index] ?? ""]),
    ),
  );
  const rows = [];
  const errors = [];
  const issues = [];
  let blankRows = 0;
  const importedMaterialIds = new Set();
  const fallbackMaterial = catalogMaterials.find(
    (item) => item.id === fallbackMaterialId,
  );

  sourceRows.forEach((row, index) => {
    const sheetRow = headerRowIndex + index + 2;
    const reject = (field, message) => {
      const fullMessage = `Fila ${sheetRow}: ${message}`;
      errors.push(fullMessage);
      issues.push({ row: sheetRow, field, message });
    };
    const rawCode = pickImportValue(row, [
      "codigo",
      "código",
      "codigo opcional",
      "code",
    ]);
    const rawName = pickImportValue(row, [
      "nombre o codigo del elemento",
      "nombre o código del elemento",
      "nombre elemento opcional",
      "nombre del elemento opcional",
      "nombre opcional",
      "nombre",
      "pieza",
      "name",
    ]);
    const rawLength = pickImportValue(row, requiredPieceHeaderGroups[0]);
    const rawWidth = pickImportValue(row, requiredPieceHeaderGroups[1]);
    const rawQuantity = pickImportValue(row, requiredPieceHeaderGroups[2]);
    const rawMaterialReference = pickImportValue(row, [
      "codigo material auto",
      "codigo material",
      "código material",
      "codigo material opcional",
      "material",
      "tablero",
      "codigo tablero",
      "código tablero",
      "sku material",
    ]);
    const rawMaterialSelection = pickImportValue(row, [
      "tablero seleccion",
      "tablero seleccionado",
      "seleccion tablero",
      "producto tablero",
    ]);
    const rawGrain = pickImportValue(row, ["veta", "grain"]);
    const rawNotes = pickImportValue(row, ["notas", "nota", "notes"]);
    const rawEdgeTypes = {
      top: pickImportValue(row, [
        "l1 tipo tapacanto",
        "tipo tapacanto l1",
      ]),
      bottom: pickImportValue(row, [
        "l2 tipo tapacanto",
        "tipo tapacanto l2",
      ]),
      left: pickImportValue(row, [
        "a1 tipo tapacanto",
        "tipo tapacanto a1",
        "l4 tipo tapacanto",
      ]),
      right: pickImportValue(row, [
        "a2 tipo tapacanto",
        "tipo tapacanto a2",
        "l3 tipo tapacanto",
      ]),
    };
    const rawEdgeSelections = {
      top: pickImportValue(row, [
        "l1 tapacanto",
        "tapacanto l1",
        "tapacanto lado l1",
        "tapacanto superior",
        "l1",
      ]),
      bottom: pickImportValue(row, [
        "l2 tapacanto",
        "tapacanto l2",
        "tapacanto lado l2",
        "tapacanto inferior",
        "l2",
      ]),
      left: pickImportValue(row, [
        "a1 tapacanto",
        "tapacanto a1",
        "tapacanto lado a1",
        "l4 tapacanto",
        "tapacanto l4",
        "tapacanto izquierdo",
        "a1",
      ]),
      right: pickImportValue(row, [
        "a2 tapacanto",
        "tapacanto a2",
        "tapacanto lado a2",
        "l3 tapacanto",
        "tapacanto l3",
        "tapacanto derecho",
        "a2",
      ]),
    };

    if (
      isBlankPieceImportRow([
        rawCode,
        rawName,
        rawLength,
        rawWidth,
        rawQuantity,
        rawMaterialReference,
        rawMaterialSelection,
        rawGrain,
        rawNotes,
        ...Object.values(rawEdgeTypes),
        ...Object.values(rawEdgeSelections),
      ])
    ) {
      blankRows += 1;
      return;
    }

    const code = String(rawCode ?? "").trim();
    const name = String(rawName ?? "").trim();
    const length = parseImportNumber(rawLength);
    const width = parseImportNumber(rawWidth);
    const quantity = parseImportNumber(rawQuantity);
    const materialReference = String(rawMaterialReference ?? "").trim();
    const materialSelection = String(rawMaterialSelection ?? "").trim();
    const material =
      resolveCatalogReference(
        catalogMaterials,
        materialSelection,
        materialImportLabel,
      ) ||
      resolveCatalogReference(
        catalogMaterials,
        materialReference,
        materialImportLabel,
      ) ||
      (!materialSelection && !materialReference ? fallbackMaterial : null);
    const normalizedGrain = normalizeImportHeader(rawGrain || "sin-veta");
    const grain = normalizedGrain.startsWith("long")
      ? "longitudinal"
      : normalizedGrain.startsWith("trans")
        ? "transversal"
        : "sin-veta";

    if (
      !Number.isFinite(length) ||
      !Number.isFinite(width) ||
      !Number.isInteger(quantity) ||
      length <= 0 ||
      width <= 0 ||
      quantity <= 0
    ) {
      reject(
        "medidas/cantidad",
        "Largo, Ancho y Cantidad deben ser números positivos; Cantidad debe ser un entero.",
      );
      return;
    }
    if (!material) {
      reject(
        "tablero",
        "el tablero indicado no existe en el catálogo. Selecciónalo desde la lista de la plantilla o ingresa su código SKU.",
      );
      return;
    }
    if (!pieceFitsMaterial({ length, width, grain }, material)) {
      reject(
        "medidas",
        `la pieza excede la plancha ${material.plateLength} × ${material.plateWidth} mm para la veta indicada.`,
      );
      return;
    }

    const importedEdges = {
      top: null,
      right: null,
      bottom: null,
      left: null,
    };
    const incompleteEdge = Object.entries(rawEdgeTypes).find(
      ([side, type]) =>
        String(type ?? "").trim() &&
        !String(rawEdgeSelections[side] ?? "").trim(),
    );
    const sideLabels = {
      top: "L1",
      bottom: "L2",
      left: "A1",
      right: "A2",
    };
    if (incompleteEdge) {
      reject(
        `tapacanto ${sideLabels[incompleteEdge[0]]}`,
        `selecciona el producto de tapacanto ${sideLabels[incompleteEdge[0]]}.`,
      );
      return;
    }
    const invalidEdge = Object.entries(rawEdgeSelections).find(
      ([side, reference]) => {
        const value = String(reference ?? "").trim();
        if (!value) return false;
        const edge = resolveCatalogReference(
          catalogEdges,
          value,
          edgeImportLabel,
        );
        if (!edge) return true;
        importedEdges[side] = edge.id;
        return false;
      },
    );
    if (invalidEdge) {
      reject(
        `tapacanto ${sideLabels[invalidEdge[0]]}`,
        `el tapacanto ${sideLabels[invalidEdge[0]]} no existe en el catálogo. Selecciónalo desde la lista o ingresa su SKU.`,
      );
      return;
    }

    rows.push({
      id: idFactory(),
      code,
      name,
      length,
      width,
      quantity,
      grain,
      materialId: material.id,
      notes: String(rawNotes ?? "").trim(),
      edges: importedEdges,
    });
    importedMaterialIds.add(material.id);
  });

  return {
    rows,
    errors,
    issues,
    materialIds: [...importedMaterialIds],
    totalRows: sourceRows.length,
    blankRows,
    rejectedRows: issues.length,
    headerRow: headerRowIndex + 1,
  };
}

export function assignPieceCodes(pieces = []) {
  const used = new Set(
    pieces
      .map((piece) => String(piece.code || "").trim())
      .filter(Boolean),
  );
  let sequence = 1;
  pieces.forEach((piece) => {
    if (String(piece.code || "").trim()) return;
    let code = "";
    do {
      code = `P-${String(sequence).padStart(3, "0")}`;
      sequence += 1;
    } while (used.has(code));
    piece.code = code;
    used.add(code);
  });
  return pieces;
}

export function cutRateForMaterial(material = {}, settings = {}) {
  const melamine = ["melamina-15", "melamina-18"].includes(
    material.categoryId,
  );
  const configured = melamine
    ? settings.melamineCutRate
    : settings.specialCutRate;
  const fallback = melamine ? 7500 : 10500;
  return Math.max(0, Number(configured ?? fallback) || 0);
}

export function cleanRut(value = "") {
  return String(value).replace(/[^0-9kK]/g, "").toUpperCase();
}

export function validateRut(value) {
  const rut = cleanRut(value);
  if (rut.length < 8) return false;
  const body = rut.slice(0, -1);
  const verifier = rut.slice(-1);
  let sum = 0;
  let multiplier = 2;
  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const result = 11 - (sum % 11);
  const expected = result === 11 ? "0" : result === 10 ? "K" : String(result);
  return verifier === expected;
}

export function formatRut(value) {
  const rut = cleanRut(value);
  if (rut.length < 2) return rut;
  const body = rut.slice(0, -1);
  return `${Number(body).toLocaleString("es-CL")}-${rut.slice(-1)}`;
}

export function cutDimensions(piece, edgeBands) {
  const edge = (side) =>
    edgeBands.find((item) => item.id === piece.edges?.[side])?.thickness ?? 0;
  return {
    cutLength: Math.max(1, piece.length - edge("left") - edge("right")),
    cutWidth: Math.max(1, piece.width - edge("top") - edge("bottom")),
  };
}

export function pieceFitsMaterial(piece, material) {
  if (!material) return false;
  const length = Number(piece.length);
  const width = Number(piece.width);
  if (length <= 0 || width <= 0) return false;
  const direct =
    length <= material.plateLength && width <= material.plateWidth;
  const rotated =
    width <= material.plateLength && length <= material.plateWidth;
  if (piece.grain === "longitudinal") return direct;
  if (piece.grain === "transversal") return rotated;
  return direct || rotated;
}

function orientations(piece, cut) {
  if (piece.grain === "longitudinal") {
    return [{ w: cut.cutLength, h: cut.cutWidth, rotated: false }];
  }
  if (piece.grain === "transversal") {
    return [{ w: cut.cutWidth, h: cut.cutLength, rotated: true }];
  }
  return [
    { w: cut.cutLength, h: cut.cutWidth, rotated: false },
    { w: cut.cutWidth, h: cut.cutLength, rotated: true },
  ].sort((a, b) => a.h - b.h || b.w - a.w);
}

function makePlate(index, cutAxis = "longitudinal") {
  return { index, cutAxis, strips: [], pieces: [], usedArea: 0 };
}

function findPlacement(plate, candidates, material, kerf) {
  for (const strip of plate.strips) {
    for (const candidate of candidates) {
      const x = strip.usedLength ? strip.usedLength + kerf : 0;
      if (
        candidate.h <= strip.height &&
        x + candidate.w <= material.plateLength
      ) {
        return { strip, x, y: strip.y, ...candidate };
      }
    }
  }

  const y = plate.strips.length
    ? plate.strips.at(-1).y + plate.strips.at(-1).height + kerf
    : 0;
  for (const candidate of candidates) {
    if (
      candidate.w <= material.plateLength &&
      y + candidate.h <= material.plateWidth
    ) {
      const strip = {
        y,
        height: candidate.h,
        usedLength: 0,
        pieces: [],
      };
      plate.strips.push(strip);
      return { strip, x: 0, y, ...candidate };
    }
  }
  return null;
}

function packLayout(material, expanded, settings, cutAxis) {
  const warnings = [];
  const plates = [];
  const virtualMaterial =
    cutAxis === "transversal"
      ? {
          ...material,
          plateLength: material.plateWidth,
          plateWidth: material.plateLength,
        }
      : material;
  for (const piece of expanded) {
    const candidates = orientations(piece, piece).map((candidate) =>
      cutAxis === "transversal"
        ? {
            w: candidate.h,
            h: candidate.w,
            rotated: candidate.rotated,
          }
        : candidate,
    );
    let placement = null;
    let targetPlate = null;
    for (const plate of plates) {
      placement = findPlacement(
        plate,
        candidates,
        virtualMaterial,
        settings.kerf,
      );
      if (placement) {
        targetPlate = plate;
        break;
      }
    }
    if (!placement) {
      targetPlate = makePlate(plates.length + 1, cutAxis);
      placement = findPlacement(
        targetPlate,
        candidates,
        virtualMaterial,
        settings.kerf,
      );
      if (placement) plates.push(targetPlate);
    }
    if (!placement || !targetPlate) {
      warnings.push(
        `${piece.code || piece.name}: la pieza no cabe en la placa seleccionada.`,
      );
      continue;
    }
    const actualPlacement =
      cutAxis === "transversal"
        ? {
            x: placement.y,
            y: placement.x,
            w: placement.h,
            h: placement.w,
          }
        : {
            x: placement.x,
            y: placement.y,
            w: placement.w,
            h: placement.h,
          };
    const placed = {
      ...piece,
      plateIndex: targetPlate.index,
      x: actualPlacement.x,
      y: actualPlacement.y,
      drawWidth: actualPlacement.w,
      drawHeight: actualPlacement.h,
      rotated: placement.rotated,
      stripIndex: targetPlate.strips.indexOf(placement.strip),
    };
    placement.strip.pieces.push(placed);
    placement.strip.usedLength = placement.x + placement.w;
    targetPlate.pieces.push(placed);
    targetPlate.usedArea += actualPlacement.w * actualPlacement.h;
  }
  return { plates, warnings };
}

export function calculatePlateLeftovers(plate, material, kerf = 0) {
  if (!plate || !material) return [];
  const gap = Math.max(0, Number(kerf) || 0);
  const leftovers = [];
  const add = (x, y, width, height) => {
    const normalized = {
      x: Math.max(0, Number(x) || 0),
      y: Math.max(0, Number(y) || 0),
      width: Math.max(0, Number(width) || 0),
      height: Math.max(0, Number(height) || 0),
    };
    if (
      normalized.width < 50 ||
      normalized.height < 50 ||
      normalized.width * normalized.height < 10_000
    ) {
      return;
    }
    leftovers.push(normalized);
  };

  if (plate.cutAxis === "transversal") {
    for (const strip of plate.strips || []) {
      const stripPieces = plate.pieces.filter(
        (piece) => piece.stripIndex === plate.strips.indexOf(strip),
      );
      const usedHeight = stripPieces.reduce(
        (maximum, piece) => Math.max(maximum, piece.y + piece.drawHeight),
        0,
      );
      const startY = Math.min(material.plateWidth, usedHeight + gap);
      add(
        strip.y,
        startY,
        strip.height,
        material.plateWidth - startY,
      );
    }
    const usedWidth = (plate.strips || []).reduce(
      (maximum, strip) => Math.max(maximum, strip.y + strip.height),
      0,
    );
    const startX = Math.min(material.plateLength, usedWidth + gap);
    add(startX, 0, material.plateLength - startX, material.plateWidth);
  } else {
    for (const strip of plate.strips || []) {
      const stripPieces = plate.pieces.filter(
        (piece) => piece.stripIndex === plate.strips.indexOf(strip),
      );
      const usedWidth = stripPieces.reduce(
        (maximum, piece) => Math.max(maximum, piece.x + piece.drawWidth),
        0,
      );
      const startX = Math.min(material.plateLength, usedWidth + gap);
      add(
        startX,
        strip.y,
        material.plateLength - startX,
        strip.height,
      );
    }
    const usedHeight = (plate.strips || []).reduce(
      (maximum, strip) => Math.max(maximum, strip.y + strip.height),
      0,
    );
    const startY = Math.min(material.plateWidth, usedHeight + gap);
    add(0, startY, material.plateLength, material.plateWidth - startY);
  }

  return leftovers
    .sort((a, b) => b.width * b.height - a.width * a.height)
    .map((leftover, index) => ({
      ...leftover,
      code: `RET-${String(plate.index || 1).padStart(2, "0")}-${String(
        index + 1,
      ).padStart(2, "0")}`,
    }));
}

export function optimize(material, pieces, edgeBands, settings = {}) {
  const normalizedSettings = {
    kerf: Math.max(0, Number(settings.kerf) || 0),
    cutRatePerBoard: Math.max(
      0,
      Number(
        settings.cutRatePerBoard ??
          settings.cutRate ??
          cutRateForMaterial(material, settings),
      ) || 0,
    ),
    optimizationMode:
      settings.optimizationMode === "free" ? "free" : "longitudinal",
    boardDiscount: Math.min(100, Math.max(0, Number(settings.boardDiscount) || 0)),
    edgeDiscount: Math.min(100, Math.max(0, Number(settings.edgeDiscount) || 0)),
    servicesDiscount: Math.min(
      100,
      Math.max(0, Number(settings.servicesDiscount) || 0),
    ),
  };
  const expanded = pieces
    .flatMap((piece) =>
      Array.from(
        { length: Math.max(1, Number(piece.quantity) || 1) },
        (_, index) => ({
          ...piece,
          instanceId: `${piece.id}-${index + 1}`,
          ...cutDimensions(piece, edgeBands),
        }),
      ),
    )
    .sort(
      (a, b) =>
        Math.max(b.cutLength, b.cutWidth) - Math.max(a.cutLength, a.cutWidth),
    );

  const layouts = [
    packLayout(material, expanded, normalizedSettings, "longitudinal"),
  ];
  if (normalizedSettings.optimizationMode === "free") {
    layouts.push(
      packLayout(material, expanded, normalizedSettings, "transversal"),
    );
  }
  const cutCountFor = (layout) =>
    layout.plates.reduce(
      (total, plate) => total + plate.strips.length + plate.pieces.length,
      0,
    );
  layouts.sort(
    (a, b) =>
      a.warnings.length - b.warnings.length ||
      a.plates.length - b.plates.length ||
      cutCountFor(a) - cutCountFor(b),
  );
  const { plates, warnings } = layouts[0];
  const plateArea = material.plateLength * material.plateWidth;
  for (const plate of plates) {
    plate.utilization = plateArea ? (plate.usedArea / plateArea) * 100 : 0;
  }

  const metersByEdge = {};
  let edgeMeters = 0;
  for (const piece of pieces) {
    for (const side of sides) {
      const edgeId = piece.edges?.[side];
      if (!edgeId) continue;
      const meters =
        ((side === "top" || side === "bottom" ? piece.length : piece.width) *
          piece.quantity) /
        1000;
      edgeMeters += meters;
      metersByEdge[edgeId] = (metersByEdge[edgeId] ?? 0) + meters;
    }
  }

  const boardSubtotal = plates.length * material.netPrice;
  const edgeSubtotal = Object.entries(metersByEdge).reduce((total, [id, meters]) => {
    const price = edgeBands.find((item) => item.id === id)?.price ?? 0;
    return total + meters * price;
  }, 0);
  const cutCount = plates.reduce(
    (total, plate) => total + plate.strips.length + plate.pieces.length,
    0,
  );
  const cuttingSubtotal = plates.length * normalizedSettings.cutRatePerBoard;
  const bandingSubtotal = Object.entries(metersByEdge).reduce(
    (total, [id, meters]) => {
      const rate = edgeBands.find((item) => item.id === id)?.serviceRate ?? 0;
      return total + meters * rate;
    },
    0,
  );
  const servicesSubtotal = cuttingSubtotal + bandingSubtotal;
  const boardDiscountAmount =
    boardSubtotal * (normalizedSettings.boardDiscount / 100);
  const edgeDiscountAmount =
    edgeSubtotal * (normalizedSettings.edgeDiscount / 100);
  const servicesDiscountAmount =
    servicesSubtotal * (normalizedSettings.servicesDiscount / 100);
  const discountTotal =
    boardDiscountAmount + edgeDiscountAmount + servicesDiscountAmount;
  const net =
    boardSubtotal + edgeSubtotal + servicesSubtotal - discountTotal;

  return {
    plates,
    warnings,
    summary: {
      boardCount: plates.length,
      cutCount,
      edgeMeters,
      boardSubtotal,
      edgeSubtotal,
      cuttingSubtotal,
      bandingSubtotal,
      servicesSubtotal,
      boardDiscount: normalizedSettings.boardDiscount,
      edgeDiscount: normalizedSettings.edgeDiscount,
      servicesDiscount: normalizedSettings.servicesDiscount,
      boardDiscountAmount,
      edgeDiscountAmount,
      servicesDiscountAmount,
      discountTotal,
      net,
      vat: net * 0.19,
      total: net * 1.19,
      waste:
        plates.length > 0
          ? 100 -
            (plates.reduce((sum, plate) => sum + plate.usedArea, 0) /
              (plates.length * plateArea)) *
              100
          : 0,
      metersByEdge,
    },
  };
}

export function optimizeProject(
  projectMaterials,
  pieces,
  edgeBands,
  settings = {},
) {
  const activeMaterials = projectMaterials.filter(Boolean);
  const fallbackMaterialId = activeMaterials[0]?.id || "";
  const materialResults = activeMaterials
    .map((material) => {
      const materialPieces = pieces
        .filter(
          (piece) =>
            (piece.materialId || fallbackMaterialId) === material.id,
        )
        .map((piece) => ({ ...piece, materialId: material.id }));
      if (!materialPieces.length) return null;
      return {
        material,
        result: optimize(material, materialPieces, edgeBands, {
          ...settings,
          cutRatePerBoard: cutRateForMaterial(material, settings),
        }),
      };
    })
    .filter(Boolean);

  let globalPlateIndex = 0;
  const plates = materialResults.flatMap(({ material, result }) =>
    result.plates.map((plate) => {
      const mapped = {
        ...plate,
        index: (globalPlateIndex += 1),
        materialPlateIndex: plate.index,
        materialId: material.id,
        material,
      };
      mapped.leftovers = calculatePlateLeftovers(
        mapped,
        material,
        settings.kerf,
      );
      return mapped;
    }),
  );
  const warnings = materialResults.flatMap(({ material, result }) =>
    result.warnings.map((warning) => `${material.sku}: ${warning}`),
  );
  const numericFields = [
    "boardCount",
    "cutCount",
    "edgeMeters",
    "boardSubtotal",
    "edgeSubtotal",
    "cuttingSubtotal",
    "bandingSubtotal",
    "servicesSubtotal",
    "boardDiscountAmount",
    "edgeDiscountAmount",
    "servicesDiscountAmount",
    "discountTotal",
    "net",
    "vat",
    "total",
  ];
  const summary = Object.fromEntries(
    numericFields.map((field) => [
      field,
      materialResults.reduce(
        (sum, item) => sum + Number(item.result.summary[field] || 0),
        0,
      ),
    ]),
  );
  const totalBoardArea = materialResults.reduce(
    (sum, { material, result }) =>
      sum +
      result.plates.length * material.plateLength * material.plateWidth,
    0,
  );
  const totalUsedArea = materialResults.reduce(
    (sum, { result }) =>
      sum +
      result.plates.reduce(
        (plateSum, plate) => plateSum + plate.usedArea,
        0,
      ),
    0,
  );
  summary.waste = totalBoardArea
    ? 100 - (totalUsedArea / totalBoardArea) * 100
    : 0;
  summary.boardDiscount = Math.min(
    100,
    Math.max(0, Number(settings.boardDiscount) || 0),
  );
  summary.edgeDiscount = Math.min(
    100,
    Math.max(0, Number(settings.edgeDiscount) || 0),
  );
  summary.servicesDiscount = Math.min(
    100,
    Math.max(0, Number(settings.servicesDiscount) || 0),
  );
  summary.metersByEdge = materialResults.reduce(
    (totals, { result }) => {
      Object.entries(result.summary.metersByEdge || {}).forEach(
        ([id, meters]) => {
          totals[id] = (totals[id] || 0) + meters;
        },
      );
      return totals;
    },
    {},
  );

  return {
    plates,
    warnings,
    summary,
    materialSummaries: materialResults.map(({ material, result }) => ({
      materialId: material.id,
      sku: material.sku,
      name: material.name,
      brand: material.brand,
      boardCount: result.summary.boardCount,
      boardSubtotal: result.summary.boardSubtotal,
      cuttingSubtotal: result.summary.cuttingSubtotal,
      cutRatePerBoard:
        result.summary.boardCount > 0
          ? result.summary.cuttingSubtotal / result.summary.boardCount
          : 0,
      utilization: 100 - result.summary.waste,
    })),
  };
}

export function summarizePlateLeftovers(plate) {
  return (plate?.leftovers || []).map((leftover) => ({
    code: leftover.code,
    width: Number(leftover.width) || 0,
    height: Number(leftover.height) || 0,
    area: ((Number(leftover.width) || 0) * (Number(leftover.height) || 0)) /
      1_000_000,
  }));
}

export function summarizePlatePieces(plate) {
  const grouped = new Map();
  for (const piece of plate?.pieces || []) {
    const key = [
      piece.id || piece.code || piece.instanceId,
      piece.cutLength,
      piece.cutWidth,
      piece.grain,
    ].join("|");
    const current = grouped.get(key);
    if (current) {
      current.quantity += 1;
      continue;
    }
    grouped.set(key, {
      id: piece.id || "",
      code: piece.code || "S/C",
      name: piece.name || "",
      materialId: plate.materialId || piece.materialId || "",
      finishedLength: Number(piece.length) || 0,
      finishedWidth: Number(piece.width) || 0,
      cutLength: Number(piece.cutLength) || 0,
      cutWidth: Number(piece.cutWidth) || 0,
      grain: piece.grain || "sin-veta",
      quantity: 1,
    });
  }
  return [...grouped.values()].sort(
    (a, b) =>
      String(a.code).localeCompare(String(b.code), "es", { numeric: true }) ||
      a.cutLength - b.cutLength ||
      a.cutWidth - b.cutWidth,
  );
}

export function summarizeOptimizedPieces(plates, pieces, edgeBands) {
  const optimizedByPiece = new Map();
  for (const plate of plates || []) {
    const plateLabel = `${plate.material?.sku || plate.materialId || "Tablero"} · Placa ${
      plate.materialPlateIndex || plate.index
    }`;
    for (const placed of plate.pieces || []) {
      const key = placed.id || placed.code || placed.instanceId;
      const current = optimizedByPiece.get(key) || {
        quantity: 0,
        plates: new Set(),
      };
      current.quantity += 1;
      current.plates.add(plateLabel);
      optimizedByPiece.set(key, current);
    }
  }

  return (pieces || []).map((piece) => {
    const optimized = optimizedByPiece.get(piece.id || piece.code) || {
      quantity: 0,
      plates: new Set(),
    };
    const cut = cutDimensions(piece, edgeBands || []);
    return {
      id: piece.id || "",
      code: piece.code || "S/C",
      name: piece.name || "",
      materialId: piece.materialId || "",
      finishedLength: Number(piece.length) || 0,
      finishedWidth: Number(piece.width) || 0,
      cutLength: cut.cutLength,
      cutWidth: cut.cutWidth,
      grain: piece.grain || "sin-veta",
      requestedQuantity: Math.max(1, Number(piece.quantity) || 1),
      optimizedQuantity: optimized.quantity,
      plates: [...optimized.plates],
    };
  });
}

function fittedText(ctx, value, maxWidth) {
  const text = String(value || "");
  if (ctx.measureText(text).width <= maxWidth) return text;
  let shortened = text;
  while (
    shortened.length > 1 &&
    ctx.measureText(`${shortened}…`).width > maxWidth
  ) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}…`;
}

function wrappedTextLines(ctx, value, maxWidth) {
  const words = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    lines.push(line);
    if (ctx.measureText(word).width <= maxWidth) {
      line = word;
      continue;
    }
    let fragment = "";
    for (const character of word) {
      if (fragment && ctx.measureText(`${fragment}${character}`).width > maxWidth) {
        lines.push(fragment);
        fragment = character;
      } else {
        fragment += character;
      }
    }
    line = fragment;
  }
  if (line) lines.push(line);
  return lines;
}

const edgePalette = [
  "#005A8D",
  "#B93815",
  "#146C43",
  "#6A3D9A",
  "#7A5700",
  "#006B73",
  "#9A1B50",
  "#394B59",
];

const edgePatterns = [
  [],
  [16, 6],
  [3, 5],
  [14, 4, 3, 4],
  [8, 4],
  [20, 5, 4, 5],
  [2, 4, 11, 4],
  [9, 3, 2, 3, 2, 3],
];

function edgeVisualMap(edgeIds) {
  return new Map(
    edgeIds.map((id, index) => [
      id,
      {
        code: `T${index + 1}`,
        color: edgePalette[index % edgePalette.length],
        dash: edgePatterns[index % edgePatterns.length],
      },
    ]),
  );
}

function drawEdgeLine(ctx, edge, visual, x1, y1, x2, y2) {
  const thickness = Number(edge.thickness) || 0.4;
  ctx.strokeStyle = visual?.color || "#101820";
  ctx.lineWidth =
    thickness >= 2 ? 10 : thickness >= 1.5 ? 8 : thickness >= 1 ? 6 : 4.5;
  ctx.setLineDash(visual?.dash || []);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  if (thickness >= 2) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawEdgeCode(ctx, visual, side, x, y, width, height) {
  if (!visual || width < 48 || height < 44) return;
  const positions = {
    top: [x + 22, y + 13],
    right: [x + width - 14, y + 23],
    bottom: [x + width - 22, y + height - 13],
    left: [x + 14, y + height - 23],
  };
  const [cx, cy] = positions[side];
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(cx - 15, cy - 10, 30, 20);
  ctx.fillStyle = visual.color;
  ctx.fillRect(cx - 13, cy - 8, 26, 16);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 10px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(visual.code, cx, cy + 0.5);
  ctx.textBaseline = "alphabetic";
}

function drawCutTag(ctx, text, x, y, maxWidth = 160) {
  ctx.font = "700 8px Arial";
  const label = fittedText(ctx, text, maxWidth - 12);
  const tagWidth = Math.min(maxWidth, ctx.measureText(label).width + 12);
  ctx.fillStyle = "rgba(255,255,255,.94)";
  ctx.fillRect(x, y - 11, tagWidth, 15);
  ctx.fillStyle = "#101820";
  ctx.fillText(label, x + 6, y);
}

function drawMeasureLabel(ctx, text, x, y, maxWidth, rotation = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  const label = fittedText(ctx, text, maxWidth);
  const labelWidth = Math.min(maxWidth, ctx.measureText(label).width);
  const boxWidth = labelWidth + 8;
  ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.fillRect(-boxWidth / 2, -11, boxWidth, 18);
  ctx.fillStyle = "#101820";
  ctx.textAlign = "center";
  ctx.fillText(label, 0, 3);
  ctx.restore();
}

function spacedMarks(values, scale, minimumPixels = 28) {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  return sorted.reduce((marks, value, index) => {
    if (!marks.length) return [value];
    if ((value - marks.at(-1)) * scale >= minimumPixels) {
      marks.push(value);
    } else if (index === sorted.length - 1) {
      marks[marks.length - 1] = value;
    }
    return marks;
  }, []);
}

export function plateProductionMetrics(plate, material, edgeBands = []) {
  let cutMillimeters = 0;
  for (const strip of plate.strips || []) {
    const fullCutPosition = strip.y + strip.height;
    if (plate.cutAxis === "transversal") {
      if (fullCutPosition < material.plateLength - 1) {
        cutMillimeters += material.plateWidth;
      }
      for (const piece of strip.pieces || []) {
        if (piece.y + piece.drawHeight < material.plateWidth - 1) {
          cutMillimeters += strip.height;
        }
      }
    } else {
      if (fullCutPosition < material.plateWidth - 1) {
        cutMillimeters += material.plateLength;
      }
      for (const piece of strip.pieces || []) {
        if (piece.x + piece.drawWidth < material.plateLength - 1) {
          cutMillimeters += strip.height;
        }
      }
    }
  }

  const metersByEdge = {};
  let edgeMeters = 0;
  for (const piece of plate.pieces || []) {
    for (const side of sides) {
      const edgeId = piece.edges?.[side];
      if (!edgeId || !edgeBands.some((edge) => edge.id === edgeId)) continue;
      const millimeters =
        side === "top" || side === "bottom"
          ? Number(piece.length) || 0
          : Number(piece.width) || 0;
      const meters = millimeters / 1000;
      edgeMeters += meters;
      metersByEdge[edgeId] = (metersByEdge[edgeId] || 0) + meters;
    }
  }

  return {
    cutMeters: cutMillimeters / 1000,
    edgeMeters,
    metersByEdge,
  };
}

export function drawCutPlan(
  canvas,
  plate,
  material,
  edgeBands,
  logoImage,
  context = {},
) {
  const ctx = canvas.getContext("2d");
  const usedEdgeIds = [
    ...new Set(
      plate.pieces
        .flatMap((piece) => Object.values(piece.edges ?? {}))
        .filter(Boolean),
    ),
  ];
  const platePieceRows = summarizePlatePieces(plate);
  const plateLeftoverRows = summarizePlateLeftovers(plate).map((leftover) => ({
    code: leftover.code,
    name: "Retazo reutilizable",
    cutLength: leftover.width,
    cutWidth: leftover.height,
    quantity: 1,
    leftover: true,
  }));
  const workflowRows = [...platePieceRows, ...plateLeftoverRows];
  const width = 1400;
  const edgeLegendRowHeight = 104;
  const workflowRowHeight = 26;
  const estimatedListTop =
    188 +
    Math.max(
      110,
      94 + Math.max(1, usedEdgeIds.length) * edgeLegendRowHeight,
    );
  const height = Math.max(
    900,
    estimatedListTop + 76 + workflowRows.length * workflowRowHeight + 190,
  );
  const margin = { left: 115, top: 188, right: 350, bottom: 82 };
  canvas.width = width;
  canvas.height = height;
  const scale = Math.min(
    (width - margin.left - margin.right) / material.plateLength,
    (height - margin.top - margin.bottom) / material.plateWidth,
  );
  const plateW = material.plateLength * scale;
  const plateH = material.plateWidth * scale;
  const ox = margin.left;
  const oy = margin.top;
  const edgeVisuals = edgeVisualMap(usedEdgeIds);
  const productionMetrics = plateProductionMetrics(
    plate,
    material,
    edgeBands,
  );

  ctx.fillStyle = "#f6f5f2";
  ctx.fillRect(0, 0, width, height);
  if (logoImage?.complete && logoImage.naturalWidth) {
    ctx.drawImage(logoImage, 38, 24, 190, 68);
  } else {
    ctx.fillStyle = "#101820";
    ctx.font = "700 26px Arial";
    ctx.fillText("CASA DISEÑO", 38, 55);
  }
  const project = context.project || {};
  const headerX = 260;
  const headerWidth = 780;
  ctx.fillStyle = "#101820";
  ctx.font = "700 22px Arial";
  ctx.fillText("PLANO DE CORTE", headerX, 42);
  ctx.font = "700 13px Arial";
  ctx.fillText(
    fittedText(
      ctx,
      `PROYECTO: ${project.projectName || "Sin nombre"} · CLIENTE: ${
        project.clientName || "Sin identificar"
      }`,
      headerWidth,
    ),
    headerX,
    66,
  );
  ctx.font = "12px Arial";
  ctx.fillStyle = "#354352";
  ctx.fillText(
    fittedText(
      ctx,
      `COTIZACIÓN: ${context.projectId || "S/I"} · ESTADO: ${
        context.statusLabel || project.status || "Cotización"
      }${project.rut ? ` · RUT: ${project.rut}` : ""}`,
      headerWidth,
    ),
    headerX,
    88,
  );
  ctx.fillText(
    fittedText(
      ctx,
      `MATERIAL: ${material.brand} ${material.name} (${material.sku}) · ${
        material.plateLength
      } × ${material.plateWidth} × ${material.thickness} mm`,
      headerWidth,
    ),
    headerX,
    109,
  );
  ctx.font = "10.5px Arial";
  ctx.fillText(
    fittedText(
      ctx,
      `PLACA ${plate.materialPlateIndex || plate.index} · PRIMER CORTE: ${
        plate.cutAxis === "transversal" ? "TRANSVERSAL" : "LONGITUDINAL"
      } · GENERADO: ${context.generatedAt || new Date().toLocaleString("es-CL")}${
        context.createdBy ? ` · RESPONSABLE: ${context.createdBy}` : ""
      }`,
      headerWidth,
    ),
    headerX,
    130,
  );
  const metricLabelX = 1070;
  const metricValueX = width - 42;
  ctx.fillStyle = "#101820";
  ctx.font = "700 12px Arial";
  ctx.textAlign = "left";
  ctx.fillText("TOTAL ML DE CORTE", metricLabelX, 64);
  ctx.fillText("TOTAL ML DE ENCHAPE", metricLabelX, 88);
  ctx.textAlign = "right";
  ctx.fillText(
    productionMetrics.cutMeters.toLocaleString("es-CL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    metricValueX,
    64,
  );
  ctx.fillText(
    productionMetrics.edgeMeters.toLocaleString("es-CL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    metricValueX,
    88,
  );
  ctx.textAlign = "left";
  ctx.strokeStyle = "#a9b0b7";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(38, 153);
  ctx.lineTo(width - 38, 153);
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#101820";
  ctx.lineWidth = 3;
  ctx.fillRect(ox, oy, plateW, plateH);
  ctx.strokeRect(ox, oy, plateW, plateH);

  (plate.leftovers || []).forEach((leftover) => {
    const x = ox + leftover.x * scale;
    const y = oy + leftover.y * scale;
    const w = leftover.width * scale;
    const h = leftover.height * scale;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,.82)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#7a838b";
    ctx.lineWidth = 1.4;
    ctx.setLineDash([8, 5]);
    ctx.strokeRect(x, y, w, h);
    if (w > 70 && h > 34) {
      ctx.fillStyle = "#4b555e";
      ctx.textAlign = "center";
      ctx.font = "700 10px Arial";
      ctx.fillText(
        fittedText(
          ctx,
          `${leftover.code} · ${Math.round(leftover.width)}×${Math.round(
            leftover.height,
          )}`,
          w - 12,
        ),
        x + w / 2,
        y + h / 2,
      );
    }
    ctx.restore();
  });

  plate.pieces.forEach((piece, index) => {
    const x = ox + piece.x * scale;
    const y = oy + piece.y * scale;
    const w = piece.drawWidth * scale;
    const h = piece.drawHeight * scale;
    ctx.fillStyle = index % 2 ? "#e7eaec" : "#d8dde0";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#59636d";
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeRect(x, y, w, h);

    const originalEdges = piece.edges ?? {};
    const edges = piece.rotated
      ? {
          top: originalEdges.left,
          right: originalEdges.top,
          bottom: originalEdges.right,
          left: originalEdges.bottom,
        }
      : originalEdges;
    const edgeInset = 6;
    const edgeLines = [
      ["top", x, y + edgeInset, x + w, y + edgeInset],
      [
        "right",
        x + w - edgeInset,
        y,
        x + w - edgeInset,
        y + h,
      ],
      [
        "bottom",
        x,
        y + h - edgeInset,
        x + w,
        y + h - edgeInset,
      ],
      ["left", x + edgeInset, y, x + edgeInset, y + h],
    ];
    for (const [side, x1, y1, x2, y2] of edgeLines) {
      const edge = edgeBands.find((item) => item.id === edges[side]);
      if (!edge) continue;
      const visual = edgeVisuals.get(edge.id);
      drawEdgeLine(ctx, edge, visual, x1, y1, x2, y2);
      drawEdgeCode(ctx, visual, side, x, y, w, h);
    }
    ctx.setLineDash([]);

    ctx.fillStyle = "#101820";
    ctx.textAlign = "center";
    ctx.font = `700 ${Math.max(9, Math.min(15, h / 5))}px Arial`;
    const pieceLabel = piece.name
      ? `${piece.code || "S/C"} · ${piece.name}`
      : piece.code || "S/C";
    ctx.fillText(
      fittedText(ctx, pieceLabel, Math.max(25, w - 28)),
      x + w / 2,
      y + h / 2,
    );

    if (w > 48 && h > 36) {
      const horizontalMeasure = Math.round(piece.drawWidth);
      const verticalMeasure = Math.round(piece.drawHeight);
      ctx.font = `700 ${w > 100 && h > 70 ? 12 : 10}px Arial`;
      const horizontalInset = Math.min(29, Math.max(18, h * 0.18));
      const verticalInset = Math.min(29, Math.max(18, w * 0.12));
      drawMeasureLabel(
        ctx,
        `${horizontalMeasure}`,
        x + w / 2,
        y + horizontalInset,
        Math.max(18, w - 58),
      );
      drawMeasureLabel(
        ctx,
        `${horizontalMeasure}`,
        x + w / 2,
        y + h - horizontalInset,
        Math.max(18, w - 58),
      );
      drawMeasureLabel(
        ctx,
        `${verticalMeasure}`,
        x + verticalInset,
        y + h / 2,
        Math.max(18, h - 58),
        -Math.PI / 2,
      );
      drawMeasureLabel(
        ctx,
        `${verticalMeasure}`,
        x + w - verticalInset,
        y + h / 2,
        Math.max(18, h - 58),
        Math.PI / 2,
      );
    }

    if (piece.grain !== "sin-veta" && w > 70 && h > 55) {
      const horizontal = piece.grain === "longitudinal" !== piece.rotated;
      ctx.strokeStyle = "#4a535c";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      if (horizontal) {
        ctx.moveTo(x + w * 0.3, y + h * 0.7);
        ctx.lineTo(x + w * 0.7, y + h * 0.7);
        ctx.lineTo(x + w * 0.63, y + h * 0.64);
      } else {
        ctx.moveTo(x + w * 0.7, y + h * 0.7);
        ctx.lineTo(x + w * 0.7, y + h * 0.3);
        ctx.lineTo(x + w * 0.64, y + h * 0.37);
      }
      ctx.stroke();
    }
  });

  ctx.textAlign = "left";
  ctx.font = "10px Arial";
  ctx.strokeStyle = "#101820";
  ctx.fillStyle = "#101820";
  ctx.lineWidth = 2.2;
  ctx.setLineDash([14, 6]);
  for (const strip of plate.strips) {
    if (plate.cutAxis === "transversal") {
      const cutX = ox + (strip.y + strip.height) * scale;
      if (cutX < ox + plateW - 1) {
        ctx.beginPath();
        ctx.moveTo(cutX, oy);
        ctx.lineTo(cutX, oy + plateH);
        ctx.stroke();
        ctx.save();
        ctx.translate(cutX + 11, oy + plateH - 12);
        ctx.rotate(-Math.PI / 2);
        drawCutTag(ctx, "CORTE TRANSVERSAL COMPLETO", 0, 0, 170);
        ctx.restore();
      }
      for (const piece of strip.pieces) {
        const cutY = oy + (piece.y + piece.drawHeight) * scale;
        if (cutY < oy + plateH - 1) {
          ctx.strokeStyle = "#6b747d";
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(ox + strip.y * scale, cutY);
          ctx.lineTo(ox + (strip.y + strip.height) * scale, cutY);
          ctx.stroke();
        }
      }
    } else {
      const cutY = oy + (strip.y + strip.height) * scale;
      if (cutY < oy + plateH - 1) {
        ctx.strokeStyle = "#101820";
        ctx.lineWidth = 2.2;
        ctx.setLineDash([14, 6]);
        ctx.beginPath();
        ctx.moveTo(ox, cutY);
        ctx.lineTo(ox + plateW, cutY);
        ctx.stroke();
        drawCutTag(
          ctx,
          "CORTE LONGITUDINAL COMPLETO",
          ox + plateW - 185,
          cutY - 3,
          180,
        );
      }
      for (const piece of strip.pieces) {
        const cutX = ox + (piece.x + piece.drawWidth) * scale;
        if (cutX < ox + plateW - 1) {
          ctx.strokeStyle = "#6b747d";
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(cutX, oy + strip.y * scale);
          ctx.lineTo(cutX, oy + (strip.y + strip.height) * scale);
          ctx.stroke();
        }
      }
    }
  }
  ctx.setLineDash([]);

  const xMarks = spacedMarks(
    [
      0,
      material.plateLength,
      ...plate.pieces.flatMap((piece) => [
        piece.x,
        piece.x + piece.drawWidth,
      ]),
    ],
    scale,
  );
  const yMarks = spacedMarks(
    [
      0,
      material.plateWidth,
      ...plate.pieces.flatMap((piece) => [
        piece.y,
        piece.y + piece.drawHeight,
      ]),
    ],
    scale,
  );
  ctx.fillStyle = "#303a44";
  ctx.strokeStyle = "#59636d";
  ctx.font = "10px Arial";
  ctx.textAlign = "center";
  xMarks.forEach((value, index) => {
    const x = ox + value * scale;
    const level = index % 2;
    const tickTop = oy - (level ? 35 : 20);
    ctx.beginPath();
    ctx.moveTo(x, oy - 5);
    ctx.lineTo(x, tickTop);
    ctx.stroke();
    ctx.fillText(`${Math.round(value)}`, x, tickTop - 5);
  });
  ctx.save();
  ctx.textAlign = "right";
  yMarks.forEach((value, index) => {
    const y = oy + value * scale;
    const level = index % 2;
    const tickLeft = ox - (level ? 42 : 21);
    ctx.beginPath();
    ctx.moveTo(ox - 5, y);
    ctx.lineTo(tickLeft, y);
    ctx.stroke();
    ctx.fillText(`${Math.round(value)}`, tickLeft - 5, y + 3);
  });
  ctx.restore();

  const legendX = ox + plateW + 28;
  ctx.textAlign = "left";
  ctx.fillStyle = "#101820";
  ctx.font = "700 14px Arial";
  ctx.fillText("LEYENDA TAPACANTOS", legendX, oy + 24);
  ctx.fillStyle = "#59636d";
  ctx.font = "10px Arial";
  ctx.fillText("Código + color + patrón + espesor", legendX, oy + 42);
  usedEdgeIds.forEach((id, index) => {
    const edge = edgeBands.find((item) => item.id === id);
    if (!edge) return;
    const visual = edgeVisuals.get(id);
    const y = oy + 72 + index * edgeLegendRowHeight;
    ctx.fillStyle = visual.color;
    ctx.fillRect(legendX, y - 10, 28, 20);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 10px Arial";
    ctx.textAlign = "center";
    ctx.fillText(visual.code, legendX + 14, y + 4);
    drawEdgeLine(ctx, edge, visual, legendX + 40, y, legendX + 100, y);
    ctx.fillStyle = "#101820";
    ctx.font = "700 10px Arial";
    ctx.textAlign = "right";
    ctx.fillText(
      `${Number(productionMetrics.metersByEdge[id] || 0).toLocaleString(
        "es-CL",
        { minimumFractionDigits: 2, maximumFractionDigits: 2 },
      )} ML`,
      width - 42,
      y + 4,
    );
    ctx.fillStyle = "#303a44";
    ctx.font = "8.5px Arial";
    ctx.textAlign = "left";
    const descriptorLines = wrappedTextLines(
      ctx,
      `${edge.sku} · ${edge.material || edge.group || ""} ${String(edge.thickness).replace(".", ",")} mm`,
      margin.right - 64,
    );
    descriptorLines.forEach((line, lineIndex) => {
      ctx.fillText(line, legendX, y + 25 + lineIndex * 12);
    });
    ctx.font = "700 8.5px Arial";
    wrappedTextLines(ctx, edge.name, margin.right - 64).forEach(
      (line, lineIndex) => {
        ctx.fillText(
          line,
          legendX,
          y + 31 + descriptorLines.length * 12 + lineIndex * 13,
        );
      },
    );
  });
  if (!usedEdgeIds.length) {
    ctx.fillStyle = "#6b747d";
    ctx.font = "11px Arial";
    ctx.fillText("Sin tapacantos asignados", legendX, oy + 52);
  }

  const listTop =
    oy +
    Math.max(
      110,
      94 + Math.max(1, usedEdgeIds.length) * edgeLegendRowHeight,
    );
  ctx.fillStyle = "#101820";
  ctx.font = "700 14px Arial";
  ctx.textAlign = "left";
  ctx.fillText("PIEZAS Y RETAZOS DE ESTA PLACA", legendX, listTop);
  ctx.fillStyle = "#59636d";
  ctx.font = "10px Arial";
  ctx.fillText(
    `${plate.pieces.length} pieza(s) · ${plateLeftoverRows.length} retazo(s) · ${workflowRows.length} línea(s)`,
    legendX,
    listTop + 17,
  );
  const listWidth = margin.right - 56;
  const listRight = legendX + listWidth;
  const measureX = listRight - 113;
  const quantityX = listRight - 74;
  const checkCenters = [listRight - 51, listRight - 31, listRight - 11];
  ctx.fillText(
    "Controles: C corte · E enchape · S supervisión/despacho",
    legendX,
    listTop + 30,
  );
  ctx.fillStyle = "#e1e4e6";
  ctx.fillRect(legendX, listTop + 38, listWidth, 20);
  ctx.fillStyle = "#303a44";
  ctx.font = "700 9px Arial";
  ctx.fillText("CÓDIGO / ELEMENTO", legendX + 5, listTop + 52);
  ctx.textAlign = "right";
  ctx.fillText("MEDIDA", measureX, listTop + 52);
  ctx.fillText("UD.", quantityX, listTop + 52);
  ctx.textAlign = "center";
  ["C", "E", "S"].forEach((label, index) => {
    ctx.fillText(label, checkCenters[index], listTop + 52);
  });
  ctx.textAlign = "left";
  workflowRows.forEach((row, index) => {
    const y = listTop + 76 + index * workflowRowHeight;
    if (index % 2) {
      ctx.fillStyle = "rgba(255,255,255,.58)";
      ctx.fillRect(legendX, y - 15, listWidth, workflowRowHeight - 1);
    }
    ctx.fillStyle = "#303a44";
    ctx.font = "700 8px Arial";
    ctx.textAlign = "left";
    ctx.fillText(row.code || "S/C", legendX + 5, y - 3);
    ctx.font = "7.5px Arial";
    ctx.fillText(
      fittedText(
        ctx,
        row.name || "",
        measureX - legendX - 40,
      ),
      legendX + 5,
      y + 8,
    );
    ctx.font = "8px Arial";
    ctx.textAlign = "right";
    ctx.fillText(
      `${Math.round(row.cutLength)}×${Math.round(row.cutWidth)}`,
      measureX,
      y + 2,
    );
    ctx.fillText(`${row.quantity}`, quantityX, y + 2);
    ctx.strokeStyle = "#101820";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([]);
    checkCenters.forEach((center) => {
      ctx.strokeRect(center - 5, y - 7, 10, 10);
    });
  });

  const staffTop =
    listTop + 76 + workflowRows.length * workflowRowHeight + 24;
  const staffRoles = ["CORTADOR", "ENCHAPADOR", "SUPERVISOR", "DESPACHADOR"];
  staffRoles.forEach((role, index) => {
    const y = staffTop + index * 36;
    ctx.fillStyle = "#101820";
    ctx.font = "700 11px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`NOMBRE ${role}`, legendX, y);
    ctx.strokeStyle = "#101820";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(legendX, y + 14);
    ctx.lineTo(Math.min(width - 42, legendX + listWidth - 70), y + 14);
    ctx.stroke();
  });

  ctx.fillStyle = "#58636d";
  ctx.font = "11px Arial";
  ctx.textAlign = "left";
  ctx.fillText(
    "Medidas interiores: parciales · Exteriores: acumuladas · T#: tapacanto por lado · RET: retazo reutilizable · C/E/S: controles de producción · Unidades en mm.",
    39,
    height - 28,
  );
}

export function clp(value) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value || 0);
}
