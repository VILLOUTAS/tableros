import test from "node:test";
import assert from "node:assert/strict";

import {
  catalogMeta,
  categories,
  edgeBands,
  materials,
} from "../src/catalog.generated.js";

test("incluye el catálogo completo del Excel entregado", () => {
  assert.equal(catalogMeta.materials, 145);
  assert.equal(catalogMeta.edgeBands, 121);
  assert.equal(materials.length, 145);
  assert.equal(edgeBands.length, 121);
  assert.deepEqual(
    categories.map((category) => category.count),
    [38, 43, 61, 3],
  );
});

test("conserva precios administrativos y tarifas por espesor", () => {
  assert.ok(
    materials.every(
      (material) =>
        Number.isFinite(material.netPrice) &&
        Number.isFinite(material.minPrice) &&
        Number.isFinite(material.purchasePrice),
    ),
  );
  const rates = new Map(edgeBands.map((edge) => [edge.thickness, edge.serviceRate]));
  assert.equal(rates.get(0.4), 500);
  assert.equal(rates.get(1), 600);
  assert.equal(rates.get(1.5), 700);
  assert.equal(rates.get(2), 850);
});
