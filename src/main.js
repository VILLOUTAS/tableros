import "./style.css";
import { jsPDF } from "jspdf";
import readXlsxFile from "read-excel-file/browser";

import {
  categories,
  edgeBands,
  grainLabels,
  materials,
  sides,
  statusLabels,
} from "./data.js";
import {
  assignPieceCodes,
  clp,
  cutDimensions,
  cutRateForMaterial,
  drawCutPlan,
  edgeImportLabel,
  formatRut,
  isBlankPieceImportRow,
  materialImportLabel,
  optimizeProject,
  pieceFitsMaterial,
  resolveCatalogReference,
  summarizeOptimizedPieces,
  summarizePlateLeftovers,
  summarizePlatePieces,
  validateRut,
} from "./logic.js";

const app = document.querySelector("#app");
const steps = [
  ["Proyecto", "Cliente y estado"],
  ["Material", "Categoría y producto"],
  ["Piezas", "Manual o Excel"],
  ["Tapacantos", "Configuración por lado"],
  ["Optimización", "Plano y subtotales"],
];

function emptyState() {
  return {
    view: "quote",
    step: 0,
    projectId: crypto.randomUUID(),
    project: {
      projectName: "",
      clientName: "",
      rut: "",
      status: "cotizacion",
    },
    assignedTo: "",
    categoryId: "",
    materialId: "",
    materialIds: [],
    productSearch: "",
    defaultGrain: "longitudinal",
    pieces: [],
    settings: {
      kerf: 2,
      melamineCutRate: 7500,
      specialCutRate: 10500,
      optimizationMode: "longitudinal",
      boardDiscount: 0,
      edgeDiscount: 0,
      servicesDiscount: 0,
    },
    importPreview: null,
    message: null,
  };
}

let state = emptyState();
let latestResult = null;
let projectsCache = [];
let usersCache = [];
let notificationsCache = [];
let commercialsCache = [];
let bulkUserPreview = null;
let imageImportResult = null;
const auth = {
  user: null,
  csrfToken: "",
  needsSetup: null,
  loading: true,
  error: "",
  mode: "login",
};

const safe = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const selectedMaterials = () => {
  const ids = state.materialIds?.length
    ? state.materialIds
    : state.materialId
      ? [state.materialId]
      : [];
  return ids
    .map((id) => materials.find((item) => item.id === id))
    .filter(Boolean);
};

const selectedMaterial = (id = state.materialId) =>
  materials.find((item) => item.id === id) || selectedMaterials()[0];

const materialImageUrl = (material) =>
  `/api/material-images/${encodeURIComponent(material?.sku || material?.id || "")}`;

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && typeof options.body !== "string") {
    headers["content-type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }
  if (auth.csrfToken && options.method && options.method !== "GET") {
    headers["x-csrf-token"] = auth.csrfToken;
  }
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers,
  });
  const payload =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || "No fue posible completar la operación.");
  return payload;
}

async function loadProjects() {
  const payload = await api("/api/projects");
  projectsCache = payload.projects || [];
}

async function loadUsers() {
  if (auth.user?.role !== "admin") return;
  const payload = await api("/api/users");
  usersCache = payload.users || [];
}

async function loadCommercials() {
  if (!auth.user) return;
  const payload = await api("/api/commercials");
  commercialsCache = payload.commercials || [];
}

async function loadNotifications() {
  if (!["admin", "comercial", "produccion"].includes(auth.user?.role)) return;
  const payload = await api("/api/notifications");
  notificationsCache = payload.notifications || [];
}

function unreadNotifications() {
  return notificationsCache.filter((notification) => !notification.readAt)
    .length;
}

function canCreateQuote() {
  return Boolean(auth.user);
}

function newQuoteState() {
  const fresh = emptyState();
  if (auth.user?.role === "cliente") {
    fresh.project.clientName =
      auth.user.clientName || auth.user.fullName || "";
    fresh.project.rut = auth.user.rut || "";
  }
  if (auth.user?.role === "comercial") {
    fresh.assignedTo = auth.user.id;
  }
  return fresh;
}

function canEditCurrent() {
  if (!auth.user) return false;
  if (auth.user.role === "produccion") {
    return (
      (!state.ownerId || state.ownerId === auth.user.id) &&
      state.project.status === "cotizacion"
    );
  }
  if (
    auth.user.role === "comercial" &&
    state.project.status === "produccion"
  ) {
    return false;
  }
  if (auth.user.role === "cliente" && state.project.status !== "cotizacion") {
    return false;
  }
  return true;
}

function notify(text, type = "success") {
  state.message = { text, type };
  render();
  window.setTimeout(() => {
    if (state.message?.text === text) {
      state.message = null;
      render();
    }
  }, 3200);
}

function validateCurrentStep() {
  if (state.step === 0) {
    if (!state.project.clientName.trim()) {
      notify("Completa el nombre del cliente.", "error");
      return false;
    }
    if (state.project.rut.trim() && !validateRut(state.project.rut)) {
      notify("Ingresa un RUT chileno válido.", "error");
      return false;
    }
    if (auth.user?.role === "cliente" && !state.assignedTo) {
      notify("Selecciona el comercial que atenderá tu cotización.", "error");
      return false;
    }
  }
  if (state.step === 1 && selectedMaterials().length === 0) {
    notify("Selecciona al menos un tablero para el proyecto.", "error");
    return false;
  }
  if (state.step === 2 && state.pieces.length === 0) {
    notify("Agrega al menos una pieza o importa una planilla Excel.", "error");
    return false;
  }
  return true;
}

function moveStep(delta) {
  if (delta > 0 && !validateCurrentStep()) return;
  state.step = Math.max(0, Math.min(4, state.step + delta));
  render();
}

async function saveProject(showMessage = true) {
  if (
    !state.project.clientName.trim() ||
    (state.project.rut.trim() && !validateRut(state.project.rut)) ||
    selectedMaterials().length === 0 ||
    state.pieces.length === 0
  ) {
    notify("Faltan datos obligatorios para guardar el proyecto.", "error");
    return false;
  }
  if (auth.user?.role === "cliente" && !state.assignedTo) {
    notify("Selecciona un comercial antes de guardar.", "error");
    return false;
  }
  const result = optimizeProject(
    selectedMaterials(),
    state.pieces,
    edgeBands,
    state.settings,
  );
  const record = {
    id: state.projectId,
    project: state.project,
    categoryId: state.categoryId,
    materialId: state.materialId,
    materialIds: state.materialIds,
    defaultGrain: state.defaultGrain,
    pieces: state.pieces,
    settings: state.settings,
    assignedTo: state.assignedTo || null,
    summary: result.summary,
  };
  try {
    const exists = projectsCache.some((item) => item.id === state.projectId);
    const payload = await api(
      exists ? `/api/projects/${state.projectId}` : "/api/projects",
      { method: exists ? "PATCH" : "POST", body: record },
    );
    state.projectId = payload.project.id;
    const index = projectsCache.findIndex((item) => item.id === state.projectId);
    if (index >= 0) projectsCache[index] = payload.project;
    else projectsCache.unshift(payload.project);
    if (!exists && ["admin", "comercial"].includes(auth.user?.role)) {
      await loadNotifications();
    }
    if (showMessage) notify("Proyecto guardado correctamente.");
    return true;
  } catch (error) {
    notify(error.message, "error");
    return false;
  }
}

function edgeOptions(selected = "") {
  const groups = [...new Set(edgeBands.map((item) => item.group))];
  return [
    `<option value="">Sin tapacanto</option>`,
    ...groups.map(
      (group) =>
        `<optgroup label="${group}">${edgeBands
          .filter((item) => item.group === group)
          .map(
            (edge) =>
              `<option value="${edge.id}" ${edge.id === selected ? "selected" : ""}>${edge.sku} · ${edge.name} · ${clp(edge.price)}/ml</option>`,
          )
          .join("")}</optgroup>`,
    ),
  ].join("");
}

function grainIcon(grain) {
  if (grain === "longitudinal") return "⟶";
  if (grain === "transversal") return "⟰";
  return "✣";
}

const roleLabels = {
  admin: "Administrador",
  comercial: "Comercial",
  produccion: "Producción",
  cliente: "Cliente",
};

function accessView() {
  const setup = auth.needsSetup;
  const registering = !setup && auth.mode === "register";
  return `
    <main class="access-page">
      <section class="access-brand">
        <img src="./logo-casa-diseno.png" alt="Casa Diseño Multiespacio" />
        <p>Cotizador, optimizador y gestión de proyectos</p>
      </section>
      <section class="card access-card">
        <p class="eyebrow">${
          setup
            ? "CONFIGURACIÓN INICIAL"
            : registering
              ? "AUTOREGISTRO DE CLIENTE"
              : "ACCESO SEGURO"
        }</p>
        <h1>${
          setup
            ? "Crear administrador"
            : registering
              ? "Crear mi cuenta"
              : "Iniciar sesión"
        }</h1>
        <p>${
          setup
            ? "Esta cuenta controlará usuarios, cotizaciones y producción."
            : registering
              ? "Regístrate para crear, guardar y consultar únicamente tus propias cotizaciones."
              : "Ingresa con tu cuenta o crea un acceso como cliente."
        }</p>
        <form id="${
          setup ? "setup-form" : registering ? "register-form" : "login-form"
        }" class="access-form">
          ${
            setup || registering
              ? `<label>Nombre completo <em>*</em><input name="fullName" required autocomplete="name" /></label>`
              : ""
          }
          <label>Correo <em>*</em><input name="email" type="email" required autocomplete="username" /></label>
          ${
            registering
              ? `<label>Teléfono <em>*</em><input name="phone" type="tel" minlength="7" required autocomplete="tel" /></label>
                <label>Empresa <small>Opcional</small><input name="clientName" autocomplete="organization" /></label>
                <label>RUT <small>Opcional</small><input name="rut" /></label>
                <label>Ubicación <small>Opcional</small><input name="location" autocomplete="address-level2" /></label>`
              : ""
          }
          <label>Clave <em>*</em><input name="password" type="password" minlength="10" required autocomplete="${
            setup || registering ? "new-password" : "current-password"
          }" /></label>
          <small>${
            setup || registering
              ? "Usa al menos 10 caracteres."
              : "La sesión se mantiene por 8 horas."
          }</small>
          ${auth.error ? `<div class="form-error">${safe(auth.error)}</div>` : ""}
          <button class="primary" type="submit">${
            setup
              ? "Crear cuenta y continuar"
              : registering
                ? "Registrarme y continuar"
                : "Ingresar"
          }</button>
          ${
            setup
              ? ""
              : `<button class="ghost" type="button" data-action="toggle-access">${
                  registering
                    ? "Ya tengo una cuenta"
                    : "Soy cliente nuevo: crear cuenta"
                }</button>`
          }
        </form>
      </section>
    </main>`;
}

function passwordChangeView() {
  return `
    <main class="access-page">
      <section class="access-brand">
        <img src="./logo-casa-diseno.png" alt="Casa Diseño Multiespacio" />
        <p>Protección de acceso</p>
      </section>
      <section class="card access-card">
        <p class="eyebrow">PRIMER INGRESO</p>
        <h1>Cambia tu clave temporal</h1>
        <p>Antes de continuar debes definir una clave personal de al menos 10 caracteres.</p>
        <form id="force-password-form" class="access-form">
          <label>Nueva clave <em>*</em>
            <input name="password" type="password" minlength="10" required autocomplete="new-password" />
          </label>
          <label>Confirmar nueva clave <em>*</em>
            <input name="passwordConfirmation" type="password" minlength="10" required autocomplete="new-password" />
          </label>
          ${auth.error ? `<div class="form-error">${safe(auth.error)}</div>` : ""}
          <button class="primary" type="submit">Guardar nueva clave</button>
          <button class="ghost" type="button" data-action="logout">Cerrar sesión</button>
        </form>
      </section>
    </main>`;
}

