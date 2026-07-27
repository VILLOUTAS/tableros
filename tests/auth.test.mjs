import test from "node:test";
import assert from "node:assert/strict";

import {
  canEditProject,
  createApplication,
  projectVisibility,
} from "../server.mjs";

async function request(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

test("protege acceso, crea perfiles y permite guardar proyectos por perfil", async () => {
  const { app } = await createApplication({ useMemory: true });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const anonymous = await request(base, "/api/projects");
    assert.equal(anonymous.response.status, 401);

    const setupStatus = await request(base, "/api/auth/setup-status");
    assert.equal(setupStatus.body.needsSetup, true);

    const setup = await request(base, "/api/auth/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: "Administrador",
        email: "admin@prueba.local",
        password: "ClaveSegura123",
      }),
    });
    assert.equal(setup.response.status, 201);
    assert.equal(setup.body.user.role, "admin");
    const adminCookie = setup.response.headers.get("set-cookie").split(";")[0];
    const adminHeaders = {
      "content-type": "application/json",
      cookie: adminCookie,
      "x-csrf-token": setup.body.csrfToken,
    };

    const user = await request(base, "/api/users", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        fullName: "Equipo Producción",
        email: "produccion@prueba.local",
        password: "ClaveSegura456",
        role: "produccion",
      }),
    });
    assert.equal(user.response.status, 201);

    const oversized = await request(base, "/api/projects", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        project: {
          clientName: "Cliente con pieza inválida",
          status: "cotizacion",
        },
        materialId: "62-egger-1502-1",
        pieces: [
          {
            code: "P-001",
            name: "",
            length: 3000,
            width: 500,
            quantity: 1,
            grain: "longitudinal",
          },
        ],
      }),
    });
    assert.equal(oversized.response.status, 400);
    assert.match(oversized.body.error, /excede la plancha/);

    const project = await request(base, "/api/projects", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        project: {
          projectName: "",
          clientName: "Cliente obligatorio",
          rut: "",
          status: "venta",
        },
        materialId: "62-egger-1502-1",
        pieces: [
          {
            code: "P-001",
            name: "",
            length: 500,
            width: 500,
            quantity: 1,
            grain: "longitudinal",
          },
        ],
        settings: {},
      }),
    });
    assert.equal(project.response.status, 201);
    assert.equal(project.body.project.project.clientName, "Cliente obligatorio");
    assert.equal(project.body.project.pieces[0].name, "");

    const notifications = await request(base, "/api/notifications", {
      headers: { cookie: adminCookie },
    });
    assert.equal(notifications.response.status, 200);
    assert.equal(notifications.body.notifications.length, 1);
    assert.equal(notifications.body.unreadCount, 1);
    assert.match(
      notifications.body.notifications[0].message,
      /Cliente obligatorio/,
    );

    const readNotification = await request(
      base,
      `/api/notifications/${notifications.body.notifications[0].id}/read`,
      {
        method: "POST",
        headers: adminHeaders,
      },
    );
    assert.equal(readNotification.response.status, 200);
    assert.ok(readNotification.body.notification.readAt);

    const notificationsAfterRead = await request(base, "/api/notifications", {
      headers: { cookie: adminCookie },
    });
    assert.equal(notificationsAfterRead.body.unreadCount, 0);

    const login = await request(base, "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "produccion@prueba.local",
        password: "ClaveSegura456",
      }),
    });
    assert.equal(login.response.status, 200);
    const productionCookie = login.response.headers
      .get("set-cookie")
      .split(";")[0];
    const productionHeaders = {
      "content-type": "application/json",
      cookie: productionCookie,
      "x-csrf-token": login.body.csrfToken,
    };

    const visible = await request(base, "/api/projects", {
      headers: { cookie: productionCookie },
    });
    assert.equal(visible.body.projects.length, 1);

    const productionProject = await request(base, "/api/projects", {
      method: "POST",
      headers: productionHeaders,
      body: JSON.stringify({
        project: { clientName: "Proyecto de Producción", status: "cotizacion" },
        materialId: "62-egger-1502-1",
        materialIds: ["62-egger-1502-1", "62-egger-1501-2"],
        pieces: [
          {
            code: "P-001",
            name: "Frente",
            materialId: "62-egger-1502-1",
            length: 500,
            width: 400,
            quantity: 1,
            grain: "longitudinal",
          },
          {
            code: "P-002",
            name: "Costado",
            materialId: "62-egger-1501-2",
            length: 700,
            width: 500,
            quantity: 1,
            grain: "longitudinal",
          },
        ],
      }),
    });
    assert.equal(productionProject.response.status, 201);
    assert.deepEqual(productionProject.body.project.materialIds, [
      "62-egger-1502-1",
      "62-egger-1501-2",
    ]);
    assert.equal(
      productionProject.body.project.pieces[1].materialId,
      "62-egger-1501-2",
    );

    const visibleAfterSave = await request(base, "/api/projects", {
      headers: { cookie: productionCookie },
    });
    assert.equal(visibleAfterSave.body.projects.length, 2);

    const advanced = await request(
      base,
      `/api/projects/${project.body.project.id}`,
      {
        method: "PATCH",
        headers: productionHeaders,
        body: JSON.stringify({
          ...project.body.project,
          project: {
            ...project.body.project.project,
            status: "produccion",
          },
        }),
      },
    );
    assert.equal(advanced.response.status, 200);
    assert.equal(advanced.body.project.project.status, "produccion");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("las consultas por perfil solo envían parámetros cuando el SQL los usa", () => {
  assert.deepEqual(
    projectVisibility({ id: "produccion-1", role: "produccion" }).params,
    ["produccion-1"],
  );
  assert.deepEqual(
    projectVisibility({ id: "admin-1", role: "admin" }).params,
    [],
  );
  assert.deepEqual(
    projectVisibility({ id: "comercial-1", role: "comercial" }).params,
    ["comercial-1"],
  );
});

test("todos los perfiles pueden guardar los proyectos que les corresponden", () => {
  const ownQuote = {
    ownerId: "usuario-1",
    assignedTo: "comercial-1",
    project: { status: "cotizacion" },
  };
  assert.equal(
    canEditProject({ id: "admin-1", role: "admin" }, ownQuote),
    true,
  );
  assert.equal(
    canEditProject({ id: "comercial-1", role: "comercial" }, ownQuote),
    true,
  );
  assert.equal(
    canEditProject({ id: "usuario-1", role: "produccion" }, ownQuote),
    true,
  );
  assert.equal(
    canEditProject({ id: "usuario-1", role: "cliente" }, ownQuote),
    true,
  );
});
