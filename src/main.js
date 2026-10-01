import './v51.css';
import {v51,attachV51,crm51View,management51View,catalog51View,searchForm,filteredProjects} from './v51-ui.js';
import {internalUser,kerfValue,updateQuoteProducts,serviceKeyFor} from './v51-domain.js';
import "./style.css";
import "./v5.css";
import { V5, ROLE_LABELS, permitted, calculationSignature, taxonomyPaths } from './v5-domain.js';
import { v5, attachV5, loadV5, importerView, dashboardView, groupedProjectsView, dispatchView, configurationView, catalogManagementView } from './v5-ui.js';
import { jsPDF } from "jspdf";
import readWorkbook, { readSheet } from "read-excel-file/browser";

import {
  categories,
  edgeBands,
  grainLabels,
  materials,
  sides,
  statusLabels,
} from "./client-data.js";
import {
  assignPieceCodes,
  CALCULATION_VERSION,
  clp,
  createEdgeCodeMap,
  cutDimensions,
  cutRateForMaterial,
  drawCutPlan,
  finishedDimensions,
  formatRut,
  isNeolithMaterial,
  MINIMUM_CUT_SIDE,
  parsePieceImportTable,
  optimizeProject,
  pieceFitsMaterial,
  pieceProductionError,
  summarizeOptimizedPieces,
  summarizePlateLeftovers,
  summarizePlatePieces,
  usablePlateDimensions,
  validateRut,
} from "./logic.js";

const app = document.querySelector("#app");
const steps = [
  ["Tipo y proyecto", "Maderas o piedras"],
  ["Material y piezas", "Selección e ingreso"],
  ["Revisión", "Listado de piezas"],
  ["Terminaciones", "Configuración por lado"],
  ["Optimización", "Plano y subtotales"],
];

function emptyState() {
  return {
    view: "quote",
    step: 0,
    productionPeriod: "week",
    projectId: crypto.randomUUID(),
    project: {
      projectName: "",
      clientName: "",
      rut: "",
      status: "cotizacion",
      projectAddress: "",
    },
    invoiceNumber: "",
    dispatchGuideNumber: "",
    contact: {
      name: "",
      email: "",
      phone: "",
      city: "",
    },
    submissionSource: "usuario",
    visitorSubmitted: false,
    visitorQuoteId: "",
    assignedTo: "",
    collaboratorIds: [],
    workType: "",
    categoryId: "",
    catalogKind: "boards",
    catalogEdgeGroup: "",
    catalogAdminKind: "board",
    catalogAdminSearch: "",
    catalogEditingId: "",
    materialId: "",
    materialIds: [],
    productSearch: "",
    pieceEntryMode: "paste",
    defaultGrain: "longitudinal",
    pieces: [],
    materialCustomizations: {},
    edgeCodeMap: {},
    settings: {
      calculationVersion: V5,
      kerf: 3,
      perimeterTrim: 10,
      neolithTrim: 30,
      melamineCutRate: 7500,
      specialCutRate: 10500,
      stoneCutPerPlateRate: 75000,
      stoneBevelRate: 12500,
      stoneMiter45Rate: 7500,
      // Alias conservados para abrir sin pérdida proyectos V4.0.
      neolithLinearRate: 75000,
      neolithBevelRate: 12500,
      neolithMiter45Rate: 7500,
      optimizationMode: "longitudinal",
      boardDiscount: 0,
      edgeDiscount: 0,
      servicesDiscount: 0,
    },
    importPreview: null,
    importPending: null,
    pastePreview: null,
    pastePending: null,
    pasteRawText: "",
    pasteColumns: [],
    pasteMapping: {},
    pasteTable: [],
    pasteConfig: {
      materialId: "",
      edgeId: "",
      defaultGrain: "longitudinal",
      measurementMode: "finished",
      sides: { top: true, bottom: false, left: false, right: false },
      edges: { top: "", bottom: "", left: "", right: "" },
      finishes: { top: "rough", bottom: "rough", left: "rough", right: "rough" },
    },
    message: null,
  };
}

let state = emptyState();
let latestResult = null;
let projectsCache = [];
let accessoriesCatalog = [];
let servicesCatalog = [];
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
  visitor: false,
};

const safe = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const userRoles = (user = auth.user) => {
  const roles = Array.isArray(user?.roles) ? user.roles : [user?.role];
  return [...new Set(roles.filter(Boolean))];
};
const hasRole = (role, user = auth.user) => userRoles(user).includes(role) || (role === "admin" && userRoles(user).includes("superadmin"));
const hasAnyRole = (roles, user = auth.user) =>
  roles.some((role) => hasRole(role, user));

const projectMaterial = (material) => {
  if (!material) return null;
  const customization = state.materialCustomizations?.[material.id] || {};
  if (!isNeolithMaterial(material)) return material;
  const color = material.customColor === false ? '' : String(customization.color || "").trim();
  const preservesV40Pricing = state.settings?.calculationVersion === "4.0";
  return {
    ...material,
    name: color || material.name,
    colorName: color,
    netPrice: preservesV40Pricing
      ? Math.max(0, Number(customization.netPrice ?? material.netPrice) || 0)
      : state.settings.calculationVersion==='5.1'&&state.settings.includeStoneMaterial?material.netPrice:0,
  };
};

const selectedMaterials = () => {
  const ids = state.materialIds?.length
    ? state.materialIds
    : state.materialId
      ? [state.materialId]
      : [];
  return ids
    .map((id) => projectMaterial(materials.find((item) => item.id === id)))
    .filter(Boolean);
};

const selectedMaterial = (id = state.materialId) =>
  projectMaterial(materials.find((item) => item.id === id)) || selectedMaterials()[0];

const materialImageUrl = (material) =>
  `/api/material-images/${encodeURIComponent(material?.imageKey || material?.sku || material?.id || "")}`;

const activeMaterials = () =>
  materials.filter((item) => item.active !== false);

const inferredWorkType = (materialIds = state.materialIds, pieces = state.pieces) => {
  const ids = [
    ...(Array.isArray(materialIds) ? materialIds : []),
    ...(Array.isArray(pieces) ? pieces.map((piece) => piece.materialId) : []),
  ].filter(Boolean);
  return ids.some((id) => isNeolithMaterial(materials.find((item) => item.id === id)))
    ? "slabs"
    : ids.length
      ? "boards"
      : "";
};

const isSlabQuote = () =>
  (state.workType || inferredWorkType()) === "slabs";

const quoteMaterials = () =>
  activeMaterials().filter((material) =>
    isSlabQuote()
      ? isNeolithMaterial(material)
      : !isNeolithMaterial(material),
  );

const activeEdgeBands = () =>
  edgeBands.filter((item) => item.active !== false);

function applyCatalogPayload(payload = {}) {
  accessoriesCatalog=payload.accessories||[];
  if (Array.isArray(payload.categories)) {
    categories.splice(0, categories.length, ...payload.categories);
  }
  if (Array.isArray(payload.materials)) {
    materials.splice(0, materials.length, ...payload.materials);
  }
  if (Array.isArray(payload.edgeBands)) {
    edgeBands.splice(0, edgeBands.length, ...payload.edgeBands);
  }
}

async function loadCatalog() {
  const payload=await api("/api/catalog");servicesCatalog=payload.services||[];
  applyCatalogPayload(payload);
}

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

async function uploadProductImage(sku, file) {
  if (!file?.size) return null;
  const response = await fetch(
    `/api/material-images/${encodeURIComponent(sku)}`,
    {
      method: "PUT",
      credentials: "same-origin",
      headers: {
        "content-type": file.type,
        "x-csrf-token": auth.csrfToken,
      },
      body: file,
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "No fue posible guardar la imagen.");
  }
  return payload;
}

async function loadProjects() {
  const payload = await api("/api/projects");
  projectsCache = payload.projects || [];
}

async function loadUsers() {
  if (!permitted(auth.user,"users")) return;
  const payload = await api("/api/users");
  usersCache = payload.users || [];
}

async function loadCommercials() {
  if (!auth.user && !auth.visitor) return;
  const payload = await api(
    auth.visitor ? "/api/public/commercials" : "/api/commercials",
  );
  commercialsCache = payload.commercials || [];
}

async function loadNotifications() {
  if (!hasAnyRole(["admin", "comercial", "produccion"])) return;
  const payload = await api("/api/notifications");
  notificationsCache = payload.notifications || [];
}

function unreadNotifications() {
  return notificationsCache.filter((notification) => !notification.readAt)
    .length;
}

function canCreateQuote() {
  return Boolean(
    auth.visitor ||
      hasAnyRole(["admin", "comercial", "cliente"]),
  );
}

function newQuoteState() {
  const fresh = emptyState();
  fresh.settings.kerf=v5.config.defaultKerf??3;
  for(const [key,policy] of Object.entries(v5.config.services))fresh.settings[key]=policy.price;
  if (hasRole("cliente")) {
    fresh.project.clientName =
      auth.user.clientName || auth.user.fullName || "";
    fresh.project.rut = auth.user.rut || "";
    fresh.project.projectAddress = auth.user.projectAddress || "";
    fresh.contact = {
      name: auth.user.fullName || "",
      email: auth.user.email || "",
      phone: auth.user.phone || "",
      city: auth.user.location || "",
    };
  }
  if (hasRole("comercial")) {
    fresh.assignedTo = auth.user.id;
  }
  return fresh;
}

function canEditCurrent() {
  if(state.readOnlyRevision) return false;
  if(hasRole("logistica") && ["despacho","entregado"].includes(state.project.status)) return true;
  if (auth.visitor) return !state.visitorSubmitted;
  if (!auth.user) return false;
  if (hasRole("admin")) return true;
  const productionCanEdit = hasRole("produccion") && [
      "facturado_pagado",
      "produccion",
      "despacho",
      "entregado",
    ].includes(state.project.status);
  const commercialCanEdit =
    hasRole("comercial") &&
    ["cotizacion", "facturacion"].includes(state.project.status);
  const clientCanEdit =
    hasRole("cliente") && state.project.status === "cotizacion";
  return productionCanEdit || commercialCanEdit || clientCanEdit;
}