function shell(content) {
  return `
    <div class="shell">
      <aside class="sidebar">
        <img src="./logo-casa-diseno.png" class="brand-logo" alt="Casa Diseño Multiespacio" />
        ${
          canCreateQuote()
            ? `<button class="primary sidebar-new" data-action="new">＋ Nueva cotización</button>`
            : ""
        }
        <nav aria-label="Etapas del cotizador">
          ${steps
            .map(
              ([title, subtitle], index) => `
                <button class="step-link ${state.view === "quote" && state.step === index ? "active" : ""}"
                  data-action="step" data-step="${index}">
                  <span>${index + 1}</span>
                  <b>${title}<small>${subtitle}</small></b>
                </button>`,
            )
            .join("")}
        </nav>
        <button class="step-link ${state.view === "projects" ? "active" : ""}" data-action="projects">
          <span>⌂</span><b>Proyectos<small>Control y estados</small></b>
        </button>
        ${
          ["admin", "comercial", "produccion"].includes(auth.user?.role)
            ? `<button class="step-link ${state.view === "notifications" ? "active" : ""}" data-action="notifications">
                <span>♢</span><b>Notificaciones<small><i class="notification-badge" ${unreadNotifications() ? "" : "hidden"}>${unreadNotifications()}</i> Alertas</small></b>
              </button>
              ${
                auth.user?.role === "admin"
                  ? `<button class="step-link ${state.view === "users" ? "active" : ""}" data-action="users">
                      <span>♙</span><b>Usuarios<small>Perfiles y accesos</small></b>
                    </button>`
                  : ""
              }`
            : ""
        }
        <div class="sidebar-user">
          <b>${safe(auth.user?.fullName)}</b>
          <span>${roleLabels[auth.user?.role] || ""}</span>
          <button data-action="logout">Cerrar sesión</button>
        </div>
      </aside>
      <main>
        <header class="topbar">
          <div>
            <p class="eyebrow">${
              state.view === "projects"
                ? "SEGUIMIENTO"
                : state.view === "notifications"
                  ? "MONITOREO COMERCIAL"
                : state.view === "users"
                  ? "ADMINISTRACIÓN"
                  : `PASO ${state.step + 1} DE 5`
            }</p>
            <h1>${
              state.view === "projects"
                ? "Proyectos"
                : state.view === "notifications"
                  ? "Notificaciones"
                : state.view === "users"
                  ? "Usuarios y perfiles"
                  : steps[state.step][0]
            }</h1>
          </div>
          ${
            state.view === "quote"
              ? `<div class="status-pill"><i></i>${statusLabels[state.project.status]}</div>`
              : ""
          }
        </header>
        <div class="workspace">${content}</div>
      </main>
      ${
        state.message
          ? `<div class="toast ${state.message.type}">${safe(state.message.text)}</div>`
          : ""
      }
    </div>`;
}

function projectStep() {
  const statusEditable =
    ["admin", "comercial"].includes(auth.user?.role) &&
    state.project.status !== "produccion";
  const commercialRequired = auth.user?.role === "cliente";
  return `
    <section class="hero-card">
      <div>
        <p class="eyebrow">NUEVA SOLICITUD</p>
        <h2>Identifica el trabajo antes de cotizar</h2>
        <p>Solo el nombre del cliente es obligatorio. Los demás datos pueden completarse después.</p>
      </div>
      <div class="hero-mark">01</div>
    </section>
    <section class="card form-card">
      <div class="section-title"><span>1</span><div><h3>Datos del proyecto</h3><p>Selecciona la etapa actual: Cotización, Venta o Producción.</p></div></div>
      <div class="form-grid">
        <label>Nombre del proyecto
          <input data-project="projectName" value="${safe(state.project.projectName)}" placeholder="Ej. Cocina departamento Ñuñoa" />
        </label>
        <label>Nombre del cliente <em>*</em>
          <input data-project="clientName" value="${safe(state.project.clientName)}" placeholder="Nombre o razón social" />
        </label>
        <label>RUT
          <input data-project="rut" value="${safe(state.project.rut)}" placeholder="12.345.678-5" />
          <small>Opcional; si se ingresa, se valida módulo 11.</small>
        </label>
        <label>Estado
          <select data-project="status" ${statusEditable ? "" : "disabled"}>
            ${Object.entries(statusLabels)
              .map(
                ([value, label]) =>
                  `<option value="${value}" ${value === state.project.status ? "selected" : ""}>${label}</option>`,
              )
              .join("")}
          </select>
        </label>
        <label>Comercial responsable ${commercialRequired ? "<em>*</em>" : ""}
          <select data-assigned-to ${commercialRequired ? "required" : ""} ${
            ["comercial", "produccion"].includes(auth.user?.role)
              ? "disabled"
              : ""
          }>
            <option value="">Seleccionar comercial</option>
            ${commercialsCache
              .map(
                (commercial) =>
                  `<option value="${commercial.id}" ${
                    commercial.id === state.assignedTo ? "selected" : ""
                  }>${safe(commercial.fullName)}</option>`,
              )
              .join("")}
          </select>
          <small>El comercial recibirá la cotización en su panel.</small>
        </label>
      </div>
    </section>
    ${stepFooter(false, "Continuar a materiales")}
  `;
}

function materialStep() {
  const products = materials.filter((item) => item.categoryId === state.categoryId);
  const chosenMaterials = selectedMaterials();
  return `
    <section class="intro-row">
      <div><p class="eyebrow">SELECCIÓN PROGRESIVA</p><h2>Selecciona uno o más tableros</h2><p>Puedes cambiar de categoría y seguir incorporando productos al mismo proyecto.</p></div>
      <div class="selection-flow"><b class="${state.categoryId ? "done" : ""}">1 Categoría</b><span>→</span><b class="${chosenMaterials.length ? "done" : ""}">${chosenMaterials.length} tablero(s)</b></div>
    </section>
    ${
      chosenMaterials.length
        ? `<section class="selected-materials" aria-label="Tableros seleccionados">
            ${chosenMaterials
              .map(
                (material) => `<article>
                  <span class="sample" style="background:${material.texture}"><img class="material-image" src="${materialImageUrl(material)}" data-fallback="${safe(material.image)}" alt="" /></span>
                  <div><small>${safe(material.sku)}</small><b>${safe(material.name)}</b></div>
                  <button class="icon danger" data-action="remove-material" data-id="${material.id}" aria-label="Quitar ${safe(material.name)}">×</button>
                </article>`,
              )
              .join("")}
          </section>`
        : ""
    }
    <section class="card">
      <div class="section-title"><span>1</span><div><h3>Categoría del tablero</h3><p>Los listados se muestran de forma progresiva.</p></div></div>
      <div class="category-grid">
        ${categories
          .map(
            (category) => `
              <button class="category ${category.id === state.categoryId ? "selected" : ""}" data-category="${category.id}">
                <strong>${category.icon}</strong><span>${category.name}</span><i>→</i>
              </button>`,
          )
          .join("")}
      </div>
    </section>
    ${
      state.categoryId
        ? `<section class="card reveal">
            <div class="section-title product-title"><span>2</span><div><h3>Producto específico</h3><p>${products.length} alternativas en esta categoría.</p></div>
              <label class="search-field">Buscar producto
                <input id="material-search" type="search" value="${safe(state.productSearch)}" placeholder="Código, nombre o marca" />
              </label>
            </div>
            <div class="product-grid">
              ${products
                .map((material) => {
                  const isSelected = chosenMaterials.some(
                    (item) => item.id === material.id,
                  );
                  return `
                  <button class="product ${isSelected ? "selected" : ""}" data-material="${material.id}" data-search-text="${safe(`${material.sku} ${material.name} ${material.brand}`.toLowerCase())}">
                    <span class="sample" style="background:${material.texture}">
                      <img class="material-image" src="${materialImageUrl(material)}" data-fallback="${safe(material.image)}" alt="" loading="lazy" />
                    </span>
                    <span class="product-copy"><small>${safe(material.brand)} · ${safe(material.sku)}</small><b>${safe(material.name)}</b><em>${material.plateLength} × ${material.plateWidth} × ${material.thickness} mm</em><strong>${clp(material.netPrice)} neto</strong>
                    ${
                      auth.user?.role === "admin"
                        ? `<span class="admin-prices">Mínimo ${clp(material.minPrice)} · Compra ${clp(material.purchasePrice)}</span>`
                        : ""
                    }</span>
                    <i>${isSelected ? "✓" : "＋"}</i>
                  </button>`;
                })
                .join("")}
            </div>
          </section>`
        : `<div class="empty-hint">Selecciona una categoría para cargar sus productos.</div>`
    }
    ${stepFooter(true, "Continuar a piezas")}
  `;
}

function piecesStep() {
  const material = selectedMaterial();
  const chosenMaterials = selectedMaterials();
  const limits = dimensionLimits(state.defaultGrain, material);
  return `
    <section class="intro-row">
      <div><p class="eyebrow">INGRESO DE PIEZAS</p><h2>Manual o mediante una planilla Excel</h2><p>Las medidas ingresadas son medidas terminadas.</p></div>
      <div class="piece-counter"><strong>${state.pieces.reduce((sum, piece) => sum + piece.quantity, 0)}</strong><span>piezas totales</span></div>
    </section>
    <div class="two-columns">
      <section class="card">
        <div class="section-title"><span>＋</span><div><h3>Agregar pieza</h3><p>El nombre es opcional; el código se asignará al generar la hoja de corte.</p></div></div>
        <form id="piece-form" class="piece-form">
          <label>Código de producción
            <div class="locked-field">Pendiente <span>Se genera al optimizar</span></div>
          </label>
          <label>Nombre del elemento <small>Opcional</small><input name="name" placeholder="Costado izquierdo" /></label>
          <label class="piece-material-field">Tablero de esta pieza <em>*</em>
            <select name="materialId" required>
              ${chosenMaterials
                .map(
                  (item) =>
                    `<option value="${item.id}" ${item.id === material?.id ? "selected" : ""}>${safe(item.sku)} · ${safe(item.name)} · ${item.thickness} mm</option>`,
                )
                .join("")}
            </select>
          </label>
          <label>Largo terminado (mm) <em>*</em><input name="length" type="number" min="1" max="${limits.maxLength}" required placeholder="720" /></label>
          <label>Ancho terminado (mm) <em>*</em><input name="width" type="number" min="1" max="${limits.maxWidth}" required placeholder="560" /></label>
          <label>Cantidad <em>*</em><input name="quantity" type="number" min="1" value="1" required /></label>
          <label>Notas<input name="notes" placeholder="Opcional" /></label>
          <div class="grain-field">
            <span>Veta de la pieza</span>
            <div class="grain-options">
              ${["longitudinal", "transversal", "sin-veta"]
                .map(
                  (grain) => `<label class="${grain === state.defaultGrain ? "selected" : ""}"><input type="radio" name="grain" value="${grain}" ${grain === state.defaultGrain ? "checked" : ""}/><b>${grainIcon(grain)}</b><span>${grainLabels[grain]}</span></label>`,
                )
                .join("")}
            </div>
            <small id="dimension-limit-note">${safe(limits.note)}</small>
          </div>
          <button class="primary" type="submit">Agregar pieza</button>
        </form>
      </section>
      <section class="card import-card">
        <div class="section-title"><span>⇧</span><div><h3>Importar Excel</h3><p>Selecciona el tablero y los tapacantos por fila desde listas dinámicas.</p></div></div>
        <label class="dropzone">
          <input type="file" id="excel-file" accept=".xlsx" />
          <strong>Seleccionar archivo</strong>
          <span>Excel .xlsx · máximo recomendado 1.000 filas</span>
        </label>
        <a class="text-button" href="/Plantilla_Piezas_Casa_Diseno.xlsx" download="Plantilla_Piezas_Casa_Diseno.xlsx">↓ Descargar plantilla Excel</a>
        ${
          state.importPreview
            ? `<div class="import-result ${state.importPreview.errors.length ? "warning" : ""}">
                <b>${safe(state.importPreview.fileName || "Archivo seleccionado")} · ${state.importPreview.rows.length} filas válidas</b>
                <span>${state.importPreview.errors.length} observaciones</span>
                ${
                  state.importPreview.errors.length
                    ? `<ul>${state.importPreview.errors.slice(0, 4).map((error) => `<li>${safe(error)}</li>`).join("")}</ul>`
                    : ""
                }
                <button class="primary small" data-action="confirm-import" ${state.importPreview.rows.length ? "" : "disabled"}>Incorporar filas válidas</button>
              </div>`
            : ""
        }
      </section>
    </div>
    ${piecesTable()}
    ${stepFooter(true, "Configurar tapacantos")}
  `;
}

