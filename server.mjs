import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import bcrypt from "bcryptjs";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pg from "pg";
import unzipper from "unzipper";

import { categories as baseCategories, edgeBands, materials } from "./src/data.js";
import { optimizeProject, pieceFitsMaterial, validateRut } from "./src/logic.js";

const { Pool } = pg;
const root = fileURLToPath(new URL(".", import.meta.url));
const dist = join(root, "dist");
const port = Number(process.env.PORT || 10000);
const isProduction = process.env.NODE_ENV === "production";
const sessionHours = 8;
const validRoles = new Set(["admin", "comercial", "produccion", "cliente"]);
const validStatuses = new Set([
  "cotizacion",
  "facturacion",
  "facturado_pagado",
  "produccion",
  "despacho",
  "entregado",
]);

const hashToken = (token) =>
  createHash("sha256").update(String(token)).digest("hex");

const publicUser = (user) =>
  user && {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    clientName: user.clientName || "",
    phone: user.phone || "",
    rut: user.rut || "",
    location: user.location || "",
    billingAddress: user.billingAddress || "",
    businessActivity: user.businessActivity || "",
    projectAddress: user.projectAddress || "",
    active: Boolean(user.active),
    mustChangePassword: Boolean(user.mustChangePassword),
    createdAt: user.createdAt,
  };

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parseActive(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return fallback;
  return !["no", "false", "0", "inactivo", "inactive"].includes(
    String(value).trim().toLowerCase(),
  );
}

function normalizeUserInput(body = {}) {
  return {
    email: normalizeEmail(body.email),
    fullName: String(body.fullName || "").trim(),
    password: String(body.password || ""),
    role: String(body.role || "").trim().toLowerCase(),
    clientName: String(body.clientName || "").trim(),
    phone: String(body.phone || "").trim(),
    rut: String(body.rut || "").trim(),
    location: String(body.location || "").trim(),
    billingAddress: String(body.billingAddress || "").trim(),
    businessActivity: String(body.businessActivity || "").trim(),
    projectAddress: String(body.projectAddress || "").trim(),
    active: parseActive(body.active, true),
  };
}

function userInputError(user) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) {
    return "El correo no es válido.";
  }
  if (user.fullName.length < 2) return "Falta el nombre completo.";
  if (user.password.length < 10) {
    return "La clave temporal requiere al menos 10 caracteres.";
  }
  if (!validRoles.has(user.role)) return "El perfil no es válido.";
  return "";
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [
          decodeURIComponent(index >= 0 ? part.slice(0, index) : part),
          decodeURIComponent(index >= 0 ? part.slice(index + 1) : ""),
        ];
      }),
  );
}

function sameValue(a, b) {
  const first = Buffer.from(String(a || ""));
  const second = Buffer.from(String(b || ""));
  return first.length === second.length && timingSafeEqual(first, second);
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    fullName: row.full_name,
    role: row.role,
    clientName: row.client_name,
    phone: row.phone,
    rut: row.rut,
    location: row.location,
    billingAddress: row.billing_address,
    businessActivity: row.business_activity,
    projectAddress: row.project_address,
    active: row.active,
    mustChangePassword: Boolean(row.must_change_password),
    createdAt: row.created_at,
  };
}

function mapProject(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.owner_id,
    assignedTo: row.assigned_to,
    project: {
      projectName: row.project_name || "",
      clientName: row.client_name,
      rut: row.rut || "",
      status: row.status,
      projectAddress: row.payload?.projectAddress || "",
    },
    ...row.payload,
    summary: row.summary || row.payload?.summary || null,
    executionDate: row.execution_date || null,
    deliveryDate: row.delivery_date || null,
    deletedAt: row.deleted_at || null,
    deletedBy: row.deleted_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ownerName:
      row.owner_name ||
      (row.payload?.submissionSource === "visitante" ? "Visitante" : ""),
    assignedName: row.assigned_name || "",
  };
}

function mapNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    type: row.type,
    title: row.title,
    message: row.message,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

function mapCatalogRevision(row) {
  if (!row) return null;
  return {
    id: row.id,
    productType: row.product_type,
    sku: row.sku,
    payload: row.payload || {},
    active: Boolean(row.active),
    replacesId: row.replaces_id || "",
    createdBy: row.created_by || "",
    createdAt: row.created_at,
  };
}

function catalogSlug(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "producto";
}

function catalogNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : Number(fallback) || 0;
}

function normalizeCatalogProduct(productType, body = {}, current = {}) {
  const source = { ...current, ...body };
  const sku = String(source.sku || "").trim();
  const name = String(source.name || "").trim();
  if (productType === "board") {
    const categoryName = String(
      source.categoryName || source.sourceCategory || "",
    ).trim();
    const previousCategoryName = String(
      current.categoryName || current.sourceCategory || "",
    ).trim();
    const categoryNameChanged =
      body.categoryName !== undefined && categoryName !== previousCategoryName;
    const categoryId = String(
      body.categoryId ||
        (categoryNameChanged
          ? catalogSlug(categoryName)
          : current.categoryId || catalogSlug(categoryName)),
    ).trim();
    return {
      categoryId,
      categoryName,
      sourceCategory: String(source.sourceCategory || categoryName).trim(),
      brand: String(source.brand || "Sin marca").trim(),
      sku,
      name,
      description: String(source.description || "").trim(),
      plateLength: Math.round(catalogNumber(source.plateLength)),
      plateWidth: Math.round(catalogNumber(source.plateWidth)),
      thickness: catalogNumber(source.thickness),
      netPrice: Math.round(catalogNumber(source.netPrice)),
      minPrice: Math.round(catalogNumber(source.minPrice)),
      purchasePrice: Math.round(catalogNumber(source.purchasePrice)),
      supplierCode: String(source.supplierCode || "").trim(),
      sourceId: String(source.sourceId || "").trim(),
      image: String(source.image || `/materiales/${catalogSlug(sku)}.jpg`),
      texture: String(source.texture || "#ece8df"),
      grainRequired:
        source.grainRequired === undefined
          ? true
          : Boolean(source.grainRequired),
      suggestedEdgeId: String(source.suggestedEdgeId || "").trim(),
    };
  }
  return {
    group: String(source.group || "Otro tapacanto").trim(),
    material: String(source.material || "PVC").trim(),
    thickness: catalogNumber(source.thickness),
    sku,
    name,
    description: String(source.description || "").trim(),
    color: String(source.color || "#334155"),
    price: Math.round(catalogNumber(source.price)),
    minPrice: Math.round(catalogNumber(source.minPrice)),
    purchasePrice: Math.round(catalogNumber(source.purchasePrice)),
    supplierCode: String(source.supplierCode || "").trim(),
    serviceRate: Math.round(catalogNumber(source.serviceRate)),
    style: String(source.style || "solid"),
  };
}

function catalogProductError(productType, product) {
  if (!product.sku) return "El código SKU es obligatorio.";
  if (!product.name) return "El nombre del producto es obligatorio.";
  if (productType === "board") {
    if (!product.categoryId || !product.categoryName) {
      return "La categoría del tablero es obligatoria.";
    }
    if (
      product.plateLength <= 0 ||
      product.plateWidth <= 0 ||
      product.thickness <= 0
    ) {
      return "Las medidas y el espesor del tablero deben ser mayores que cero.";
    }
    if (
      product.netPrice < 0 ||
      product.minPrice < 0 ||
      product.purchasePrice < 0
    ) {
      return "Los precios del tablero no pueden ser negativos.";
    }
  } else if (
    product.thickness <= 0 ||
    product.price < 0 ||
    product.serviceRate < 0
  ) {
    return "Revisa el espesor y los valores del tapacanto.";
  }
  return "";
}

