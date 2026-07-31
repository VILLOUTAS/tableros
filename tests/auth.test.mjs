import test from "node:test";
import assert from "node:assert/strict";

import {
  canEditProject,
  canTransitionProjectStatus,
  createApplication,
  projectVisibility,
  quoteEmailRecipients,
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
    assert.equal(user.body.user.mustChangePassword, true);

    const bulkUsers = await request(base, "/api/users/bulk", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        users: [
          {
            sourceRow: 2,
            fullName: "Equipo Comercial",
            email: "comercial@prueba.local",
            password: "TemporalComercial123",
            role: "comercial",
            active: true,
          },
          {
            sourceRow: 3,
            fullName: "Cliente Masivo",
            email: "cliente@prueba.local",
            password: "TemporalCliente123",
            role: "cliente",
            clientName: "Empresa Cliente",
            active: false,
          },
          {
            sourceRow: 4,
            fullName: "Administrador repetido",
            email: "admin@prueba.local",
            password: "TemporalAdmin123",
            role: "admin",
            active: true,
          },
        ],
      }),
    });
    assert.equal(bulkUsers.response.status, 200);
    assert.equal(bulkUsers.body.created.length, 2);
    assert.equal(bulkUsers.body.errors.length, 1);
    assert.equal(bulkUsers.body.errors[0].row, 4);
    assert.match(bulkUsers.body.errors[0].error, /registrado/);
    assert.ok(
      bulkUsers.body.created.every((createdUser) => createdUser.mustChangePassword),
    );

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
          status: "facturacion",
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
    assert.equal(project.body.project.project.status, "facturacion");
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

    assert.equal(login.body.user.mustChangePassword, true);
    const blockedBeforePasswordChange = await request(base, "/api/projects", {
      headers: { cookie: productionCookie },
    });
    assert.equal(blockedBeforePasswordChange.response.status, 403);
    assert.equal(
      blockedBeforePasswordChange.body.code,
      "PASSWORD_CHANGE_REQUIRED",
    );

    const changedPassword = await request(base, "/api/auth/change-password", {
      method: "POST",
      headers: productionHeaders,
      body: JSON.stringify({ password: "NuevaClaveSegura789" }),
    });
    assert.equal(changedPassword.response.status, 200);
    assert.equal(changedPassword.body.user.mustChangePassword, false);

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
    const productionBilling = await request(
      base,
      `/api/projects/${productionProject.body.project.id}`,
      {
        method: "PATCH",
        headers: productionHeaders,
        body: JSON.stringify({
          ...productionProject.body.project,
          project: {
            ...productionProject.body.project.project,
            status: "facturacion",
          },
        }),
      },
    );
    assert.equal(productionBilling.response.status, 200);
    assert.equal(
      productionBilling.body.project.project.status,
      "facturacion",
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
        headers: adminHeaders,
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

    const visibleInProduction = await request(base, "/api/projects", {
      headers: { cookie: productionCookie },
    });
    assert.equal(visibleInProduction.body.projects.length, 2);
    const productionNotifications = await request(base, "/api/notifications", {
      headers: { cookie: productionCookie },
    });
    assert.equal(productionNotifications.response.status, 200);
    assert.equal(productionNotifications.body.notifications.length, 1);
    assert.equal(
      productionNotifications.body.notifications[0].type,
      "production_order",
    );

    const blockedProductionEdit = await request(
      base,
      `/api/projects/${project.body.project.id}`,
      {
        method: "PATCH",
        headers: productionHeaders,
        body: JSON.stringify(advanced.body.project),
      },
    );
    assert.equal(blockedProductionEdit.response.status, 200);

    const scheduled = await request(
      base,
      `/api/projects/${project.body.project.id}/schedule`,
      {
        method: "PATCH",
        headers: productionHeaders,
        body: JSON.stringify({
          executionDate: "2026-08-03",
          deliveryDate: "2026-08-05",
        }),
      },
    );
    assert.equal(scheduled.response.status, 200);
    assert.equal(scheduled.body.project.executionDate, "2026-08-03");
    assert.equal(scheduled.body.project.deliveryDate, "2026-08-05");

    const dispatched = await request(
      base,
      `/api/projects/${project.body.project.id}`,
      {
        method: "PATCH",
        headers: productionHeaders,
        body: JSON.stringify({
          ...blockedProductionEdit.body.project,
          project: {
            ...blockedProductionEdit.body.project.project,
            status: "despacho",
          },
        }),
      },
    );
    assert.equal(dispatched.response.status, 200);
    assert.equal(dispatched.body.project.project.status, "despacho");

    const blockedAdminEdit = await request(
      base,
      `/api/projects/${project.body.project.id}`,
      {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify(dispatched.body.project),
      },
    );
    assert.equal(blockedAdminEdit.response.status, 403);
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

test("notifica nuevas cotizaciones a contacto y evita destinatarios repetidos", () => {
  const recipients = quoteEmailRecipients(
    [
      { email: "ADMIN@PRUEBA.CL" },
      { email: "contacto@cdchile.cl" },
    ],
    "ventas@prueba.cl; contacto@cdchile.cl",
  );
  assert.deepEqual(new Set(recipients), new Set([
    "admin@prueba.cl",
    "contacto@cdchile.cl",
    "ventas@prueba.cl",
  ]));
  assert.equal(
    recipients.filter((email) => email === "contacto@cdchile.cl").length,
    1,
  );
});

test("respeta edición por rol y bloquea pedidos enviados a producción", () => {
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
    canEditProject(
      { id: "usuario-1", role: "produccion" },
      { ...ownQuote, project: { status: "facturacion" } },
    ),
    true,
  );
  assert.equal(
    canEditProject({ id: "usuario-1", role: "cliente" }, ownQuote),
    true,
  );
  assert.equal(
    canEditProject(
      { id: "comercial-1", role: "comercial" },
      { ...ownQuote, project: { status: "produccion" } },
    ),
    false,
  );
  assert.equal(
    canEditProject(
      { id: "admin-1", role: "admin" },
      { ...ownQuote, project: { status: "produccion" } },
    ),
    false,
  );
  assert.equal(
    canEditProject(
      { id: "produccion-2", role: "produccion" },
      { ...ownQuote, project: { status: "produccion" } },
    ),
    true,
  );
});