function piecesTable() {
  if (!state.pieces.length) {
    return `<section class="card empty-state"><span>▦</span><h3>Aún no hay piezas</h3><p>Agrégalas manualmente o importa la plantilla.</p></section>`;
  }
  return `<section class="card table-card">
    <div class="section-title"><span>▦</span><div><h3>Listado de piezas</h3><p>${state.pieces.length} líneas ingresadas.</p></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Código · elemento</th><th>Tablero</th><th>Terminada</th><th>Cant.</th><th>Veta</th><th></th></tr></thead>
      <tbody>${selectedMaterials()
        .flatMap((groupMaterial) => {
          const groupPieces = state.pieces.filter(
            (piece) => piece.materialId === groupMaterial.id,
          );
          if (!groupPieces.length) return [];
          return [
            `<tr class="material-group-row"><td colspan="6"><b>${safe(
              groupMaterial.sku,
            )} · ${safe(groupMaterial.name)}</b><span>${
              groupPieces.length
            } línea(s)</span></td></tr>`,
            ...groupPieces.map((piece) => {
          const material = selectedMaterial(piece.materialId);
          const limits = dimensionLimits(piece.grain, material);
          const editable = canEditCurrent();
          return `<tr>
            <td><b>${safe(piece.code || "Pendiente")}</b><span>${safe(
              piece.name || "Sin nombre",
            )}</span></td>
            <td><b>${safe(material?.sku || "Sin asignar")}</b><span>${safe(material?.name || "")}</span></td>
            <td>${
              editable
                ? `<div class="inline-dimensions">
                    <label>Largo<input type="number" min="1" max="${limits.maxLength}" step="1" value="${piece.length}" data-piece-field="length" data-id="${piece.id}" aria-label="Largo de ${safe(piece.code)}" /></label>
                    <b>×</b>
                    <label>Ancho<input type="number" min="1" max="${limits.maxWidth}" step="1" value="${piece.width}" data-piece-field="width" data-id="${piece.id}" aria-label="Ancho de ${safe(piece.code)}" /></label>
                    <small>mm</small>
                  </div>`
                : `${piece.length} × ${piece.width} mm`
            }</td>
            <td>${
              editable
                ? `<input class="inline-quantity" type="number" min="1" step="1" value="${piece.quantity}" data-piece-field="quantity" data-id="${piece.id}" aria-label="Cantidad de ${safe(piece.code)}" />`
                : piece.quantity
            }</td>
            <td><i class="mini-grain">${grainIcon(piece.grain)}</i>${grainLabels[piece.grain]}</td>
            <td>${
              editable
                ? `<button class="icon danger" data-action="remove-piece" data-id="${piece.id}" aria-label="Eliminar">×</button>`
                : ""
            }</td>
          </tr>`;
            }),
          ];
        })
        .join("")}</tbody>
    </table></div>
  </section>`;
}