function statusEntriesForRole(
  role = auth.user?.role,
  currentStatus = state.project.status,
) {
  const entries = Object.entries(statusLabels);
  const roles = role === auth.user?.role ? userRoles() : [role];
  if (roles.includes("admin") || roles.includes("superadmin")) return entries;
  if (!roles.length || roles.includes("cliente")) {
    return entries.filter(([value]) => value === "cotizacion");
  }
  const allowed = new Set([currentStatus]);
  if (roles.includes("logistica") && currentStatus==="despacho") allowed.add("entregado");
  if (roles.includes("produccion")) {
    if (currentStatus === "facturado_pagado") {
      allowed.add("produccion");
    } else if (currentStatus === "produccion") {
      allowed.add("despacho");
    } else if (currentStatus === "despacho") {
      allowed.add("entregado");
    }
  }
  if (roles.includes("comercial")) {
    if (currentStatus === "cotizacion") allowed.add("facturacion");
    if (currentStatus === "facturacion") allowed.add("facturado_pagado");
  }
  return entries.filter(([value]) => allowed.has(value));
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
    if (!state.workType) {
      notify("Selecciona si la cotización corresponde a Tableros (maderas) o Placas (piedras).", "error");
      return false;
    }
    if (
      auth.visitor &&
      (!state.contact.name.trim() ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.contact.email) ||
        state.contact.phone.trim().length < 7 ||
        !state.contact.city.trim())
    ) {
      notify("Completa nombre, correo, teléfono y ciudad.", "error");
      return false;
    }
    if (!state.project.clientName.trim()) {
      notify("Completa el nombre del cliente.", "error");
      return false;
    }
    if (state.project.rut.trim() && !validateRut(state.project.rut)) {
      notify("Ingresa un RUT chileno válido.", "error");
      return false;
    }
    if ((auth.visitor || hasRole("cliente")) && !state.assignedTo) {
      notify("Selecciona el comercial que atenderá tu cotización.", "error");
      return false;
    }
  }
  if (state.step === 1 && selectedMaterials().length === 0) {
    notify(
      isSlabQuote()
        ? "Selecciona al menos un formato de placa para el proyecto."
        : "Selecciona al menos un tablero para el proyecto.",
      "error",
    );
    return false;
  }
  if (
    state.step === 1 &&
    selectedMaterials().some((material) =>
      isSlabQuote()
        ? !isNeolithMaterial(material)
        : isNeolithMaterial(material),
    )
  ) {
    notify(
      "Los materiales seleccionados no corresponden al tipo de optimización. Sepáralos en cotizaciones distintas.",
      "error",
    );
    return false;
  }
  if (
    state.step === 1 &&
    selectedMaterials().some(
      (material) =>
        isNeolithMaterial(material) && material.customColor !== false &&
        !String(state.materialCustomizations?.[material.id]?.color || "").trim(),
    )
  ) {
    notify("Escribe el nombre del color para cada formato Neolith seleccionado.", "error");
    return false;
  }
  if (state.step === 2 && state.pieces.length === 0) {
    notify("Agrega al menos una pieza manualmente o pegando desde Excel.", "error");
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
  if(!canEditCurrent()){notify("Esta revisión es de consulta.","error");return false;}
  if (
    !state.project.clientName.trim() ||
    (state.project.rut.trim() && !validateRut(state.project.rut)) ||
    selectedMaterials().length === 0 ||
    state.pieces.length === 0
  ) {
    notify("Faltan datos obligatorios para guardar el proyecto.", "error");
    return false;
  }
  if (
    selectedMaterials().some((material) =>
      isSlabQuote()
        ? !isNeolithMaterial(material)
        : isNeolithMaterial(material),
    )
  ) {
    notify("No se pueden guardar tableros y piedras en una misma cotización.", "error");
    return false;
  }
  if (
    selectedMaterials().some(
      (material) =>
        isNeolithMaterial(material) && material.customColor !== false &&
        !String(state.materialCustomizations?.[material.id]?.color || "").trim(),
    )
  ) {
    notify("Falta escribir el color de una plancha Neolith.", "error");
    return false;
  }
  if ((auth.visitor || hasRole("cliente")) && !state.assignedTo) {
    notify("Selecciona un comercial antes de guardar.", "error");
    return false;
  }
  state.edgeCodeMap = createEdgeCodeMap(state.pieces, state.edgeCodeMap);
  const result = computeCurrentResult();
  const record = {
    id: state.projectId,
    groupId: state.groupId, quoteName: state.quoteName, comments: state.comments, expectedUpdatedAt:state.updatedAt,expectedRowVersion:state.rowVersion,
    project: state.project,
    workType: state.workType || inferredWorkType(),
    categoryId: state.categoryId,
    materialId: state.materialId,
    materialIds: state.materialIds,
    materialCustomizations: state.materialCustomizations,
    edgeCodeMap: state.edgeCodeMap,
    defaultGrain: state.defaultGrain,
    pieces: state.pieces,
    settings: state.settings,
    invoiceNumber: state.invoiceNumber,
    dispatchGuideNumber: state.dispatchGuideNumber,
    assignedTo: state.assignedTo || null,
    collaboratorIds: state.collaboratorIds || [],
    contact: state.contact,
    submissionSource: auth.visitor ? "visitante" : state.submissionSource,
    summary: result.summary,
  };
  if(state.loadedSignature===calculationSignature(state) && state.originalSettings) record.settings=state.originalSettings;
  try {
    if (auth.visitor) {
      const payload = await api("/api/public/quotes", {
        method: "POST",
        body: record,
      });
      state.visitorSubmitted = true;
      state.visitorQuoteId = payload.quote.id;
      if (showMessage) {
        notify(
          `Cotización ${projectCode(payload.quote.id)} enviada. Administración fue notificada.`,
        );
      }
      return true;
    }
    const exists = projectsCache.some((item) => item.id === state.projectId);
    const payload = await api(
      exists ? `/api/projects/${state.projectId}` : "/api/projects",
      { method: exists ? "PATCH" : "POST", body: record },
    );
    state.projectId = payload.project.id;
    for(const key of ['settings','summary','priceSnapshot','calculationSnapshot','revisionNo','groupId','history','updatedAt','rowVersion','milestones']) state[key]=payload.project[key];
    state.originalSettings=structuredClone(payload.project.settings);
    state.loadedSignature=calculationSignature(state);
    latestResult=payload.project.calculationSnapshot;
    const index = projectsCache.findIndex((item) => item.id === state.projectId);
    if (index >= 0) projectsCache[index] = payload.project;
    else projectsCache.unshift(payload.project);
    if (!exists && hasAnyRole(["admin", "comercial"])) {
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

function finishOptions(selected = "rough") {
  return [
    ["rough", "Sin adicional · corte bruto"],
    ["bevel", `Biselado o Pulido · ${clp(state.settings.stoneBevelRate ?? state.settings.neolithBevelRate)}/ml`],
    ["miter45", `Corte 45° · ${clp(state.settings.stoneMiter45Rate ?? state.settings.neolithMiter45Rate)}/ml`],
  ]
    .map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`)
    .join("");
}

const roleLabels = ROLE_LABELS;

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
                <label>Ciudad <small>Opcional</small><input name="location" autocomplete="address-level2" /></label>
                <label>Razón social <small>Solo si es empresa</small><input name="clientName" autocomplete="organization" /></label>
                <label>RUT empresa <small>Obligatorio si indica razón social</small><input name="rut" /></label>
                <label>Dirección de facturación <small>Obligatoria si es empresa</small><input name="billingAddress" autocomplete="street-address" /></label>
                <label>Giro comercial <small>Obligatorio si es empresa</small><input name="businessActivity" /></label>
                <label>Dirección del proyecto <em>*</em><input name="projectAddress" minlength="5" required /></label>`
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
                }</button>
                <button class="secondary" type="button" data-action="visitor-access">Ver catálogo y cotizar como visitante</button>`
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
  const quote=state.view==='quote';
  const title=quote?(state.workType==='slabs'?'Placas':'Tableros'):({dashboard:'Panel general',projects:'Proyectos',dispatch:'Despachos','v5-settings':'Configuración','v5-catalog':'Catálogo',users:'Usuarios',catalog:'Catálogo',production:'Agenda de pedidos',crm:'CRM de Producción',notifications:'Notificaciones'}[state.view]||'Casa Diseño');
  return `<div class="v5-shell"><header class="v5-topbar"><button class="v5-brand" data-v5="home"><img class="brand-logo" src="/logo-casa-diseno.png" alt="Casa Diseño"><span>GESTIÓN & PROYECTOS <b>V5.1</b></span></button><nav aria-label="Navegación general"><button data-v5="home" class="${state.view==='dashboard'?'active':''}">Panel</button>${auth.user?'<button data-v5="projects">Proyectos</button>':''}${internalUser(auth.user)?'<button data-v51="crm">CRM de Producción</button>':''}<button data-v5="module" data-module="boards">Tableros</button><button data-v5="module" data-module="slabs">Placas</button>${auth.user?'<button data-v5="module" data-module="dispatch">Despachos</button>':''}<button data-action="catalog">Catálogo</button>${permitted(auth.user,'catalog')?'<button data-v5="catalog-manage">Administración</button>':''}</nav><details class="v5-account"><summary>${safe(auth.user?.fullName||'Visitante')} ▾</summary><div><small>${userRoles().map(r=>roleLabels[r]).join(' · ')||'Venta sin descuento'}</small>${permitted(auth.user,'users')?'<button data-action="users">Usuarios y roles</button>':''}${permitted(auth.user,'settings')||permitted(auth.user,'catalog')?'<button data-v5="settings">Configuración</button>':''}${auth.user?'<button data-action="notifications">Notificaciones</button>':''}<button data-action="${auth.visitor?'visitor-exit':'logout'}">Cerrar sesión</button></div></details></header>
  <div class="v5-layout ${quote?'has-context':''}">${quote?`<aside class="v5-context"><p class="eyebrow">${title.toUpperCase()}</p><h3>${safe(state.project.projectName||'Nuevo proyecto')}</h3><p>${safe(state.quoteName||'Cotización')}</p><nav aria-label="Etapas de cotización">${steps.map(([label,subtitle],i)=>`<button class="step-link ${state.step===i?'active':''}" data-action="step" data-step="${i}"><span>${i+1}</span><b>${label}<small>${subtitle}</small></b></button>`).join('')}</nav><div class="v5-context-note"><b>R${state.revisionNo||1} · cálculo ${safe(state.settings.calculationVersion)}</b><p>Las modificaciones de medidas, veta, materiales y servicios generan una nueva revisión al guardar.</p>${state.readOnlyRevision?'<strong>Historial · solo consulta</strong>':''}</div></aside>`:''}<main class="v5-main"><header class="v5-page-header"><p class="eyebrow">${quote?'COTIZACIÓN / '+title.toUpperCase():'ESPACIO DE TRABAJO'}</p><h1>${quote?steps[state.step][0]:title}</h1>${quote?`<span class="status-pill">${statusLabels[state.project.status]}</span>`:''}</header><div class="workspace">${auth.user?searchForm():''}${content}</div></main></div>${state.message?`<div class="toast ${state.message.type}">${safe(state.message.text)}</div>`:''}</div>`;
}

function pieceImportPreview() {
  const preview = state.importPreview;
  if (!preview) return "";
  if (preview.status === "reading") {
    return `<div class="import-result reading" role="status" aria-live="polite">
      <b>Leyendo y validando ${safe(preview.fileName || "el archivo")}…</b>
      <span>Al terminar verás cuántas líneas y piezas están listas para incorporar.</span>
    </div>`;
  }

  const errors = preview.errors || [];
  const validCount = preview.validCount || preview.importedCount || 0;
  const totalUnits = preview.totalUnits || 0;
  const isReady = preview.status === "ready" && state.importPending?.rows?.length;
  const isImported = preview.status === "imported";
  const heading = isReady
    ? `${validCount} líneas listas · ${totalUnits} piezas`
    : isImported
      ? `${preview.importedCount || validCount} líneas incorporadas · ${totalUnits} piezas`
      : "No se encontraron piezas válidas";

  return `<div class="import-result ${errors.length || !validCount ? "warning" : ""}" aria-live="polite">
    <b>${safe(preview.fileName || "Archivo seleccionado")} · ${heading}</b>
    <span>Hoja: ${safe(preview.sheetName || "detectada automáticamente")} · Encabezados: fila ${preview.headerRow || "sin identificar"}</span>
    <div class="import-metrics">
      <i><b>${validCount}</b> líneas válidas</i>
      <i><b>${totalUnits}</b> piezas totales</i>
      <i><b>${preview.rejectedRows || 0}</b> rechazadas</i>
      <i><b>${preview.blankRows || 0}</b> vacías ignoradas</i>
    </div>
    ${
      isReady
        ? `<div class="import-confirm">
            <button class="primary" type="button" data-action="confirm-piece-import">Incorporar todas las piezas (${totalUnits})</button>
            <span>También se seleccionarán automáticamente los ${isSlabQuote() ? "formatos, vetas y acabados" : "tableros, vetas y tapacantos"} indicados en el Excel.</span>
          </div>`
        : isImported
          ? `<span><b>Listo.</b> Las piezas ya aparecen en el listado y están disponibles para optimizar.</span>`
          : ""
    }
    ${
      errors.length
        ? `<details ${validCount ? "" : "open"}><summary>Ver diagnóstico completo (${errors.length})</summary>
            <div class="import-errors"><table><thead><tr><th>Fila</th><th>Campo</th><th>Problema</th></tr></thead><tbody>
              ${(preview.issues || []).slice(0, 100).map((issue) => `<tr><td>${issue.row || "-"}</td><td>${safe(issue.field || "archivo")}</td><td>${safe(issue.message)}</td></tr>`).join("")}
            </tbody></table></div>
            <button class="ghost small" type="button" data-action="download-import-report">Descargar informe de errores</button>
          </details>`
        : validCount
          ? `<span>El archivo fue validado sin errores.</span>`
          : ""
    }
  </div>`;
}

function pasteMapFields() {
  const sideKind = isSlabQuote() ? "acabado" : "tapacanto";
  return [
    ["name", "Nombre / pieza"],
    ["quantity", "Cantidad *"],
    ["length", "Largo *"],
    ["width", "Ancho *"],
    ["grain", "Sentido de veta"],
    ["top", `L1 · ${sideKind}`],
    ["bottom", `L2 · ${sideKind}`],
    ["left", `A1 · ${sideKind}`],
    ["right", `A2 · ${sideKind}`],
  ];
}

function pasteMappingPanel() {
  if (!state.pasteColumns?.length) return "";
  const options = (selected) => [
    `<option value="">No usar</option>`,
    ...state.pasteColumns.map((column, index) => `<option value="${index}" ${String(index) === String(selected) ? "selected" : ""}>${safe(column || `Columna ${index + 1}`)}</option>`),
  ].join("");
  return `<section class="paste-mapping">
    <div><b>Asignar columnas del Excel</b><span>Confirma cómo debe leerse cada columna, aunque el cliente use nombres u orden distintos.</span></div>
    <div class="paste-mapping-grid">
      ${pasteMapFields().map(([field, label]) => `<label>${label}<select data-paste-map="${field}">${options(state.pasteMapping?.[field])}</select></label>`).join("")}
    </div>
  </section>`;
}

function pastedPiecesPreview() {
  const preview = state.pastePreview;
  if (!preview) return "";
  const ready = preview.status === "ready" && state.pastePending?.rows?.length;
  return `<div class="import-result ${preview.errors?.length ? "warning" : ""}" aria-live="polite">
    <b>${ready ? `${preview.validCount} líneas listas · ${preview.totalUnits} piezas` : "No fue posible interpretar el bloque pegado"}</b>
    <span>${safe(preview.formatMessage || "")}</span>
    ${
      ready
        ? `<div class="table-wrap paste-review-table"><table><thead><tr><th>Pieza</th><th>Medidas</th><th>Cant.</th><th>Veta</th><th>L1</th><th>L2</th><th>A1</th><th>A2</th></tr></thead><tbody>${state.pastePending.rows.map((piece, index) => {
            const material = selectedMaterial(piece.materialId);
            const neolith = isNeolithMaterial(material);
            const sideControl = (side) => neolith
              ? `<select data-paste-row-finish="${index}" data-side="${side}">${finishOptions(piece.finishes?.[side] || "rough")}</select>`
              : `<select data-paste-row-edge="${index}" data-side="${side}">${edgeOptions(piece.edges?.[side] || "")}</select>`;
            return `<tr><td>${safe(piece.name || `Pieza ${index + 1}`)}</td><td>${piece.length} × ${piece.width}</td><td>${piece.quantity}</td><td><select data-paste-row-grain="${index}">${["longitudinal", "transversal", "sin-veta"].map((grain) => `<option value="${grain}" ${piece.grain === grain ? "selected" : ""}>${grainLabels[grain]}</option>`).join("")}</select></td><td>${sideControl("top")}</td><td>${sideControl("bottom")}</td><td>${sideControl("left")}</td><td>${sideControl("right")}</td></tr>`;
          }).join("")}</tbody></table></div>
          <div class="import-confirm">
            <button class="primary" type="button" data-action="confirm-piece-paste">Incorporar este lote (${preview.totalUnits})</button>
            <span>Después podrás pegar otro bloque para un tablero o color diferente.</span>
          </div>`
        : `<span>${safe((preview.errors || ["Incluye encabezados Largo, Ancho y Cantidad."])[0])}</span>`
    }
  </div>`;
}

function pastePiecesPanel() { return importerView(v5Context()); }

function pieceImportPanel({ project = false } = {}) {
  return `<section class="card import-card ${project ? "project-import-card" : ""}">
    <div class="section-title"><span>▦</span><div><h3>Pegar listado desde Excel</h3><p>${isSlabQuote() ? "Copia las celdas del cliente y define veta y acabado de cada lado." : "Copia las celdas del cliente y define veta y un tapacanto distinto para cada lado si corresponde."}</p></div></div>
    ${pastePiecesPanel()}
  </section>`;
}

function manualPiecePanel() {
  const material = selectedMaterial();
  const neolith = isNeolithMaterial(material);
  const chosenMaterials = selectedMaterials();
  const limits = dimensionLimits(state.defaultGrain, material);
  return `<section class="card piece-entry-card">
    <div class="section-title"><span>＋</span><div><h3>Agregar pieza manualmente</h3><p>El nombre es opcional; el código se asigna recién al optimizar.</p></div></div>
    <form id="piece-form" class="piece-form">
      <label>Nombre del elemento <small>Opcional</small><input name="name" placeholder="Costado izquierdo" /></label>
      <label>${neolith ? "Formato de placa" : "Tablero"} de esta pieza <em>*</em>
        <select name="materialId" required>
          ${chosenMaterials.map((item) => `<option value="${item.id}" ${item.id === material?.id ? "selected" : ""}>${safe(item.sku)} · ${safe(item.name)} · ${item.thickness} mm</option>`).join("")}
        </select>
      </label>
      <label class="form-span">Interpretación de las medidas
        <select name="measurementMode">
          <option value="finished">${neolith ? "Medidas terminadas de la pieza" : "Medidas terminadas · descontar tapacanto automáticamente"}</option>
          <option value="cut">Medidas de corte · ya descontadas por el cliente</option>
        </select>
        <small>La primera opción es la normal.${neolith ? "" : " Usa “de corte” únicamente cuando el cliente ya descontó el tapacanto."}</small>
      </label>
      <label>Largo ingresado (mm) <em>*</em><input name="length" type="number" min="${MINIMUM_CUT_SIDE}" max="${limits.maxLength}" required placeholder="720" /></label>
      <label>Ancho ingresado (mm) <em>*</em><input name="width" type="number" min="${MINIMUM_CUT_SIDE}" max="${limits.maxWidth}" required placeholder="560" /></label>
      <label>Cantidad <em>*</em><input name="quantity" type="number" min="1" value="1" required /></label>
      <label>Notas<input name="notes" placeholder="Opcional" /></label>
      <div class="form-span manual-finish-grid" data-manual-neolith ${neolith ? "" : "hidden"}>
        <b>Acabado por lado</b>
        <label>L1 · superior<select name="finishTop">${finishOptions()}</select></label>
        <label>L2 · inferior<select name="finishBottom">${finishOptions()}</select></label>
        <label>A1 · izquierdo<select name="finishLeft">${finishOptions()}</select></label>
        <label>A2 · derecho<select name="finishRight">${finishOptions()}</select></label>
      </div>
      <div class="form-span" data-manual-board ${neolith ? "hidden" : ""}>
      <label>Tapacanto único para los lados seleccionados
        <select name="edgeId">${edgeOptions("")}</select>
      </label>
      <div class="manual-edge-sides">
        <span>Aplicar en:</span>
        <label><input type="checkbox" name="edgeTop" /> L1 · superior</label>
        <label><input type="checkbox" name="edgeBottom" /> L2 · inferior</label>
        <label><input type="checkbox" name="edgeLeft" /> A1 · izquierdo</label>
        <label><input type="checkbox" name="edgeRight" /> A2 · derecho</label>
      </div></div>
      <div class="grain-field form-span">
        <span>Veta de la pieza</span>
        <div class="grain-options">
          ${["longitudinal", "transversal", "sin-veta"].map((grain) => `<label class="${grain === state.defaultGrain ? "selected" : ""}"><input type="radio" name="grain" value="${grain}" ${grain === state.defaultGrain ? "checked" : ""}/><b>${grainIcon(grain)}</b><span>${grainLabels[grain]}</span></label>`).join("")}
        </div>
        <small id="dimension-limit-note">${safe(limits.note)} Corte mínimo: ${MINIMUM_CUT_SIDE} × ${MINIMUM_CUT_SIDE} mm.</small>
      </div>
      <button class="primary form-span" type="submit">Agregar pieza</button>
    </form>
  </section>`;
}

function pieceEntryPanel() {
  const mode = state.pieceEntryMode === "manual" ? "manual" : "paste";
  return `<section class="piece-entry-section reveal">
    <div class="section-title"><span>3</span><div><h3>Ingresa las piezas de este proyecto</h3><p>Puedes alternar entre ingreso manual y pegado masivo. La veta y los cuatro lados quedan editables antes de optimizar.</p></div></div>
    <div class="piece-entry-switch" role="tablist">
      <button type="button" class="${mode === "paste" ? "active" : ""}" data-action="piece-entry-mode" data-mode="paste">▦ Pegar desde Excel</button>
      <button type="button" class="${mode === "manual" ? "active" : ""}" data-action="piece-entry-mode" data-mode="manual">＋ Ingreso manual</button>
    </div>
    ${mode === "manual" ? manualPiecePanel() : pieceImportPanel()}
    ${state.pieces.length ? `<div class="piece-entry-total"><b>${state.pieces.length} línea(s)</b><span>${state.pieces.reduce((sum, piece) => sum + Number(piece.quantity || 0), 0)} piezas incorporadas</span></div>` : ""}
  </section>`;
}

function projectStep() {
  const isExistingProject = projectsCache.some(
    (item) => item.id === state.projectId,
  );
  const availableStatusEntries = isExistingProject
    ? statusEntriesForRole()
    : [["cotizacion", statusLabels.cotizacion]];
  const statusEditable =
    !hasRole("cliente") &&
    canEditCurrent() &&
    availableStatusEntries.length > 1;
  const commercialRequired = auth.visitor || hasRole("cliente");
  const canAssignCollaborators =
    !auth.visitor &&
    hasAnyRole(["admin", "comercial"]) &&
    canEditCurrent();
  const showCommercialDocuments =
    !auth.visitor && hasAnyRole(["admin", "comercial", "produccion"]);
  const canEditInvoice =
    canEditCurrent() &&
    (hasRole("admin") ||
      (hasRole("comercial") &&
        ["cotizacion", "facturacion"].includes(state.project.status)));
  const canEditDispatchGuide =
    canEditCurrent() &&
    (hasRole("admin") ||
      (hasRole("produccion") &&
        ["facturado_pagado", "produccion", "despacho"].includes(
          state.project.status,
        )));
  return `
    <section class="hero-card">
      <div>
        <p class="eyebrow">NUEVA SOLICITUD</p>
        <h2>Primero selecciona qué deseas optimizar</h2>
        <p>El sistema separará herramientas, terminaciones y costos según se trate de maderas o piedras.</p>
      </div>
      <div class="hero-mark">01</div>
    </section>
    <section class="card work-type-card">
      <div class="section-title"><span>1</span><div><h3>Tipo de optimización <em>*</em></h3><p>Una cotización utiliza un solo flujo para evitar mezclar tapacantos con acabados de piedra.</p></div></div>
      <div class="work-type-grid">
        <button type="button" class="work-type-option ${state.workType === "boards" ? "selected" : ""}" data-work-type="boards">
          <strong>▤</strong><span><b>Tableros · Maderas</b><small>Melaminas, MDF y otros tableros. Incluye tapacantos por lado y rebaje de 10 mm.</small></span><i>${state.workType === "boards" ? "✓" : "→"}</i>
        </button>
        <button type="button" class="work-type-option ${state.workType === "slabs" ? "selected" : ""}" data-work-type="slabs">
          <strong>◆</strong><span><b>Placas · Piedras</b><small>Neolith y futuras piedras. Sin tapacantos; corte por placa y acabados opcionales por lado.</small></span><i>${state.workType === "slabs" ? "✓" : "→"}</i>
        </button>
      </div>
    </section>
    <section class="card form-card">
      <div class="section-title"><span>2</span><div><h3>Datos del proyecto</h3><p>${auth.visitor ? "Completa tus datos mínimos para que podamos responder la cotización." : "Identifica al cliente, dirección del proyecto y responsable comercial."}</p></div></div>
      <div class="form-grid">
        <label>Nombre del proyecto
          <input data-project="projectName" value="${safe(state.project.projectName)}" placeholder="Ej. Cocina departamento Ñuñoa" />
        </label>
        ${
          auth.visitor
            ? `<label>Nombre <em>*</em><input data-contact="name" value="${safe(state.contact.name)}" autocomplete="name" /></label>
              <label>Correo <em>*</em><input data-contact="email" type="email" value="${safe(state.contact.email)}" autocomplete="email" /></label>
              <label>Teléfono <em>*</em><input data-contact="phone" type="tel" minlength="7" value="${safe(state.contact.phone)}" autocomplete="tel" /></label>
              <label>Ciudad <em>*</em><input data-contact="city" value="${safe(state.contact.city)}" autocomplete="address-level2" /></label>`
            : `<label>Nombre del cliente <em>*</em>
                <input data-project="clientName" value="${safe(state.project.clientName)}" placeholder="Nombre o razón social" />
              </label>
              <label>RUT
                <input data-project="rut" value="${safe(state.project.rut)}" placeholder="12.345.678-5" />
                <small>Opcional; si se ingresa, se valida módulo 11.</small>
              </label>`
        }
        <label>Dirección del proyecto
          <input data-project="projectAddress" value="${safe(state.project.projectAddress)}" placeholder="Calle, número y comuna" />
        </label>
        <label>Estado
          <select data-project="status" ${statusEditable ? "" : "disabled"}>
            ${availableStatusEntries
              .map(
                ([value, label]) =>
                  `<option value="${value}" ${value === state.project.status ? "selected" : ""}>${label}</option>`,
              )
              .join("")}
          </select>
        </label>
        ${showCommercialDocuments ? `<label>Número de factura ${state.project.status === "facturado_pagado" ? "<em>*</em>" : ""}
          <input data-document="invoiceNumber" value="${safe(state.invoiceNumber)}" placeholder="Ej. 12345" ${canEditInvoice ? "" : "disabled"} />
          <small>Obligatorio para pasar a Facturado y pagado.</small>
        </label>
        <label>Número de guía de despacho ${state.project.status === "entregado" ? "<em>*</em>" : ""}
          <input data-document="dispatchGuideNumber" value="${safe(state.dispatchGuideNumber)}" placeholder="Ej. 9876" ${canEditDispatchGuide ? "" : "disabled"} />
          <small>Obligatorio antes de marcar el pedido como Entregado.</small>
        </label>` : ""}
        <label>Ejecutivo comercial responsable ${commercialRequired ? "<em>*</em>" : ""}
          <select data-assigned-to ${commercialRequired ? "required" : ""} ${
            hasAnyRole(["comercial", "produccion"])
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
          <small>El ejecutivo recibirá la cotización directamente en su panel.</small>
        </label>
        ${canAssignCollaborators ? `<label class="form-span">Comerciales colaboradores
          <select data-collaborators multiple size="${Math.min(4, Math.max(2, commercialsCache.length))}">
            ${commercialsCache
              .filter((commercial) => commercial.id !== state.assignedTo)
              .map((commercial) => `<option value="${commercial.id}" ${(state.collaboratorIds || []).includes(commercial.id) ? "selected" : ""}>${safe(commercial.fullName)}</option>`)
              .join("")}
          </select>
          <small>Usa Ctrl/Cmd para elegir más de uno. Estos usuarios podrán abrir y ayudar a preparar la cotización.</small>
        </label>` : ""}
      </div>
    </section>
    ${stepFooter(false, state.workType === "slabs" ? "Continuar a placas" : "Continuar a tableros")}
  `;
}

function materialStep() {
  const availableMaterials = quoteMaterials();
  const availableCategoryIds = new Set(
    availableMaterials.map((item) => item.categoryId),
  );
  const taxonomy=taxonomyPaths(v5.config.taxonomy);
  const availableCategories = taxonomy.filter(n=>n.active!==false&&availableMaterials.some(m=>m.taxonomyId===n.id)).map(n=>({id:n.id,name:n.path,icon:isSlabQuote()?'◆':'▤'}));
  for(const category of categories)if(availableCategoryIds.has(category.id)&&availableMaterials.some(m=>m.categoryId===category.id&&!m.taxonomyId))availableCategories.push(category);
  const products = availableMaterials.filter(
    (item) => item.categoryId === state.categoryId || item.taxonomyId === state.categoryId,
  );
  const chosenMaterials = selectedMaterials();
  const slabQuote = isSlabQuote();
  const productNoun = slabQuote ? "placa(s)" : "tablero(s)";
  return `
    <section class="intro-row">
      <div><p class="eyebrow">${slabQuote ? "PLACAS · PIEDRAS" : "TABLEROS · MADERAS"}</p><h2>${slabQuote ? "Selecciona las placas del catálogo" : "Selecciona uno o más tableros"}</h2><p>${slabQuote ? "Elige el producto y su espesor. En el resumen puedes incluir el suministro de la placa, además del corte y los acabados." : "Puedes cambiar de categoría y seguir incorporando productos al mismo proyecto."}</p></div>
      <div class="selection-flow"><b class="${state.categoryId ? "done" : ""}">1 Categoría</b><span>→</span><b class="${chosenMaterials.length ? "done" : ""}">${chosenMaterials.length} ${productNoun}</b></div>
    </section>
    ${
      chosenMaterials.length
        ? `<section class="selected-materials" aria-label="Materiales seleccionados">
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
    ${chosenMaterials.some(isNeolithMaterial) ? `<section class="card neolith-config-card">
      <div class="section-title"><span>◆</span><div><h3>Placas de este proyecto</h3><p>El código y el color corresponden al producto seleccionado del catálogo.</p></div></div>
      <div class="paste-config-grid">
        ${chosenMaterials.filter(isNeolithMaterial).map((material) => {
          const custom = state.materialCustomizations?.[material.id] || {};
          return `<div><b>${safe(material.sku)} · ${safe(material.name)}</b>
            ${material.customColor!==false?`<label>Color <em>*</em><input data-neolith-color="${material.id}" value="${safe(custom.color || "")}" placeholder="Ej. Calacatta Luxe" required /></label>`:''}
            <p>Fábrica ${material.plateLength} × ${material.plateWidth} × ${material.thickness} mm · útil ${material.plateLength - 2*(material.perimeterTrim??30)} × ${material.plateWidth - 2*(material.perimeterTrim??30)} mm.</p>
          </div><div class="stone-rate-note"><b>${clp(state.settings.stoneCutPerPlateRate)} neto</b><span>Corte por cada placa utilizada</span><small>Biselado/Pulido y 45° se agregan por lado cuando corresponda.</small></div>`;
        }).join("")}
      </div>
    </section>` : ""}
    <section class="card">
      <div class="section-title"><span>1</span><div><h3>${slabQuote ? "Tipo de placa" : "Categoría del tablero"}</h3><p>Los productos incompatibles con el flujo elegido quedan ocultos.</p></div></div>
      <div class="category-grid">
        ${availableCategories
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
                    <span class="product-copy"><small>${safe(material.brand)} · ${safe(material.sku)}</small><b>${safe(material.name)}</b><em>${isNeolithMaterial(material) ? `Útil ${material.plateLength - 2*(material.perimeterTrim??30)} × ${material.plateWidth - 2*(material.perimeterTrim??30)} × ${material.thickness} mm · fábrica ${material.plateLength} × ${material.plateWidth} mm` : `${material.plateLength} × ${material.plateWidth} × ${material.thickness} mm`}</em><strong>${isNeolithMaterial(material) ? `${clp(state.settings.stoneCutPerPlateRate)} neto por placa cortada` : `${clp(material.netPrice)} neto`}</strong>
                    ${
                      permitted(auth.user,"costs")
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
    ${chosenMaterials.length && canCreateQuote() && canEditCurrent() ? pieceEntryPanel() : ""}
    ${stepFooter(true, state.pieces.length ? "Revisar piezas" : "Continuar")}
  `;
}

function catalogView(){return shell(catalog51View(v5Context()));}

function legacyCatalogView() {
  const edgeGroups = [...new Set(activeEdgeBands().map((item) => item.group))];
  const showingBoards = state.catalogKind !== "edges";
  const products = showingBoards
    ? activeMaterials().filter((item) => item.categoryId === state.categoryId)
    : activeEdgeBands().filter((item) => item.group === state.catalogEdgeGroup);
  return shell(`
    <section class="intro-row catalog-intro">
      <div>
        <p class="eyebrow">CONSULTA ANTES O DURANTE LA COTIZACIÓN</p>
        <h2>Catálogo por categoría</h2>
        <p>Revisa colores, formatos y precios netos disponibles sin perder el avance de tu cotización.</p>
      </div>
      ${
        canCreateQuote()
          ? `<button class="primary" data-action="return-quote">Volver a mi cotización</button>`
          : ""
      }
    </section>
    <div class="catalog-tabs" role="tablist">
      <button class="${showingBoards ? "active" : ""}" data-action="catalog-kind" data-kind="boards">Tableros</button>
      <button class="${showingBoards ? "" : "active"}" data-action="catalog-kind" data-kind="edges">Tapacantos</button>
    </div>
    <section class="card">
      <div class="section-title"><span>1</span><div><h3>${showingBoards ? "Categoría del tablero" : "Tipo de tapacanto"}</h3><p>Selecciona una categoría para revisar sus productos.</p></div></div>
      <div class="category-grid catalog-categories">
        ${
          showingBoards
            ? `${categories
                .map(
                  (category) => `<button class="category ${category.id === state.categoryId ? "selected" : ""}" data-category="${category.id}">
                    <strong>${category.icon}</strong><span>${safe(category.name)}</span><i>${activeMaterials().filter((item) => item.categoryId === category.id).length}</i>
                  </button>`,
                )
                .join("")}`
            : edgeGroups
                .map(
                  (group) => `<button class="category ${group === state.catalogEdgeGroup ? "selected" : ""}" data-action="catalog-edge-group" data-group="${safe(group)}">
                    <strong>▰</strong><span>${safe(group)}</span><i>${activeEdgeBands().filter((item) => item.group === group).length}</i>
                  </button>`,
                )
                .join("")
        }
      </div>
    </section>
    ${
      (showingBoards && state.categoryId) || (!showingBoards && state.catalogEdgeGroup)
        ? `<section class="card reveal catalog-results">
            <div class="section-title product-title"><span>2</span><div><h3>Colores y productos disponibles</h3><p>${products.length} alternativa(s) en esta categoría.</p></div>
              <label class="search-field">Buscar
                <input id="material-search" type="search" value="${safe(state.productSearch)}" placeholder="Código, color, nombre o marca" />
              </label>
            </div>
            <div class="product-grid">
              ${products
                .map((item) => {
                  const selected = showingBoards && state.materialIds.includes(item.id);
                  const body = `<span class="sample" style="background:${item.texture || "#ece8df"}">
                      <img class="material-image" src="${materialImageUrl(item)}" data-fallback="${safe(item.image || "")}" alt="" loading="lazy" />
                    </span>
                    <span class="product-copy"><small>${safe(item.brand || item.group)} · ${safe(item.sku)}</small><b>${safe(item.name)}</b>
                    <em>${
                      showingBoards
                        ? `${item.plateLength} × ${item.plateWidth} × ${item.thickness} mm`
                        : `${String(item.thickness).replace(".", ",")} mm · ${safe(item.material || "Tapacanto")}`
                    }</em>
                    <strong>${clp(item.price ?? item.netPrice)} neto${showingBoards ? "" : "/ml"}</strong>
                    ${
                      !showingBoards
                        ? `<span class="catalog-service-price">Servicio enchape: ${clp(item.serviceRate)}/ml</span>`
                        : permitted(auth.user,"costs")
                          ? `<span class="admin-prices">Mínimo ${clp(item.minPrice)} · Compra ${clp(item.purchasePrice)}</span>`
                          : ""
                    }</span>`;
                  return showingBoards && canCreateQuote()
                    ? `<button class="product catalog-product ${selected ? "selected" : ""}" data-catalog-material="${item.id}" data-search-text="${safe(`${item.sku} ${item.name} ${item.brand}`.toLowerCase())}">${body}<i>${selected ? "✓" : "＋"}</i></button>`
                    : `<article class="product catalog-product" data-search-text="${safe(`${item.sku} ${item.name} ${item.brand || item.group}`.toLowerCase())}">${body}</article>`;
                })
                .join("")}
            </div>
          </section>`
        : `<div class="empty-hint">Selecciona una categoría para visualizar colores y precios.</div>`
    }
  `);
}

function catalogAdminView() {
  const productType = state.catalogAdminKind === "edge" ? "edge" : "board";
  const collection = productType === "board" ? activeMaterials() : activeEdgeBands();
  const query = String(state.catalogAdminSearch || "").trim().toLowerCase();
  const visibleProducts = collection.filter((item) =>
    !query ||
    `${item.sku} ${item.name} ${item.brand || item.group || ""}`
      .toLowerCase()
      .includes(query),
  );
  const editing = collection.find((item) => item.id === state.catalogEditingId);
  const board = productType === "board";
  return shell(`
    <section class="intro-row catalog-admin-intro">
      <div>
        <p class="eyebrow">EXCLUSIVO PARA ADMINISTRADORES</p>
        <h2>Productos, medidas, precios e imágenes</h2>
        <p>Cada edición crea una revisión nueva. Las cotizaciones existentes conservan el identificador y la ficha anterior del producto.</p>
      </div>
      <button class="secondary" data-action="catalog-admin-new">＋ Nuevo producto</button>
    </section>
    <div class="catalog-tabs" role="tablist">
      <button class="${board ? "active" : ""}" data-action="catalog-admin-kind" data-kind="board">Tableros</button>
      <button class="${board ? "" : "active"}" data-action="catalog-admin-kind" data-kind="edge">Tapacantos</button>
    </div>
    <div class="catalog-admin-layout">
      <section class="card catalog-admin-form-card">
        <div class="section-title">
          <span>${editing ? "✎" : "＋"}</span>
          <div><h3>${editing ? "Editar producto" : "Crear producto"}</h3><p>${editing ? `Revisión de ${safe(editing.sku)}` : `Nuevo ${board ? "tablero" : "tapacanto"}`}</p></div>
        </div>
        <form id="admin-catalog-form" class="catalog-admin-form">
          <input type="hidden" name="productType" value="${productType}" />
          <input type="hidden" name="productId" value="${safe(editing?.id || "")}" />
          <label>Código SKU <em>*</em><input name="sku" required value="${safe(editing?.sku || "")}" /></label>
          <label>Nombre o color <em>*</em><input name="name" required value="${safe(editing?.name || "")}" /></label>
          ${
            board
              ? `<label>Marca <em>*</em><input name="brand" required value="${safe(editing?.brand || "")}" /></label>
                 <label>Categoría <em>*</em><input name="categoryName" required list="catalog-category-options" value="${safe(editing?.categoryName || editing?.sourceCategory || "")}" placeholder="Ej.: Melamina MASISA 15 mm" /></label>
                 <datalist id="catalog-category-options">${categories.map((category) => `<option value="${safe(category.name)}"></option>`).join("")}</datalist>
                 <label>Largo plancha (mm) <em>*</em><input name="plateLength" type="number" min="1" step="1" required value="${editing?.plateLength || 2600}" /></label>
                 <label>Ancho plancha (mm) <em>*</em><input name="plateWidth" type="number" min="1" step="1" required value="${editing?.plateWidth || 1830}" /></label>
                 <label>Espesor (mm) <em>*</em><input name="thickness" type="number" min="0.1" step="0.1" required value="${editing?.thickness || 15}" /></label>
                 <label>Precio venta neto <em>*</em><input name="netPrice" type="number" min="0" step="1" required value="${editing?.netPrice ?? 0}" /></label>
                 <label>Precio mínimo neto<input name="minPrice" type="number" min="0" step="1" value="${editing?.minPrice ?? 0}" /></label>
                 <label>Precio compra neto<input name="purchasePrice" type="number" min="0" step="1" value="${editing?.purchasePrice ?? 0}" /></label>
                 <label>Código proveedor<input name="supplierCode" value="${safe(editing?.supplierCode || "")}" /></label>
                 <label class="checkbox-row"><input name="grainRequired" type="checkbox" ${editing?.grainRequired === false ? "" : "checked"} /> Producto con veta</label>`
              : `<label>Grupo <em>*</em><input name="group" required value="${safe(editing?.group || "PVC 0,4 mm")}" /></label>
                 <label>Material <em>*</em><select name="material"><option ${editing?.material === "PVC" ? "selected" : ""}>PVC</option><option ${editing?.material === "ABS" ? "selected" : ""}>ABS</option><option ${editing?.material === "EGR" ? "selected" : ""}>EGR</option><option ${!['PVC','ABS','EGR'].includes(editing?.material) && editing ? "selected" : ""}>Otro</option></select></label>
                 <label>Espesor (mm) <em>*</em><input name="thickness" type="number" min="0.1" step="0.1" required value="${editing?.thickness || 0.4}" /></label>
                 <label>Precio tapacanto neto/ml <em>*</em><input name="price" type="number" min="0" step="1" required value="${editing?.price ?? 0}" /></label>
                 <label>Servicio enchape neto/ml <em>*</em><input name="serviceRate" type="number" min="0" step="1" required value="${editing?.serviceRate ?? 500}" /></label>
                 <label>Precio mínimo neto<input name="minPrice" type="number" min="0" step="1" value="${editing?.minPrice ?? 0}" /></label>
                 <label>Precio compra neto<input name="purchasePrice" type="number" min="0" step="1" value="${editing?.purchasePrice ?? 0}" /></label>
                 <label>Código proveedor<input name="supplierCode" value="${safe(editing?.supplierCode || "")}" /></label>
                 <label>Tipo de línea<select name="style"><option value="solid" ${editing?.style === "solid" ? "selected" : ""}>Continua</option><option value="dashed" ${editing?.style === "dashed" ? "selected" : ""}>Segmentada</option><option value="dashdot" ${editing?.style === "dashdot" ? "selected" : ""}>Punto y raya</option><option value="double" ${editing?.style === "double" ? "selected" : ""}>Doble</option></select></label>`
          }
          <label class="form-span">Descripción<textarea name="description" rows="2">${safe(editing?.description || "")}</textarea></label>
          <label class="form-span">Imagen del producto <input name="imageFile" type="file" accept="image/jpeg,image/png,image/webp" /><small>Opcional. JPG, PNG o WEBP de hasta 2,5 MB.</small></label>
          <div class="form-span catalog-admin-actions">
            <button class="primary" type="submit">${editing ? "Guardar como nueva revisión" : "Crear producto"}</button>
            ${editing ? `<button class="ghost" type="button" data-action="catalog-admin-new">Cancelar edición</button>` : ""}
          </div>
        </form>
      </section>
      <section class="card catalog-admin-list-card">
        <div class="section-title product-title">
          <span>▦</span><div><h3>${board ? "Tableros activos" : "Tapacantos activos"}</h3><p>${collection.length} producto(s). Las revisiones históricas quedan protegidas.</p></div>
          <label class="search-field">Buscar<input id="catalog-admin-search" type="search" value="${safe(state.catalogAdminSearch)}" placeholder="Código, nombre o marca" /></label>
        </div>
        <div class="catalog-admin-list">
          ${visibleProducts.length ? visibleProducts.map((item) => `
            <article class="catalog-admin-row" data-admin-search="${safe(`${item.sku} ${item.name} ${item.brand || item.group || ""}`.toLowerCase())}">
              <span class="sample" style="background:${item.texture || item.color || "#ece8df"}"><img class="material-image" src="${materialImageUrl(item)}" data-fallback="${safe(item.image || "")}" alt="" /></span>
              <div><small>${safe(item.sku)} · ${safe(item.catalogSource === "administracion" ? "Gestión administrativa" : "Excel base")}</small><b>${safe(item.name)}</b><span>${board ? `${safe(item.brand)} · ${item.plateLength} × ${item.plateWidth} × ${item.thickness} mm · ${clp(item.netPrice)}` : `${safe(item.group)} · ${String(item.thickness).replace('.', ',')} mm · ${clp(item.price)}/ml`}</span></div>
              <button class="secondary small" data-action="catalog-admin-edit" data-id="${item.id}">Editar</button>
            </article>`).join("") : `<div class="empty-hint">No hay productos que coincidan con la búsqueda.</div>`}
        </div>
      </section>
    </div>
  `);
}

function piecesStep() {
  return `
    <section class="intro-row">
      <div><p class="eyebrow">REVISIÓN DE PIEZAS</p><h2>Confirma cantidades, dimensiones y veta</h2><p>Vuelve a Material y piezas si necesitas incorporar otro lote, color o ${isSlabQuote() ? "formato" : "tablero"}.</p></div>
      <div class="piece-counter"><strong>${state.pieces.reduce((sum, piece) => sum + piece.quantity, 0)}</strong><span>piezas totales</span></div>
    </section>
    ${piecesTable()}
    ${stepFooter(true, isSlabQuote() ? "Configurar acabados" : "Configurar tapacantos")}
  `;
}

function piecesTable() {
  if (!state.pieces.length) {
    return `<section class="card empty-state"><span>▦</span><h3>Aún no hay piezas</h3><p>Vuelve al paso Material y piezas para ingresarlas manualmente o pegarlas desde Excel.</p></section>`;
  }
  return `<section class="card table-card">
    <div class="section-title"><span>▦</span><div><h3>Listado de piezas</h3><p>${state.pieces.length} líneas ingresadas.</p></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Código · elemento</th><th>${isSlabQuote() ? "Placa" : "Tablero"}</th><th>Ingresada / corte</th><th>Cant.</th><th>Veta</th><th></th></tr></thead>
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
          const cut = cutDimensions(piece, edgeBands);
          const finished = finishedDimensions(piece, edgeBands);
          const editable = canEditCurrent();
          return `<tr>
            <td><b>${safe(piece.code || "Pendiente")}</b><span>${safe(
              piece.name || "Sin nombre",
            )}</span></td>
            <td><b>${safe(material?.sku || "Sin asignar")}</b><span>${safe(material?.name || "")}</span></td>
            <td>${
              editable
                ? `<div class="inline-dimensions">
                    <label>Largo<input type="number" min="${MINIMUM_CUT_SIDE}" max="${limits.maxLength}" step="1" value="${piece.length}" data-piece-field="length" data-id="${piece.id}" aria-label="Largo de ${safe(piece.code)}" /></label>
                    <b>×</b>
                    <label>Ancho<input type="number" min="${MINIMUM_CUT_SIDE}" max="${limits.maxWidth}" step="1" value="${piece.width}" data-piece-field="width" data-id="${piece.id}" aria-label="Ancho de ${safe(piece.code)}" /></label>
                    <small>mm</small>
                  </div><small class="dimension-mode">${piece.measurementMode === "cut" ? "Corte ingresado" : "Terminada"} · corte ${millimeters(cut.cutLength)} × ${millimeters(cut.cutWidth)} · terminada ${millimeters(finished.finishedLength)} × ${millimeters(finished.finishedWidth)}</small>`
                : `${piece.length} × ${piece.width} mm`
            }</td>
            <td>${
              editable
                ? `<input class="inline-quantity" type="number" min="1" step="1" value="${piece.quantity}" data-piece-field="quantity" data-id="${piece.id}" aria-label="Cantidad de ${safe(piece.code)}" />`
                : piece.quantity
            }</td>
            <td>${editable
              ? `<select class="inline-grain" data-piece-grain="${piece.id}" aria-label="Sentido de veta de ${safe(piece.code)}">
                  ${["longitudinal", "transversal", "sin-veta"].map((grain) => `<option value="${grain}" ${grain === piece.grain ? "selected" : ""}>${grainIcon(grain)} ${grainLabels[grain]}</option>`).join("")}
                </select>`
              : `<i class="mini-grain">${grainIcon(piece.grain)}</i>${grainLabels[piece.grain]}`}</td>
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
  const slabQuote = isSlabQuote();
  return `
    <section class="intro-row">
      <div><p class="eyebrow">TERMINACIÓN</p><h2>${slabQuote ? "Servicios opcionales por cada lado" : "Tapacantos por cada lado"}</h2><p>${slabQuote ? `El corte bruto se cobra por placa utilizada (${clp(state.settings.stoneCutPerPlateRate)} neto). En L1, L2, A1 y A2 puedes agregar Biselado o Pulido, o Corte 45°.` : "Selecciona si cada lado lleva tapacanto y qué producto corresponde. Largo y Ancho conservan el sentido ingresado."}</p></div>
    </section>
    ${state.pieces.some((piece) => isNeolithMaterial(selectedMaterial(piece.materialId))) ? `<section class="card edge-bulk-card">
      <div class="section-title"><span>◆</span><div><h3>Asignación rápida de acabados</h3><p>Aplica un servicio distinto en cada lado a todas las piezas de piedra. “Sin adicional” mantiene el corte bruto.</p></div></div>
      <div class="edge-bulk-grid">
        <label>L1 · Superior<select id="finish-fast-top">${finishOptions()}</select></label>
        <label>L2 · Inferior<select id="finish-fast-bottom">${finishOptions()}</select></label>
        <label>A1 · Izquierdo<select id="finish-fast-left">${finishOptions()}</select></label>
        <label>A2 · Derecho<select id="finish-fast-right">${finishOptions()}</select></label>
      </div>
      <button class="secondary" data-action="apply-neolith-finishes">Aplicar acabados a piezas Neolith</button>
    </section>` : ""}
    ${state.pieces.some((piece) => !isNeolithMaterial(selectedMaterial(piece.materialId))) ? `<section class="card edge-bulk-card">
      <div class="section-title"><span>⚡</span><div><h3>Asignación rápida por tablero o selección</h3><p>Configura L1, L2, A1 y A2 una sola vez y aplícalos a varias piezas.</p></div></div>
      <div class="edge-bulk-grid">
        <label>Aplicar a
          <select id="edge-bulk-scope">
            <option value="all">Todas las piezas</option>
            <option value="selected">Solo piezas marcadas</option>
            <optgroup label="Piezas de un tablero">
              ${selectedMaterials().filter((item) => !isNeolithMaterial(item)).map((item) => `<option value="material:${item.id}">${safe(item.sku)} · ${safe(item.name)}</option>`).join("")}
            </optgroup>
          </select>
        </label>
        <label>L1 · Superior<select id="edge-fast-top">${edgeOptions(suggested?.id)}</select></label>
        <label>L2 · Inferior<select id="edge-fast-bottom">${edgeOptions(suggested?.id)}</select></label>
        <label>A1 · Izquierdo<select id="edge-fast-left">${edgeOptions(suggested?.id)}</select></label>
        <label>A2 · Derecho<select id="edge-fast-right">${edgeOptions(suggested?.id)}</select></label>
      </div>
      <div class="edge-bulk-actions">
        <button class="secondary" data-action="apply-edge-sides">Aplicar los 4 lados al alcance</button>
        <button class="ghost" data-action="copy-edge-four">Usar L1 en los 4 lados</button>
        <button class="ghost danger-text" data-action="clear-edge-scope">Limpiar el alcance</button>
      </div>
    </section>` : ""}
    <div class="edge-list">
      ${state.pieces
        .map((piece) => {
          const cut = cutDimensions(piece, edgeBands);
          const pieceMaterial = selectedMaterial(piece.materialId);
          const neolith = isNeolithMaterial(pieceMaterial);
          return `<article class="card edge-piece">
            <div class="edge-piece-head">
              <div class="edge-piece-identity"><label class="piece-check"><input type="checkbox" data-edge-piece-select="${piece.id}" /> Marcar para asignación rápida</label><small>${safe(piece.code)} · ${safe(pieceMaterial?.sku || "Sin material")}</small><h3>${safe(piece.name || "Pieza sin nombre")}</h3><p>${safe(pieceMaterial?.name || "")} · Terminada: ${piece.length} × ${piece.width} mm · Cantidad: ${piece.quantity}</p></div>
              <div class="cut-size"><span>MEDIDA DE CORTE ${piece.measurementMode === "cut" ? "· YA DESCONTADA" : "· AUTOMÁTICA"}</span><b>${cut.cutLength} × ${cut.cutWidth} mm</b></div>
            </div>
            <div class="edge-diagram" aria-label="${neolith ? "Acabados" : "Tapacantos"} por posición">
              <div class="edge-piece-shape">
                <span>${piece.length} × ${piece.width} mm</span>
                <small>L1 superior · L2 inferior · A1 izquierdo · A2 derecho</small>
              </div>
              ${neolith
                ? sides.map(([side, label]) => `<label class="edge-control edge-${side}">
                    <span>${label}</span>
                    <select data-piece-finish="${piece.id}" data-side="${side}">${finishOptions(piece.finishes?.[side] || "rough")}</select>
                  </label>`).join("")
                : sides
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

function edgeBulkTargetPieces() {
  const scope = document.querySelector("#edge-bulk-scope")?.value || "all";
  if (scope === "selected") {
    const selected = new Set(
      [...document.querySelectorAll("[data-edge-piece-select]:checked")].map(
        (input) => input.dataset.edgePieceSelect,
      ),
    );
    return state.pieces.filter((piece) => selected.has(piece.id));
  }
  if (scope.startsWith("material:")) {
    const materialId = scope.slice("material:".length);
    return state.pieces.filter((piece) => piece.materialId === materialId);
  }
  return state.pieces;
}

function edgeConfigurationError(pieces = state.pieces) {
  for (const piece of pieces) {
    const material = selectedMaterial(piece.materialId);
    const error = pieceProductionError(piece, material, edgeBands, state.settings);
    if (error) return `${piece.code || piece.name || "Pieza"}: ${error}`;
  }
  for (const material of selectedMaterials()) {
    if (isNeolithMaterial(material)) continue;
    const usedEdges = new Set(
      pieces
        .filter((piece) => piece.materialId === material.id)
        .flatMap((piece) => Object.values(piece.edges || {}))
        .filter(Boolean),
    );
  }
  return "";
}

function applyFastEdges(mode = "sides") {
  const targets = edgeBulkTargetPieces().filter(
    (piece) => !isNeolithMaterial(selectedMaterial(piece.materialId)),
  );
  if (!targets.length) {
    notify("No hay piezas dentro del alcance seleccionado.", "error");
    return;
  }
  const top = document.querySelector("#edge-fast-top")?.value || null;
  const values =
    mode === "same"
      ? { top, right: top, bottom: top, left: top }
      : {
          top,
          bottom: document.querySelector("#edge-fast-bottom")?.value || null,
          left: document.querySelector("#edge-fast-left")?.value || null,
          right: document.querySelector("#edge-fast-right")?.value || null,
        };
  const targetIds = new Set(targets.map((piece) => piece.id));
  const proposed = state.pieces.map((piece) =>
    targetIds.has(piece.id)
      ? { ...piece, edges: { ...piece.edges, ...values } }
      : piece,
  );
  const error = edgeConfigurationError(proposed);
  if (error) {
    notify(`No se aplicaron los tapacantos: ${error}`, "error");
    return;
  }
  state.pieces = proposed;
  latestResult = null;
  notify(`Tapacantos aplicados a ${targets.length} pieza(s).`);
}

function clearFastEdges() {
  const targets = edgeBulkTargetPieces().filter(
    (piece) => !isNeolithMaterial(selectedMaterial(piece.materialId)),
  );
  if (!targets.length) {
    notify("No hay piezas dentro del alcance seleccionado.", "error");
    return;
  }
  targets.forEach((piece) => {
    piece.edges = { top: null, right: null, bottom: null, left: null };
  });
  latestResult = null;
  notify(`Tapacantos eliminados de ${targets.length} pieza(s).`);
}

function applyNeolithFinishes() {
  const values = Object.fromEntries(
    ["top", "bottom", "left", "right"].map((side) => [
      side,
      document.querySelector(`#finish-fast-${side}`)?.value || "rough",
    ]),
  );
  const targets = state.pieces.filter((piece) =>
    isNeolithMaterial(selectedMaterial(piece.materialId)),
  );
  targets.forEach((piece) => {
    piece.edges = { top: null, right: null, bottom: null, left: null };
    piece.finishes = { ...values };
  });
  latestResult = null;
  notify(`Acabados aplicados a ${targets.length} pieza(s) de piedra.`);
}

function summaryRows(summary) {
  if (isSlabQuote()) {
    const cutRate = summary.boardCount
      ? summary.cuttingSubtotal / summary.boardCount
      : state.settings.stoneCutPerPlateRate;
    return `
      ${summary.boardSubtotal?`<div class="summary-row"><span>Suministro de placas</span><b>${clp(summary.boardSubtotal)}</b></div>`:""}
      <div class="summary-row"><span>Corte por placa <small>${summary.boardCount} placa(s) × ${clp(cutRate)} neto</small></span><b>${clp(summary.cuttingSubtotal)}</b></div>
      <div class="summary-row"><span>Biselado o Pulido <small>${Number(summary.finishMetersByType?.bevel || 0).toFixed(2)} ml</small></span><b>${clp(Number(summary.finishMetersByType?.bevel || 0) * Number(summary.finishRates?.bevel || state.settings.stoneBevelRate))}</b></div>
      <div class="summary-row"><span>Corte 45° <small>${Number(summary.finishMetersByType?.miter45 || 0).toFixed(2)} ml</small></span><b>${clp(Number(summary.finishMetersByType?.miter45 || 0) * Number(summary.finishRates?.miter45 || state.settings.stoneMiter45Rate))}</b></div>
      ${summary.servicesDiscount ? `<div class="summary-row discount"><span>Descuento servicios <small>${summary.servicesDiscount} %</small></span><b>− ${clp(summary.servicesDiscountAmount)}</b></div>` : ""}
      <div class="summary-row net"><span>Neto</span><b>${clp(summary.net)}</b></div>
      <div class="summary-row"><span>IVA 19 %</span><b>${clp(summary.vat)}</b></div>
      <div class="summary-row total"><span>Total</span><b>${clp(summary.total)}</b></div>
    `;
  }
  return `
    <div class="summary-row"><span>Total tableros <small>${summary.boardCount} placa(s)</small></span><b>${clp(summary.boardSubtotal)}</b></div>
    ${
      summary.boardDiscount
        ? `<div class="summary-row discount"><span>Descuento tableros <small>${summary.boardDiscount} %</small></span><b>− ${clp(summary.boardDiscountAmount)}</b></div>`
        : ""
    }
    <div class="summary-row"><span>Total tapacantos <small>${summary.edgeMeters.toFixed(2)} m</small></span><b>${clp(summary.edgeSubtotal)}</b></div>
    ${
      summary.edgeDiscount
        ? `<div class="summary-row discount"><span>Descuento tapacantos <small>${summary.edgeDiscount} %</small></span><b>− ${clp(summary.edgeDiscountAmount)}</b></div>`
        : ""
    }
    <div class="summary-row"><span>Total servicio de corte <small>${summary.boardCount} tablero(s) · ${summary.cutCount} cortes estimados</small></span><b>${clp(summary.cuttingSubtotal)}</b></div>
    <div class="summary-row"><span>Total servicio de tapacanto <small>Tarifa según espesor</small></span><b>${clp(summary.bandingSubtotal)}</b></div>
    ${summary.finishSubtotal ? `<div class="summary-row"><span>Acabados de placa <small>${Number(summary.finishMetersByType?.bevel || 0).toFixed(2)} ml bisel/pulido · ${Number(summary.finishMetersByType?.miter45 || 0).toFixed(2)} ml a 45°</small></span><b>${clp(summary.finishSubtotal)}</b></div>` : ""}
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

function invoiceBreakdown(result) {
  const materialRows = result.materialSummaries || [];
  const edgeRows = result.edgeSummaries || [];
  const finishRows = result.finishSummaries || [];
  const slabQuote = materialRows.some((item) => item.isStone) || isSlabQuote();
  const meters = (value) =>
    Number(value || 0).toLocaleString("es-CL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  return `<div class="invoice-breakdown">
    <section class="invoice-group">
      <div class="invoice-group-title">
        <b>${slabQuote ? "Placas y corte" : "Tableros por tipo"}</b>
        <span>${materialRows.length} formato(s)</span>
      </div>
      ${materialRows
        .map(
          (item) => `<article class="invoice-item">
            <header><b>${safe(item.sku)}</b><span>${safe(item.name)}</span></header>
            ${item.isStone && !item.boardSubtotal ? `<div class="invoice-line"><span>Formato<small>Fábrica ${item.rawPlateLength} × ${item.rawPlateWidth} mm · útil ${item.usablePlateLength} × ${item.usablePlateWidth} mm</small></span><strong>Servicio</strong></div>` : `<div class="invoice-line">
              <span>${item.isStone ? "Placa" : "Tablero"}<small>${item.boardCount} placa(s) × ${clp(item.unitPrice)}</small></span>
              <strong>${clp(item.boardSubtotal)}</strong>
            </div>`}
            <div class="invoice-line service">
              <span>${item.isStone ? "Corte por placa" : "Servicio de corte"}<small>${item.boardCount} placa(s) × ${clp(item.cutRatePerBoard)}</small></span>
              <strong>${clp(item.cuttingSubtotal)}</strong>
            </div>
          </article>`,
        )
        .join("")}
    </section>
    ${slabQuote ? "" : `<section class="invoice-group">
      <div class="invoice-group-title">
        <b>Tapacantos por tipo</b>
        <span>${edgeRows.length} producto(s)</span>
      </div>
      ${
        edgeRows.length
          ? edgeRows
              .map(
                (item) => `<article class="invoice-item">
                  <header><b>${safe(item.sku)}</b><span>${safe(item.group)} · ${safe(item.name)}</span></header>
                  <div class="invoice-line">
                    <span>Tapacanto<small>${meters(item.materialMeters??item.meters)} ml × ${clp(item.unitPrice)}/ml${item.wasteMeters?` · incluye ${meters(item.wasteMeters)} ml de merma (2%)`:""}</small></span>
                    <strong>${clp(item.materialSubtotal)}</strong>
                  </div>
                  <div class="invoice-line service">
                    <span>Servicio de tapacanto<small>${meters(item.meters)} ml × ${clp(item.serviceRate)}/ml</small></span>
                    <strong>${clp(item.serviceSubtotal)}</strong>
                  </div>
                </article>`,
              )
              .join("")
          : `<div class="invoice-empty">Sin tapacantos asignados.</div>`
      }
    </section>`}
    ${finishRows.length ? `<section class="invoice-group">
      <div class="invoice-group-title"><b>Acabados opcionales por lado</b><span>${finishRows.length} servicio(s)</span></div>
      ${finishRows.map((item) => `<article class="invoice-item"><header><b>${safe(item.name)}</b></header><div class="invoice-line service"><span>Acabado<small>${meters(item.materialMeters??item.meters)} ml × ${clp(item.unitPrice)}/ml${item.wasteMeters?` · incluye ${meters(item.wasteMeters)} ml de merma (2%)`:""}</small></span><strong>${clp(item.serviceSubtotal)}</strong></div></article>`).join("")}
    </section>` : ""}
  </div>`;
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
      <thead><tr><th>Código · elemento</th><th>${isSlabQuote() ? "Placa" : "Tablero"}</th><th>Terminada</th><th>Corte</th><th>Solic.</th><th>Optim.</th><th>Placa(s)</th></tr></thead>
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
  state.edgeCodeMap = createEdgeCodeMap(state.pieces, state.edgeCodeMap);
  latestResult = computeCurrentResult();
  const summary = latestResult.summary;
  const slabQuote = isSlabQuote();
  return `
    <section class="intro-row">
      <div><p class="eyebrow">RESULTADO</p><h2>Planos agrupados por ${slabQuote ? "formato de placa" : "tablero"}</h2><p>Cada material se optimiza por separado y genera sus propias hojas de corte.</p></div>
      <div class="actions">
        ${
          auth.visitor
            ? ""
            : `<button class="secondary" data-action="pdf">↓ Descargar PDF</button>`
        }
        ${
          hasAnyRole(["admin", "produccion"])
            ? `<button class="secondary" data-action="labels-pdf">↓ Etiquetas 50 mm</button>`
            : ""
        }
        ${
          canEditCurrent()
            ? `<button class="primary" data-action="save">${auth.visitor ? "Enviar cotización" : "Guardar proyecto"}</button>`
            : ""
        }
      </div>
    </section>
    ${
      auth.visitor
        ? state.visitorSubmitted
          ? `<div class="alert success"><b>Cotización enviada:</b> ${safe(projectCode(state.visitorQuoteId))}. Administración recibió el aviso y se comunicará contigo.</div>`
          : `<div class="alert"><b>Modo visitante:</b> puedes revisar precios y enviar la cotización, pero la descarga PDF está disponible solo para Clientes registrados.</div>`
        : ""
    }
    <div class="metrics">
      <div><span>PLACAS</span><b>${summary.boardCount}</b></div>
      <div><span>APROVECHAMIENTO</span><b>${(100 - summary.waste).toFixed(1)} %</b></div>
      <div><span>DESPERDICIO</span><b>${summary.waste.toFixed(1)} %</b></div>
      <div><span>CONSUMO DE DISCO</span><b>${state.settings.kerf} mm</b></div>
    </div>
    ${
      !canEditCurrent()
        ? `<div class="alert"><b>Pedido de solo lectura:</b> ${
            hasRole("comercial")
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
    ${state.settings.calculationVersion !== V5 ? `<div class="alert"><b>Cálculo histórico ${safe(state.settings.calculationVersion)}:</b> los valores guardados se conservan. Al modificar medidas, materiales o servicios se creará una revisión V5. ${latestResult.historicalReconstruction?'Los planos se reconstruyen con las reglas históricas porque esta versión no guardaba una imagen del resultado.':''}</div>` : ''}
    ${state.readOnlyRevision?'<div class="alert">Revisión de consulta. Para editar, abre la cotización vigente desde Proyectos.</div>':''}
    ${optimizedPiecesTable()}
    <nav class="plate-quick-nav" aria-label="Navegación rápida entre hojas de corte">
      <b>Ir a hoja</b>
      <div>
        ${latestResult.plates
          .map(
            (plate, index) => `<button type="button" class="ghost small" data-action="jump-plate" data-target="plan-card-${plate.index}" aria-label="Ir a hoja ${index + 1}">${index + 1}</button>`,
          )
          .join("")}
      </div>
      <small>${latestResult.plates.length} hoja(s)</small>
    </nav>
    <div class="result-layout">
      <section class="plans">
        ${latestResult.plates
          .map(
            (plate) => `<article class="card plan-card" id="plan-card-${plate.index}">
              <header><div><small>${safe(plate.material.sku)} · ${safe(plate.material.name)}</small><h3>Placa ${plate.materialPlateIndex} de este ${slabQuote ? "formato" : "tablero"}</h3></div><b>${plate.utilization.toFixed(1)} % utilizado</b></header>
              <div class="canvas-wrap"><canvas id="plan-${plate.index}"></canvas></div>
              ${platePiecesTable(plate)}
            </article>`,
          )
          .join("")}
      </section>
      <aside class="quote-side">
        <section class="card summary-card"><p class="eyebrow">RESUMEN ECONÓMICO</p><h3>Subtotales</h3>
          ${invoiceBreakdown(latestResult)}
          ${summaryRows(summary)}
        </section>
        <section class="card settings-card">
          <p class="eyebrow">PARÁMETROS</p>
          <label>Consumo de disco por corte (mm)<input type="number" min="2" max="5" step="0.1" data-setting="kerf" value="${state.settings.kerf}" /></label>
          <small>Predeterminado: 3 mm. Rango permitido: 2 a 5 mm. El despunte se configura en cada producto.</small>
          ${slabQuote?`<label class="checkbox-row"><input type="checkbox" data-v51-stone-supply ${state.settings.includeStoneMaterial?'checked':''}>Incluir suministro de las placas</label><small>Desmarcado: se cotizan corte y terminaciones.</small>`:''}
          <label>Modo de optimización<select data-setting-text="optimizationMode">
            <option value="longitudinal" ${state.settings.optimizationMode === "longitudinal" ? "selected" : ""}>Priorizar primer corte longitudinal</option>
            <option value="free" ${state.settings.optimizationMode === "free" ? "selected" : ""}>Sin priorizar</option>
          </select></label>
          ${slabQuote ? `<div class="rate-table">
            <b>Servicios de placas · valores netos</b>
            <span>Corte por placa utilizada <strong>${clp(state.settings.stoneCutPerPlateRate)}</strong></span>
            <span>Biselado o Pulido <strong>${clp(state.settings.stoneBevelRate)}/ml</strong></span>
            <span>Corte 45° <strong>${clp(state.settings.stoneMiter45Rate)}/ml</strong></span>
          </div>` : `<div class="rate-table">
            <b>Corte automático por tablero</b>
            <span>Melamina 15/18 mm <strong>${clp(
              state.settings.melamineCutRate,
            )}</strong></span>
            <span>Acrílico / Petlite / Trunatur <strong>${clp(
              state.settings.acrylicCutRate??state.settings.specialCutRate,
            )}</strong></span><span>Stylelite <strong>${clp(state.settings.styleliteCutRate)}</strong></span>
          </div>
          <div class="rate-table">
            <b>Servicio tapacanto / ml</b>
            <span>0,4 mm <strong>${clp(state.settings.edge04??500)}</strong></span>
            <span>1,0 mm <strong>${clp(state.settings.edge10??600)}</strong></span>
            <span>1,5 mm <strong>${clp(state.settings.edge15??700)}</strong></span>
            <span>2,0 mm <strong>${clp(state.settings.edge20??850)}</strong></span>
          </div>`}
          <p class="eyebrow settings-subtitle">DESCUENTOS</p>
          ${slabQuote ? "" : `<label>Tableros (%)<input type="number" min="0" max="50" step="0.1" data-setting="boardDiscount" value="${state.settings.boardDiscount}" /></label>
          <label>Tapacantos (%)<input type="number" min="0" max="50" step="0.1" data-setting="edgeDiscount" value="${state.settings.edgeDiscount}" /></label>`}
          <label>Servicios (%)<input type="number" min="0" max="50" step="0.1" data-setting="servicesDiscount" value="${state.settings.servicesDiscount}" /></label>
          <small>Valores netos. Descuento máximo 50%, limitado por costo y precio mínimo de cada línea.</small>
        </section>
      </aside>
    </div>
    ${stepFooter(true, null)}
  `;
}

function projectsView() { return shell(groupedProjectsView(v5Context())); }

function localIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateInputValue(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function displayScheduleDate(value) {
  const date = dateInputValue(value);
  if (!date) return "Sin fecha";
  const [year, month, day] = date.split("-");
  return `${day}-${month}-${year}`;
}

function productionPeriodRange(period) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  if (period === "day") {
    const date = localIsoDate(today);
    return { start: date, end: date, label: "Hoy" };
  }
  if (period === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1, 12);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0, 12);
    return {
      start: localIsoDate(start),
      end: localIsoDate(end),
      label: start.toLocaleDateString("es-CL", {
        month: "long",
        year: "numeric",
      }),
    };
  }
  const monday = new Date(today);
  const weekday = (today.getDay() + 6) % 7;
  monday.setDate(today.getDate() - weekday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: localIsoDate(monday),
    end: localIsoDate(sunday),
    label: `${displayScheduleDate(localIsoDate(monday))} al ${displayScheduleDate(
      localIsoDate(sunday),
    )}`,
  };
}

function productionDashboardView() {
  const period = state.productionPeriod || "week";
  const range = productionPeriodRange(period);
  const pipelineStatuses = [
    "cotizacion",
    "facturacion",
    "facturado_pagado",
    "produccion",
    "despacho",
    "entregado",
  ];
  const pipeline = projectsCache
    .filter((item) => pipelineStatuses.includes(item.project.status))
    .sort((a, b) =>
      `${dateInputValue(a.executionDate) || "9999"}${a.project.clientName}`.localeCompare(
        `${dateInputValue(b.executionDate) || "9999"}${b.project.clientName}`,
        "es",
      ),
    );
  const reportProjects = pipeline.filter((item) => {
    const date = dateInputValue(item.executionDate);
    return date && date >= range.start && date <= range.end;
  });
  const completed = reportProjects.filter(
    (item) => item.project.status === "entregado",
  );
  const completedBoards = completed.reduce(
    (sum, item) => sum + Number(item.summary?.boardCount || 0),
    0,
  );
  const completedEdgeMeters = completed.reduce(
    (sum, item) => sum + Number(item.summary?.edgeMeters || 0),
    0,
  );
  const deliveries = pipeline.filter((item) => {
    const date = dateInputValue(item.deliveryDate);
    return date && date >= range.start && date <= range.end;
  }).length;
  const unscheduled = pipeline.filter(
    (item) => !item.executionDate || !item.deliveryDate,
  ).length;
  const statusColumns = [
    ["cotizacion", "Cotización", "Oportunidades y solicitudes recibidas"],
    ["facturacion", "Facturación", "Pedidos en proceso de facturación"],
    ["facturado_pagado", "Facturado y pagado", "Órdenes liberadas a fábrica"],
    ["produccion", "Producción", "Órdenes actualmente en fábrica"],
    ["despacho", "Despacho", "Pedidos terminados y listos"],
    ["entregado", "Entregado", "Registro histórico de entregas"],
  ];
  return shell(`
    <section class="intro-row production-intro">
      <div>
        <p class="eyebrow">CRM DE PRODUCCIÓN</p>
        <h2>Agenda, carga y cumplimiento</h2>
        <p>Visualiza el proceso completo. Administración agenda cualquier proyecto y Producción interviene desde Facturado y pagado.</p>
      </div>
      <div class="period-switch" aria-label="Período del reporte">
        ${[
          ["day", "Diario"],
          ["week", "Semanal"],
          ["month", "Mensual"],
        ]
          .map(
            ([value, label]) =>
              `<button class="${period === value ? "active" : ""}" data-action="production-period" data-period="${value}">${label}</button>`,
          )
          .join("")}
      </div>
    </section>
    <section class="production-metrics">
      <article><span>PERÍODO</span><b>${safe(range.label)}</b><small>${reportProjects.length} orden(es) programada(s)</small></article>
      <article><span>TABLEROS ENTREGADOS</span><b>${completedBoards.toLocaleString("es-CL")}</b><small>Proyectos con estado Entregado</small></article>
      <article><span>ML ENCHAPADOS</span><b>${completedEdgeMeters.toLocaleString("es-CL", {
        maximumFractionDigits: 1,
      })}</b><small>Proyectos con estado Entregado</small></article>
      <article><span>ENTREGAS DEL PERÍODO</span><b>${deliveries}</b><small>Según fecha comprometida</small></article>
      <article class="${unscheduled ? "attention" : ""}"><span>SIN AGENDA COMPLETA</span><b>${unscheduled}</b><small>Requieren ejecución y entrega</small></article>
    </section>
    <section class="crm-board">
      ${statusColumns
        .map(([status, title, subtitle]) => {
          const items = pipeline.filter((item) => item.project.status === status);
          return `<div class="crm-column status-${status}">
            <header><div><span class="status-dot ${status}"></span><b>${title}</b></div><strong>${items.length}</strong><small>${subtitle}</small></header>
            <div class="crm-stack">
              ${
                items.length
                  ? items
                      .map((item) => {
                        const transitionEntries = statusEntriesForRole(
                          auth.user?.role,
                          item.project.status,
                        );
                        const canMoveStatus = transitionEntries.length > 1;
                        const canSchedule =
                          hasRole("admin") ||
                          (hasRole("produccion") &&
                            [
                              "facturado_pagado",
                              "produccion",
                              "despacho",
                              "entregado",
                            ].includes(status));
                        return `<article class="crm-card">
                          <div class="crm-card-title">
                            <div><small>${safe(projectCode(item.id))}</small><h3>${safe(
                              item.project.clientName,
                            )}</h3></div>
                            <span>${Number(item.summary?.boardCount || 0)} tab. · ${Number(
                              item.summary?.edgeMeters || 0,
                            ).toLocaleString("es-CL", {
                              maximumFractionDigits: 1,
                            })} ml</span>
                          </div>
                          <p>${safe(item.project.projectName || "Proyecto sin nombre")}${
                            item.assignedName
                              ? ` · ${safe(item.assignedName)}`
                              : ""
                          }${item.submissionSource === "visitante" ? " · Visitante web" : ""}</p>
                          ${["facturado_pagado", "produccion", "despacho", "entregado"].includes(status) ? `<div class="crm-documents"><b>Factura ${safe(item.invoiceNumber || "pendiente")}</b>${["despacho", "entregado"].includes(status) ? `<span>Guía ${safe(item.dispatchGuideNumber || "pendiente")}</span>` : ""}</div>` : ""}
                          ${canSchedule ? `<form class="schedule-form" data-project-id="${item.id}">
                            <label>Ejecución<input type="date" name="executionDate" value="${safe(
                              dateInputValue(item.executionDate),
                            )}" /></label>
                            <label>Entrega<input type="date" name="deliveryDate" value="${safe(
                              dateInputValue(item.deliveryDate),
                            )}" /></label>
                            <button class="secondary small" type="submit">Guardar agenda</button>
                          </form>` : `<div class="crm-readonly-dates"><span>Ejecución: ${displayScheduleDate(item.executionDate)}</span><span>Entrega: ${displayScheduleDate(item.deliveryDate)}</span></div>`}
                          ${
                            canMoveStatus
                              ? `<label class="crm-status-control">Cambiar etapa<select data-project-status="${item.id}">
                                  ${transitionEntries
                                    .map(
                                      ([value, label]) =>
                                        `<option value="${value}" ${
                                          value === item.project.status
                                            ? "selected"
                                            : ""
                                        }>${label}</option>`,
                                    )
                                    .join("")}
                                </select></label>`
                              : ""
                          }
                          <button class="ghost small" data-action="open-project" data-id="${item.id}">Abrir orden</button>
                        </article>`;
                      })
                      .join("")
                  : `<div class="crm-empty">No hay proyectos en esta etapa.</div>`
              }
            </div>
          </div>`;
        })
        .join("")}
    </section>
    <section class="card production-report">
      <div class="section-title"><span>▤</span><div><h3>Reporte ${safe(
        period === "day" ? "diario" : period === "month" ? "mensual" : "semanal",
      )}</h3><p>${safe(range.label)} · carga programada y cumplimiento por orden.</p></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Ejecución</th><th>Entrega</th><th>Proyecto</th><th>Estado</th><th>Factura</th><th>Guía</th><th>Tableros</th><th>ML tapacanto</th></tr></thead>
        <tbody>${
          reportProjects.length
            ? reportProjects
                .map(
                  (item) => `<tr>
                    <td>${displayScheduleDate(item.executionDate)}</td>
                    <td>${displayScheduleDate(item.deliveryDate)}</td>
                    <td><b>${safe(item.project.clientName)}</b><span>${safe(
                      item.project.projectName || projectCode(item.id),
                    )}</span></td>
                    <td>${safe(statusLabels[item.project.status])}</td>
                    <td>${safe(item.invoiceNumber || "—")}</td>
                    <td>${safe(item.dispatchGuideNumber || "—")}</td>
                    <td>${Number(item.summary?.boardCount || 0).toLocaleString(
                      "es-CL",
                    )}</td>
                    <td>${Number(item.summary?.edgeMeters || 0).toLocaleString(
                      "es-CL",
                      { maximumFractionDigits: 1 },
                    )}</td>
                  </tr>`,
                )
                .join("")
            : `<tr><td colspan="8" class="report-empty">No hay órdenes con fecha de ejecución dentro de este período.</td></tr>`
        }</tbody>
      </table></div>
    </section>
  `);
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
                  <td>${safe((user.roles || [user.role]).map((role) => roleLabels[role] || role).join(" · "))}</td>
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
          <label>Perfiles <em>*</em><select name="roles" multiple size="4" required>
            ${Object.entries(roleLabels)
              .map(([value, label]) => `<option value="${value}">${label}</option>`)
              .join("")}
          </select><small>Ctrl/Cmd permite combinar perfiles internos. Cliente debe usarse solo.</small></label>
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
                <div><b>${safe(user.fullName)}</b><span>${safe(user.email)} · ${(user.roles || [user.role]).map((role) => roleLabels[role] || role).join(" · ")}</span></div>
                <span class="account-state ${user.active ? "" : "inactive"}">${user.active ? "Activo" : "Inactivo"}${user.mustChangePassword ? " · Clave temporal" : ""}</span>
                <div class="user-controls">
                  <label>Perfiles<select data-user-roles="${user.id}" multiple size="4">
                    ${Object.entries(roleLabels).map(([value, label]) => `<option value="${value}" ${(user.roles || [user.role]).includes(value) ? "selected" : ""}>${label}</option>`).join("")}
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
          <div><h3>Accesos definidos por perfil</h3><p>El Superadministrador puede cambiar los perfiles desde el listado superior.</p></div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Perfil</th><th>Proyectos visibles</th><th>Acciones principales</th></tr></thead>
          <tbody>
            <tr><td><b>Administrador</b></td><td>Todos</td><td>Administra categorías, productos, precios de venta y fotografías. Los costos y usuarios requieren permisos específicos.</td></tr>
            <tr><td><b>Comercial</b></td><td>Propios y asignados</td><td>Pasa Cotización a Facturación y luego a Facturado y pagado; producción queda en consulta.</td></tr>
            <tr><td><b>Producción</b></td><td>Todos los proyectos</td><td>Consulta las etapas previas e interviene desde Facturado y pagado hasta Entregado.</td></tr>
            <tr><td><b>Cliente</b></td><td>Solo sus cotizaciones</td><td>Consulta catálogo, cotiza, guarda, descarga y designa Comercial sin cambiar estados.</td></tr>
            <tr><td><b>Visitante</b></td><td>Sin cuenta</td><td>Consulta catálogo y precios, envía cotización sin descargar PDF; Administración recibe la alerta.</td></tr>
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
  if(state.view==='quote') {
    if(!permitted(auth.user,'discount')) document.querySelectorAll('[data-setting$="Discount"]').forEach(el=>{el.disabled=true;el.value=0;});
    if(state.readOnlyRevision) document.querySelectorAll('.workspace input,.workspace select,.workspace textarea,.workspace button:not([data-action="pdf"]):not([data-action="labels-pdf"]):not([data-action="jump-plate"]):not([data-action="back"]):not([data-action="next"])').forEach(el=>el.disabled=true);
  }
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
  if (!auth.user && !auth.visitor) {
    app.innerHTML = accessView();
    return;
  }
  if (auth.user?.mustChangePassword) {
    app.innerHTML = passwordChangeView();
    return;
  }
  if(state.view==='crm'){app.innerHTML=shell(crm51View(v5Context()));renderEnhancements();return;}
  if (['dashboard','dispatch','v5-settings','v5-catalog'].includes(state.view)) {
    const view={dashboard:dashboardView,dispatch:dispatchView,'v5-settings':configurationView,'v5-catalog':management51View}[state.view];
    app.innerHTML=shell(view(v5Context()));renderEnhancements();return;
  }
  if (state.view === "projects") {
    app.innerHTML = projectsView();
    renderEnhancements();
    return;
  }
  if (state.view === "catalog") {
    app.innerHTML = catalogView();
    renderEnhancements();
    return;
  }
  if (state.view === "production") {
    app.innerHTML = productionDashboardView();
    renderEnhancements();
    return;
  }
  if (state.view === "users") {
    app.innerHTML = usersView();
    renderEnhancements();
    return;
  }
  if (state.view === "catalog-admin" && hasRole("admin")) {
    app.innerHTML = catalogAdminView();
    renderEnhancements();
    return;
  }
  if (state.view === "notifications") {
    app.innerHTML = notificationsView();
    renderEnhancements();
    return;
  }
  const views = [projectStep, materialStep, piecesStep, edgeStep, optimizeStep];
  const extra=state.step===0?`<section class="card v5-grid"><label>Nombre de esta cotización<input data-v5quote="quoteName" value="${safe(state.quoteName||'')}" placeholder="Ej. Cocina · melaminas"></label><label>Comentarios<textarea data-v5quote="comments">${safe(state.comments||'')}</textarea></label></section>`:'';
  app.innerHTML = shell(extra+views[state.step]());
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
              project: {
                ...state.project,
                invoiceNumber: state.invoiceNumber,
                dispatchGuideNumber: state.dispatchGuideNumber,
              },
              statusLabel: statusLabels[state.project.status],
              createdBy: auth.user?.fullName,
              generatedAt: new Date().toLocaleString("es-CL"),
              kerf: state.settings.kerf,
              bladeThickness: state.settings.bladeThickness || 2,
              calculationVersion:state.settings.calculationVersion,
              edgeCodeMap: state.edgeCodeMap,
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

function dimensionLimits(grain, material = selectedMaterial()) {
  if (!material) {
    return {
      maxLength: 9999,
      maxWidth: 9999,
      note: "Selecciona un tablero para aplicar sus límites.",
    };
  }
  const usable = usablePlateDimensions(material, state.settings);
  if (grain === "transversal") {
    return {
      maxLength: usable.plateWidth,
      maxWidth: usable.plateLength,
      note: `Veta por el Ancho ingresado. Área útil: ${usable.plateLength} × ${usable.plateWidth} mm; Largo y Ancho no se reordenan.`,
    };
  }
  if (grain === "sin-veta") {
    const maximum = Math.max(usable.plateLength, usable.plateWidth);
    return {
      maxLength: maximum,
      maxWidth: maximum,
      note: `Debe caber en el área útil ${usable.plateLength} × ${usable.plateWidth} mm; se permite girar la pieza.`,
    };
  }
  return {
    maxLength: usable.plateLength,
    maxWidth: usable.plateWidth,
    note: `Veta por el Largo ingresado. Área útil: ${usable.plateLength} × ${usable.plateWidth} mm; Largo puede ser numéricamente menor que Ancho.`,
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
  const neolith = isNeolithMaterial(material);
  const measurementMode = data.get("measurementMode") === "cut" ? "cut" : "finished";
  const edgeId = String(data.get("edgeId") || "");
  const edges = neolith
    ? { top: null, right: null, bottom: null, left: null }
    : {
        top: edgeId && data.get("edgeTop") ? edgeId : null,
        right: edgeId && data.get("edgeRight") ? edgeId : null,
        bottom: edgeId && data.get("edgeBottom") ? edgeId : null,
        left: edgeId && data.get("edgeLeft") ? edgeId : null,
      };
  const finishes = neolith
    ? {
        top: String(data.get("finishTop") || "rough"),
        right: String(data.get("finishRight") || "rough"),
        bottom: String(data.get("finishBottom") || "rough"),
        left: String(data.get("finishLeft") || "rough"),
      }
    : {};
  if (length <= 0 || width <= 0 || quantity <= 0) {
    notify("Revisa los datos obligatorios de la pieza.", "error");
    return;
  }
  if (!material || !state.materialIds.includes(material.id)) {
    notify("Selecciona un tablero válido para la pieza.", "error");
    return;
  }
  const candidate = { length, width, grain, measurementMode, edges, finishes };
  const productionError = pieceProductionError(
    candidate,
    material,
    edgeBands,
    state.settings,
  );
  if (productionError) {
    notify(`No se puede agregar la pieza: ${productionError}`, "error");
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
    measurementMode,
    materialId: material.id,
    notes: String(data.get("notes") || "").trim(),
    edges,
    finishes,
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
    value < (isQuantity ? 1 : MINIMUM_CUT_SIDE) ||
    (isQuantity && !Number.isInteger(value))
  ) {
    target.value = String(previous);
    notify(
      isQuantity
        ? "La cantidad debe ser un número entero mayor que cero."
        : `La dimensión de corte no puede ser menor que ${MINIMUM_CUT_SIDE} mm.`,
      "error",
    );
    return;
  }
  const material = materials.find((item) => item.id === piece.materialId);
  const candidate = { ...piece, [field]: value };
  const productionError = !isQuantity
    ? pieceProductionError(candidate, material, edgeBands, state.settings)
    : "";
  if (productionError) {
    target.value = String(previous);
    notify(`No se puede actualizar la pieza: ${productionError}`, "error");
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

async function importExcel(file) {
  state.importPending = null;
  state.importPreview = {
    status: "reading",
    errors: [],
    issues: [],
    fileName: file?.name || "Archivo seleccionado",
    sheetName: "",
    validCount: 0,
    importedCount: 0,
    totalUnits: 0,
    totalRows: 0,
    rejectedRows: 0,
    blankRows: 0,
    headerRow: 0,
  };
  render();

  try {
    const normalizedRequiredHeaders = ["largo", "ancho", "cantidad"];
    const countRequiredHeaders = (table = []) =>
      Math.max(
        0,
        ...table.slice(0, 25).map((row) => {
          const headers = new Set((row || []).map(normalizeHeader));
          return normalizedRequiredHeaders.filter((header) =>
            headers.has(header),
          ).length;
        }),
      );

    let selectedSheet = null;
    try {
      const piecesTable = await readSheet(file, "Piezas");
      if (countRequiredHeaders(piecesTable) === normalizedRequiredHeaders.length) {
        selectedSheet = { sheet: "Piezas", data: piecesTable };
      }
    } catch {
      // Si la hoja fue renombrada, se busca por encabezados en todo el libro.
    }

    let workbookSheets = [];
    if (!selectedSheet) workbookSheets = await readWorkbook(file);
    const sheetCandidates = workbookSheets
      .map((sheet) => {
        const firstRows = (sheet.data || []).slice(0, 25);
        const headerScore = countRequiredHeaders(firstRows);
        const name = normalizeHeader(sheet.sheet || "");
        const nameScore = /pieza|corte|despiece/.test(name) ? 4 : 0;
        return { ...sheet, score: headerScore * 10 + nameScore };
      })
      .sort((a, b) => b.score - a.score);
    selectedSheet ||= sheetCandidates.find((sheet) => sheet.score >= 30);
    if (!selectedSheet) {
      throw new Error(
        `No se encontró una hoja con las columnas Largo, Ancho y Cantidad. Hojas detectadas: ${workbookSheets.map((sheet) => sheet.sheet).join(", ") || "ninguna"}.`,
      );
    }
    const table = selectedSheet.data;
    const imported = parsePieceImportTable(table, {
      catalogMaterials: quoteMaterials(),
      catalogEdges: edgeBands,
      fallbackMaterialId: state.materialId,
      fallbackGrain: state.defaultGrain,
      settings: state.settings,
      idFactory: () => crypto.randomUUID(),
    });

    const totalUnits = imported.rows.reduce(
      (sum, row) => sum + Number(row.quantity || 0),
      0,
    );
    state.importPending = imported.rows.length
      ? { rows: imported.rows, materialIds: imported.materialIds }
      : null;

    state.importPreview = {
      status: imported.rows.length ? "ready" : "error",
      errors: imported.errors,
      issues: imported.issues || [],
      fileName: file.name,
      sheetName: selectedSheet.sheet,
      validCount: imported.rows.length,
      importedCount: 0,
      totalUnits,
      totalRows: imported.totalRows,
      rejectedRows: imported.rejectedRows,
      blankRows: imported.blankRows,
      headerRow: imported.headerRow,
    };
    notify(
      imported.rows.length
        ? `${imported.rows.length} líneas y ${totalUnits} piezas listas. Presiona “Incorporar todas las piezas”.`
        : "No se encontraron piezas válidas. Revisa el diagnóstico del archivo.",
      imported.rows.length ? "success" : "error",
    );
  } catch (error) {
    state.importPending = null;
    state.importPreview = {
      status: "error",
      errors: [error.message || "No fue posible leer el archivo."],
      issues: [{ row: 0, field: "archivo", message: error.message || "No fue posible leer el archivo." }],
      fileName: file?.name || "Archivo seleccionado",
      sheetName: "",
      validCount: 0,
      importedCount: 0,
      totalUnits: 0,
      totalRows: 0,
      rejectedRows: 0,
      blankRows: 0,
      headerRow: 0,
    };
    notify(
      error.message || "No fue posible leer el archivo. Revisa el formato.",
      "error",
    );
  }
}

function addImportedPieceBatch(pending, previewKey) {
  if (!pending?.rows?.length) {
    notify("Primero valida las piezas que deseas incorporar.", "error");
    return;
  }
  const containsWrongType = pending.materialIds.some((id) => {
    const material = materials.find((item) => item.id === id);
    return isSlabQuote()
      ? !isNeolithMaterial(material)
      : isNeolithMaterial(material);
  });
  if (containsWrongType) {
    notify(
      "El lote contiene materiales del otro flujo. Separa tableros y placas de piedra en cotizaciones distintas.",
      "error",
    );
    return;
  }
  const proposedPieces = [...state.pieces, ...pending.rows];
  const edgeError = edgeConfigurationError(proposedPieces);
  if (edgeError) {
    notify(`No se incorporó el lote: ${edgeError}`, "error");
    return;
  }
  state.pieces = proposedPieces;
  const selectedIds = new Set(state.materialIds || []);
  pending.materialIds.forEach((id) => selectedIds.add(id));
  state.materialIds = [...selectedIds];
  if (!state.materialId) state.materialId = pending.materialIds[0] || "";
  const firstImportedMaterial = materials.find(
    (item) => item.id === pending.materialIds[0],
  );
  if (!state.categoryId && firstImportedMaterial) {
    state.categoryId = firstImportedMaterial.categoryId;
  }
  const importedCount = pending.rows.length;
  const totalUnits = pending.rows.reduce(
    (sum, row) => sum + Number(row.quantity || 0),
    0,
  );
  if (previewKey === "import") {
    state.importPending = null;
    state.importPreview = {
      ...state.importPreview,
      status: "imported",
      importedCount,
      validCount: importedCount,
      totalUnits,
    };
  } else {
    state.pastePending = null;
    state.pastePreview = null;
    state.pasteRawText = "";
    state.pasteColumns = [];
    state.pasteMapping = {};
    state.pasteTable = [];
  }
  state.view = "quote";
  state.step = previewKey === "paste" ? 1 : 2;
  latestResult = null;
  notify(
    `${importedCount} líneas y ${totalUnits} piezas incorporadas. Ya están disponibles para optimizar.`,
  );
}

function confirmPieceImport() {
  addImportedPieceBatch(state.importPending, "import");
}

function splitPastedExcel(text = "") {
  const lines = String(text)
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .filter((line) => line.trim());
  const delimiter = lines.some((line) => line.includes("\t"))
    ? "\t"
    : lines.some((line) => line.includes(";"))
      ? ";"
      : ",";
  return lines.map((line) => line.split(delimiter).map((cell) => cell.trim()));
}

function autoPasteMapping(columns = []) {
  const normalized = columns.map(normalizeHeader);
  const aliases = {
    superadmin: 'superadmin', superadministrador: 'superadmin', 'super administrador':'superadmin',
    instalacion:'instalacion', logistica:'logistica', supervisor:'supervisor', finanzas:'finanzas',
    name: ["nombre", "pieza", "elemento", "descripcion", "detalle"],
    quantity: ["cantidad", "cant", "qty", "unidades", "ud"],
    length: ["largo", "longitud", "alto", "length", "medida 1"],
    width: ["ancho", "fondo", "profundidad", "width", "medida 2"],
    grain: ["veta", "sentido", "orientacion", "fibra", "grain"],
    top: ["l1", "superior", "arriba"],
    bottom: ["l2", "inferior", "abajo"],
    left: ["a1", "izquierdo", "izquierda", "l4"],
    right: ["a2", "derecho", "derecha", "l3"],
  };
  return Object.fromEntries(
    Object.entries(aliases).map(([field, candidates]) => [
      field,
      normalized.findIndex((header) =>
        candidates.some((candidate) =>
          header === candidate || header.includes(candidate),
        ),
      ),
    ]).filter(([, index]) => index >= 0),
  );
}

function neolithFinishFromImport(value) {
  const normalized = normalizeHeader(value);
  if (normalized.includes("bisel") || normalized.includes("pulid")) return "bevel";
  if (normalized.includes("45") || normalized.includes("inglete")) return "miter45";
  return "rough";
}

function analyzePastedPieces() {
  const text = document.querySelector("#piece-paste-text")?.value || state.pasteRawText || "";
  const previousText = state.pasteRawText;
  const materialId = document.querySelector("#paste-material")?.value || state.pasteConfig.materialId || "";
  const defaultGrain = document.querySelector("#paste-default-grain")?.value || state.pasteConfig.defaultGrain || "longitudinal";
  const measurementMode =
    document.querySelector("#paste-measurement-mode")?.value === "cut"
      ? "cut"
      : "finished";
  const defaultEdges = Object.fromEntries(
    ["top", "bottom", "left", "right"].map((side) => [
      side,
      document.querySelector(`#paste-edge-${side}`)?.value ||
        state.pasteConfig.edges?.[side] ||
        "",
    ]),
  );
  const defaultFinishes = Object.fromEntries(
    ["top", "bottom", "left", "right"].map((side) => [
      side,
      document.querySelector(`#paste-finish-${side}`)?.value ||
        state.pasteConfig.finishes?.[side] ||
        "rough",
    ]),
  );
  state.pasteConfig = {
    materialId,
    defaultGrain,
    measurementMode,
    edges: defaultEdges,
    finishes: defaultFinishes,
  };
  state.pasteRawText = text;
  if (!text.trim() || !materialId) {
    state.pastePending = null;
    state.pastePreview = {
      status: "error",
      errors: [!text.trim() ? "Pega primero las filas copiadas desde Excel." : `Selecciona ${isSlabQuote() ? "el formato/color" : "el tablero"} correspondiente a este lote.`],
    };
    render();
    return;
  }

  const pastedTable = splitPastedExcel(text);
  const currentMapInputs = [...document.querySelectorAll("[data-paste-map]")];
  const textChanged = text !== previousText || !state.pasteColumns.length;
  if (!state.pasteColumns.length || textChanged) {
    const firstRow = pastedTable[0] || [];
    const numericCells = firstRow.filter((value) => Number.isFinite(Number(String(value).replace(",", ".")))).length;
    const hasHeader = numericCells < Math.ceil(firstRow.length / 2);
    state.pasteColumns = hasHeader
      ? firstRow.map((value, index) => String(value || `Columna ${index + 1}`))
      : firstRow.map((_, index) => `Columna ${String.fromCharCode(65 + index)}`);
    state.pasteTable = hasHeader ? pastedTable.slice(1) : pastedTable;
    state.pasteMapping = autoPasteMapping(state.pasteColumns);
    if (!hasHeader && firstRow.length === 3) {
      state.pasteMapping = { length: 0, width: 1, quantity: 2 };
    } else if (!hasHeader && firstRow.length >= 4) {
      state.pasteMapping = { name: 0, length: 1, width: 2, quantity: 3 };
    }
  } else if (currentMapInputs.length) {
    state.pasteMapping = Object.fromEntries(
      currentMapInputs
        .filter((input) => input.value !== "")
        .map((input) => [input.dataset.pasteMap, Number(input.value)]),
    );
  }

  if (["length", "width", "quantity"].some((field) => state.pasteMapping[field] === undefined)) {
    state.pastePending = null;
    state.pastePreview = {
      status: "error",
      errors: ["Asigna las columnas Largo, Ancho y Cantidad para continuar."],
      formatMessage: "El Excel puede tener cualquier orden: usa los selectores de columnas.",
    };
    render();
    return;
  }

  const material = selectedMaterial(materialId);
  const neolith = isNeolithMaterial(material);
  const canonicalHeaders = ["nombre", "largo", "ancho", "cantidad", "veta", "l1 tapacanto", "l2 tapacanto", "a1 tapacanto", "a2 tapacanto"];
  const canonicalFields = ["name", "length", "width", "quantity", "grain", "top", "bottom", "left", "right"];
  const canonicalRows = state.pasteTable.map((row) =>
    canonicalFields.map((field) => {
      if (neolith && ["top", "bottom", "left", "right"].includes(field)) return "";
      const index = state.pasteMapping[field];
      return index === undefined ? "" : row[index] ?? "";
    }),
  );
  const imported = parsePieceImportTable([canonicalHeaders, ...canonicalRows], {
    catalogMaterials: selectedMaterials(),
    catalogEdges: edgeBands,
    fallbackMaterialId: materialId,
    fallbackGrain: defaultGrain,
    fallbackEdgeIds: defaultEdges,
    settings: state.settings,
    idFactory: () => crypto.randomUUID(),
  });
  const validRows = [];
  const productionErrors = [];
  imported.rows.forEach((piece, index) => {
    piece.measurementMode = measurementMode;
    if (neolith) {
      piece.edges = { top: null, right: null, bottom: null, left: null };
      const source = state.pasteTable[index] || [];
      piece.finishes = Object.fromEntries(
        ["top", "bottom", "left", "right"].map((side) => {
          const mappedValue =
            state.pasteMapping[side] === undefined
              ? ""
              : source[state.pasteMapping[side]];
          return [
            side,
            String(mappedValue ?? "").trim()
              ? neolithFinishFromImport(mappedValue)
              : defaultFinishes[side] || "rough",
          ];
        }),
      );
    }
    const error = pieceProductionError(piece, material, edgeBands, state.settings);
    if (error) productionErrors.push(`Fila ${index + 2}: ${error}`);
    else validRows.push(piece);
  });
  imported.rows = validRows;
  imported.errors = [...(imported.errors || []), ...productionErrors];
  imported.rejectedRows = Number(imported.rejectedRows || 0) + productionErrors.length;
  const totalUnits = imported.rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  state.pastePending = imported.rows.length
    ? { rows: imported.rows, materialIds: [materialId] }
    : null;
  state.pastePreview = {
    status: imported.rows.length ? "ready" : "error",
    errors: imported.errors,
    validCount: imported.rows.length,
    totalUnits,
    formatMessage: imported.rows.length
      ? `Columnas asignadas. ${imported.rejectedRows ? `${imported.rejectedRows} fila(s) fueron descartadas.` : "Todas las filas son válidas."} Revisa veta y lados antes de incorporar.`
      : imported.errors[0] || "No se reconocieron filas válidas.",
  };
  render();
}

function downloadImportReport() {
  const preview = state.importPreview;
  if (!preview?.issues?.length) return;
  const csvCell = (value) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = [
    ["archivo", "hoja", "fila", "campo", "problema"],
    ...preview.issues.map((issue) => [
      preview.fileName,
      preview.sheetName,
      issue.row || "",
      issue.field || "archivo",
      issue.message,
    ]),
  ];
  const csv = `\ufeff${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `Diagnostico_Importacion_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function normalizeImportedRoles(value) {
  const aliases = {
    admin: "admin",
    administrador: "admin",
    comercial: "comercial",
    produccion: "produccion",
    cliente: "cliente",
  };
  const roles = [...new Set(
    String(value || "")
      .split(/[,;|+\/]|\s+y\s+/i)
      .map((item) => aliases[normalizeHeader(item)])
      .filter(Boolean),
  )];
  if (roles.includes("cliente") && roles.length > 1) return [];
  return roles;
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
    const table = await readSheet(file, "Usuarios");
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
      const roles = normalizeImportedRoles(pick(row, ["perfil", "roles", "rol", "role"]));
      const role = roles.includes("admin") ? "admin" : roles[0] || "";
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
        roles,
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
  if (auth.visitor) {
    notify("La descarga PDF requiere una cuenta Cliente.", "error");
    return;
  }
  if (!latestResult?.plates.length) {
    notify("No hay placas para exportar.", "error");
    return;
  }
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  pdf.setProperties({
    title: `Plano de corte · ${state.project.projectName || state.project.clientName}`,
    subject: `Plano, listado de piezas y controles de producción por ${isSlabQuote() ? "placa" : "tablero"}`,
    author: "Casa Diseño Multiespacio",
  });

  const summary = latestResult.summary;
  const pageWidth = pdf.internal.pageSize.getWidth();
  pdf.setFillColor(23, 50, 77);
  pdf.rect(0, 0, pageWidth, 34, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("CASA DISEÑO MULTIESPACIO", 12, 10);
  pdf.setFontSize(18);
  pdf.text(`RESUMEN DE OPTIMIZACIÓN · ${isSlabQuote() ? "PLACAS" : "TABLEROS"}`, 12, 22);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text(`Cotización ${projectCode()} · R${state.revisionNo||1} · Motor ${state.settings.calculationVersion} · ${new Date().toLocaleString("es-CL")}`, 12, 29);
  pdf.setTextColor(37, 49, 60);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(state.project.projectName || "Proyecto sin nombre", 12, 44);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.text(`Cliente: ${state.project.clientName || "Sin identificar"} · Estado: ${statusLabels[state.project.status]}`, 12, 51);
  const metrics = [
    ["PLACAS", summary.boardCount],
    ["APROVECHAMIENTO", `${(100 - summary.waste).toFixed(1)} %`],
    ["PIEZAS", state.pieces.reduce((sum, piece) => sum + Number(piece.quantity || 0), 0)],
    ["TOTAL", clp(summary.total)],
  ];
  metrics.forEach(([label, value], index) => {
    const x = 12 + index * 69;
    pdf.setFillColor(index === 3 ? 232 : 242, index === 3 ? 239 : 244, index === 3 ? 231 : 246);
    pdf.roundedRect(x, 59, 63, 24, 2, 2, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.text(String(label), x + 4, 67);
    pdf.setFontSize(13);
    pdf.text(String(value), x + 4, 77);
  });
  pdf.setFontSize(10);
  pdf.text(isSlabQuote() ? "FORMATOS Y SERVICIOS" : "MATERIALES Y SERVICIOS", 12, 94);
  let summaryY = 102;
  const summarySpace=(height=10)=>{if(summaryY+height>175){pdf.addPage('a4','landscape');pdf.setTextColor(37,49,60);pdf.setFont('helvetica','bold');pdf.setFontSize(12);pdf.text('RESUMEN DE OPTIMIZACIÓN · CONTINUACIÓN',12,15);pdf.setFontSize(8);summaryY=28;}};
  pdf.setFontSize(8);
  latestResult.materialSummaries.forEach((item) => {
    const nameLines=pdf.splitTextToSize(`${item.sku} · ${item.name}`,105);
    const detailLines=pdf.splitTextToSize(`${item.boardCount} placa(s) · fábrica ${item.rawPlateLength} × ${item.rawPlateWidth} mm · útil ${item.usablePlateLength} × ${item.usablePlateWidth} mm · despunte ${item.perimeterTrim} mm/lado`,158);
    const height=Math.max(nameLines.length,detailLines.length)*4+4;
    summarySpace(height);
    pdf.setFont("helvetica", "bold");
    pdf.text(nameLines, 12, summaryY);
    pdf.setFont("helvetica", "normal");
    pdf.text(detailLines,124,summaryY);
    summaryY += height;
  });
  const edgeEntries = Object.entries(state.edgeCodeMap || {}).sort(
    (a, b) => Number(a[1].slice(1)) - Number(b[1].slice(1)),
  );
  if (edgeEntries.length) {
    summarySpace(18);
    summaryY += 4;
    pdf.setFont("helvetica", "bold");
    pdf.text("LEYENDA GLOBAL DE TAPACANTOS", 12, summaryY);
    summaryY += 7;
    edgeEntries.forEach(([edgeId, code]) => {
      const edge = edgeBands.find((item) => item.id === edgeId);
      const edgeSummary=latestResult.edgeSummaries.find(x=>x.edgeId===edgeId);const meters=edgeSummary?.meters||0;const wasteLabel=edgeSummary?.wasteMeters?` instalados + ${edgeSummary.wasteMeters.toFixed(2)} ml merma = ${edgeSummary.materialMeters.toFixed(2)} ml material`:'';
      const lines=pdf.splitTextToSize(`${edge?.sku || edgeId} · ${edge?.name || 'Tapacanto'} · ${meters.toFixed(2)} ml${wasteLabel}`,245);
      summarySpace(lines.length*4+3);
      pdf.text(`${code}`, 12, summaryY);
      pdf.setFont("helvetica", "normal");
      pdf.text(lines, 27, summaryY);
      pdf.setFont("helvetica", "bold");
      summaryY += lines.length*4+3;
    });
  }
  if (latestResult.finishSummaries?.length) {
    summaryY += 4;
    pdf.text("ACABADOS OPCIONALES POR LADO", 12, summaryY);
    summaryY += 7;
    pdf.setFont("helvetica", "normal");
    latestResult.finishSummaries.forEach((item) => {
      summarySpace(8);
      pdf.text(`${item.name}: ${item.meters.toFixed(2)} ml × ${clp(item.unitPrice)}/ml = ${clp(item.serviceSubtotal)}`, 12, summaryY);
      summaryY += 6;
    });
  }
  pdf.setFillColor(247, 244, 232);
  pdf.roundedRect(12, 183, 273, 16, 2, 2, "F");
  pdf.setTextColor(70, 61, 42);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("Regla de veta:", 16, 190);
  pdf.setFont("helvetica", "normal");
  pdf.text("Longitudinal sigue el Largo ingresado; Transversal sigue el Ancho ingresado. Los valores nunca se ordenan por tamaño.", 42, 190);
  pdf.text(
    isSlabQuote()
      ? "Biselado/Pulido y 45° se indican individualmente en L1, L2, A1 y A2."
      : "La numeración T1, T2… es única y se mantiene en todas las hojas de este proyecto.",
    16,
    196,
  );

  const sideValue = (piece, side) => {
    const material = selectedMaterial(piece.materialId);
    if (isNeolithMaterial(material)) {
      return { rough: "Sin adicional", bevel: "Bisel/Pulido", miter45: "45°" }[piece.finishes?.[side] || "rough"];
    }
    return state.edgeCodeMap?.[piece.edges?.[side]] || "—";
  };
  addPdfTable(pdf, {
    title: "LISTADO COMPLETO DE PIEZAS",
    subtitle: "Dimensiones semánticas ingresadas, sentido de veta y terminación de los cuatro lados.",
    columns: [
      { title: "Código", key: "code", width: 18 },
      { title: "Elemento", key: "name", width: 45 },
      { title: "Material", value: (row) => selectedMaterial(row.materialId)?.name || "", width: 44 },
      { title: "Largo", value: (row) => String(row.length), width: 22, align: "right" },
      { title: "Ancho", value: (row) => String(row.width), width: 22, align: "right" },
      { title: "Cant.", key: "quantity", width: 14, align: "right" },
      { title: "Veta", value: (row) => grainLabels[row.grain] || row.grain, width: 28 },
      { title: "L1", value: (row) => sideValue(row, "top"), width: 20 },
      { title: "L2", value: (row) => sideValue(row, "bottom"), width: 20 },
      { title: "A1", value: (row) => sideValue(row, "left"), width: 20 },
      { title: "A2", value: (row) => sideValue(row, "right"), width: 20 },
    ],
    rows: state.pieces,
  });

  latestResult.plates.forEach((plate, index) => {
    pdf.addPage("a4", "landscape");
    const canvas = document.querySelector(`#plan-${plate.index}`);
    if (!canvas) return;
    const maximumWidth = 292;
    const maximumHeight = 205;
    const imageScale = Math.min(
      maximumWidth / canvas.width,
      maximumHeight / canvas.height,
    );
    const imageWidth = canvas.width * imageScale;
    const imageHeight = canvas.height * imageScale;
    pdf.addImage(
      canvas.toDataURL("image/png"),
      "PNG",
      (297 - imageWidth) / 2,
      2,
      imageWidth,
      imageHeight,
    );
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(83, 94, 104);
    pdf.text(
      `Plano ${index + 1} de ${latestResult.plates.length} · Resumen y listado incluidos al inicio`,
      290,
      206.4,
      { align: "right" },
    );
  });
  pdf.save(
    `Plano_Corte_${state.project.projectName.replace(/[^a-z0-9]+/gi, "_") || "Proyecto"}.pdf`,
  );
}

app.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.classList.contains("schedule-form")) {
    const data = Object.fromEntries(new FormData(form));
    try {
      const payload = await api(
        `/api/projects/${form.dataset.projectId}/schedule`,
        {
          method: "PATCH",
          body: {
            executionDate: data.executionDate || "",
            deliveryDate: data.deliveryDate || "",
          },
        },
      );
      projectsCache = projectsCache.map((item) =>
        item.id === payload.project.id
          ? { ...item, ...payload.project }
          : item,
      );
      notify("Agenda de producción actualizada.");
    } catch (error) {
      notify(error.message, "error");
    }
    return;
  }
  if(form.dataset.v5Form||form.dataset.v51Form) return;
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
      await loadCatalog();await loadV5(v5Context());state.view = "dashboard";
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
      auth.visitor = false;
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
        await loadCatalog();await loadV5(v5Context());state.view = "dashboard";
      }
    } catch (error) {
      auth.error = error.message;
    }
    render();
    return;
  }
  if (form.id === "user-form") {
    const formData = new FormData(form);
    const data = {
      ...Object.fromEntries(formData),
      roles: formData.getAll("roles"),
    };
    try {
      await api("/api/users", { method: "POST", body: data });
      await loadUsers();
      notify("Usuario creado correctamente.");
    } catch (error) {
      notify(error.message, "error");
    }
    return;
  }
  if (form.id === "admin-catalog-form" && hasRole("admin")) {
    const formData = new FormData(form);
    const productType = formData.get("productType") === "edge" ? "edge" : "board";
    const productId = String(formData.get("productId") || "");
    const imageFile = formData.get("imageFile");
    const product = Object.fromEntries(
      [...formData.entries()].filter(
        ([key]) => !["productType", "productId", "imageFile", "grainRequired"].includes(key),
      ),
    );
    if (productType === "board") {
      product.grainRequired = formData.has("grainRequired");
    }
    try {
      const payload = await api(
        productId
          ? `/api/admin/catalog/${productType}/${encodeURIComponent(productId)}`
          : "/api/admin/catalog",
        {
          method: productId ? "PATCH" : "POST",
          body: { productType, product },
        },
      );
      applyCatalogPayload(payload.catalog);
      let imageMessage = "";
      if (imageFile?.size) {
        await uploadProductImage(product.sku, imageFile);
        imageMessage = " e imagen";
      }
      state.catalogEditingId = "";
      notify(`Producto${imageMessage} guardado(s) sin modificar cotizaciones anteriores.`);
      render();
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
  if(event.target.dataset.v5quote){state[event.target.dataset.v5quote]=event.target.value;return;}
  const target = event.target;
  if (target.dataset.contact) {
    state.contact[target.dataset.contact] = target.value;
    if (target.dataset.contact === "name") {
      state.project.clientName = target.value;
    }
  }
  if (target.dataset.project) {
    state.project[target.dataset.project] = target.value;
  }
  if (target.dataset.document) {
    state[target.dataset.document] = target.value;
  }
  if (target.dataset.assignedTo !== undefined) {
    state.assignedTo = target.value;
  }
  if (target.dataset.neolithColor) {
    const id = target.dataset.neolithColor;
    state.materialCustomizations[id] = {
      ...(state.materialCustomizations[id] || {}),
      color: target.value,
    };
    latestResult = null;
  }
  if (target.dataset.neolithPrice) {
    const id = target.dataset.neolithPrice;
    state.materialCustomizations[id] = {
      ...(state.materialCustomizations[id] || {}),
      netPrice: Math.max(0, Number(target.value) || 0),
    };
    latestResult = null;
  }
  if (target.id === "material-search") {
    state.productSearch = target.value;
    applyProductFilter(target.value);
  }
  if (target.id === "catalog-admin-search") {
    state.catalogAdminSearch = target.value;
    const query = target.value.trim().toLowerCase();
    document.querySelectorAll(".catalog-admin-row").forEach((row) => {
      row.hidden = Boolean(query) && !row.dataset.adminSearch.includes(query);
    });
  }
});

app.addEventListener("change", async (event) => {
  const target = event.target;
  if (target.dataset.collaborators !== undefined) {
    state.collaboratorIds = [...target.selectedOptions].map(
      (option) => option.value,
    );
    return;
  }
  if (target.dataset.pieceField) {
    updatePieceField(target);
    return;
  }
  if (target.dataset.pieceGrain) {
    const piece = state.pieces.find((item) => item.id === target.dataset.pieceGrain);
    if (!piece) return;
    const previous = piece.grain;
    const material = selectedMaterial(piece.materialId);
    const candidate = { ...piece, grain: target.value };
    const error = pieceProductionError(candidate, material, edgeBands, state.settings);
    if (error) {
      target.value = previous;
      notify(`No se cambió la veta: ${error}`, "error");
      return;
    }
    piece.grain = target.value;
    latestResult = null;
    notify("Sentido de veta actualizado sin intercambiar Largo y Ancho.");
    return;
  }
  if (target.name === "grain") {
    updateDimensionInputs(target.value);
  }
  if (target.name === "materialId" && target.closest("#piece-form")) {
    state.materialId = target.value;
    const neolith = isNeolithMaterial(selectedMaterial(target.value));
    const neolithControls = document.querySelector("[data-manual-neolith]");
    const boardControls = document.querySelector("[data-manual-board]");
    if (neolithControls) neolithControls.hidden = !neolith;
    if (boardControls) boardControls.hidden = neolith;
    const grain =
      document.querySelector('#piece-form input[name="grain"]:checked')?.value ||
      state.defaultGrain;
    updateDimensionInputs(grain, target.value);
  }
  if (target.id === "paste-material") {
    state.pasteRawText = document.querySelector("#piece-paste-text")?.value || "";
    state.pasteConfig.materialId = target.value;
    state.pasteColumns = [];
    state.pasteMapping = {};
    state.pastePreview = null;
    state.pastePending = null;
    render();
    return;
  }
  if (target.dataset.project === "rut") {
    state.project.rut = formatRut(target.value);
    target.value = state.project.rut;
  }
  if (target.dataset.pieceExcel !== undefined && target.files?.[0]) {
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
  if (target.dataset.pasteRowGrain !== undefined) {
    const piece = state.pastePending?.rows?.[Number(target.dataset.pasteRowGrain)];
    if (piece) {
      const previous = piece.grain;
      piece.grain = target.value;
      const error = pieceProductionError(
        piece,
        selectedMaterial(piece.materialId),
        edgeBands,
        state.settings,
      );
      if (error) {
        piece.grain = previous;
        notify(`Veta no aplicada: ${error}`, "error");
      }
    }
    render();
    return;
  }
  if (target.dataset.pasteRowEdge !== undefined) {
    const piece = state.pastePending?.rows?.[Number(target.dataset.pasteRowEdge)];
    if (piece) piece.edges[target.dataset.side] = target.value || null;
    render();
    return;
  }
  if (target.dataset.pasteRowFinish !== undefined) {
    const piece = state.pastePending?.rows?.[Number(target.dataset.pasteRowFinish)];
    if (piece) {
      piece.finishes = { ...(piece.finishes || {}), [target.dataset.side]: target.value || "rough" };
    }
    render();
    return;
  }
  if (target.dataset.pieceEdge) {
    const piece = state.pieces.find((item) => item.id === target.dataset.pieceEdge);
    if (piece) {
      const previous = piece.edges[target.dataset.side];
      piece.edges[target.dataset.side] = target.value || null;
      const error = edgeConfigurationError();
      if (error) {
        piece.edges[target.dataset.side] = previous;
        notify(`No se aplicó el tapacanto: ${error}`, "error");
      }
    }
    render();
  }
  if (target.dataset.pieceFinish) {
    const piece = state.pieces.find((item) => item.id === target.dataset.pieceFinish);
    if (piece) {
      piece.finishes = {
        ...(piece.finishes || {}),
        [target.dataset.side]: target.value || "rough",
      };
      latestResult = null;
    }
    render();
  }
  if(target.matches('[data-v51-stone-supply]')){state.settings.includeStoneMaterial=target.checked;render();}
  if (target.dataset.setting) {
    if(target.dataset.setting==='kerf'){try{state.settings.kerf=kerfValue(target.value);}catch(e){notify(e.message,'error');return;}render();return;}
    const maximum = target.dataset.setting.endsWith("Discount") ? 50 : Infinity;
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
        let invoiceNumber = String(project.invoiceNumber || "").trim();
        let dispatchGuideNumber = String(project.dispatchGuideNumber || "").trim();
        if (
          ["facturado_pagado", "produccion", "despacho", "entregado"].includes(
            target.value,
          ) &&
          !invoiceNumber
        ) {
          invoiceNumber = String(
            window.prompt(
              "Ingresa el número de factura para liberar el pedido a Producción:",
              "",
            ) || "",
          ).trim();
          if (!invoiceNumber) {
            notify("El número de factura es obligatorio.", "error");
            render();
            return;
          }
        }
        if (target.value === "entregado" && !dispatchGuideNumber) {
          dispatchGuideNumber = String(
            window.prompt(
              "Ingresa el número de guía de despacho para marcar el pedido como Entregado:",
              "",
            ) || "",
          ).trim();
          if (!dispatchGuideNumber) {
            notify("El número de guía de despacho es obligatorio.", "error");
            render();
            return;
          }
        }
        const payload = await api(`/api/projects/${project.id}`, {
          method: "PATCH",
          body: {
            ...project,
            invoiceNumber,
            dispatchGuideNumber,
            project: { ...project.project, status: target.value },
          },
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
  if (target.dataset.userRoles) {
    try {
      await api(`/api/users/${target.dataset.userRoles}`, {
        method: "PATCH",
        body: { roles: [...target.selectedOptions].map((option) => option.value) },
      });
      await loadUsers();
      notify("Perfiles actualizados.");
    } catch (error) {
      notify(error.message, "error");
    }
  }
});

app.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const action = button.dataset.action;
  if (button.dataset.workType) {
    const nextType = button.dataset.workType === "slabs" ? "slabs" : "boards";
    if (state.workType === nextType) return;
    if (
      (state.materialIds.length || state.pieces.length) &&
      !window.confirm(
        "Cambiar el tipo de optimización quitará los materiales y piezas ingresados en esta cotización. ¿Continuar?",
      )
    ) {
      return;
    }
    v5.importer=null;
    state.workType = nextType;
    state.categoryId = nextType === "slabs" ? "neolith" : "";
    state.materialId = "";
    state.materialIds = [];
    state.materialCustomizations = {};
    state.pieces = [];
    state.edgeCodeMap = {};
    state.importPreview = null;
    state.importPending = null;
    state.pastePreview = null;
    state.pastePending = null;
    state.pasteColumns = [];
    state.pasteMapping = {};
    state.pasteConfig = {
      ...emptyState().pasteConfig,
      defaultGrain: state.defaultGrain,
    };
    latestResult = null;
    render();
    return;
  }
  if (action === "piece-entry-mode") {
    state.pieceEntryMode = button.dataset.mode === "manual" ? "manual" : "paste";
    render();
    return;
  }
  if (action === "jump-plate") {
    document.getElementById(button.dataset.target)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    return;
  }
  if (action === "migrate-calculation-v4") {
    const confirmed = window.confirm(
      "Se recalcularán los planos con las reglas V4.1. En placas de piedra se usarán las nuevas medidas útiles y solo se cobrarán servicios. El registro existente no se elimina. ¿Continuar?",
    );
    if (!confirmed) return;
    state.settings = {
      ...state.settings,
      calculationVersion: V5,
      perimeterTrim: 10,
      neolithTrim: 30,
      kerf: 3,
    };
    state.workType = state.workType || inferredWorkType();
    latestResult = null;
    notify("Reglas V4.1 aplicadas. Revisa los planos y valores antes de guardar.");
    return;
  }
  if (button.dataset.catalogMaterial) {
    const materialId = button.dataset.catalogMaterial;
    const catalogMaterial = materials.find((item) => item.id === materialId);
    const requestedType = isNeolithMaterial(catalogMaterial) ? "slabs" : "boards";
    if (state.workType && state.workType !== requestedType) {
      notify("Este producto pertenece al otro tipo de optimización. Crea una cotización separada.", "error");
      return;
    }
    state.workType = requestedType;
    if (state.materialIds.includes(materialId)) {
      if (state.pieces.some((piece) => piece.materialId === materialId)) {
        notify("Ese tablero ya tiene piezas asignadas y no puede quitarse.", "error");
        return;
      }
      state.materialIds = state.materialIds.filter((id) => id !== materialId);
    } else {
      state.materialIds.push(materialId);
      state.materialId = materialId;
      notify("Tablero agregado a la cotización.");
      return;
    }
    render();
    return;
  }
  if (button.dataset.category) {
    const categoryHasAllowedProducts = quoteMaterials().some(
      (material) => material.categoryId === button.dataset.category || material.taxonomyId === button.dataset.category,
    );
    if (!categoryHasAllowedProducts) {
      notify("Esa categoría no corresponde al tipo de optimización seleccionado.", "error");
      return;
    }
    state.categoryId = button.dataset.category;
    render();
    return;
  }
  if (button.dataset.material) {
    const materialId = button.dataset.material;
    const chosenMaterial = materials.find((item) => item.id === materialId);
    const requestedType = isNeolithMaterial(chosenMaterial) ? "slabs" : "boards";
    if (!state.workType) state.workType = requestedType;
    if (state.workType !== requestedType) {
      notify("No se pueden mezclar tableros y placas de piedra en una misma cotización.", "error");
      return;
    }
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
    v5.importer=null;
    state = newQuoteState();
    render();
  }
  if (action === "toggle-access") {
    auth.mode = auth.mode === "register" ? "login" : "register";
    auth.error = "";
    render();
  }
  if (action === "visitor-access") {
    auth.visitor = true;
    auth.error = "";
    state = newQuoteState();
    state.view = "catalog";
    try {
      await loadCommercials();
    } catch (error) {
      auth.error = error.message;
    }
    render();
  }
  if (action === "visitor-exit") {
    auth.visitor = false;
    state = emptyState();
    render();
  }
  if (action === "catalog") {
    state.view = "catalog";
    render();
  }
  if (action === "return-quote") {
    state.view = "quote";
    render();
  }
  if (action === "catalog-kind") {
    state.catalogKind = button.dataset.kind === "edges" ? "edges" : "boards";
    state.productSearch = "";
    render();
  }
  if (action === "catalog-edge-group") {
    state.catalogEdgeGroup = button.dataset.group || "";
    state.productSearch = "";
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
  if (
    action === "production-dashboard" &&
    hasAnyRole(["admin", "produccion"])
  ) {
    try {
      await loadProjects();
      state.view = "production";
      render();
    } catch (error) {
      notify(error.message, "error");
    }
  }
  if (action === "production-period") {
    state.productionPeriod = button.dataset.period || "week";
    render();
  }
  if (action === "users" && hasRole("admin")) {
    try {
      await loadUsers();
      state.view = "users";
      render();
    } catch (error) {
      notify(error.message, "error");
    }
  }
  if (action === "catalog-admin" && hasRole("admin")) {
    try {
      await loadCatalog();
      state.catalogEditingId = "";
      state.view = "catalog-admin";
      render();
    } catch (error) {
      notify(error.message, "error");
    }
  }
  if (action === "catalog-admin-kind" && hasRole("admin")) {
    state.catalogAdminKind = button.dataset.kind === "edge" ? "edge" : "board";
    state.catalogEditingId = "";
    state.catalogAdminSearch = "";
    render();
  }
  if (action === "catalog-admin-new" && hasRole("admin")) {
    state.catalogEditingId = "";
    render();
  }
  if (action === "catalog-admin-edit" && hasRole("admin")) {
    state.catalogEditingId = button.dataset.id || "";
    render();
  }
  if (
    action === "notifications" &&
    hasAnyRole(["admin", "comercial", "produccion"])
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
    auth.visitor = false;
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
  if (action === "confirm-piece-import") {
    confirmPieceImport();
  }
  if (action === "analyze-piece-paste") {
    analyzePastedPieces();
  }
  if (action === "confirm-piece-paste") {
    addImportedPieceBatch(state.pastePending, "paste");
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
      if (isNeolithMaterial(selectedMaterial(piece.materialId))) return;
      piece.edges = { top: edgeId, right: edgeId, bottom: edgeId, left: edgeId };
    });
    render();
  }
  if (action === "apply-edge-sides") {
    applyFastEdges("sides");
  }
  if (action === "copy-edge-four") {
    applyFastEdges("same");
  }
  if (action === "clear-edge-scope") {
    clearFastEdges();
  }
  if (action === "apply-neolith-finishes") {
    applyNeolithFinishes();
  }
  if (action === "clear-edges") {
    state.pieces.forEach((piece) => {
      if (isNeolithMaterial(selectedMaterial(piece.materialId))) return;
      piece.edges = { top: null, right: null, bottom: null, left: null };
    });
    render();
  }
  if (action === "download-import-report") {
    downloadImportReport();
  }
  if (action === "save") await saveProject();
  if (action === "pdf") exportPdf();
  if (action === "labels-pdf") exportLabelsPdf();
  if (action === "delete-project" && hasRole("admin")) {
    const item = projectsCache.find((project) => project.id === button.dataset.id);
    if (!item) return;
    const confirmed = window.confirm(
      `¿Eliminar la cotización ${projectCode(item.id)} de ${item.project.clientName}? Se quitará de todos los paneles.`,
    );
    if (!confirmed) return;
    try {
      await api(`/api/projects/${item.id}`, { method: "DELETE" });
      projectsCache = projectsCache.filter((project) => project.id !== item.id);
      notificationsCache = notificationsCache.filter(
        (notification) => notification.projectId !== item.id,
      );
      notify("Cotización eliminada. El registro quedó protegido para auditoría.");
    } catch (error) {
      notify(error.message, "error");
    }
  }
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
    openV5Quote(projectsCache.find(p=>p.id===button.dataset.id));
    return;
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

function computeCurrentResult() {
  const key=calculationSignature(state);
  if(state.calculationSnapshot && (state.readOnlyRevision||key===state.loadedSignature)) return state.calculationSnapshot;
  const unchanged=state.loadedSignature&&key===state.loadedSignature;
  if(!unchanged && !state.readOnlyRevision){
    state.settings={...state.settings,calculationVersion:V5,perimeterTrim:10,neolithTrim:30,kerf:kerfValue(state.settings.kerf,v5.config.defaultKerf??3)};
    for(const [name,policy] of Object.entries(v5.config.services))state.settings[name]=policy.price;
    state.settings.servicePolicies=v5.config.services;
    if(!permitted(auth.user,'discount'))for(const field of ['boardDiscount','edgeDiscount','servicesDiscount'])state.settings[field]=0;
  }
  let mappingWarning='';
  if(!unchanged&&!state.readOnlyRevision&&state.materialIds.length){try{const mapped=updateQuoteProducts(structuredClone(state),materials,edgeBands);for(const key of ['materialIds','materialId','pieces','edgeCodeMap','materialCustomizations'])state[key]=mapped[key];}catch(e){mappingWarning=e.message;}}
  const result=optimizeProject(selectedMaterials(),state.pieces,edgeBands,state.settings);
  if(mappingWarning)result.warnings.push(mappingWarning);
  if(unchanged && state.summary){result.summary=state.summary;result.historicalReconstruction=true;}
  return result;
}
function openV5Quote(item,readOnly=false) {
  if(!item)return;
  const defaults=emptyState(),copy=structuredClone(item);
  state={...defaults,...copy,projectId:item.id,view:'quote',step:4,readOnlyRevision:readOnly,
    originalSettings:structuredClone(item.settings||{}),
    materialIds:item.materialIds?.length?item.materialIds:[item.materialId].filter(Boolean),
    workType:item.workType||((item.materialIds||[item.materialId]).some(id=>isNeolithMaterial(materials.find(m=>m.id===id)))?'slabs':'boards'),
    settings:item.settings?.calculationVersion?{...defaults.settings,...item.settings}:{...defaults.settings,...item.settings,calculationVersion:'legacy-v3',perimeterTrim:0,neolithTrim:0}};
  state.loadedSignature=calculationSignature(state);v5.importer=null;latestResult=null;render();
}
function v5Context() {
  return {state,user:auth.user,projects:projectsCache,materials,edges:edgeBands,accessories:accessoriesCatalog,services:servicesCatalog,api,render,notify,loadProjects,loadCatalog,selectedMaterials,canCreateQuote,
    canEditRecord:p=>hasRole('admin')||(hasRole('produccion')&&['facturado_pagado','produccion','despacho','entregado'].includes(p.project.status))||(hasRole('comercial')&&['cotizacion','facturacion'].includes(p.project.status)&&(p.ownerId===auth.user?.id||p.assignedTo===auth.user?.id||p.collaboratorIds?.includes(auth.user?.id)))||(hasRole('logistica')&&p.project.status==='despacho'),
    statusEntries:status=>statusEntriesForRole(auth.user?.role,status),uploadImage:uploadProductImage,
    pieceError:p=>pieceProductionError(p,materials.find(m=>m.id===p.materialId),edgeBands,{...state.settings,calculationVersion:V5,kerf:kerfValue(state.settings.kerf),perimeterTrim:10,neolithTrim:30}),
    openQuote:openV5Quote,
    newQuote:(type,group)=>{state=newQuoteState();state.settings.kerf=v5.config.defaultKerf??3;state.workType=type;state.view='quote';if(group){state.groupId=group.groupId||group.id;state.project={...state.project,projectName:group.project.projectName,clientName:group.project.clientName,rut:group.project.rut,projectAddress:group.project.projectAddress};state.assignedTo=group.assignedTo;state.collaboratorIds=group.collaboratorIds||[];}latestResult=null;},
  };
}
attachV5(app,v5Context);
attachV51(app,v5Context);

async function initialize() {
  render();
  try {
    await loadCatalog();await loadV5(v5Context());
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
          await loadCatalog();await loadV5(v5Context());state.view = "dashboard";
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
  if (!hasAnyRole(["admin", "comercial", "produccion"])) return;
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