async function buildRuntimeCatalog(database) {
  const revisions = await database.listCatalogRevisions();
  const replacedIds = new Set(
    revisions.map((revision) => revision.replacesId).filter(Boolean),
  );
  const baseBoards = materials.map((item) => ({
    ...item,
    categoryName:
      baseCategories.find((category) => category.id === item.categoryId)?.name ||
      item.sourceCategory ||
      "Tableros",
    active: !replacedIds.has(item.id),
    catalogSource: "excel",
  }));
  const baseEdges = edgeBands.map((item) => ({
    ...item,
    active: !replacedIds.has(item.id),
    catalogSource: "excel",
  }));
  const revisionBoards = revisions
    .filter((revision) => revision.productType === "board")
    .map((revision) => ({
      ...revision.payload,
      id: revision.id,
      active: revision.active,
      replacesId: revision.replacesId,
      createdAt: revision.createdAt,
      catalogSource: "administracion",
    }));
  const revisionEdges = revisions
    .filter((revision) => revision.productType === "edge")
    .map((revision) => ({
      ...revision.payload,
      id: revision.id,
      active: revision.active,
      replacesId: revision.replacesId,
      createdAt: revision.createdAt,
      catalogSource: "administracion",
    }));
  const allMaterials = [...baseBoards, ...revisionBoards];
  const allEdgeBands = [...baseEdges, ...revisionEdges];
  const categoryMap = new Map(
    baseCategories.map((category) => [category.id, { ...category }]),
  );
  for (const material of allMaterials.filter((item) => item.active !== false)) {
    if (!categoryMap.has(material.categoryId)) {
      categoryMap.set(material.categoryId, {
        id: material.categoryId,
        name: material.categoryName || material.sourceCategory || "Tableros",
        icon: "▧",
      });
    }
  }
  const categories = [...categoryMap.values()].map((category) => ({
    ...category,
    count: allMaterials.filter(
      (material) =>
        material.active !== false && material.categoryId === category.id,
    ).length,
  }));
  return { categories, materials: allMaterials, edgeBands: allEdgeBands };
}

function normalizeImageKey(value = "") {
  return basename(String(value || ""), extname(String(value || "")))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const imageCatalogAliases = new Map();
for (const item of [...materials, ...edgeBands]) {
  for (const alias of [item.sku, item.id, item.supplierCode]) {
    const key = normalizeImageKey(alias);
    if (key && !imageCatalogAliases.has(key)) {
      imageCatalogAliases.set(key, normalizeImageKey(item.sku || item.id));
    }
  }
}

function resolveCatalogImageKey(value = "") {
  const key = normalizeImageKey(value);
  const withoutCopySuffix = key.replace(/_[0-9]+$/, "");
  return (
    imageCatalogAliases.get(key) ||
    imageCatalogAliases.get(withoutCopySuffix) ||
    key
  );
}

async function importBundledMaterialImages(pool) {
  const archivePath = join(root, "catalog", "IMAGENES_PRODUCTOS_V3.zip");
  if (!existsSync(archivePath)) return;
  const existingResult = await pool.query("SELECT sku FROM material_images");
  const existing = new Set(existingResult.rows.map((row) => row.sku));
  const archive = await unzipper.Open.file(archivePath);
  const candidates = archive.files.filter(
    (file) =>
      file.type === "File" &&
      [".jpg", ".jpeg", ".png", ".webp"].includes(
        extname(file.path).toLowerCase(),
      ),
  );
  let imported = 0;
  for (const file of candidates) {
    const sku = resolveCatalogImageKey(file.path);
    if (!sku || existing.has(sku)) continue;
    const data = await file.buffer();
    if (data.length > 2_500_000) continue;
    const extension = extname(file.path).toLowerCase();
    const mimeType =
      extension === ".png"
        ? "image/png"
        : extension === ".webp"
          ? "image/webp"
          : "image/jpeg";
    await pool.query(
      `INSERT INTO material_images (sku, mime_type, data)
       VALUES ($1,$2,$3)
       ON CONFLICT (sku) DO NOTHING`,
      [sku, mimeType, data],
    );
    existing.add(sku);
    imported += 1;
  }
  if (imported) {
    console.log(`Catálogo visual V3: ${imported} imagen(es) incorporada(s).`);
  }
}

function html(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function quoteEmailRecipients(
  admins = [],
  configuredRecipients =
    process.env.NOTIFICATION_TO_EMAIL || "contacto@cdchile.cl",
) {
  const configured = String(configuredRecipients || "")
    .split(/[;,]/)
    .map(normalizeEmail)
    .filter((email) => email.includes("@"));
  return [
    ...new Set([
      ...admins.map((admin) => normalizeEmail(admin.email)),
      ...configured,
      "contacto@cdchile.cl",
    ]),
  ].filter((email) => email.includes("@"));
}

async function sendQuoteEmail(recipients, project, creator) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATION_FROM_EMAIL;
  const uniqueRecipients = [...new Set(recipients.map(normalizeEmail))].filter(
    (email) => email.includes("@"),
  );
  if (!apiKey || !from || !uniqueRecipients.length) return;
  const appUrl = process.env.RENDER_EXTERNAL_HOSTNAME
    ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
    : process.env.APP_URL || "";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: uniqueRecipients,
      subject: `Nueva cotización · ${project.project.clientName}`,
      html: `
        <h2>Nueva cotización en Casa Diseño</h2>
        <p><strong>Cliente:</strong> ${html(project.project.clientName)}</p>
        <p><strong>Proyecto:</strong> ${html(
          project.project.projectName || "Sin nombre",
        )}</p>
        <p><strong>Estado:</strong> ${html(project.project.status)}</p>
        <p><strong>Creada por:</strong> ${html(creator.fullName)} (${html(
          creator.email,
        )})</p>
        <p><strong>Total:</strong> ${new Intl.NumberFormat("es-CL", {
          style: "currency",
          currency: "CLP",
          maximumFractionDigits: 0,
        }).format(project.summary?.total || 0)}</p>
        ${
          appUrl
            ? `<p><a href="${html(appUrl)}">Abrir cotizador</a></p>`
            : ""
        }
      `,
    }),
  });
  if (!response.ok) {
    throw new Error(`Resend respondió ${response.status}.`);
  }
}