function edgeStep() {
  const material = selectedMaterial();
  const suggested = edgeBands.find((item) => item.id === material?.suggestedEdgeId);
  return `
    <section class="intro-row">
      <div><p class="eyebrow">TERMINACIÓN</p><h2>Tapacantos por pieza y tablero</h2><p>El espesor seleccionado se descuenta automáticamente de la medida de corte.</p></div>
    </section>
    <section class="card edge-toolbar">
      <div><small>SUGERIDO PARA ${safe(material?.name)}</small><b><i style="background:${suggested?.color}"></i>${suggested?.group} · ${suggested?.name}</b></div>
      <label>Tapacanto masivo<select id="global-edge">${edgeOptions(suggested?.id)}</select></label>
      <button class="secondary" data-action="apply-all">Aplicar a los 4 lados</button>
      <button class="ghost" data-action="clear-edges">Limpiar tapacantos</button>
    </section>
    <div class="edge-list">
      ${state.pieces
        .map((piece) => {
          const cut = cutDimensions(piece, edgeBands);
          const pieceMaterial = selectedMaterial(piece.materialId);
          return `<article class="card edge-piece">
            <div class="edge-piece-head">
              <div><small>${safe(piece.code)} · ${safe(pieceMaterial?.sku || "Sin tablero")}</small><h3>${safe(piece.name || "Pieza sin nombre")}</h3><p>${safe(pieceMaterial?.name || "")} · Terminada: ${piece.length} × ${piece.width} mm · Cantidad: ${piece.quantity}</p></div>
              <div class="cut-size"><span>MEDIDA DE CORTE</span><b>${cut.cutLength} × ${cut.cutWidth} mm</b></div>
            </div>
            <div class="edge-diagram" aria-label="Tapacantos por posición">
              <div class="edge-piece-shape">
                <span>${piece.length} × ${piece.width} mm</span>
                <small>L1 superior · L2 inferior · A1 izquierdo · A2 derecho</small>
              </div>
              ${sides
                .map(([side, label]) => {
                  const edge = edgeBands.find(
                    (item) => item.id === piece.edges?.[side],
                  );
                  return `<label class="edge-control edge-${side}">
                    <span>${label}</span>
                    <span class="edge-selector-row">
                      ${
                        edge
                          ? `<img class="material-image edge-product-image" src="${materialImageUrl(
                              edge,
                            )}" alt="" />`
                          : `<i class="edge-empty-swatch" aria-hidden="true"></i>`
                      }
                      <select data-piece-edge="${piece.id}" data-side="${side}">${edgeOptions(
                        piece.edges[side],
                      )}</select>
                    </span>
                  </label>`;
                })
                .join("")}
            </div>
          </article>`;
        })
        .join("")}
    </div>
    ${stepFooter(true, "Optimizar y cotizar")}
  `;
}

function summaryRows(summary) {
  return `
    <div class="summary-row"><span>Tableros <small>${summary.boardCount} placa(s)</small></span><b>${clp(summary.boardSubtotal)}</b></div>
    ${
      summary.boardDiscount
        ? `<div class="summary-row discount"><span>Descuento tableros <small>${summary.boardDiscount} %</small></span><b>− ${clp(summary.boardDiscountAmount)}</b></div>`
        : ""
    }
    <div class="summary-row"><span>Tapacantos <small>${summary.edgeMeters.toFixed(2)} m</small></span><b>${clp(summary.edgeSubtotal)}</b></div>
    ${
      summary.edgeDiscount
        ? `<div class="summary-row discount"><span>Descuento tapacantos <small>${summary.edgeDiscount} %</small></span><b>− ${clp(summary.edgeDiscountAmount)}</b></div>`
        : ""
    }
    <div class="summary-row"><span>Servicio de corte <small>${summary.boardCount} tablero(s) · ${summary.cutCount} cortes estimados</small></span><b>${clp(summary.cuttingSubtotal)}</b></div>
    <div class="summary-row"><span>Servicio de tapacanto <small>Tarifa según espesor</small></span><b>${clp(summary.bandingSubtotal)}</b></div>
    ${
      summary.servicesDiscount
        ? `<div class="summary-row discount"><span>Descuento servicios <small>${summary.servicesDiscount} %</small></span><b>− ${clp(summary.servicesDiscountAmount)}</b></div>`
        : ""
    }
    <div class="summary-row net"><span>Neto</span><b>${clp(summary.net)}</b></div>
    <div class="summary-row"><span>IVA 19 %</span><b>${clp(summary.vat)}</b></div>
    <div class="summary-row total"><span>Total</span><b>${clp(summary.total)}</b></div>
  `;
}

function millimeters(value) {
  return Number(value || 0).toLocaleString("es-CL", {
    minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 1,
    maximumFractionDigits: 2,
  });
}

function optimizedPieceList() {
  return summarizeOptimizedPieces(
    latestResult?.plates || [],
    state.pieces,
    edgeBands,
  );
}

function optimizedPiecesTable() {
  const rows = optimizedPieceList();
  return `<section class="card optimized-list-card">
    <div class="section-title">
      <span>≡</span>
      <div>
        <h3>Listado completo de piezas optimizadas</h3>
        <p>${rows.length} línea(s) · ${rows.reduce((sum, row) => sum + row.optimizedQuantity, 0)} pieza(s) ubicadas.</p>
      </div>
    </div>
    <div class="table-wrap"><table class="result-piece-table">
      <thead><tr><th>Código · elemento</th><th>Tablero</th><th>Terminada</th><th>Corte</th><th>Solic.</th><th>Optim.</th><th>Placa(s)</th></tr></thead>
      <tbody>${selectedMaterials()
        .flatMap((groupMaterial) => {
          const groupRows = rows.filter(
            (row) => row.materialId === groupMaterial.id,
          );
          if (!groupRows.length) return [];
          return [
            `<tr class="material-group-row"><td colspan="7"><b>${safe(
              groupMaterial.sku,
            )} · ${safe(groupMaterial.name)}</b><span>${
              groupRows.length
            } línea(s) optimizada(s)</span></td></tr>`,
            ...groupRows.map((row) => {
          const material = materials.find((item) => item.id === row.materialId);
          const incomplete = row.optimizedQuantity !== row.requestedQuantity;
          return `<tr class="${incomplete ? "row-warning" : ""}">
            <td><b>${safe(row.code)}</b><span>${safe(row.name || "Sin nombre")}</span></td>
            <td><b>${safe(material?.sku || "Sin asignar")}</b><span>${safe(material?.name || "")}</span></td>
            <td>${millimeters(row.finishedLength)} × ${millimeters(row.finishedWidth)} mm</td>
            <td>${millimeters(row.cutLength)} × ${millimeters(row.cutWidth)} mm</td>
            <td>${row.requestedQuantity}</td>
            <td><b>${row.optimizedQuantity}</b>${incomplete ? `<span>Revisar</span>` : ""}</td>
            <td><span class="plate-references">${safe(row.plates.join(" · ") || "Sin ubicación")}</span></td>
          </tr>`;
            }),
          ];
        })
        .join("")}</tbody>
    </table></div>
  </section>`;
}

function platePiecesTable(plate) {
  const rows = summarizePlatePieces(plate);
  const leftovers = summarizePlateLeftovers(plate);
  return `<section class="plate-piece-list">
    <div>
      <b>Piezas generadas en esta placa</b>
      <span>${plate.pieces.length} pieza(s) · ${rows.length} línea(s)</span>
    </div>
    <div class="table-wrap"><table class="result-piece-table compact">
      <thead><tr><th>Código · elemento</th><th>Terminada</th><th>Corte</th><th>Cant.</th><th>Veta</th></tr></thead>
      <tbody>${rows
        .map(
          (row) => `<tr>
            <td><b>${safe(row.code)}</b><span>${safe(row.name || "Sin nombre")}</span></td>
            <td>${millimeters(row.finishedLength)} × ${millimeters(row.finishedWidth)} mm</td>
            <td>${millimeters(row.cutLength)} × ${millimeters(row.cutWidth)} mm</td>
            <td><b>${row.quantity}</b></td>
            <td>${safe(grainLabels[row.grain] || row.grain)}</td>
          </tr>`,
        )
        .join("")}</tbody>
    </table></div>
    <div class="leftover-list-title">
      <b>Retazos identificados</b>
      <span>${leftovers.length} retazo(s) reutilizable(s)</span>
    </div>
    ${
      leftovers.length
        ? `<div class="table-wrap"><table class="result-piece-table compact leftover-table">
            <thead><tr><th>Código de retazo</th><th>Medidas</th><th>Área aproximada</th></tr></thead>
            <tbody>${leftovers
              .map(
                (leftover) => `<tr>
                  <td><b>${safe(leftover.code)}</b></td>
                  <td>${millimeters(leftover.width)} × ${millimeters(leftover.height)} mm</td>
                  <td>${leftover.area.toLocaleString("es-CL", {
                    maximumFractionDigits: 2,
                  })} m²</td>
                </tr>`,
              )
              .join("")}</tbody>
          </table></div>`
        : `<small class="muted-note">No se generaron retazos reutilizables de al menos 50 × 50 mm.</small>`
    }
  </section>`;
}

function optimizeStep() {
  assignPieceCodes(state.pieces);
  latestResult = optimizeProject(
    selectedMaterials(),
    state.pieces,
    edgeBands,
    state.settings,
  );
  const summary = latestResult.summary;
  return `
    <section class="intro-row">
      <div><p class="eyebrow">RESULTADO</p><h2>Planos agrupados por tablero</h2><p>Cada material se optimiza por separado y genera sus propias hojas de corte.</p></div>
      <div class="actions">
        <button class="secondary" data-action="pdf">↓ Descargar PDF</button>
        ${
          ["admin", "produccion"].includes(auth.user?.role)
            ? `<button class="secondary" data-action="labels-pdf">↓ Etiquetas 50 mm</button>
               <button class="secondary" data-action="labels-csv">↓ Etiquetas editables</button>`
            : ""
        }
        ${
          canEditCurrent()
            ? `<button class="primary" data-action="save">Guardar proyecto</button>`
            : ""
        }
      </div>
    </section>
    <div class="metrics">
      <div><span>PLACAS</span><b>${summary.boardCount}</b></div>
      <div><span>APROVECHAMIENTO</span><b>${(100 - summary.waste).toFixed(1)} %</b></div>
      <div><span>DESPERDICIO</span><b>${summary.waste.toFixed(1)} %</b></div>
      <div><span>SIERRA</span><b>${state.settings.kerf} mm</b></div>
    </div>
    ${
      !canEditCurrent()
        ? `<div class="alert"><b>Pedido de solo lectura:</b> ${
            auth.user?.role === "comercial"
              ? "ya fue enviado a Producción y no admite cambios comerciales."
              : "puedes revisar planos y descargar documentos sin alterar el pedido."
          }</div>`
        : ""
    }
    ${
      latestResult.warnings.length
        ? `<div class="alert"><b>Revisar piezas:</b> ${latestResult.warnings.map(safe).join(" · ")}</div>`
        : ""
    }
    ${optimizedPiecesTable()}
    <div class="result-layout">
      <section class="plans">
        ${latestResult.plates
          .map(
            (plate) => `<article class="card plan-card">
              <header><div><small>${safe(plate.material.sku)} · ${safe(plate.material.name)}</small><h3>Placa ${plate.materialPlateIndex} de este tablero</h3></div><b>${plate.utilization.toFixed(1)} % utilizado</b></header>
              <div class="canvas-wrap"><canvas id="plan-${plate.index}"></canvas></div>
              ${platePiecesTable(plate)}
            </article>`,
          )
          .join("")}
      </section>
      <aside class="quote-side">
        <section class="card summary-card"><p class="eyebrow">RESUMEN ECONÓMICO</p><h3>Subtotales</h3>
          <div class="material-summary-list">
            ${latestResult.materialSummaries
              .map(
                (item) => `<div><span><b>${safe(item.sku)}</b><small>${safe(
                  item.name,
                )} · ${item.boardCount} placa(s) · corte ${clp(
                  item.cutRatePerBoard,
                )}/placa</small></span><strong>${clp(
                  item.boardSubtotal + item.cuttingSubtotal,
                )}</strong></div>`,
              )
              .join("")}
          </div>
          ${summaryRows(summary)}
        </section>
        <section class="card settings-card">
          <p class="eyebrow">PARÁMETROS</p>
          <label>Sierra (mm)<input type="number" min="0" step="0.1" data-setting="kerf" value="${state.settings.kerf}" /></label>
          <label>Modo de optimización<select data-setting-text="optimizationMode">
            <option value="longitudinal" ${state.settings.optimizationMode === "longitudinal" ? "selected" : ""}>Priorizar primer corte longitudinal</option>
            <option value="free" ${state.settings.optimizationMode === "free" ? "selected" : ""}>Sin priorizar</option>
          </select></label>
          <div class="rate-table">
            <b>Corte automático por tablero</b>
            <span>Melamina 15/18 mm <strong>${clp(
              state.settings.melamineCutRate,
            )}</strong></span>
            <span>EGR y otros <strong>${clp(
              state.settings.specialCutRate,
            )}</strong></span>
          </div>
          <div class="rate-table">
            <b>Servicio tapacanto / ml</b>
            <span>0,4 mm <strong>${clp(500)}</strong></span>
            <span>1,0 mm <strong>${clp(600)}</strong></span>
            <span>1,5 mm <strong>${clp(700)}</strong></span>
            <span>2,0 mm <strong>${clp(850)}</strong></span>
          </div>
          <p class="eyebrow settings-subtitle">DESCUENTOS</p>
          <label>Tableros (%)<input type="number" min="0" max="100" step="0.1" data-setting="boardDiscount" value="${state.settings.boardDiscount}" /></label>
          <label>Tapacantos (%)<input type="number" min="0" max="100" step="0.1" data-setting="edgeDiscount" value="${state.settings.edgeDiscount}" /></label>
          <label>Servicios (%)<input type="number" min="0" max="100" step="0.1" data-setting="servicesDiscount" value="${state.settings.servicesDiscount}" /></label>
          <small>Precios y servicios expresados en valores netos.</small>
        </section>
      </aside>
    </div>
    ${stepFooter(true, null)}
  `;
}

function projectsView() {
  const projects = [...projectsCache].sort(
    (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt),
  );
  if (!projects.length) {
    return shell(`<section class="card empty-state large"><span>⌂</span><h2>No hay proyectos disponibles</h2><p>Los proyectos visibles dependen del perfil y del estado de cada orden.</p>${
      canCreateQuote()
        ? `<button class="primary" data-action="new">Crear cotización</button>`
        : ""
    }</section>`);
  }
  return shell(`
    <section class="intro-row"><div><p class="eyebrow">SEGUIMIENTO</p><h2>Cotización → Venta → Producción</h2><p>Cada perfil ve y modifica únicamente los proyectos que le corresponden.</p></div>${
      canCreateQuote()
        ? `<button class="primary" data-action="new">＋ Nueva cotización</button>`
        : ""
    }</section>
    <section class="project-grid">
      ${projects
        .map(
          (item) => `<article class="card project-card">
            <header><span class="status-dot ${item.project.status}"></span><small>${statusLabels[item.project.status]}</small><time>${new Date(item.updatedAt).toLocaleDateString("es-CL")}</time></header>
            <h3>${safe(item.project.projectName || "Proyecto sin nombre")}</h3>
            <p>${safe(item.project.clientName)}${
              item.project.rut ? ` · ${safe(item.project.rut)}` : ""
            }<br><small>Código: ${safe(projectCode(item.id))}${
              item.assignedName
                ? ` · Comercial: ${safe(item.assignedName)}`
                : ""
            }</small></p>
            <div><span>Total</span><b>${clp(item.summary?.total)}</b></div>
            ${
              ["admin", "comercial"].includes(auth.user?.role)
                ? `<label>Estado<select data-project-status="${item.id}">
                    ${
                      auth.user?.role === "comercial" &&
                      item.project.status === "produccion"
                        ? `<option value="produccion" selected>Producción · pedido bloqueado</option>`
                        : Object.entries(statusLabels)
                            .map(
                              ([value, label]) =>
                                `<option value="${value}" ${
                                  value === item.project.status ? "selected" : ""
                                }>${label}</option>`,
                            )
                            .join("")
                    }
                  </select></label>`
                : ""
            }
            <button class="secondary" data-action="open-project" data-id="${item.id}">Abrir proyecto</button>
          </article>`,
        )
        .join("")}
    </section>`);
}

function notificationsView() {
  const notifications = [...notificationsCache].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  );
  return shell(`
    <section class="intro-row notification-intro">
      <div>
        <p class="eyebrow">MONITOREO COMERCIAL</p>
        <h2>Alertas de cotización y producción</h2>
        <p>Administración recibe nuevas cotizaciones; el Comercial ve las asignadas y Producción recibe las órdenes que fueron enviadas a fabricar.</p>
      </div>
      <div class="notification-summary">
        <strong>${unreadNotifications()}</strong>
        <span>sin leer</span>
      </div>
    </section>
    ${
      notifications.length
        ? `<section class="card notification-list">
            ${notifications
              .map(
                (notification) => `<article class="notification-row ${
                  notification.readAt ? "" : "unread"
                }">
                  <span class="notification-marker" aria-hidden="true"></span>
                  <div class="notification-copy">
                    <div>
                      <h3>${safe(notification.title)}</h3>
                      <time>${new Date(notification.createdAt).toLocaleString(
                        "es-CL",
                      )}</time>
                    </div>
                    <p>${safe(notification.message)}</p>
                  </div>
                  <div class="notification-actions">
                    <button class="secondary small" data-action="open-project" data-id="${notification.projectId}" data-notification-id="${notification.id}">Abrir cotización</button>
                    ${
                      notification.readAt
                        ? `<small>Leída</small>`
                        : `<button class="ghost small" data-action="mark-notification" data-id="${notification.id}">Marcar leída</button>`
                    }
                  </div>
                </article>`,
              )
              .join("")}
          </section>`
        : `<section class="card empty-state large"><span>♢</span><h2>Aún no hay notificaciones</h2><p>La primera alerta aparecerá cuando se guarde una nueva cotización.</p></section>`
    }
  `);
}

function bulkUserPreviewHtml() {
  if (!bulkUserPreview) return "";
  return `<div class="bulk-user-preview">
    <div class="bulk-preview-summary">
      <b>${bulkUserPreview.rows.length} usuario(s) válido(s)</b>
      <span>${bulkUserPreview.errors.length} observación(es)</span>
    </div>
    ${
      bulkUserPreview.rows.length
        ? `<div class="table-wrap"><table>
            <thead><tr><th>Nombre</th><th>Correo</th><th>Perfil</th><th>Empresa</th><th>Activo</th></tr></thead>
            <tbody>${bulkUserPreview.rows
              .slice(0, 20)
              .map(
                (user) => `<tr>
                  <td><b>${safe(user.fullName)}</b></td>
                  <td>${safe(user.email)}</td>
                  <td>${safe(roleLabels[user.role])}</td>
                  <td>${safe(user.clientName || "—")}</td>
                  <td>${user.active ? "Sí" : "No"}</td>
                </tr>`,
              )
              .join("")}</tbody>
          </table></div>
          ${
            bulkUserPreview.rows.length > 20
              ? `<small>Se muestran las primeras 20 filas de ${bulkUserPreview.rows.length}.</small>`
              : ""
          }`
        : ""
    }
    ${
      bulkUserPreview.errors.length
        ? `<ul class="bulk-user-errors">${bulkUserPreview.errors
            .slice(0, 12)
            .map((error) => `<li>${safe(error)}</li>`)
            .join("")}</ul>`
        : ""
    }
    <button class="primary" data-action="confirm-user-import" ${
      bulkUserPreview.rows.length ? "" : "disabled"
    }>Crear ${bulkUserPreview.rows.length} usuario(s)</button>
  </div>`;
}

function usersView() {
  return shell(`
    <section class="intro-row">
      <div><p class="eyebrow">CONTROL DE ACCESO</p><h2>Usuarios diferenciados</h2><p>Administrador, Comercial, Producción y Cliente tienen permisos distintos.</p></div>
    </section>
    <div class="users-layout">
      <section class="card">
        <div class="section-title"><span>＋</span><div><h3>Crear usuario</h3><p>La clave inicial requiere al menos 10 caracteres.</p></div></div>
        <form id="user-form" class="access-form">
          <label>Nombre completo <em>*</em><input name="fullName" required /></label>
          <label>Correo <em>*</em><input name="email" type="email" required /></label>
          <label>Perfil <em>*</em><select name="role" required>
            ${Object.entries(roleLabels)
              .map(([value, label]) => `<option value="${value}">${label}</option>`)
              .join("")}
          </select></label>
          <label>Cliente o empresa<small>Útil para el perfil Cliente.</small><input name="clientName" /></label>
          <label>Teléfono<small>Obligatorio solo para autoregistro de Cliente.</small><input name="phone" type="tel" /></label>
          <label>Clave inicial <em>*</em><input name="password" type="password" minlength="10" required /></label>
          <button class="primary" type="submit">Crear usuario</button>
        </form>
      </section>
      <section class="card">
        <div class="section-title"><span>♙</span><div><h3>Usuarios registrados</h3><p>${usersCache.length} cuenta(s).</p></div></div>
        <div class="user-list">
          ${usersCache
            .map(
              (user) => `<article class="user-row">
                <div><b>${safe(user.fullName)}</b><span>${safe(user.email)} · ${roleLabels[user.role]}</span></div>
                <span class="account-state ${user.active ? "" : "inactive"}">${user.active ? "Activo" : "Inactivo"}${user.mustChangePassword ? " · Clave temporal" : ""}</span>
                <div class="user-controls">
                  <label>Perfil<select data-user-role="${user.id}">
                    ${Object.entries(roleLabels).map(([value, label]) => `<option value="${value}" ${value === user.role ? "selected" : ""}>${label}</option>`).join("")}
                  </select></label>
                  <form class="password-reset-form" data-user-id="${user.id}">
                    <input name="password" type="password" minlength="10" required placeholder="Nueva clave" aria-label="Nueva clave para ${safe(user.fullName)}" />
                    <button class="secondary small" type="submit">Cambiar clave</button>
                  </form>
                  ${
                    user.id !== auth.user.id
                      ? `<button class="secondary small" data-action="toggle-user" data-id="${user.id}" data-active="${user.active ? "true" : "false"}">${user.active ? "Desactivar" : "Activar"}</button>`
                      : `<small>Tu cuenta</small>`
                  }
                </div>
              </article>`,
            )
            .join("")}
        </div>
      </section>
      <section class="card users-import-card">
        <div class="section-title">
          <span>⇧</span>
          <div>
            <h3>Importar usuarios desde Excel</h3>
            <p>Máximo 200 usuarios por archivo. Las claves importadas son temporales.</p>
          </div>
        </div>
        <div class="bulk-import-layout">
          <label class="dropzone compact-dropzone">
            <input type="file" id="user-excel-file" accept=".xlsx" />
            <strong>Seleccionar plantilla completada</strong>
            <span>Se validarán correos, perfiles, claves y duplicados.</span>
          </label>
          <div class="bulk-import-help">
            <b>Columnas requeridas</b>
            <span>nombre_completo · correo · perfil · cliente_empresa · clave_temporal · activo</span>
            <a class="text-button" href="/Plantilla_Usuarios_Casa_Diseno.xlsx" download="Plantilla_Usuarios_Casa_Diseno.xlsx">↓ Descargar plantilla de usuarios</a>
          </div>
        </div>
        ${bulkUserPreviewHtml()}
      </section>
      <section class="card role-access-card">
        <div class="section-title">
          <span>▧</span>
          <div><h3>Imágenes masivas de productos</h3><p>Sube un solo ZIP con hasta 500 imágenes nombradas con el código del tablero o tapacanto.</p></div>
        </div>
        <div class="bulk-import-layout">
          <label class="dropzone compact-dropzone">
            <input type="file" id="product-images-zip" accept=".zip,application/zip" />
            <strong>Seleccionar ZIP de imágenes</strong>
            <span>Ejemplo: 2-EGGER-1504.jpg · máximo 2,5 MB por imagen</span>
          </label>
          <div class="bulk-import-help">
            <b>Ya no debes cargar 200 archivos en GitHub</b>
            <span>El administrador carga un único ZIP aquí y las imágenes quedan guardadas en PostgreSQL.</span>
            ${
              imageImportResult
                ? `<strong>${imageImportResult.imported} imagen(es) incorporada(s) · ${imageImportResult.rejected} rechazada(s)</strong>`
                : ""
            }
          </div>
        </div>
      </section>
      <section class="card role-access-card">
        <div class="section-title">
          <span>⌘</span>
          <div><h3>Accesos definidos por perfil</h3><p>El Administrador puede cambiar el perfil desde el listado superior.</p></div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Perfil</th><th>Proyectos visibles</th><th>Acciones principales</th></tr></thead>
          <tbody>
            <tr><td><b>Administrador</b></td><td>Todos</td><td>Usuarios, precios, descuentos, estados y notificaciones.</td></tr>
            <tr><td><b>Comercial</b></td><td>Propios y asignados</td><td>Crea, cotiza, guarda y gestiona estados.</td></tr>
            <tr><td><b>Producción</b></td><td>Órdenes en Producción y borradores propios</td><td>Revisa planos, descarga etiquetas y guarda solo sus cotizaciones propias.</td></tr>
            <tr><td><b>Cliente</b></td><td>Solo sus cotizaciones</td><td>Crea, guarda y consulta sin cambiar a Venta o Producción.</td></tr>
          </tbody>
        </table></div>
      </section>
    </div>
  `);
}

function stepFooter(back, nextLabel) {
  return `<footer class="step-footer">
    ${back ? `<button class="ghost" data-action="back">← Volver</button>` : `<span></span>`}
    ${nextLabel ? `<button class="primary" data-action="next">${nextLabel} →</button>` : `<span></span>`}
  </footer>`;
}

function applyProductFilter(value = "") {
  const query = String(value).trim().toLowerCase();
  document.querySelectorAll(".product[data-search-text]").forEach((product) => {
    product.hidden = Boolean(query) && !product.dataset.searchText.includes(query);
  });
}

function renderEnhancements() {
  document.querySelectorAll(".material-image").forEach((image) => {
    const fallback = () => {
      if (
        image.dataset.fallback &&
        !image.dataset.fallbackUsed &&
        image.src !== new URL(image.dataset.fallback, window.location.href).href
      ) {
        image.dataset.fallbackUsed = "true";
        image.src = image.dataset.fallback;
        return;
      }
      image.classList.add("missing");
    };
    image.addEventListener("error", fallback);
    if (image.complete && !image.naturalWidth) fallback();
  });
  applyProductFilter(state.productSearch);
}

function render() {
  if (auth.loading) {
    app.innerHTML = `<main class="access-page"><section class="access-brand"><img src="./logo-casa-diseno.png" alt="Casa Diseño Multiespacio" /><p>Preparando acceso seguro…</p></section></main>`;
    return;
  }
  if (!auth.user) {
    app.innerHTML = accessView();
    return;
  }
  if (auth.user.mustChangePassword) {
    app.innerHTML = passwordChangeView();
    return;
  }
  if (state.view === "projects") {
    app.innerHTML = projectsView();
    renderEnhancements();
    return;
  }
  if (state.view === "users") {
    app.innerHTML = usersView();
    renderEnhancements();
    return;
  }
  if (state.view === "notifications") {
    app.innerHTML = notificationsView();
    renderEnhancements();
    return;
  }
  const views = [projectStep, materialStep, piecesStep, edgeStep, optimizeStep];
  app.innerHTML = shell(views[state.step]());
  renderEnhancements();
  if (state.step === 4 && latestResult) {
    requestAnimationFrame(() => {
      const logo = document.querySelector(".brand-logo");
      const drawPlans = () =>
        latestResult.plates.forEach((plate) => {
          const canvas = document.querySelector(`#plan-${plate.index}`);
          if (canvas) {
            drawCutPlan(canvas, plate, plate.material, edgeBands, logo, {
              projectId: state.projectId,
              project: state.project,
              statusLabel: statusLabels[state.project.status],
              createdBy: auth.user?.fullName,
              generatedAt: new Date().toLocaleString("es-CL"),
            });
          }
        });
      drawPlans();
      if (logo && !logo.complete) {
        logo.addEventListener("load", drawPlans, { once: true });
      }
    });
  }
}

