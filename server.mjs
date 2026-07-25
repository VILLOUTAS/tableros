import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import bcrypt from "bcryptjs";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pg from "pg";

const { Pool } = pg;
const root = fileURLToPath(new URL(".", import.meta.url));
const dist = join(root, "dist");
const port = Number(process.env.PORT || 10000);
const isProduction = process.env.NODE_ENV === "production";
const sessionHours = 8;
const validRoles = new Set(["admin", "comercial", "produccion", "cliente"]);
const validStatuses = new Set(["cotizacion", "venta", "produccion"]);

const hashToken = (token) =>
  createHash("sha256").update(String(token)).digest("hex");

const publicUser = (user) =>
  user && {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    clientName: user.clientName || "",
    active: Boolean(user.active),
    createdAt: user.createdAt,
  };

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
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
    active: row.active,
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
    },
    ...row.payload,
    summary: row.summary || row.payload?.summary || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ownerName: row.owner_name || "",
    assignedName: row.assigned_name || "",
  };
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
        active BOOLEAN NOT NULL DEFAULT TRUE,
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
        owner_id UUID NOT NULL REFERENCES app_users(id),
        assigned_to UUID REFERENCES app_users(id),
        project_name TEXT NOT NULL DEFAULT '',
        client_name TEXT NOT NULL,
        rut TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK (status IN ('cotizacion','venta','produccion')),
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        summary JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS projects_owner_idx ON projects(owner_id);
      CREATE INDEX IF NOT EXISTS projects_status_idx ON projects(status);
      CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON app_sessions(expires_at);
    `);
    await this.pool.query("DELETE FROM app_sessions WHERE expires_at <= NOW()");
  }

  async countUsers() {
    const result = await this.pool.query("SELECT COUNT(*)::int AS count FROM app_users");
    return result.rows[0].count;
  }

  async createUser(user) {
    const result = await this.pool.query(
      `INSERT INTO app_users
        (id, email, password_hash, full_name, role, client_name, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        user.id,
        user.email,
        user.passwordHash,
        user.fullName,
        user.role,
        user.clientName || "",
        user.active ?? true,
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

  async updateUser(id, changes) {
    const current = await this.getUser(id);
    if (!current) return null;
    const next = { ...current, ...changes };
    const result = await this.pool.query(
      `UPDATE app_users
       SET email=$2, password_hash=$3, full_name=$4, role=$5,
           client_name=$6, active=$7, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [
        id,
        next.email,
        next.passwordHash,
        next.fullName,
        next.role,
        next.clientName || "",
        next.active,
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

  async listProjects(user) {
    const where =
      user.role === "admin"
        ? "TRUE"
        : user.role === "produccion"
          ? "p.status IN ('venta','produccion')"
          : user.role === "comercial"
            ? "(p.owner_id=$1 OR p.assigned_to=$1)"
            : "p.owner_id=$1";
    const params = user.role === "admin" ? [] : [user.id];
    const result = await this.pool.query(
      `SELECT p.*, owner.full_name AS owner_name,
              assigned.full_name AS assigned_name
       FROM projects p
       JOIN app_users owner ON owner.id=p.owner_id
       LEFT JOIN app_users assigned ON assigned.id=p.assigned_to
       WHERE ${where}
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
       JOIN app_users owner ON owner.id=p.owner_id
       LEFT JOIN app_users assigned ON assigned.id=p.assigned_to
       WHERE p.id=$1`,
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
}

class MemoryStore {
  constructor() {
    this.users = new Map();
    this.sessions = new Map();
    this.projects = new Map();
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
    const record = { ...user, createdAt: new Date().toISOString() };
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
  async listProjects(user) {
    return [...this.projects.values()]
      .filter((project) => {
        if (user.role === "admin") return true;
        if (user.role === "produccion") {
          return ["venta", "produccion"].includes(project.project.status);
        }
        if (user.role === "comercial") {
          return project.ownerId === user.id || project.assignedTo === user.id;
        }
        return project.ownerId === user.id;
      })
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }
  async getProject(id) {
    return this.projects.get(id) || null;
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
      createdAt: current?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.projects.set(saved.id, saved);
    return saved;
  }
}

export function canReadProject(user, project) {
  if (user.role === "admin") return true;
  if (user.role === "produccion") {
    return ["venta", "produccion"].includes(project.project.status);
  }
  if (user.role === "comercial") {
    return project.ownerId === user.id || project.assignedTo === user.id;
  }
  return project.ownerId === user.id;
}

export function canEditProject(user, project) {
  if (user.role === "admin") return true;
  if (user.role === "produccion") return false;
  if (user.role === "comercial") {
    return project.ownerId === user.id || project.assignedTo === user.id;
  }
  return project.ownerId === user.id && project.project.status === "cotizacion";
}

function projectRecord(body, ownerId, current = null) {
  const project = body.project || {};
  return {
    id: current?.id || body.id || randomUUID(),
    ownerId: current?.ownerId || ownerId,
    assignedTo: body.assignedTo || current?.assignedTo || null,
    project: {
      projectName: String(project.projectName || "").trim(),
      clientName: String(project.clientName || "").trim(),
      rut: String(project.rut || "").trim(),
      status: validStatuses.has(project.status) ? project.status : "cotizacion",
    },
    payload: {
      categoryId: String(body.categoryId || ""),
      materialId: String(body.materialId || ""),
      defaultGrain: String(body.defaultGrain || "longitudinal"),
      pieces: Array.isArray(body.pieces) ? body.pieces : [],
      settings: body.settings && typeof body.settings === "object" ? body.settings : {},
      discounts:
        body.discounts && typeof body.discounts === "object" ? body.discounts : {},
    },
    summary: body.summary && typeof body.summary === "object" ? body.summary : null,
  };
}

export async function createApplication({ store } = {}) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!store && isProduction && !databaseUrl) {
    throw new Error("Falta DATABASE_URL. Vincula una base PostgreSQL en Render.");
  }
  const database = store || (databaseUrl ? new PostgresStore(databaseUrl) : new MemoryStore());
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

  const authenticate = async (request, response, next) => {
    const token = parseCookies(request.get("cookie")).casa_session;
    if (!token) return response.status(401).json({ error: "Debes iniciar sesión." });
    const session = await database.getSession(hashToken(token));
    if (!session) return response.status(401).json({ error: "Sesión vencida." });
    request.auth = { ...session, rawToken: token };
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

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true, database: databaseUrl ? "postgresql" : "memoria-local" });
  });

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

  app.get("/api/auth/me", authenticate, (request, response) => {
    response.json({
      user: publicUser(request.auth.user),
      csrfToken: request.auth.csrfToken,
    });
  });

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

  app.post("/api/users", authenticate, csrf, adminOnly, async (request, response) => {
    const email = normalizeEmail(request.body.email);
    const fullName = String(request.body.fullName || "").trim();
    const password = String(request.body.password || "");
    const role = String(request.body.role || "");
    if (
      !email.includes("@") ||
      fullName.length < 2 ||
      password.length < 10 ||
      !validRoles.has(role)
    ) {
      return response.status(400).json({ error: "Revisa los datos del usuario." });
    }
    try {
      const user = await database.createUser({
        id: randomUUID(),
        email,
        passwordHash: await bcrypt.hash(password, 12),
        fullName,
        role,
        clientName: String(request.body.clientName || "").trim(),
        active: true,
      });
      return response.status(201).json({ user: publicUser(user) });
    } catch (error) {
      if (error.code === "23505") {
        return response.status(409).json({ error: "Ese correo ya está registrado." });
      }
      throw error;
    }
  });

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
      if (request.body.role !== undefined && validRoles.has(request.body.role)) {
        changes.role = request.body.role;
      }
      if (request.body.active !== undefined) changes.active = Boolean(request.body.active);
      if (request.body.password) {
        if (String(request.body.password).length < 10) {
          return response.status(400).json({ error: "La clave requiere 10 caracteres." });
        }
        changes.passwordHash = await bcrypt.hash(String(request.body.password), 12);
      }
      const user = await database.updateUser(current.id, changes);
      return response.json({ user: publicUser(user) });
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
      return response.status(403).json({ error: "Producción trabaja sobre órdenes existentes." });
    }
    const record = projectRecord(request.body, request.auth.user.id);
    if (!record.project.clientName) {
      return response.status(400).json({ error: "El nombre del cliente es obligatorio." });
    }
    if (request.auth.user.role !== "admin") {
      record.assignedTo =
        request.auth.user.role === "comercial" ? request.auth.user.id : null;
      if (request.auth.user.role === "cliente") record.project.status = "cotizacion";
    }
    const saved = await database.saveProject(record);
    return response.status(201).json({ project: saved });
  });

  app.patch("/api/projects/:id", authenticate, csrf, async (request, response) => {
    const current = await database.getProject(request.params.id);
    if (!current || !canReadProject(request.auth.user, current)) {
      return response.status(404).json({ error: "Proyecto no encontrado." });
    }
    if (request.auth.user.role === "produccion") {
      const status = request.body.project?.status;
      if (status !== "produccion") {
        return response.status(403).json({
          error: "Producción solo puede avanzar una orden al estado Producción.",
        });
      }
      const saved = await database.saveProject({
        ...projectRecord(current, current.ownerId, current),
        project: { ...current.project, status: "produccion" },
        payload: {
          categoryId: current.categoryId,
          materialId: current.materialId,
          defaultGrain: current.defaultGrain,
          pieces: current.pieces,
          settings: current.settings,
          discounts: current.discounts,
        },
        summary: current.summary,
      });
      return response.json({ project: saved });
    }
    if (!canEditProject(request.auth.user, current)) {
      return response.status(403).json({ error: "No puedes modificar este proyecto." });
    }
    const record = projectRecord(request.body, current.ownerId, current);
    if (!record.project.clientName) {
      return response.status(400).json({ error: "El nombre del cliente es obligatorio." });
    }
    if (request.auth.user.role === "cliente") record.project.status = "cotizacion";
    if (request.auth.user.role !== "admin") record.assignedTo = current.assignedTo;
    const saved = await database.saveProject(record);
    return response.json({ project: saved });
  });

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