class PostgresStore {
  constructor(connectionString) {
    this.pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS app_users (
        id UUID PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin','comercial','produccion','cliente')),
        client_name TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        rut TEXT NOT NULL DEFAULT '',
        location TEXT NOT NULL DEFAULT '',
        billing_address TEXT NOT NULL DEFAULT '',
        business_activity TEXT NOT NULL DEFAULT '',
        project_address TEXT NOT NULL DEFAULT '',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS app_sessions (
        token_hash TEXT PRIMARY KEY,
        csrf_token TEXT NOT NULL,
        user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY,
        owner_id UUID REFERENCES app_users(id),
        assigned_to UUID REFERENCES app_users(id),
        project_name TEXT NOT NULL DEFAULT '',
        client_name TEXT NOT NULL,
        rut TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK (status IN ('cotizacion','facturacion','facturado_pagado','produccion','despacho','entregado')),
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        summary JSONB,
        execution_date DATE,
        delivery_date DATE,
        deleted_at TIMESTAMPTZ,
        deleted_by UUID REFERENCES app_users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS app_notifications (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        type TEXT NOT NULL DEFAULT 'new_quote',
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS material_images (
        sku TEXT PRIMARY KEY,
        mime_type TEXT NOT NULL,
        data BYTEA NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS catalog_product_revisions (
        id TEXT PRIMARY KEY,
        product_type TEXT NOT NULL CHECK (product_type IN ('board','edge')),
        sku TEXT NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        replaces_id TEXT,
        created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS projects_owner_idx ON projects(owner_id);
      CREATE INDEX IF NOT EXISTS projects_status_idx ON projects(status);
      CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON app_sessions(expires_at);
      CREATE INDEX IF NOT EXISTS notifications_user_idx
        ON app_notifications(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS catalog_product_type_idx
        ON catalog_product_revisions(product_type, active, created_at DESC);
      CREATE INDEX IF NOT EXISTS catalog_product_sku_idx
        ON catalog_product_revisions(sku);
      ALTER TABLE app_users
        ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE app_users
        ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
      ALTER TABLE app_users
        ADD COLUMN IF NOT EXISTS rut TEXT NOT NULL DEFAULT '';
      ALTER TABLE app_users
        ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '';
      ALTER TABLE app_users
        ADD COLUMN IF NOT EXISTS billing_address TEXT NOT NULL DEFAULT '';
      ALTER TABLE app_users
        ADD COLUMN IF NOT EXISTS business_activity TEXT NOT NULL DEFAULT '';
      ALTER TABLE app_users
        ADD COLUMN IF NOT EXISTS project_address TEXT NOT NULL DEFAULT '';
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS execution_date DATE;
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS delivery_date DATE;
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES app_users(id);
      ALTER TABLE projects
        ALTER COLUMN owner_id DROP NOT NULL;
      CREATE INDEX IF NOT EXISTS projects_deleted_idx ON projects(deleted_at);
    `);
    await this.pool.query(`
      ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
      UPDATE projects SET status = 'facturacion' WHERE status = 'venta';
      ALTER TABLE projects
        ADD CONSTRAINT projects_status_check
        CHECK (status IN ('cotizacion','facturacion','facturado_pagado','produccion','despacho','entregado'));
    `);
    await importBundledMaterialImages(this.pool);
    await this.pool.query("DELETE FROM app_sessions WHERE expires_at <= NOW()");
  }

  async countUsers() {
    const result = await this.pool.query("SELECT COUNT(*)::int AS count FROM app_users");
    return result.rows[0].count;
  }

  async createUser(user) {
    const result = await this.pool.query(
      `INSERT INTO app_users
        (id, email, password_hash, full_name, role, client_name, phone, rut,
         location, billing_address, business_activity, project_address,
         active, must_change_password)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        user.id,
        user.email,
        user.passwordHash,
        user.fullName,
        user.role,
        user.clientName || "",
        user.phone || "",
        user.rut || "",
        user.location || "",
        user.billingAddress || "",
        user.businessActivity || "",
        user.projectAddress || "",
        user.active ?? true,
        user.mustChangePassword ?? false,
      ],
    );
    return mapUser(result.rows[0]);
  }

  async findUserByEmail(email) {
    const result = await this.pool.query(
      "SELECT * FROM app_users WHERE email = $1",
      [email],
    );
    return mapUser(result.rows[0]);
  }

  async getUser(id) {
    const result = await this.pool.query("SELECT * FROM app_users WHERE id = $1", [
      id,
    ]);
    return mapUser(result.rows[0]);
  }

  async listUsers() {
    const result = await this.pool.query(
      "SELECT * FROM app_users ORDER BY active DESC, full_name ASC",
    );
    return result.rows.map(mapUser);
  }

  async listActiveAdmins() {
    const result = await this.pool.query(
      "SELECT * FROM app_users WHERE role='admin' AND active=TRUE ORDER BY created_at",
    );
    return result.rows.map(mapUser);
  }

  async listActiveUsersByRole(role) {
    const result = await this.pool.query(
      "SELECT * FROM app_users WHERE role=$1 AND active=TRUE ORDER BY full_name",
      [role],
    );
    return result.rows.map(mapUser);
  }

  async updateUser(id, changes) {
    const current = await this.getUser(id);
    if (!current) return null;
    const next = { ...current, ...changes };
    const result = await this.pool.query(
      `UPDATE app_users
       SET email=$2, password_hash=$3, full_name=$4, role=$5,
           client_name=$6, phone=$7, rut=$8, location=$9, active=$10,
           must_change_password=$11, billing_address=$12,
           business_activity=$13, project_address=$14, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [
        id,
        next.email,
        next.passwordHash,
        next.fullName,
        next.role,
        next.clientName || "",
        next.phone || "",
        next.rut || "",
        next.location || "",
        next.active,
        next.mustChangePassword ?? false,
        next.billingAddress || "",
        next.businessActivity || "",
        next.projectAddress || "",
      ],
    );
    return mapUser(result.rows[0]);
  }

  async createSession(session) {
    await this.pool.query(
      `INSERT INTO app_sessions (token_hash, csrf_token, user_id, expires_at)
       VALUES ($1,$2,$3,$4)`,
      [session.tokenHash, session.csrfToken, session.userId, session.expiresAt],
    );
  }

  async getSession(tokenHash) {
    const result = await this.pool.query(
      `SELECT s.token_hash, s.csrf_token, s.expires_at, u.*
       FROM app_sessions s JOIN app_users u ON u.id=s.user_id
       WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.active=TRUE`,
      [tokenHash],
    );
    if (!result.rows[0]) return null;
    return {
      tokenHash: result.rows[0].token_hash,
      csrfToken: result.rows[0].csrf_token,
      expiresAt: result.rows[0].expires_at,
      user: mapUser(result.rows[0]),
    };
  }

  async deleteSession(tokenHash) {
    await this.pool.query("DELETE FROM app_sessions WHERE token_hash=$1", [
      tokenHash,
    ]);
  }

  async createNotification(notification) {
    const result = await this.pool.query(
      `INSERT INTO app_notifications
        (id, user_id, project_id, type, title, message)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        notification.id,
        notification.userId,
        notification.projectId,
        notification.type,
        notification.title,
        notification.message,
      ],
    );
    return mapNotification(result.rows[0]);
  }

  async listNotifications(userId) {
    const result = await this.pool.query(
      `SELECT * FROM app_notifications
       WHERE user_id=$1
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId],
    );
    return result.rows.map(mapNotification);
  }

  async markNotificationRead(id, userId) {
    const result = await this.pool.query(
      `UPDATE app_notifications
       SET read_at=COALESCE(read_at, NOW())
       WHERE id=$1 AND user_id=$2
       RETURNING *`,
      [id, userId],
    );
    return mapNotification(result.rows[0]);
  }

  async upsertMaterialImage(image) {
    const result = await this.pool.query(
      `INSERT INTO material_images (sku, mime_type, data)
       VALUES ($1,$2,$3)
       ON CONFLICT (sku) DO UPDATE SET
         mime_type=EXCLUDED.mime_type,
         data=EXCLUDED.data,
         updated_at=NOW()
       RETURNING sku, mime_type, updated_at`,
      [image.sku, image.mimeType, image.data],
    );
    return result.rows[0];
  }

  async getMaterialImage(sku) {
    const result = await this.pool.query(
      "SELECT sku, mime_type, data, updated_at FROM material_images WHERE sku=$1",
      [sku],
    );
    return result.rows[0] || null;
  }

  async listCatalogRevisions() {
    const result = await this.pool.query(
      `SELECT * FROM catalog_product_revisions
       ORDER BY created_at ASC`,
    );
    return result.rows.map(mapCatalogRevision);
  }

  async createCatalogRevision(revision) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (revision.replacesId) {
        await client.query(
          `UPDATE catalog_product_revisions SET active=FALSE
           WHERE id=$1`,
          [revision.replacesId],
        );
      }
      const result = await client.query(
        `INSERT INTO catalog_product_revisions
          (id, product_type, sku, payload, active, replaces_id, created_by)
         VALUES ($1,$2,$3,$4::jsonb,TRUE,$5,$6)
         RETURNING *`,
        [
          revision.id,
          revision.productType,
          revision.sku,
          JSON.stringify(revision.payload),
          revision.replacesId || null,
          revision.createdBy || null,
        ],
      );
      await client.query("COMMIT");
      return mapCatalogRevision(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listProjects(user) {
    const { where, params } = projectVisibility(user);
    const result = await this.pool.query(
      `SELECT p.*, owner.full_name AS owner_name,
              assigned.full_name AS assigned_name
       FROM projects p
       LEFT JOIN app_users owner ON owner.id=p.owner_id
       LEFT JOIN app_users assigned ON assigned.id=p.assigned_to
       WHERE p.deleted_at IS NULL AND (${where})
       ORDER BY p.updated_at DESC`,
      params,
    );
    return result.rows.map(mapProject);
  }

  async getProject(id) {
    const result = await this.pool.query(
      `SELECT p.*, owner.full_name AS owner_name,
              assigned.full_name AS assigned_name
       FROM projects p
       LEFT JOIN app_users owner ON owner.id=p.owner_id
       LEFT JOIN app_users assigned ON assigned.id=p.assigned_to
       WHERE p.id=$1 AND p.deleted_at IS NULL`,
      [id],
    );
    return mapProject(result.rows[0]);
  }

  async saveProject(record) {
    const result = await this.pool.query(
      `INSERT INTO projects
        (id, owner_id, assigned_to, project_name, client_name, rut, status, payload, summary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         assigned_to=EXCLUDED.assigned_to,
         project_name=EXCLUDED.project_name,
         client_name=EXCLUDED.client_name,
         rut=EXCLUDED.rut,
         status=EXCLUDED.status,
         payload=EXCLUDED.payload,
         summary=EXCLUDED.summary,
         updated_at=NOW()
       RETURNING *`,
      [
        record.id,
        record.ownerId,
        record.assignedTo || null,
        record.project.projectName || "",
        record.project.clientName,
        record.project.rut || "",
        record.project.status,
        JSON.stringify(record.payload || {}),
        JSON.stringify(record.summary || null),
      ],
    );
    return mapProject(result.rows[0]);
  }

  async updateProjectSchedule(id, executionDate, deliveryDate) {
    const result = await this.pool.query(
      `UPDATE projects
       SET execution_date=$2::date,
           delivery_date=$3::date,
           updated_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [id, executionDate || null, deliveryDate || null],
    );
    return mapProject(result.rows[0]);
  }

  async deleteProject(id, userId) {
    const result = await this.pool.query(
      `UPDATE projects
       SET deleted_at=NOW(), deleted_by=$2, updated_at=NOW()
       WHERE id=$1 AND deleted_at IS NULL
       RETURNING *`,
      [id, userId],
    );
    return mapProject(result.rows[0]);
  }
}

export function projectVisibility(user) {
  const where =
      ["admin", "produccion"].includes(user.role)
        ? "TRUE"
        : user.role === "comercial"
            ? "(p.owner_id=$1 OR p.assigned_to=$1 OR COALESCE(p.payload->'collaboratorIds','[]'::jsonb) ? $1::text)"
            : "p.owner_id=$1";
  const params = ["comercial", "cliente"].includes(user.role)
    ? [user.id]
    : [];
  return { where, params };
}

class MemoryStore {
  constructor() {
    this.users = new Map();
    this.sessions = new Map();
    this.projects = new Map();
    this.notifications = new Map();
    this.materialImages = new Map();
    this.catalogRevisions = new Map();
  }
  async init() {}
  async countUsers() {
    return this.users.size;
  }
  async createUser(user) {
    if ([...this.users.values()].some((item) => item.email === user.email)) {
      const error = new Error("duplicate");
      error.code = "23505";
      throw error;
    }
    const record = {
      mustChangePassword: false,
      ...user,
      createdAt: new Date().toISOString(),
    };
    this.users.set(record.id, record);
    return record;
  }
  async findUserByEmail(email) {
    return [...this.users.values()].find((item) => item.email === email) || null;
  }
  async getUser(id) {
    return this.users.get(id) || null;
  }
  async listUsers() {
    return [...this.users.values()];
  }
  async listActiveAdmins() {
    return [...this.users.values()].filter(
      (user) => user.role === "admin" && user.active,
    );
  }
  async listActiveUsersByRole(role) {
    return [...this.users.values()].filter(
      (user) => user.role === role && user.active,
    );
  }
  async updateUser(id, changes) {
    const current = this.users.get(id);
    if (!current) return null;
    const next = { ...current, ...changes };
    this.users.set(id, next);
    return next;
  }
  async createSession(session) {
    this.sessions.set(session.tokenHash, session);
  }
  async getSession(tokenHash) {
    const session = this.sessions.get(tokenHash);
    if (!session || new Date(session.expiresAt) <= new Date()) return null;
    const user = this.users.get(session.userId);
    if (!user?.active) return null;
    return { ...session, user };
  }
  async deleteSession(tokenHash) {
    this.sessions.delete(tokenHash);
  }
  async createNotification(notification) {
    const saved = {
      ...notification,
      readAt: null,
      createdAt: new Date().toISOString(),
    };
    this.notifications.set(saved.id, saved);
    return saved;
  }
  async listNotifications(userId) {
    return [...this.notifications.values()]
      .filter((notification) => notification.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  async markNotificationRead(id, userId) {
    const notification = this.notifications.get(id);
    if (!notification || notification.userId !== userId) return null;
    const saved = {
      ...notification,
      readAt: notification.readAt || new Date().toISOString(),
    };
    this.notifications.set(id, saved);
    return saved;
  }
  async upsertMaterialImage(image) {
    const saved = { ...image, updatedAt: new Date().toISOString() };
    this.materialImages.set(image.sku, saved);
    return saved;
  }
  async getMaterialImage(sku) {
    return this.materialImages.get(sku) || null;
  }
  async listCatalogRevisions() {
    return [...this.catalogRevisions.values()].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
    );
  }
  async createCatalogRevision(revision) {
    if (revision.replacesId && this.catalogRevisions.has(revision.replacesId)) {
      const previous = this.catalogRevisions.get(revision.replacesId);
      this.catalogRevisions.set(revision.replacesId, {
        ...previous,
        active: false,
      });
    }
    const saved = {
      ...revision,
      active: true,
      createdAt: new Date().toISOString(),
    };
    this.catalogRevisions.set(saved.id, saved);
    return saved;
  }
  async listProjects(user) {
    return [...this.projects.values()]
      .filter((project) => {
        if (project.deletedAt) return false;
        if (user.role === "admin") return true;
        if (user.role === "produccion") return true;
        if (user.role === "comercial") {
          return (
            project.ownerId === user.id ||
            project.assignedTo === user.id ||
            project.collaboratorIds?.includes(user.id)
          );
        }
        return project.ownerId === user.id;
      })
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }
  async getProject(id) {
    const project = this.projects.get(id) || null;
    return project?.deletedAt ? null : project;
  }
  async saveProject(record) {
    const current = this.projects.get(record.id);
    const saved = {
      ...current,
      ...record.payload,
      id: record.id,
      ownerId: record.ownerId,
      assignedTo: record.assignedTo || null,
      project: record.project,
      summary: record.summary,
      ownerName:
        this.users.get(record.ownerId)?.fullName ||
        (record.payload?.submissionSource === "visitante" ? "Visitante" : ""),
      assignedName: this.users.get(record.assignedTo)?.fullName || "",
      createdAt: current?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.projects.set(saved.id, saved);
    return saved;
  }

  async updateProjectSchedule(id, executionDate, deliveryDate) {
    const current = this.projects.get(id);
    if (!current) return null;
    const saved = {
      ...current,
      executionDate: executionDate || null,
      deliveryDate: deliveryDate || null,
      updatedAt: new Date().toISOString(),
    };
    this.projects.set(id, saved);
    return saved;
  }

  async deleteProject(id, userId) {
    const current = this.projects.get(id);
    if (!current || current.deletedAt) return null;
    const saved = {
      ...current,
      deletedAt: new Date().toISOString(),
      deletedBy: userId,
      updatedAt: new Date().toISOString(),
    };
    this.projects.set(id, saved);
    return saved;
  }
}

export function canReadProject(user, project) {
  if (user.role === "admin") return true;
  if (user.role === "produccion") return true;
  if (user.role === "comercial") {
    return (
      project.ownerId === user.id ||
      project.assignedTo === user.id ||
      project.collaboratorIds?.includes(user.id)
    );
  }
  return project.ownerId === user.id;
}

export function canEditProject(user, project) {
  if (user.role === "admin") return true;
  if (user.role === "produccion") {
    return [
      "facturado_pagado",
      "produccion",
      "despacho",
      "entregado",
    ].includes(project.project.status);
  }
  if (user.role === "comercial") {
    return (
      ["cotizacion", "facturacion"].includes(project.project.status) &&
      (project.ownerId === user.id ||
        project.assignedTo === user.id ||
        project.collaboratorIds?.includes(user.id))
    );
  }
  return project.ownerId === user.id && project.project.status === "cotizacion";
}

export function canTransitionProjectStatus(user, currentStatus, nextStatus) {
  if (currentStatus === nextStatus) return true;
  if (user.role === "admin") return validStatuses.has(nextStatus);
  if (user.role === "comercial") {
    return (
      (currentStatus === "cotizacion" && nextStatus === "facturacion") ||
      (currentStatus === "facturacion" && nextStatus === "facturado_pagado")
    );
  }
  if (user.role === "produccion") {
    return (
      (currentStatus === "facturado_pagado" && nextStatus === "produccion") ||
      (currentStatus === "produccion" && nextStatus === "despacho") ||
      (currentStatus === "despacho" && nextStatus === "entregado")
    );
  }
  return false;
}

function projectRecord(body, ownerId, current = null) {
  const project = body.project || {};
  const assignedTo = body.assignedTo || current?.assignedTo || null;
  const materialIds = [
    ...new Set(
      [
        ...(Array.isArray(body.materialIds) ? body.materialIds : []),
        body.materialId,
      ]
        .map((id) => String(id || ""))
        .filter(Boolean),
    ),
  ];
  const materialId = String(body.materialId || materialIds[0] || "");
  if (materialId && !materialIds.includes(materialId)) {
    materialIds.unshift(materialId);
  }
  const pieces = Array.isArray(body.pieces)
    ? body.pieces.map((piece) => ({
        ...piece,
        materialId: String(piece.materialId || materialId),
      }))
    : [];
  const collaboratorIds = [
    ...new Set(
      (Array.isArray(body.collaboratorIds)
        ? body.collaboratorIds
        : current?.collaboratorIds || [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  ];
  return {
    id: current?.id || body.id || randomUUID(),
    ownerId: current?.ownerId || ownerId,
    assignedTo,
    project: {
      projectName: String(project.projectName || "").trim(),
      clientName: String(project.clientName || "").trim(),
      rut: String(project.rut || "").trim(),
      status: validStatuses.has(project.status) ? project.status : "cotizacion",
      projectAddress: String(
        project.projectAddress || body.projectAddress || current?.project?.projectAddress || "",
      ).trim(),
    },
    payload: {
      categoryId: String(body.categoryId || ""),
      materialId,
      materialIds,
      defaultGrain: String(body.defaultGrain || "longitudinal"),
      pieces,
      settings: body.settings && typeof body.settings === "object" ? body.settings : {},
      discounts:
        body.discounts && typeof body.discounts === "object" ? body.discounts : {},
      projectAddress: String(
        project.projectAddress || body.projectAddress || current?.project?.projectAddress || "",
      ).trim(),
      contact:
        body.contact && typeof body.contact === "object"
          ? body.contact
          : current?.contact && typeof current.contact === "object"
            ? current.contact
            : {},
      submissionSource: String(
        body.submissionSource || current?.submissionSource || "usuario",
      ),
      collaboratorIds: collaboratorIds.filter((id) => id !== assignedTo),
    },
    summary: body.summary && typeof body.summary === "object" ? body.summary : null,
  };
}

function projectDimensionError(record, catalogMaterials = materials) {
  const pieces = record.payload.pieces;
  if (!pieces.length) return "";
  const invalidIndex = pieces.findIndex((piece) => {
    const material = catalogMaterials.find(
      (item) => item.id === piece.materialId,
    );
    return (
      !material ||
      !record.payload.materialIds.includes(material.id) ||
      !pieceFitsMaterial(piece, material)
    );
  });
  if (invalidIndex < 0) return "";
  const piece = pieces[invalidIndex];
  const material = catalogMaterials.find((item) => item.id === piece.materialId);
  if (!material) {
    return `La pieza ${piece.code || invalidIndex + 1} no tiene un tablero válido asignado.`;
  }
  return `La pieza ${piece.code || invalidIndex + 1} excede la plancha de ${material.plateLength} × ${material.plateWidth} mm para la veta seleccionada.`;
}

export async function createApplication({ store, useMemory = false } = {}) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!store && isProduction && !databaseUrl) {
    throw new Error("Falta DATABASE_URL. Vincula una base PostgreSQL en Render.");
  }
  const database =
    store ||
    (useMemory
      ? new MemoryStore()
      : databaseUrl
        ? new PostgresStore(databaseUrl)
        : new MemoryStore());
  await database.init();

  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "script-src": ["'self'"],
          "img-src": ["'self'", "data:"],
          "style-src": ["'self'", "'unsafe-inline'"],
        },
      },
    }),
  );
  app.use(express.json({ limit: "2mb" }));

  app.use("/api", (request, response, next) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return next();
    const origin = request.get("origin");
    if (!origin) return next();
    const expectedHost = request.get("x-forwarded-host") || request.get("host");
    try {
      if (new URL(origin).host !== expectedHost) {
        return response.status(403).json({ error: "Origen no autorizado." });
      }
    } catch {
      return response.status(403).json({ error: "Origen no autorizado." });
    }
    return next();
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Demasiados intentos. Espera 15 minutos." },
  });
  const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 8,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Demasiados registros. Intenta nuevamente más tarde." },
  });
  const visitorQuoteLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: "Se alcanzó el máximo de cotizaciones por hora. Intenta nuevamente más tarde.",
    },
  });

  const authenticate = async (request, response, next) => {
    const token = parseCookies(request.get("cookie")).casa_session;
    if (!token) return response.status(401).json({ error: "Debes iniciar sesión." });
    const session = await database.getSession(hashToken(token));
    if (!session) return response.status(401).json({ error: "Sesión vencida." });
    request.auth = { ...session, rawToken: token };
    const passwordChangeAllowed = new Set([
      "/api/auth/me",
      "/api/auth/logout",
      "/api/auth/change-password",
    ]);
    if (
      session.user.mustChangePassword &&
      !passwordChangeAllowed.has(request.path)
    ) {
      return response.status(403).json({
        error: "Debes cambiar tu clave temporal antes de continuar.",
        code: "PASSWORD_CHANGE_REQUIRED",
      });
    }
    return next();
  };

  const csrf = (request, response, next) => {
    if (!sameValue(request.auth?.csrfToken, request.get("x-csrf-token"))) {
      return response.status(403).json({ error: "Token de seguridad inválido." });
    }
    return next();
  };

  const adminOnly = (request, response, next) =>
    request.auth.user.role === "admin"
      ? next()
      : response.status(403).json({ error: "Acceso exclusivo de administrador." });

  const createSession = async (response, user) => {
    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + sessionHours * 60 * 60 * 1000);
    await database.createSession({
      tokenHash: hashToken(token),
      csrfToken,
      userId: user.id,
      expiresAt,
    });
    response.cookie("casa_session", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: sessionHours * 60 * 60 * 1000,
    });
    return csrfToken;
  };

  const announceNewQuote = async (saved, creator) => {
    const admins = await database.listActiveAdmins();
    for (const admin of admins) {
      await database.createNotification({
        id: randomUUID(),
        userId: admin.id,
        projectId: saved.id,
        type: "new_quote",
        title:
          saved.submissionSource === "visitante"
            ? "Nueva cotización de visitante"
            : "Nueva cotización",
        message: `${saved.project.clientName} · ${
          saved.project.projectName || "Proyecto sin nombre"
        } · creada por ${creator.fullName}`,
      });
    }
    if (
      saved.assignedTo &&
      !admins.some((admin) => admin.id === saved.assignedTo)
    ) {
      await database.createNotification({
        id: randomUUID(),
        userId: saved.assignedTo,
        projectId: saved.id,
        type: "assigned_quote",
        title: "Cotización asignada",
        message: `${saved.project.clientName} · ${
          saved.project.projectName || "Proyecto sin nombre"
        }`,
      });
    }
    for (const collaboratorId of saved.collaboratorIds || []) {
      if (
        collaboratorId === saved.assignedTo ||
        admins.some((admin) => admin.id === collaboratorId)
      ) {
        continue;
      }
      await database.createNotification({
        id: randomUUID(),
        userId: collaboratorId,
        projectId: saved.id,
        type: "collaborating_quote",
        title: "Apoyo solicitado en cotización",
        message: `${saved.project.clientName} · ${
          saved.project.projectName || "Proyecto sin nombre"
        }`,
      });
    }
    sendQuoteEmail(quoteEmailRecipients(admins), saved, creator).catch(
      (error) => {
        console.error(
          "No se pudo enviar la notificación por correo:",
          error.message,
        );
      },
    );
  };

  const commercialAssignmentError = async (
    record,
    { assignedRequired = false } = {},
  ) => {
    const assigned = record.assignedTo
      ? await database.getUser(record.assignedTo)
      : null;
    if (assignedRequired && (!assigned?.active || assigned.role !== "comercial")) {
      return "Selecciona el ejecutivo comercial que atenderá esta cotización.";
    }
    if (record.assignedTo && (!assigned?.active || assigned.role !== "comercial")) {
      return "El ejecutivo comercial seleccionado no está disponible.";
    }
    for (const collaboratorId of record.payload.collaboratorIds || []) {
      const collaborator = await database.getUser(collaboratorId);
      if (!collaborator?.active || collaborator.role !== "comercial") {
        return "Uno de los comerciales colaboradores no está disponible.";
      }
    }
    return "";
  };

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true, database: databaseUrl ? "postgresql" : "memoria-local" });
  });

  app.get("/api/catalog", async (_request, response) => {
    response.json(await buildRuntimeCatalog(database));
  });

  app.get(
    "/api/admin/catalog",
    authenticate,
    adminOnly,
    async (_request, response) => {
      response.json(await buildRuntimeCatalog(database));
    },
  );

  app.post(
    "/api/admin/catalog",
    authenticate,
    csrf,
    adminOnly,
    async (request, response) => {
      const productType = request.body.productType === "edge" ? "edge" : "board";
      const product = normalizeCatalogProduct(productType, request.body.product);
      const validationError = catalogProductError(productType, product);
      if (validationError) {
        return response.status(400).json({ error: validationError });
      }
      const catalog = await buildRuntimeCatalog(database);
      const collection = productType === "board" ? catalog.materials : catalog.edgeBands;
      if (
        collection.some(
          (item) =>
            item.active !== false &&
            String(item.sku).trim().toLowerCase() === product.sku.toLowerCase(),
        )
      ) {
        return response.status(409).json({
          error: "Ya existe un producto activo con ese código. Edítalo desde el listado.",
        });
      }
      const revision = await database.createCatalogRevision({
        id: `catalog-${productType}-${randomUUID()}`,
        productType,
        sku: product.sku,
        payload: product,
        replacesId: "",
        createdBy: request.auth.user.id,
      });
      return response.status(201).json({
        revision,
        catalog: await buildRuntimeCatalog(database),
      });
    },
  );

  app.patch(
    "/api/admin/catalog/:productType/:id",
    authenticate,
    csrf,
    adminOnly,
    async (request, response) => {
      const productType = request.params.productType === "edge" ? "edge" : "board";
      const catalog = await buildRuntimeCatalog(database);
      const collection = productType === "board" ? catalog.materials : catalog.edgeBands;
      const current = collection.find((item) => item.id === request.params.id);
      if (!current) {
        return response.status(404).json({ error: "Producto no encontrado." });
      }
      if (current.active === false) {
        return response.status(409).json({
          error: "Esa revisión ya fue reemplazada. Abre la versión activa del producto.",
        });
      }
      const product = normalizeCatalogProduct(
        productType,
        request.body.product,
        current,
      );
      const validationError = catalogProductError(productType, product);
      if (validationError) {
        return response.status(400).json({ error: validationError });
      }
      if (
        collection.some(
          (item) =>
            item.id !== current.id &&
            item.active !== false &&
            String(item.sku).trim().toLowerCase() === product.sku.toLowerCase(),
        )
      ) {
        return response.status(409).json({
          error: "Ya existe otro producto activo con ese código.",
        });
      }
      const revision = await database.createCatalogRevision({
        id: `catalog-${productType}-${randomUUID()}`,
        productType,
        sku: product.sku,
        payload: product,
        replacesId: current.id,
        createdBy: request.auth.user.id,
      });
      return response.json({
        revision,
        catalog: await buildRuntimeCatalog(database),
      });
    },
  );

  app.get("/api/auth/setup-status", async (_request, response) => {
    response.json({ needsSetup: (await database.countUsers()) === 0 });
  });

  app.post("/api/auth/setup", loginLimiter, async (request, response) => {
    if ((await database.countUsers()) !== 0) {
      return response.status(409).json({ error: "La cuenta inicial ya fue creada." });
    }
    const email = normalizeEmail(request.body.email);
    const password = String(request.body.password || "");
    const fullName = String(request.body.fullName || "").trim();
    if (!email.includes("@") || fullName.length < 2 || password.length < 10) {
      return response.status(400).json({
        error: "Ingresa nombre, correo válido y una clave de al menos 10 caracteres.",
      });
    }
    const user = await database.createUser({
      id: randomUUID(),
      email,
      passwordHash: await bcrypt.hash(password, 12),
      fullName,
      role: "admin",
      clientName: "",
      active: true,
      mustChangePassword: false,
    });
    const csrfToken = await createSession(response, user);
    return response.status(201).json({ user: publicUser(user), csrfToken });
  });

  app.post("/api/auth/login", loginLimiter, async (request, response) => {
    const email = normalizeEmail(request.body.email);
    const password = String(request.body.password || "");
    const user = await database.findUserByEmail(email);
    const valid = user?.active && (await bcrypt.compare(password, user.passwordHash));
    if (!valid) {
      return response.status(401).json({ error: "Correo o clave incorrectos." });
    }
    const csrfToken = await createSession(response, user);
    return response.json({ user: publicUser(user), csrfToken });
  });

  app.post("/api/auth/register", registerLimiter, async (request, response) => {
    if ((await database.countUsers()) === 0) {
      return response.status(409).json({
        error: "Primero debe crearse la cuenta administradora del sistema.",
      });
    }
    const input = normalizeUserInput({
      ...request.body,
      role: "cliente",
      active: true,
    });
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) ||
      input.fullName.length < 2 ||
      input.phone.length < 7 ||
      input.projectAddress.length < 5 ||
      input.password.length < 10
    ) {
      return response.status(400).json({
        error:
          "Completa nombre, correo, teléfono, dirección del proyecto y una clave de al menos 10 caracteres.",
      });
    }
    if (
      input.clientName &&
      (!input.rut || !input.billingAddress || !input.businessActivity)
    ) {
      return response.status(400).json({
        error:
          "Para registrar una empresa completa razón social, RUT, dirección de facturación y giro comercial.",
      });
    }
    if (input.rut && !validateRut(input.rut)) {
      return response.status(400).json({ error: "El RUT ingresado no es válido." });
    }
    try {
      const user = await database.createUser({
        id: randomUUID(),
        email: input.email,
        passwordHash: await bcrypt.hash(input.password, 12),
        fullName: input.fullName,
        role: "cliente",
        clientName: input.clientName,
        phone: input.phone,
        rut: input.rut,
        location: input.location,
        billingAddress: input.billingAddress,
        businessActivity: input.businessActivity,
        projectAddress: input.projectAddress,
        active: true,
        mustChangePassword: false,
      });
      const csrfToken = await createSession(response, user);
      return response.status(201).json({ user: publicUser(user), csrfToken });
    } catch (error) {
      if (error.code === "23505") {
        return response.status(409).json({ error: "Ese correo ya está registrado." });
      }
      throw error;
    }
  });

  app.get("/api/auth/me", authenticate, (request, response) => {
    response.json({
      user: publicUser(request.auth.user),
      csrfToken: request.auth.csrfToken,
    });
  });

  app.post(
    "/api/auth/change-password",
    authenticate,
    csrf,
    async (request, response) => {
      const password = String(request.body.password || "");
      if (password.length < 10) {
        return response
          .status(400)
          .json({ error: "La nueva clave requiere al menos 10 caracteres." });
      }
      if (await bcrypt.compare(password, request.auth.user.passwordHash)) {
        return response.status(400).json({
          error: "La nueva clave debe ser diferente de la clave temporal.",
        });
      }
      const user = await database.updateUser(request.auth.user.id, {
        passwordHash: await bcrypt.hash(password, 12),
        mustChangePassword: false,
      });
      return response.json({ user: publicUser(user) });
    },
  );

  app.post("/api/auth/logout", authenticate, csrf, async (request, response) => {
    await database.deleteSession(request.auth.tokenHash);
    response.clearCookie("casa_session", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
    });
    response.status(204).end();
  });

  app.get("/api/users", authenticate, adminOnly, async (_request, response) => {
    response.json({ users: (await database.listUsers()).map(publicUser) });
  });

  app.get("/api/public/commercials", async (_request, response) => {
    const commercials = await database.listActiveUsersByRole("comercial");
    response.json({
      commercials: commercials.map((user) => ({
        id: user.id,
        fullName: user.fullName,
      })),
    });
  });

  app.get("/api/commercials", authenticate, async (_request, response) => {
    const commercials = await database.listActiveUsersByRole("comercial");
    response.json({
      commercials: commercials.map((user) => ({
        id: user.id,
        fullName: user.fullName,
      })),
    });
  });

  app.post("/api/users", authenticate, csrf, adminOnly, async (request, response) => {
    const input = normalizeUserInput(request.body);
    const validationError = userInputError(input);
    if (validationError) {
      return response.status(400).json({ error: validationError });
    }
    try {
      const user = await database.createUser({
        id: randomUUID(),
        email: input.email,
        passwordHash: await bcrypt.hash(input.password, 12),
        fullName: input.fullName,
        role: input.role,
        clientName: input.clientName,
        phone: input.phone,
        rut: input.rut,
        location: input.location,
        billingAddress: input.billingAddress,
        businessActivity: input.businessActivity,
        projectAddress: input.projectAddress,
        active: input.active,
        mustChangePassword: true,
      });
      return response.status(201).json({ user: publicUser(user) });
    } catch (error) {
      if (error.code === "23505") {
        return response.status(409).json({ error: "Ese correo ya está registrado." });
      }
      throw error;
    }
  });

  app.post(
    "/api/users/bulk",
    authenticate,
    csrf,
    adminOnly,
    async (request, response) => {
      const entries = Array.isArray(request.body.users)
        ? request.body.users
        : [];
      if (!entries.length || entries.length > 200) {
        return response.status(400).json({
          error: "La importación debe contener entre 1 y 200 usuarios.",
        });
      }

      const created = [];
      const errors = [];
      const batchEmails = new Set();
      const validEntries = [];
      entries.forEach((entry, index) => {
        const sourceRow =
          Number.isInteger(Number(entry?.sourceRow)) && Number(entry.sourceRow) >= 2
            ? Number(entry.sourceRow)
            : index + 2;
        const input = normalizeUserInput(entry);
        const validationError = userInputError(input);
        if (validationError) {
          errors.push({ row: sourceRow, email: input.email, error: validationError });
          return;
        }
        if (batchEmails.has(input.email)) {
          errors.push({
            row: sourceRow,
            email: input.email,
            error: "El correo está repetido dentro del archivo.",
          });
          return;
        }
        batchEmails.add(input.email);
        validEntries.push({ row: sourceRow, input });
      });

      for (let start = 0; start < validEntries.length; start += 8) {
        const chunk = validEntries.slice(start, start + 8);
        const prepared = await Promise.all(
          chunk.map(async ({ row, input }) => ({
            row,
            input,
            passwordHash: await bcrypt.hash(input.password, 12),
          })),
        );
        for (const item of prepared) {
          if (await database.findUserByEmail(item.input.email)) {
            errors.push({
              row: item.row,
              email: item.input.email,
              error: "Ese correo ya está registrado.",
            });
            continue;
          }
          try {
            const user = await database.createUser({
              id: randomUUID(),
              email: item.input.email,
              passwordHash: item.passwordHash,
              fullName: item.input.fullName,
              role: item.input.role,
              clientName: item.input.clientName,
              phone: item.input.phone,
              rut: item.input.rut,
              location: item.input.location,
              billingAddress: item.input.billingAddress,
              businessActivity: item.input.businessActivity,
              projectAddress: item.input.projectAddress,
              active: item.input.active,
              mustChangePassword: true,
            });
            created.push(publicUser(user));
          } catch (error) {
            errors.push({
              row: item.row,
              email: item.input.email,
              error:
                error.code === "23505"
                  ? "Ese correo ya está registrado."
                  : "No fue posible crear el usuario.",
            });
          }
        }
      }

      return response.json({ created, errors });
    },
  );

  app.patch(
    "/api/users/:id",
    authenticate,
    csrf,
    adminOnly,
    async (request, response) => {
      const current = await database.getUser(request.params.id);
      if (!current) return response.status(404).json({ error: "Usuario no encontrado." });
      const changes = {};
      if (request.body.fullName !== undefined) {
        changes.fullName = String(request.body.fullName).trim();
      }
      if (request.body.clientName !== undefined) {
        changes.clientName = String(request.body.clientName).trim();
      }
      if (request.body.phone !== undefined) {
        changes.phone = String(request.body.phone).trim();
      }
      if (request.body.rut !== undefined) {
        changes.rut = String(request.body.rut).trim();
      }
      if (request.body.location !== undefined) {
        changes.location = String(request.body.location).trim();
      }
      if (request.body.billingAddress !== undefined) {
        changes.billingAddress = String(request.body.billingAddress).trim();
      }
      if (request.body.businessActivity !== undefined) {
        changes.businessActivity = String(request.body.businessActivity).trim();
      }
      if (request.body.projectAddress !== undefined) {
        changes.projectAddress = String(request.body.projectAddress).trim();
      }
      if (request.body.role !== undefined && validRoles.has(request.body.role)) {
        changes.role = request.body.role;
      }
      if (request.body.active !== undefined) changes.active = Boolean(request.body.active);
      if (request.body.password) {
        if (String(request.body.password).length < 10) {
          return response.status(400).json({ error: "La clave requiere 10 caracteres." });
        }
        changes.passwordHash = await bcrypt.hash(String(request.body.password), 12);
        changes.mustChangePassword = true;
      }
      const user = await database.updateUser(current.id, changes);
      return response.json({ user: publicUser(user) });
    },
  );

  app.get(
    "/api/notifications",
    authenticate,
    async (request, response) => {
      const notifications = await database.listNotifications(
        request.auth.user.id,
      );
      response.json({
        notifications,
        unreadCount: notifications.filter((item) => !item.readAt).length,
      });
    },
  );

  app.post(
    "/api/notifications/:id/read",
    authenticate,
    csrf,
    async (request, response) => {
      const notification = await database.markNotificationRead(
        request.params.id,
        request.auth.user.id,
      );
      if (!notification) {
        return response
          .status(404)
          .json({ error: "Notificación no encontrada." });
      }
      return response.json({ notification });
    },
  );

  app.post(
    "/api/material-images/import",
    authenticate,
    csrf,
    adminOnly,
    express.raw({ type: ["application/zip", "application/x-zip-compressed"], limit: "80mb" }),
    async (request, response) => {
      if (!Buffer.isBuffer(request.body) || !request.body.length) {
        return response.status(400).json({ error: "Selecciona un archivo ZIP válido." });
      }
      const archive = await unzipper.Open.buffer(request.body);
      const candidates = archive.files.filter(
        (file) =>
          file.type === "File" &&
          [".jpg", ".jpeg", ".png", ".webp"].includes(
            extname(file.path).toLowerCase(),
          ),
      );
      if (!candidates.length || candidates.length > 500) {
        return response.status(400).json({
          error: "El ZIP debe contener entre 1 y 500 imágenes JPG, PNG o WEBP.",
        });
      }
      const imported = [];
      const rejected = [];
      for (const file of candidates) {
        const data = await file.buffer();
        const sku = resolveCatalogImageKey(file.path);
        if (!sku || data.length > 2_500_000) {
          rejected.push(file.path);
          continue;
        }
        const extension = extname(file.path).toLowerCase();
        const mimeType =
          extension === ".png"
            ? "image/png"
            : extension === ".webp"
              ? "image/webp"
              : "image/jpeg";
        await database.upsertMaterialImage({ sku, mimeType, data });
        imported.push(sku);
      }
      return response.json({ imported, rejected });
    },
  );

  app.put(
    "/api/material-images/:sku",
    authenticate,
    csrf,
    adminOnly,
    express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "2.5mb" }),
    async (request, response) => {
      if (!Buffer.isBuffer(request.body) || !request.body.length) {
        return response.status(400).json({
          error: "Selecciona una imagen JPG, PNG o WEBP de hasta 2,5 MB.",
        });
      }
      const sku = resolveCatalogImageKey(request.params.sku);
      if (!sku) {
        return response.status(400).json({ error: "El código del producto no es válido." });
      }
      const image = await database.upsertMaterialImage({
        sku,
        mimeType: request.get("content-type"),
        data: request.body,
      });
      return response.json({ image: { sku, updatedAt: image.updated_at || image.updatedAt } });
    },
  );

  app.get("/api/material-images/:sku", async (request, response) => {
    const sku = normalizeImageKey(request.params.sku);
    const image = await database.getMaterialImage(sku);
    if (!image) return response.status(404).end();
    response.set("content-type", image.mime_type || image.mimeType);
    response.set("cache-control", "public, max-age=86400");
    return response.send(image.data);
  });

  app.post(
    "/api/public/quotes",
    visitorQuoteLimiter,
    async (request, response) => {
      const contact = {
        name: String(request.body.contact?.name || "").trim(),
        email: normalizeEmail(request.body.contact?.email),
        phone: String(request.body.contact?.phone || "").trim(),
        city: String(request.body.contact?.city || "").trim(),
      };
      if (
        contact.name.length < 2 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email) ||
        contact.phone.length < 7 ||
        contact.city.length < 2
      ) {
        return response.status(400).json({
          error:
            "Completa nombre, correo, teléfono y ciudad para enviar la cotización.",
        });
      }
      const record = projectRecord(
        {
          ...request.body,
          contact,
          submissionSource: "visitante",
          collaboratorIds: [],
          project: {
            ...(request.body.project || {}),
            clientName: contact.name,
            rut: "",
            status: "cotizacion",
          },
        },
        null,
      );
      record.id = randomUUID();
      record.ownerId = null;
      record.project.status = "cotizacion";
      record.payload.collaboratorIds = [];
      record.payload.contact = contact;
      record.payload.submissionSource = "visitante";
      const assignmentError = await commercialAssignmentError(record, {
        assignedRequired: true,
      });
      if (assignmentError) {
        return response.status(400).json({ error: assignmentError });
      }
      const catalog = await buildRuntimeCatalog(database);
      const dimensionError = projectDimensionError(record, catalog.materials);
      if (dimensionError) {
        return response.status(400).json({ error: dimensionError });
      }
      if (!record.payload.materialIds.length || !record.payload.pieces.length) {
        return response.status(400).json({
          error: "La cotización debe incluir al menos un tablero y una pieza.",
        });
      }
      const selectedCatalogMaterials = record.payload.materialIds
        .map((id) => catalog.materials.find((item) => item.id === id))
        .filter(Boolean);
      const result = optimizeProject(
        selectedCatalogMaterials,
        record.payload.pieces,
        catalog.edgeBands,
        record.payload.settings,
      );
      record.summary = result.summary;
      const saved = await database.saveProject(record);
      await announceNewQuote(saved, {
        fullName: `${contact.name} (Visitante)`,
        email: contact.email,
      });
      return response.status(201).json({
        quote: {
          id: saved.id,
          status: saved.project.status,
          total: saved.summary?.total || 0,
        },
      });
    },
  );

  app.get("/api/projects", authenticate, async (request, response) => {
    response.json({ projects: await database.listProjects(request.auth.user) });
  });

  app.get("/api/projects/:id", authenticate, async (request, response) => {
    const project = await database.getProject(request.params.id);
    if (!project || !canReadProject(request.auth.user, project)) {
      return response.status(404).json({ error: "Proyecto no encontrado." });
    }
    return response.json({ project });
  });

  app.post("/api/projects", authenticate, csrf, async (request, response) => {
    if (request.auth.user.role === "produccion") {
      return response.status(403).json({
        error: "Producción puede revisar todos los proyectos, pero no crear cotizaciones.",
      });
    }
    const record = projectRecord(request.body, request.auth.user.id);
    record.id = randomUUID();
    if (!record.project.clientName) {
      return response.status(400).json({ error: "El nombre del cliente es obligatorio." });
    }
    const catalog = await buildRuntimeCatalog(database);
    const dimensionError = projectDimensionError(record, catalog.materials);
    if (dimensionError) {
      return response.status(400).json({ error: dimensionError });
    }
    if (request.auth.user.role !== "admin") {
      if (request.auth.user.role === "comercial") {
        record.assignedTo = request.auth.user.id;
      }
      if (request.auth.user.role === "cliente") {
        record.payload.collaboratorIds = [];
        record.project.status = "cotizacion";
      }
    }
    record.payload.collaboratorIds = (record.payload.collaboratorIds || []).filter(
      (id) => id !== record.assignedTo,
    );
    const assignmentError = await commercialAssignmentError(record, {
      assignedRequired: request.auth.user.role === "cliente",
    });
    if (assignmentError) {
      return response.status(400).json({ error: assignmentError });
    }
    record.project.status = "cotizacion";
    const saved = await database.saveProject(record);
    await announceNewQuote(saved, request.auth.user);
    return response.status(201).json({ project: saved });
  });

  app.patch("/api/projects/:id", authenticate, csrf, async (request, response) => {
    const current = await database.getProject(request.params.id);
    if (!current || !canReadProject(request.auth.user, current)) {
      return response.status(404).json({ error: "Proyecto no encontrado." });
    }
    if (!canEditProject(request.auth.user, current)) {
      return response.status(403).json({ error: "No puedes modificar este proyecto." });
    }
    const requestedStatus = String(
      request.body.project?.status || current.project.status,
    );
    if (
      !validStatuses.has(requestedStatus) ||
      !canTransitionProjectStatus(
        request.auth.user,
        current.project.status,
        requestedStatus,
      )
    ) {
      return response.status(403).json({
        error:
          "Cambio de estado no autorizado. Sigue el flujo Cotización, Facturación, Facturado y pagado, Producción, Despacho y Entregado.",
      });
    }
    const record = projectRecord(request.body, current.ownerId, current);
    if (!record.project.clientName) {
      return response.status(400).json({ error: "El nombre del cliente es obligatorio." });
    }
    const catalog = await buildRuntimeCatalog(database);
    const dimensionError = projectDimensionError(record, catalog.materials);
    if (dimensionError) {
      return response.status(400).json({ error: dimensionError });
    }
    if (request.auth.user.role === "cliente") {
      record.project.status = "cotizacion";
      record.assignedTo = current.assignedTo;
      record.payload.collaboratorIds = current.collaboratorIds || [];
    }
    if (request.auth.user.role === "comercial") {
      record.assignedTo = current.assignedTo || request.auth.user.id;
    }
    if (request.auth.user.role === "produccion") {
      record.assignedTo = current.assignedTo;
      record.payload.collaboratorIds = current.collaboratorIds || [];
    }
    record.payload.collaboratorIds = (record.payload.collaboratorIds || []).filter(
      (id) => id !== record.assignedTo,
    );
    const assignmentError = await commercialAssignmentError(record, {
      assignedRequired: request.auth.user.role === "cliente",
    });
    if (assignmentError) {
      return response.status(400).json({ error: assignmentError });
    }
    const addedCollaborators = (record.payload.collaboratorIds || []).filter(
      (id) => !(current.collaboratorIds || []).includes(id),
    );
    const enteredPaid =
      current.project.status !== "facturado_pagado" &&
      record.project.status === "facturado_pagado";
    const saved = await database.saveProject(record);
    for (const collaboratorId of addedCollaborators) {
      await database.createNotification({
        id: randomUUID(),
        userId: collaboratorId,
        projectId: saved.id,
        type: "collaborating_quote",
        title: "Apoyo solicitado en cotización",
        message: `${saved.project.clientName} · ${
          saved.project.projectName || "Proyecto sin nombre"
        } · asignado por ${request.auth.user.fullName}`,
      });
    }
    if (enteredPaid) {
      const productionUsers = await database.listActiveUsersByRole("produccion");
      for (const user of productionUsers) {
        await database.createNotification({
          id: randomUUID(),
          userId: user.id,
          projectId: saved.id,
          type: "paid_order",
          title: "Pedido facturado y pagado",
          message: `${saved.project.clientName} · ${
            saved.project.projectName || "Proyecto sin nombre"
          } · liberado por ${request.auth.user.fullName}`,
        });
      }
    }
    if (
      current.project.status !== "despacho" &&
      saved.project.status === "despacho"
    ) {
      const recipients = await database.listActiveAdmins();
      const assigned = saved.assignedTo
        ? await database.getUser(saved.assignedTo)
        : null;
      if (
        assigned?.active &&
        !recipients.some((user) => user.id === assigned.id)
      ) {
        recipients.push(assigned);
      }
      for (const user of recipients) {
        await database.createNotification({
          id: randomUUID(),
          userId: user.id,
          projectId: saved.id,
          type: "dispatch_ready",
          title: "Pedido listo para despacho",
          message: `${saved.project.clientName} · ${
            saved.project.projectName || "Proyecto sin nombre"
          } · actualizado por ${request.auth.user.fullName}`,
        });
      }
    }
    return response.json({ project: saved });
  });

  app.delete(
    "/api/projects/:id",
    authenticate,
    csrf,
    adminOnly,
    async (request, response) => {
      const current = await database.getProject(request.params.id);
      if (!current) {
        return response.status(404).json({ error: "Proyecto no encontrado." });
      }
      await database.deleteProject(current.id, request.auth.user.id);
      return response.status(204).end();
    },
  );

  app.patch(
    "/api/projects/:id/schedule",
    authenticate,
    csrf,
    async (request, response) => {
      if (!["admin", "produccion"].includes(request.auth.user.role)) {
        return response.status(403).json({
          error: "Solo Administración o Producción pueden ajustar la agenda.",
        });
      }
      const current = await database.getProject(request.params.id);
      if (!current || !canReadProject(request.auth.user, current)) {
        return response.status(404).json({ error: "Proyecto no encontrado." });
      }
      if (
        request.auth.user.role === "produccion" &&
        ![
          "facturado_pagado",
          "produccion",
          "despacho",
          "entregado",
        ].includes(current.project.status)
      ) {
        return response.status(403).json({
          error:
            "Producción puede programar una orden una vez que esté Facturada y pagada.",
        });
      }
      const normalizeDate = (value) => {
        const text = String(value || "").trim();
        if (!text) return "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
        const date = new Date(`${text}T12:00:00Z`);
        return Number.isNaN(date.getTime()) ? null : text;
      };
      const executionDate = normalizeDate(request.body.executionDate);
      const deliveryDate = normalizeDate(request.body.deliveryDate);
      if (executionDate === null || deliveryDate === null) {
        return response.status(400).json({
          error: "Las fechas de agenda no son válidas.",
        });
      }
      if (
        executionDate &&
        deliveryDate &&
        deliveryDate < executionDate
      ) {
        return response.status(400).json({
          error: "La fecha de entrega no puede ser anterior a la ejecución.",
        });
      }
      await database.updateProjectSchedule(
        current.id,
        executionDate,
        deliveryDate,
      );
      const project = await database.getProject(current.id);
      return response.json({ project });
    },
  );

  app.use("/api", (_request, response) => {
    response.status(404).json({ error: "Ruta no encontrada." });
  });

  if (existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: isProduction ? "1h" : 0 }));
    app.get("*path", (_request, response) => {
      response.sendFile(join(dist, "index.html"));
    });
  }

  app.use((error, _request, response, _next) => {
    console.error(error);
    response.status(500).json({ error: "Ocurrió un error interno." });
  });

  return { app, store: database };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { app } = await createApplication();
  app.listen(port, "0.0.0.0", () => {
    console.log(`Cotizador disponible en http://0.0.0.0:${port}`);
  });
}