function nextPieceCode(pieces = state.pieces) {
  const highest = pieces.reduce((max, piece) => {
    const match = String(piece.code || "").match(/(\d+)$/);
    return Math.max(max, match ? Number(match[1]) : 0);
  }, 0);
  return `P-${String(highest + 1).padStart(3, "0")}`;
}

function projectCode(id = state.projectId) {
  return `COT-${String(id || "")
    .replaceAll("-", "")
    .slice(0, 8)
    .toUpperCase()}`;
}

function pieceEdgeDescription(piece) {
  const positions = [
    ["top", "L1"],
    ["bottom", "L2"],
    ["left", "A1"],
    ["right", "A2"],
  ];
  return positions
    .map(([side, label]) => {
      const edge = edgeBands.find((item) => item.id === piece.edges?.[side]);
      return edge
        ? `${label}: ${edge.sku} · ${String(edge.thickness).replace(".", ",")} mm`
        : `${label}: sin tapacanto`;
    })
    .join(" | ");
}

function labelRows() {
  assignPieceCodes(state.pieces);
  return state.pieces.flatMap((piece) =>
    Array.from({ length: Math.max(1, Number(piece.quantity) || 1) }, (_, index) => ({
      ...piece,
      unit: index + 1,
      edgeDescription: pieceEdgeDescription(piece),
    })),
  );
}

function exportLabelsPdf() {
  const rows = labelRows();
  if (!rows.length) {
    notify("No hay piezas para generar etiquetas.", "error");
    return;
  }
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [50, 70],
  });
  rows.forEach((piece, index) => {
    if (index) pdf.addPage([50, 70], "portrait");
    pdf.setDrawColor(20, 32, 45);
    pdf.setLineWidth(0.4);
    pdf.rect(2, 2, 46, 66);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.text("CASA DISEÑO MULTIESPACIO", 4, 6);
    pdf.setLineWidth(0.2);
    pdf.line(4, 8, 46, 8);
    pdf.setFontSize(8.5);
    pdf.text(fittedPdfText(pdf, state.project.clientName, 42), 4, 13);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6);
    pdf.text(`Proyecto: ${projectCode()}`, 4, 17);
    pdf.text(`Pieza: ${piece.code} · ${piece.unit}/${piece.quantity}`, 4, 21);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text(
      fittedPdfText(pdf, piece.name || "Elemento sin nombre", 42),
      4,
      26,
    );
    pdf.setFontSize(12);
    pdf.text(`${millimeters(piece.length)} × ${millimeters(piece.width)} mm`, 4, 33);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.8);
    const edgeLines = [
      ["top", "L1 · Superior"],
      ["bottom", "L2 · Inferior"],
      ["left", "A1 · Izquierdo"],
      ["right", "A2 · Derecho"],
    ];
    let y = 39;
    edgeLines.forEach(([side, label]) => {
      const edge = edgeBands.find((item) => item.id === piece.edges?.[side]);
      pdf.setFont("helvetica", edge ? "bold" : "normal");
      pdf.text(
        fittedPdfText(
          pdf,
          `${label}: ${
            edge
              ? `${edge.sku} · ${String(edge.thickness).replace(".", ",")} mm`
              : "sin tapacanto"
          }`,
          42,
        ),
        4,
        y,
      );
      y += 5;
    });
    const material = materials.find((item) => item.id === piece.materialId);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.5);
    pdf.text(
      fittedPdfText(
        pdf,
        `Tablero: ${material?.sku || "S/I"} · ${material?.name || ""}`,
        42,
      ),
      4,
      62,
    );
    pdf.text("Formato térmico 50 × 70 mm", 4, 66);
  });
  pdf.save(`Etiquetas_${projectCode()}.pdf`);
}

