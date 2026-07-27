import test from "node:test";
import assert from "node:assert/strict";

import {
  cutDimensions,
  optimize,
  pieceFitsMaterial,
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