test("aplica el flujo de estados y reserva Despacho para Producción", () => {
  assert.equal(
    canTransitionProjectStatus(
      { role: "cliente" },
      "cotizacion",
      "facturacion",
    ),
    false,
  );
  assert.equal(
    canTransitionProjectStatus(
      { role: "comercial" },
      "cotizacion",
      "facturacion",
    ),
    true,
  );
  assert.equal(
    canTransitionProjectStatus(
      { role: "comercial" },
      "facturacion",
      "produccion",
    ),
    true,
  );
  assert.equal(
    canTransitionProjectStatus(
      { role: "admin" },
      "facturacion",
      "produccion",
    ),
    true,
  );
  assert.equal(
    canTransitionProjectStatus(
      { role: "produccion" },
      "produccion",
      "despacho",
    ),
    true,
  );
  assert.equal(
    canTransitionProjectStatus(
      { role: "admin" },
      "produccion",
      "despacho",
    ),
    false,
  );
});

test("permite autoregistro de clientes y exige sus datos obligatorios", async () => {
  const { app } = await createApplication({ useMemory: true });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const setup = await request(base, "/api/auth/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: "Administración",
        email: "admin@example.cl",
        password: "ClaveAdmin123",
      }),
    });
    assert.equal(setup.response.status, 201);
    const adminCookie = setup.response.headers.get("set-cookie").split(";")[0];
    const commercial = await request(base, "/api/users", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: adminCookie,
        "x-csrf-token": setup.body.csrfToken,
      },
      body: JSON.stringify({
        fullName: "Comercial Asignable",
        email: "comercial@example.cl",
        password: "TemporalComercial123",
        role: "comercial",
      }),
    });
    assert.equal(commercial.response.status, 201);

    const invalid = await request(base, "/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: "Cliente",
        email: "cliente@example.cl",
        password: "ClaveSegura123",
      }),
    });
    assert.equal(invalid.response.status, 400);

    const registered = await request(base, "/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: "Cliente Autoregistrado",
        email: "cliente@example.cl",
        phone: "+56 9 1234 5678",
        password: "ClaveSegura123",
        clientName: "Empresa opcional",
        location: "Santiago",
      }),
    });
    assert.equal(registered.response.status, 201);
    assert.equal(registered.body.user.role, "cliente");
    assert.equal(registered.body.user.phone, "+56 9 1234 5678");
    assert.equal(registered.body.user.clientName, "Empresa opcional");
    const clientCookie = registered.response.headers.get("set-cookie").split(";")[0];
    const clientHeaders = {
      "content-type": "application/json",
      cookie: clientCookie,
      "x-csrf-token": registered.body.csrfToken,
    };
    const commercials = await request(base, "/api/commercials", {
      headers: { cookie: clientCookie },
    });
    assert.equal(commercials.body.commercials.length, 1);
    assert.equal(
      commercials.body.commercials[0].id,
      commercial.body.user.id,
    );

    const quote = await request(base, "/api/projects", {
      method: "POST",
      headers: clientHeaders,
      body: JSON.stringify({
        assignedTo: commercial.body.user.id,
        project: {
          clientName: "Empresa opcional",
          status: "facturacion",
        },
        materialId: "62-egger-1502-1",
        pieces: [
          {
            id: "pieza-cliente",
            code: "",
            name: "",
            materialId: "62-egger-1502-1",
            length: 500,
            width: 400,
            quantity: 1,
            grain: "longitudinal",
            edges: {},
          },
        ],
      }),
    });
    assert.equal(quote.response.status, 201);
    assert.equal(quote.body.project.project.status, "cotizacion");
    assert.equal(quote.body.project.assignedTo, commercial.body.user.id);
    const ownProjects = await request(base, "/api/projects", {
      headers: { cookie: clientCookie },
    });
    assert.equal(ownProjects.body.projects.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