function exportLabelsCsv() {
  const headers = [
    "cliente",
    "codigo_proyecto",
    "codigo_pieza",
    "unidad",
    "nombre_elemento",
    "largo_mm",
    "ancho_mm",
    "tapacantos",
  ];
  const escapeCsv = (value) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = [
    headers.join(";"),
    ...labelRows().map((piece) =>
      [
        state.project.clientName,
        projectCode(),
        piece.code,
        `${piece.unit}/${piece.quantity}`,
        piece.name,
        piece.length,
        piece.width,
        piece.edgeDescription,
      ]
        .map(escapeCsv)
        .join(";"),
    ),
  ];
  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], {
    type: "text/csv;charset=utf-8",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Etiquetas_editables_${projectCode()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function dimensionLimits(grain, material = selectedMaterial()) {
  if (!material) {
    return {
      maxLength: 9999,
      maxWidth: 9999,
      note: "Selecciona un tablero para aplicar sus límites.",
    };
  }
  if (grain === "transversal") {
    return {
      maxLength: material.plateWidth,
      maxWidth: material.plateLength,
      note: `Máximo con veta transversal: ${material.plateWidth} × ${material.plateLength} mm.`,
    };
  }
  if (grain === "sin-veta") {
    const maximum = Math.max(material.plateLength, material.plateWidth);
    return {
      maxLength: maximum,
      maxWidth: maximum,
      note: `Debe caber en ${material.plateLength} × ${material.plateWidth} mm; se permite girar la pieza.`,
    };
  }
  return {
    maxLength: material.plateLength,
    maxWidth: material.plateWidth,
    note: `Máximo con veta longitudinal: ${material.plateLength} × ${material.plateWidth} mm.`,
  };
}

function updateDimensionInputs(
  grain,
  materialId = document.querySelector(
    '#piece-form select[name="materialId"]',
  )?.value,
) {
  const limits = dimensionLimits(grain, selectedMaterial(materialId));
  const lengthInput = document.querySelector('#piece-form input[name="length"]');
  const widthInput = document.querySelector('#piece-form input[name="width"]');
  const note = document.querySelector("#dimension-limit-note");
  if (lengthInput) lengthInput.max = String(limits.maxLength);
  if (widthInput) widthInput.max = String(limits.maxWidth);
  if (note) note.textContent = limits.note;
}

function addPiece(form) {
  const data = new FormData(form);
  const length = Number(data.get("length"));
  const width = Number(data.get("width"));
  const quantity = Number(data.get("quantity"));
  const grain = String(data.get("grain") || "sin-veta");
  const materialId = String(data.get("materialId") || "");
  const material = selectedMaterial(materialId);
  if (length <= 0 || width <= 0 || quantity <= 0) {
    notify("Revisa los datos obligatorios de la pieza.", "error");
    return;
  }
  if (!material || !state.materialIds.includes(material.id)) {
    notify("Selecciona un tablero válido para la pieza.", "error");
    return;
  }
  if (!pieceFitsMaterial({ length, width, grain }, material)) {
    notify(
      `La pieza no cabe en la plancha de ${material.plateLength} × ${material.plateWidth} mm con la veta seleccionada.`,
      "error",
    );
    return;
  }
  state.defaultGrain = grain;
  state.pieces.push({
    id: crypto.randomUUID(),
    code: "",
    name: String(data.get("name")).trim(),
    length,
    width,
    quantity,
    grain: state.defaultGrain,
    materialId: material.id,
    notes: String(data.get("notes") || "").trim(),
    edges: { top: null, right: null, bottom: null, left: null },
  });
  notify("Pieza agregada.");
}

function updatePieceField(target) {
  const piece = state.pieces.find((item) => item.id === target.dataset.id);
  if (!piece) return;
  const field = target.dataset.pieceField;
  const previous = piece[field];
  const value = Number(target.value);
  const isQuantity = field === "quantity";
  if (
    !["length", "width", "quantity"].includes(field) ||
    !Number.isFinite(value) ||
    value < 1 ||
    (isQuantity && !Number.isInteger(value))
  ) {
    target.value = String(previous);
    notify(
      isQuantity
        ? "La cantidad debe ser un número entero mayor que cero."
        : "La dimensión debe ser mayor que cero.",
      "error",
    );
    return;
  }
  const material = materials.find((item) => item.id === piece.materialId);
  const candidate = { ...piece, [field]: value };
  if (!isQuantity && !pieceFitsMaterial(candidate, material)) {
    target.value = String(previous);
    notify(
      `La pieza no cabe en la plancha de ${material?.plateLength || 0} × ${
        material?.plateWidth || 0
      } mm con la veta seleccionada.`,
      "error",
    );
    return;
  }
  piece[field] = value;
  latestResult = null;
  notify(
    isQuantity
      ? `Cantidad de ${piece.code || piece.name || "la pieza"} actualizada.`
      : `Dimensiones de ${piece.code || piece.name || "la pieza"} actualizadas.`,
  );
}

function normalizeHeader(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pick(row, names) {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]),
  );
  return names.map(normalizeHeader).map((name) => normalized[name]).find((value) => value !== undefined);
}

