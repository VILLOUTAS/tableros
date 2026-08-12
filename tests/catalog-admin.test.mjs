import test from "node:test";
import assert from "node:assert/strict";

import { createApplication } from "../server.mjs";

async function request(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

test("el catálogo administrativo es exclusivo y conserva revisiones usadas por proyectos", async () => {
  const { app } = await createApplication({ useMemory: true });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const publicCatalog = await request(base, "/api/catalog");
    assert.equal(publicCatalog.response.status, 200);
    assert.equal(
      publicCatalog.body.materials.filter((item) => item.active !== false).length,
      147,
    );

    const setup = await request(base, "/api/auth/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: "Administración Catálogo",
        email: "catalogo-admin@prueba.local",
        password: "ClaveCatalogo123",
      }),
    });
    const adminCookie = setup.response.headers.get("set-cookie").split(";")[0];
    const adminHeaders = {
      "content-type": "application/json",
      cookie: adminCookie,
      "x-csrf-token": setup.body.csrfToken,
    };

    const client = await request(base, "/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: "Cliente Catálogo",
        email: "catalogo-cliente@prueba.local",
        phone: "+56911112222",
        projectAddress: "Calle de prueba 123",
        password: "ClaveCliente123",
      }),
    });
    const clientCookie = client.response.headers.get("set-cookie").split(";")[0];
    const forbidden = await request(base, "/api/admin/catalog", {
      headers: { cookie: clientCookie },
    });
    assert.equal(forbidden.response.status, 403);

    const created = await request(base, "/api/admin/catalog", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        productType: "board",
        product: {
          sku: "TEST-BOARD-1801",
          name: "Blanco de prueba",
          brand: "Marca de prueba",
          categoryName: "Melamina prueba 18 mm",
          plateLength: 2440,
          plateWidth: 1220,
          thickness: 18,
          netPrice: 40000,
          minPrice: 35000,
          purchasePrice: 30000,
          grainRequired: false,
        },
      }),
    });
    assert.equal(created.response.status, 201);
    const originalId = created.body.revision.id;
    assert.ok(
      created.body.catalog.materials.some(
        (item) => item.id === originalId && item.active,
      ),
    );

    const project = await request(base, "/api/projects", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        project: { clientName: "Cliente histórico", status: "cotizacion" },
        materialId: originalId,
        pieces: [
          {
            name: "Pieza histórica",
            materialId: originalId,
            length: 500,
            width: 300,
            quantity: 1,
            grain: "sin-veta",
          },
        ],
      }),
    });
    assert.equal(project.response.status, 201);

    const edited = await request(
      base,
      `/api/admin/catalog/board/${encodeURIComponent(originalId)}`,
      {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify({
          product: { netPrice: 45000 },
        }),
      },
    );
    assert.equal(edited.response.status, 200);
    assert.notEqual(edited.body.revision.id, originalId);
    const historical = edited.body.catalog.materials.find(
      (item) => item.id === originalId,
    );
    const current = edited.body.catalog.materials.find(
      (item) => item.id === edited.body.revision.id,
    );
    assert.equal(historical.active, false);
    assert.equal(historical.netPrice, 40000);
    assert.equal(current.active, true);
    assert.equal(current.netPrice, 45000);

    const savedAgain = await request(
      base,
      `/api/projects/${project.body.project.id}`,
      {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify(project.body.project),
      },
    );
    assert.equal(savedAgain.response.status, 200);
    assert.equal(savedAgain.body.project.materialId, originalId);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