async function importExcel(file) {
  try {
    const table = await readXlsxFile(file);
    if (!table.length) throw new Error("La hoja de piezas está vacía.");
    const headers = table[0].map((value) => String(value || ""));
    const rows = table.slice(1).map((row) =>
      Object.fromEntries(
        headers.map((header, index) => [header, row[index] ?? ""]),
      ),
    );
    const valid = [];
    const errors = [];
    rows.forEach((row, index) => {
      const rawCode = pick(row, [
        "codigo",
        "código",
        "codigo opcional",
        "code",
      ]);
      const rawName = pick(row, [
        "nombre o codigo del elemento",
        "nombre o código del elemento",
        "nombre elemento opcional",
        "nombre del elemento opcional",
        "nombre opcional",
        "nombre",
        "pieza",
        "name",
      ]);
      const rawLength = pick(row, ["largo", "length"]);
      const rawWidth = pick(row, ["ancho", "width"]);
      const rawQuantity = pick(row, ["cantidad", "qty"]);
      const rawMaterialReference = pick(row, [
        "codigo material auto",
        "codigo material",
        "código material",
        "codigo material opcional",
        "material",
        "sku material",
      ]);
      const rawMaterialSelection = pick(row, [
        "tablero seleccion",
        "tablero seleccionado",
        "seleccion tablero",
        "producto tablero",
      ]);
      const rawGrain = pick(row, ["veta", "grain"]);
      const rawNotes = pick(row, ["notas", "nota", "notes"]);
      const rawEdgeTypes = {
        top: pick(row, ["l1 tipo tapacanto", "tipo tapacanto l1"]),
        bottom: pick(row, ["l2 tipo tapacanto", "tipo tapacanto l2"]),
        left: pick(row, [
          "a1 tipo tapacanto",
          "tipo tapacanto a1",
          "l4 tipo tapacanto",
        ]),
        right: pick(row, [
          "a2 tipo tapacanto",
          "tipo tapacanto a2",
          "l3 tipo tapacanto",
        ]),
      };
      const rawEdgeSelections = {
        top: pick(row, [
          "l1 tapacanto",
          "tapacanto l1",
          "tapacanto lado l1",
          "tapacanto superior",
        ]),
        bottom: pick(row, [
          "l2 tapacanto",
          "tapacanto l2",
          "tapacanto lado l2",
          "tapacanto inferior",
        ]),
        left: pick(row, [
          "a1 tapacanto",
          "tapacanto a1",
          "tapacanto lado a1",
          "l4 tapacanto",
          "tapacanto l4",
          "tapacanto izquierdo",
        ]),
        right: pick(row, [
          "a2 tapacanto",
          "tapacanto a2",
          "tapacanto lado a2",
          "l3 tapacanto",
          "tapacanto l3",
          "tapacanto derecho",
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
        return;
      }
      const code = String(
        rawCode || "",
      ).trim();
      const name = String(
        rawName || "",
      ).trim();
      const length = Number(rawLength);
      const width = Number(rawWidth);
      const quantity = Number(rawQuantity);
      const materialReference = String(
        rawMaterialReference || "",
      ).trim();
      const materialSelection = String(rawMaterialSelection || "").trim();
      const chosenMaterials = selectedMaterials();
      const material =
        resolveCatalogReference(
          chosenMaterials,
          materialSelection,
          materialImportLabel,
        ) ||
        resolveCatalogReference(
          chosenMaterials,
          materialReference,
          materialImportLabel,
        ) ||
        (!materialSelection && !materialReference ? selectedMaterial() : null);
      const normalizedGrain = normalizeHeader(rawGrain || "sin-veta");
      const grain = normalizedGrain.startsWith("long")
        ? "longitudinal"
        : normalizedGrain.startsWith("trans")
          ? "transversal"
          : "sin-veta";
      if (length <= 0 || width <= 0 || quantity <= 0) {
        errors.push(`Fila ${index + 2}: faltan medidas o cantidad.`);
        return;
      }
      if (!material) {
        errors.push(
          `Fila ${index + 2}: el código de material no corresponde a un tablero seleccionado.`,
        );
        return;
      }
      if (!pieceFitsMaterial({ length, width, grain }, material)) {
        errors.push(
          `Fila ${index + 2}: la pieza excede la plancha ${material.plateLength} × ${material.plateWidth} mm para la veta indicada.`,
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
          String(type || "").trim() &&
          !String(rawEdgeSelections[side] || "").trim(),
      );
      if (incompleteEdge) {
        const sideLabels = {
          top: "L1",
          bottom: "L2",
          left: "A1",
          right: "A2",
        };
        errors.push(
          `Fila ${index + 2}: selecciona el producto de tapacanto ${sideLabels[incompleteEdge[0]]}.`,
        );
        return;
      }
      const invalidEdge = Object.entries(rawEdgeSelections).find(
        ([side, reference]) => {
          const value = String(reference || "").trim();
          if (!value) return false;
          const edge = resolveCatalogReference(
            edgeBands,
            value,
            edgeImportLabel,
          );
          if (!edge) return true;
          importedEdges[side] = edge.id;
          return false;
        },
      );
      if (invalidEdge) {
        const sideLabels = {
          top: "L1",
          bottom: "L2",
          left: "A1",
          right: "A2",
        };
        errors.push(
          `Fila ${index + 2}: el tapacanto ${sideLabels[invalidEdge[0]]} no existe en el catálogo.`,
        );
        return;
      }
      valid.push({
        id: crypto.randomUUID(),
        code,
        name,
        length,
        width,
        quantity,
        grain,
        materialId: material.id,
        notes: String(rawNotes || ""),
        edges: importedEdges,
      });
    });
    state.importPreview = { rows: valid, errors, fileName: file.name };
    render();
  } catch (error) {
    notify(
      error.message || "No fue posible leer el archivo. Revisa el formato.",
      "error",
    );
  }
}

function normalizeImportedRole(value) {
  const role = normalizeHeader(value);
  if (["admin", "administrador"].includes(role)) return "admin";
  if (role === "comercial") return "comercial";
  if (role === "produccion") return "produccion";
  if (role === "cliente") return "cliente";
  return "";
}

function parseImportedActive(value) {
  const normalized = normalizeHeader(value);
  if (!normalized || ["si", "true", "1", "activo", "active", "yes"].includes(normalized)) {
    return true;
  }
  if (["no", "false", "0", "inactivo", "inactive"].includes(normalized)) {
    return false;
  }
  return null;
}

async function importUsersExcel(file) {
  try {
    const table = await readXlsxFile(file);
    if (!table.length) {
      throw new Error("La hoja Usuarios está vacía.");
    }
    const headers = (table[0] || []).map((value) => String(value || ""));
    const rows = table.slice(1).map((row) =>
      Object.fromEntries(
        headers.map((header, index) => [header, row[index] ?? ""]),
      ),
    );
    const valid = [];
    const errors = [];
    const importedEmails = new Set();
    const registeredEmails = new Set(
      usersCache.map((user) => String(user.email || "").trim().toLowerCase()),
    );

    rows.forEach((row, index) => {
      const sourceRow = index + 2;
      const values = Object.values(row).map((value) => String(value ?? "").trim());
      if (!values.some(Boolean)) return;

      const fullName = String(
        pick(row, ["nombre_completo", "nombre completo", "nombre", "full name"]) || "",
      ).trim();
      const email = String(
        pick(row, ["correo", "email", "correo electronico"]) || "",
      )
        .trim()
        .toLowerCase();
      const role = normalizeImportedRole(pick(row, ["perfil", "rol", "role"]));
      const clientName = String(
        pick(row, [
          "cliente_empresa",
          "cliente empresa",
          "empresa",
          "cliente",
          "client name",
        ]) || "",
      ).trim();
      const password = String(
        pick(row, [
          "clave_temporal",
          "clave temporal",
          "clave",
          "password",
        ]) || "",
      );
      const active = parseImportedActive(
        pick(row, ["activo", "active", "estado"]),
      );
      const rowErrors = [];

      if (fullName.length < 2) rowErrors.push("falta el nombre completo");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        rowErrors.push("el correo no es válido");
      }
      if (!role) rowErrors.push("el perfil no es válido");
      if (password.length < 10) {
        rowErrors.push("la clave temporal debe tener al menos 10 caracteres");
      }
      if (active === null) rowErrors.push("activo debe indicar sí o no");
      if (importedEmails.has(email)) rowErrors.push("el correo está repetido en el archivo");
      if (registeredEmails.has(email)) rowErrors.push("el correo ya está registrado");

      if (rowErrors.length) {
        errors.push(`Fila ${sourceRow}: ${rowErrors.join("; ")}.`);
        return;
      }
      importedEmails.add(email);
      valid.push({
        sourceRow,
        fullName,
        email,
        role,
        clientName,
        password,
        active,
      });
    });

    bulkUserPreview = { rows: valid, errors };
    render();
  } catch (error) {
    notify(
      error.message || "No fue posible leer el archivo de usuarios.",
      "error",
    );
  }
}

function fittedPdfText(pdf, value, maxWidth) {
  const text = String(value || "");
  if (pdf.getTextWidth(text) <= maxWidth) return text;
  let shortened = text;
  while (
    shortened.length > 1 &&
    pdf.getTextWidth(`${shortened}…`) > maxWidth
  ) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}…`;
}

function addPdfTable(
  pdf,
  { title, subtitle, columns, rows, useCurrentPage = false },
) {
  const margin = 12;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const rowHeight = 6.2;
  let pageIndex = 0;
  let y = 0;
  let columnPositions = [];

  const startPage = () => {
    if (!useCurrentPage || pageIndex > 0) {
      pdf.addPage("a4", "landscape");
    }
    pageIndex += 1;
    pdf.setFillColor(23, 50, 77);
    pdf.rect(0, 0, pageWidth, 28, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text("CASA DISEÑO MULTIESPACIO", margin, 9);
    pdf.setFontSize(14);
    pdf.text(
      pageIndex > 1 ? `${title} · CONTINUACIÓN` : title,
      margin,
      17,
    );
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    const projectLine = `Proyecto: ${
      state.project.projectName || "Sin nombre"
    } · Cliente: ${state.project.clientName || "Sin identificar"} · Cotización: ${
      state.projectId
    } · Estado: ${statusLabels[state.project.status]}`;
    pdf.text(fittedPdfText(pdf, projectLine, pageWidth - margin * 2), margin, 23);
    pdf.setTextColor(46, 58, 69);
    pdf.setFontSize(8);
    pdf.text(fittedPdfText(pdf, subtitle, pageWidth - margin * 2), margin, 32);

    y = 36;
    pdf.setFillColor(226, 230, 233);
    pdf.rect(margin, y, pageWidth - margin * 2, 7, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.setTextColor(37, 49, 60);
    let x = margin;
    columnPositions = columns.map((column) => {
      const position = { ...column, x };
      const textX =
        column.align === "right" ? x + column.width - 1.5 : x + 1.5;
      pdf.text(column.title, textX, y + 4.8, {
        align: column.align || "left",
      });
      x += column.width;
      return position;
    });
    y += 7;
  };

  startPage();
  rows.forEach((row, index) => {
    if (y + rowHeight > pageHeight - 8) {
      startPage();
    }
    if (index % 2) {
      pdf.setFillColor(247, 248, 248);
      pdf.rect(margin, y, pageWidth - margin * 2, rowHeight, "F");
    }
    pdf.setDrawColor(222, 226, 229);
    pdf.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.2);
    pdf.setTextColor(37, 49, 60);
    columnPositions.forEach((column) => {
      const rawValue =
        typeof column.value === "function"
          ? column.value(row)
          : row[column.key] ?? "";
      const text = fittedPdfText(pdf, rawValue, column.width - 3);
      const textX =
        column.align === "right"
          ? column.x + column.width - 1.5
          : column.x + 1.5;
      pdf.text(text, textX, y + 4.2, {
        align: column.align || "left",
      });
    });
    y += rowHeight;
  });
}

function exportPdf() {
  if (!latestResult?.plates.length) {
    notify("No hay placas para exportar.", "error");
    return;
  }
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  pdf.setProperties({
    title: `Plano de corte · ${state.project.projectName || state.project.clientName}`,
    subject: "Listado de piezas optimizadas y planos de corte",
    author: "Casa Diseño Multiespacio",
  });
  const generalRows = optimizedPieceList().map((row) => {
    const material = materials.find((item) => item.id === row.materialId);
    return {
      piece: `${row.code}${row.name ? ` · ${row.name}` : ""}`,
      material: `${material?.sku || "S/I"} · ${material?.name || ""}`,
      finished: `${millimeters(row.finishedLength)}×${millimeters(
        row.finishedWidth,
      )}`,
      cut: `${millimeters(row.cutLength)}×${millimeters(row.cutWidth)}`,
      requested: String(row.requestedQuantity),
      optimized: String(row.optimizedQuantity),
      plates: row.plates.join(" · ") || "Sin ubicación",
    };
  });
  addPdfTable(pdf, {
    title: "LISTADO GENERAL DE PIEZAS OPTIMIZADAS",
    subtitle: `${generalRows.length} línea(s) · ${generalRows.reduce(
      (sum, row) => sum + Number(row.optimized || 0),
      0,
    )} pieza(s) ubicadas · Medidas en mm`,
    useCurrentPage: true,
    columns: [
      { title: "CÓDIGO / ELEMENTO", key: "piece", width: 58 },
      { title: "TABLERO", key: "material", width: 52 },
      { title: "TERMINADA", key: "finished", width: 28 },
      { title: "CORTE", key: "cut", width: 28 },
      {
        title: "SOLIC.",
        key: "requested",
        width: 18,
        align: "right",
      },
      {
        title: "OPTIM.",
        key: "optimized",
        width: 18,
        align: "right",
      },
      { title: "PLACA(S)", key: "plates", width: 71 },
    ],
    rows: generalRows,
  });

  latestResult.plates.forEach((plate, index) => {
    pdf.addPage("a4", "landscape");
    const canvas = document.querySelector(`#plan-${plate.index}`);
    const imageWidth = 283;
    const imageHeight = (canvas.height / canvas.width) * imageWidth;
    pdf.addImage(
      canvas.toDataURL("image/png"),
      "PNG",
      7,
      (210 - imageHeight) / 2,
      imageWidth,
      imageHeight,
    );
    const plateRows = summarizePlatePieces(plate).map((row) => ({
      piece: `${row.code}${row.name ? ` · ${row.name}` : ""}`,
      finished: `${millimeters(row.finishedLength)}×${millimeters(
        row.finishedWidth,
      )}`,
      cut: `${millimeters(row.cutLength)}×${millimeters(row.cutWidth)}`,
      quantity: String(row.quantity),
      grain: grainLabels[row.grain] || row.grain,
    }));
    addPdfTable(pdf, {
      title: `PIEZAS DE PLACA ${plate.materialPlateIndex} · ${plate.material.sku}`,
      subtitle: `${plate.material.brand} ${plate.material.name} · ${
        plate.material.plateLength
      }×${plate.material.plateWidth}×${
        plate.material.thickness
      } mm · ${plate.pieces.length} pieza(s)`,
      columns: [
        { title: "CÓDIGO / ELEMENTO", key: "piece", width: 91 },
        { title: "MEDIDA TERMINADA", key: "finished", width: 48 },
        { title: "MEDIDA DE CORTE", key: "cut", width: 48 },
        {
          title: "CANTIDAD",
          key: "quantity",
          width: 28,
          align: "right",
        },
        { title: "VETA", key: "grain", width: 58 },
      ],
      rows: plateRows,
    });
    const leftoverRows = summarizePlateLeftovers(plate).map((leftover) => ({
      code: leftover.code,
      dimensions: `${millimeters(leftover.width)}×${millimeters(
        leftover.height,
      )}`,
      area: `${leftover.area.toLocaleString("es-CL", {
        maximumFractionDigits: 2,
      })} m²`,
      board: `${plate.material.sku} · Placa ${plate.materialPlateIndex}`,
    }));
    if (leftoverRows.length) {
      addPdfTable(pdf, {
        title: `RETAZOS DE PLACA ${plate.materialPlateIndex} · ${plate.material.sku}`,
        subtitle:
          "Retazos reutilizables codificados · medidas en mm · verificar dimensiones antes de almacenar",
        columns: [
          { title: "CÓDIGO RETAZO", key: "code", width: 65 },
          { title: "MEDIDAS", key: "dimensions", width: 55 },
          { title: "ÁREA", key: "area", width: 45 },
          { title: "ORIGEN", key: "board", width: 108 },
        ],
        rows: leftoverRows,
      });
    }
  });
  pdf.save(
    `Plano_Corte_${state.project.projectName.replace(/[^a-z0-9]+/gi, "_") || "Proyecto"}.pdf`,
  );
}

app.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.id === "piece-form") {
    addPiece(form);
    return;
  }
  if (form.id === "force-password-form") {
    const data = Object.fromEntries(new FormData(form));
    auth.error = "";
    if (data.password !== data.passwordConfirmation) {
      auth.error = "Las claves no coinciden.";
      render();
      return;
    }
    try {
      const payload = await api("/api/auth/change-password", {
        method: "POST",
        body: { password: data.password },
      });
      auth.user = payload.user;
      state = newQuoteState();
      await Promise.all([
        loadProjects(),
        loadCommercials(),
        loadUsers(),
        loadNotifications(),
      ]);
      state.view = "projects";
    } catch (error) {
      auth.error = error.message;
    }
    render();
    return;
  }
  if (
    form.id === "login-form" ||
    form.id === "setup-form" ||
    form.id === "register-form"
  ) {
    const data = Object.fromEntries(new FormData(form));
    auth.error = "";
    try {
      const endpoint =
        form.id === "setup-form"
          ? "/api/auth/setup"
          : form.id === "register-form"
            ? "/api/auth/register"
            : "/api/auth/login";
      const payload = await api(endpoint, { method: "POST", body: data });
      auth.user = payload.user;
      auth.csrfToken = payload.csrfToken;
      auth.needsSetup = false;
      auth.mode = "login";
      state = newQuoteState();
      if (!auth.user.mustChangePassword) {
        await Promise.all([
          loadProjects(),
          loadCommercials(),
          loadUsers(),
          loadNotifications(),
        ]);
        state.view = "projects";
      }
    } catch (error) {
      auth.error = error.message;
    }
    render();
    return;
  }
  if (form.id === "user-form") {
    const data = Object.fromEntries(new FormData(form));
    try {
      await api("/api/users", { method: "POST", body: data });
      await loadUsers();
      notify("Usuario creado correctamente.");
    } catch (error) {
      notify(error.message, "error");
    }
    return;
  }
  if (form.classList.contains("password-reset-form")) {
    const password = String(new FormData(form).get("password") || "");
    try {
      await api(`/api/users/${form.dataset.userId}`, {
        method: "PATCH",
        body: { password },
      });
      form.reset();
      notify("Clave actualizada.");
    } catch (error) {
      notify(error.message, "error");
    }
  }
});

app.addEventListener("input", (event) => {
  const target = event.target;
  if (target.dataset.project) {
    state.project[target.dataset.project] = target.value;
  }
  if (target.dataset.assignedTo !== undefined) {
    state.assignedTo = target.value;
  }
  if (target.id === "material-search") {
    state.productSearch = target.value;
    applyProductFilter(target.value);
  }
});

app.addEventListener("change", async (event) => {
  const target = event.target;
  if (target.dataset.pieceField) {
    updatePieceField(target);
    return;
  }
  if (target.name === "grain") {
    updateDimensionInputs(target.value);
  }
  if (target.name === "materialId" && target.closest("#piece-form")) {
    state.materialId = target.value;
    const grain =
      document.querySelector('#piece-form input[name="grain"]:checked')?.value ||
      state.defaultGrain;
    updateDimensionInputs(grain, target.value);
  }
  if (target.dataset.project === "rut") {
    state.project.rut = formatRut(target.value);
    target.value = state.project.rut;
  }
  if (target.id === "excel-file" && target.files?.[0]) {
    await importExcel(target.files[0]);
  }
  if (target.id === "user-excel-file" && target.files?.[0]) {
    await importUsersExcel(target.files[0]);
  }
  if (target.id === "product-images-zip" && target.files?.[0]) {
    const file = target.files[0];
    try {
      const response = await fetch("/api/material-images/import", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/zip",
          "x-csrf-token": auth.csrfToken,
        },
        body: file,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "No fue posible cargar las imágenes.");
      }
      imageImportResult = {
        imported: payload.imported?.length || 0,
        rejected: payload.rejected?.length || 0,
      };
      notify(
        `${imageImportResult.imported} imagen(es) de producto incorporada(s).`,
      );
    } catch (error) {
      notify(error.message, "error");
    }
  }
  if (target.dataset.pieceEdge) {
    const piece = state.pieces.find((item) => item.id === target.dataset.pieceEdge);
    if (piece) piece.edges[target.dataset.side] = target.value || null;
    render();
  }
  if (target.dataset.setting) {
    const maximum = target.dataset.setting.endsWith("Discount") ? 100 : Infinity;
    state.settings[target.dataset.setting] = Math.min(
      maximum,
      Math.max(0, Number(target.value) || 0),
    );
    render();
  }
  if (target.dataset.settingText) {
    state.settings[target.dataset.settingText] = target.value;
    render();
  }
  if (target.dataset.projectStatus) {
    const project = projectsCache.find(
      (item) => item.id === target.dataset.projectStatus,
    );
    if (project) {
      try {
        const payload = await api(`/api/projects/${project.id}`, {
          method: "PATCH",
          body: { ...project, project: { ...project.project, status: target.value } },
        });
        projectsCache = projectsCache.map((item) =>
          item.id === project.id ? payload.project : item,
        );
      } catch (error) {
        notify(error.message, "error");
      }
      render();
    }
  }
  if (target.dataset.userRole) {
    try {
      await api(`/api/users/${target.dataset.userRole}`, {
        method: "PATCH",
        body: { role: target.value },
      });
      await loadUsers();
      notify("Perfil actualizado.");
    } catch (error) {
      notify(error.message, "error");
    }
  }
});

app.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const action = button.dataset.action;
  if (button.dataset.category) {
    state.categoryId = button.dataset.category;
    render();
    return;
  }
  if (button.dataset.material) {
    const materialId = button.dataset.material;
    if (state.materialIds.includes(materialId)) {
      if (state.pieces.some((piece) => piece.materialId === materialId)) {
        notify(
          "No puedes quitar un tablero que ya tiene piezas asignadas.",
          "error",
        );
        return;
      }
      state.materialIds = state.materialIds.filter((id) => id !== materialId);
      if (state.materialId === materialId) {
        state.materialId = state.materialIds[0] || "";
      }
    } else {
      state.materialIds.push(materialId);
      state.materialId = materialId;
    }
    render();
    return;
  }
  if (action === "next") moveStep(1);
  if (action === "back") moveStep(-1);
  if (action === "new") {
    state = newQuoteState();
    render();
  }
  if (action === "toggle-access") {
    auth.mode = auth.mode === "register" ? "login" : "register";
    auth.error = "";
    render();
  }
  if (action === "projects") {
    try {
      await loadProjects();
    } catch (error) {
      notify(error.message, "error");
    }
    state.view = "projects";
    render();
  }
  if (action === "users" && auth.user?.role === "admin") {
    try {
      await loadUsers();
      state.view = "users";
      render();
    } catch (error) {
      notify(error.message, "error");
    }
  }
  if (
    action === "notifications" &&
    ["admin", "comercial", "produccion"].includes(auth.user?.role)
  ) {
    try {
      await Promise.all([loadNotifications(), loadProjects()]);
      state.view = "notifications";
      render();
    } catch (error) {
      notify(error.message, "error");
    }
  }
  if (action === "logout") {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // La sesión local se limpia incluso si ya venció en el servidor.
    }
    auth.user = null;
    auth.csrfToken = "";
    auth.error = "";
    projectsCache = [];
    usersCache = [];
    notificationsCache = [];
    commercialsCache = [];
    bulkUserPreview = null;
    state = emptyState();
    render();
  }
  if (action === "step") {
    state.view = "quote";
    state.step = Number(button.dataset.step);
    render();
  }
  if (action === "remove-piece") {
    state.pieces = state.pieces.filter((piece) => piece.id !== button.dataset.id);
    render();
  }
  if (action === "remove-material") {
    const materialId = button.dataset.id;
    if (state.pieces.some((piece) => piece.materialId === materialId)) {
      notify("Primero elimina o reasigna las piezas de ese tablero.", "error");
      return;
    }
    state.materialIds = state.materialIds.filter((id) => id !== materialId);
    if (state.materialId === materialId) {
      state.materialId = state.materialIds[0] || "";
    }
    render();
  }
  if (action === "confirm-import" && state.importPreview) {
    state.pieces.push(...state.importPreview.rows);
    state.importPreview = null;
    notify("Filas válidas incorporadas.");
  }
  if (action === "confirm-user-import" && bulkUserPreview?.rows.length) {
    try {
      const payload = await api("/api/users/bulk", {
        method: "POST",
        body: { users: bulkUserPreview.rows },
      });
      await loadUsers();
      const serverErrors = (payload.errors || []).map(
        (item) =>
          `Fila ${item.row}${item.email ? ` · ${item.email}` : ""}: ${item.error}`,
      );
      bulkUserPreview = serverErrors.length
        ? { rows: [], errors: serverErrors }
        : null;
      notify(
        `${payload.created?.length || 0} usuario(s) creado(s)${
          serverErrors.length ? `; ${serverErrors.length} fila(s) con error.` : "."
        }`,
        serverErrors.length ? "error" : "success",
      );
    } catch (error) {
      notify(error.message, "error");
    }
  }
  if (action === "apply-all") {
    const edgeId = document.querySelector("#global-edge")?.value || null;
    state.pieces.forEach((piece) => {
      piece.edges = { top: edgeId, right: edgeId, bottom: edgeId, left: edgeId };
    });
    render();
  }
  if (action === "clear-edges") {
    state.pieces.forEach((piece) => {
      piece.edges = { top: null, right: null, bottom: null, left: null };
    });
    render();
  }
  if (action === "save") await saveProject();
  if (action === "pdf") exportPdf();
  if (action === "labels-pdf") exportLabelsPdf();
  if (action === "labels-csv") exportLabelsCsv();
  if (action === "open-project") {
    if (button.dataset.notificationId) {
      try {
        const payload = await api(
          `/api/notifications/${button.dataset.notificationId}/read`,
          { method: "POST" },
        );
        notificationsCache = notificationsCache.map((notification) =>
          notification.id === payload.notification.id
            ? payload.notification
            : notification,
        );
      } catch (error) {
        notify(error.message, "error");
        return;
      }
    }
    const item = projectsCache.find((project) => project.id === button.dataset.id);
    if (item) {
      const defaults = emptyState();
      const materialIds = [
        ...new Set(
          [
            ...(Array.isArray(item.materialIds) ? item.materialIds : []),
            item.materialId,
            ...(item.pieces || []).map((piece) => piece.materialId),
          ].filter((id) => materials.some((material) => material.id === id)),
        ),
      ];
      const primaryMaterialId =
        materialIds.includes(item.materialId) ? item.materialId : materialIds[0];
      state = {
        ...defaults,
        ...item,
        project: { ...item.project },
        assignedTo: item.assignedTo || "",
        materialId: primaryMaterialId || "",
        materialIds,
        settings: { ...defaults.settings, ...(item.settings || {}) },
        pieces: (item.pieces || []).map((piece) => ({
          ...piece,
          materialId: piece.materialId || primaryMaterialId || "",
          edges: {
            top: null,
            right: null,
            bottom: null,
            left: null,
            ...(piece.edges || {}),
          },
        })),
        view: "quote",
        step: 4,
      };
      render();
    }
  }
  if (action === "mark-notification") {
    try {
      const payload = await api(`/api/notifications/${button.dataset.id}/read`, {
        method: "POST",
      });
      notificationsCache = notificationsCache.map((notification) =>
        notification.id === payload.notification.id
          ? payload.notification
          : notification,
      );
      render();
    } catch (error) {
      notify(error.message, "error");
    }
  }
  if (action === "mark-production") {
    const project = projectsCache.find((item) => item.id === button.dataset.id);
    if (project) {
      try {
        const payload = await api(`/api/projects/${project.id}`, {
          method: "PATCH",
          body: {
            ...project,
            project: { ...project.project, status: "produccion" },
          },
        });
        projectsCache = projectsCache.map((item) =>
          item.id === project.id ? payload.project : item,
        );
        notify("Orden marcada en Producción.");
      } catch (error) {
        notify(error.message, "error");
      }
    }
  }
  if (action === "toggle-user") {
    try {
      await api(`/api/users/${button.dataset.id}`, {
        method: "PATCH",
        body: { active: button.dataset.active !== "true" },
      });
      await loadUsers();
      render();
    } catch (error) {
      notify(error.message, "error");
    }
  }
});

async function initialize() {
  render();
  try {
    const setup = await api("/api/auth/setup-status");
    auth.needsSetup = setup.needsSetup;
    if (!setup.needsSetup) {
      try {
        const session = await api("/api/auth/me");
        auth.user = session.user;
        auth.csrfToken = session.csrfToken;
        if (!auth.user.mustChangePassword) {
          await Promise.all([
            loadProjects(),
            loadCommercials(),
            loadUsers(),
            loadNotifications(),
          ]);
          state.view = "projects";
        }
      } catch {
        auth.user = null;
      }
    }
  } catch (error) {
    auth.error = `${error.message} Revisa la configuración del servicio y la base de datos.`;
    auth.needsSetup = false;
  } finally {
    auth.loading = false;
    render();
  }
}

initialize();

window.setInterval(async () => {
  if (!["admin", "comercial", "produccion"].includes(auth.user?.role)) return;
  try {
    await loadNotifications();
    if (state.view === "notifications") {
      render();
      return;
    }
    const badge = document.querySelector(".notification-badge");
    if (badge) {
      const unread = unreadNotifications();
      badge.textContent = String(unread);
      badge.hidden = unread === 0;
    }
  } catch {
    // La próxima consulta vuelve a intentarlo sin interrumpir el trabajo actual.
  }
}, 60_000);
