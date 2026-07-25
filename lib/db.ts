import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

/**
 * Base de datos SQLite (better-sqlite3). Los datos viven en ./data/xtreamplayer.db.
 * Para producción con varios nodos, migrar a Postgres es directo: el esquema es mínimo.
 */

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  _db = new Database(path.join(DATA_DIR, "xtreamplayer.db"));
  _db.pragma("journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('xtream', 'm3u')),
      url TEXT NOT NULL DEFAULT '',
      username TEXT NOT NULL DEFAULT '',
      password TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id);

    /* ---------- B2B: proveedores IPTV y sus clientes ---------- */

    CREATE TABLE IF NOT EXISTS provider_plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price_month INTEGER NOT NULL,      -- en céntimos
      max_customers INTEGER NOT NULL,
      stripe_price_id TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      company TEXT NOT NULL DEFAULT '',
      plan_id TEXT NOT NULL DEFAULT '',
      plan_expires_at INTEGER NOT NULL DEFAULT 0,
      trial_ends_at INTEGER NOT NULL DEFAULT 0,
      stripe_customer_id TEXT NOT NULL DEFAULT '',
      stripe_subscription_id TEXT NOT NULL DEFAULT '',
      brand_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL
    );

    -- Clientes finales dados de alta por un proveedor
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      playlist_type TEXT NOT NULL DEFAULT 'xtream' CHECK (playlist_type IN ('xtream','m3u')),
      playlist_url TEXT NOT NULL DEFAULT '',
      playlist_username TEXT NOT NULL DEFAULT '',
      playlist_password TEXT NOT NULL DEFAULT '',
      max_devices INTEGER NOT NULL DEFAULT 2,
      expires_at INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      UNIQUE (provider_id, username)
    );
    CREATE INDEX IF NOT EXISTS idx_customers_provider ON customers(provider_id);
    CREATE INDEX IF NOT EXISTS idx_customers_username ON customers(username);

    -- Dominios del proveedor: se configuran una vez y se reutilizan en cada alta.
    -- Si un dominio cae o lo bloquean, se edita aquí y todos sus clientes quedan actualizados.
    CREATE TABLE IF NOT EXISTS provider_domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 80,
      protocol TEXT NOT NULL DEFAULT 'http' CHECK (protocol IN ('http','https')),
      label TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      UNIQUE (provider_id, host, port)
    );
    CREATE INDEX IF NOT EXISTS idx_domains_provider ON provider_domains(provider_id);

    -- Revendedores: cuentas que el proveedor crea para dar acceso al mismo panel
    -- con permisos recortados.
    CREATE TABLE IF NOT EXISTS resellers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      -- 0 = ve solo los clientes que él crea; 1 = ve todos los del proveedor
      view_all_customers INTEGER NOT NULL DEFAULT 0,
      -- 'full' = gestiona dominios | 'names' = solo ve el nombre para asignarlo | 'none'
      domain_access TEXT NOT NULL DEFAULT 'names' CHECK (domain_access IN ('full','names','none')),
      -- Cupo propio de clientes (0 = sin límite propio, dentro del plan del proveedor)
      max_customers INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_resellers_provider ON resellers(provider_id);

    -- Dispositivos vinculados a cada cliente (MAC en TV, UUID en web)
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      device_key TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT '',
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      UNIQUE (customer_id, device_key)
    );
    CREATE INDEX IF NOT EXISTS idx_devices_customer ON devices(customer_id);
  `);
  migrate(_db);
  seedPlans(_db);
  return _db;
}

/**
 * Tramos por capacidad de usuarios (modelo SaaS recurrente).
 * Los precios son editables: basta con cambiar la fila y su stripe_price_id.
 */
const DEFAULT_PLANS: [string, string, number, number, number][] = [
  // id, nombre, precio/mes en céntimos, máx. clientes, orden
  ["starter", "Starter", 2000, 100, 1],
  ["basic", "Basic", 4500, 250, 2],
  ["premium", "Premium", 9000, 600, 3],
  ["enterprise", "Enterprise", 18000, 1500, 4],
  ["large", "Large", 27000, 3000, 5],
  ["mega", "Mega", 45000, 5000, 6],
];

function seedPlans(db: Database.Database) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO provider_plans (id, name, price_month, max_customers, sort_order) VALUES (?, ?, ?, ?, ?)"
  );
  const tx = db.transaction(() => {
    for (const [id, name, price, max, order] of DEFAULT_PLANS) insert.run(id, name, price, max, order);
  });
  tx();
}

/** Migraciones aditivas: añade columnas nuevas a bases de datos ya existentes. */
function migrate(db: Database.Database) {
  const columnsOf = (table: string) =>
    new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));

  const userCols = columnsOf("users");
  const addUser = (name: string, ddl: string) => {
    if (!userCols.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${ddl}`);
  };
  addUser("trial_ends_at", "trial_ends_at INTEGER NOT NULL DEFAULT 0");
  addUser("premium_until", "premium_until INTEGER NOT NULL DEFAULT 0");
  addUser("stripe_customer_id", "stripe_customer_id TEXT NOT NULL DEFAULT ''");
  addUser("stripe_subscription_id", "stripe_subscription_id TEXT NOT NULL DEFAULT ''");

  const customerCols = columnsOf("customers");
  if (customerCols.size && !customerCols.has("domain_id")) {
    db.exec("ALTER TABLE customers ADD COLUMN domain_id INTEGER NOT NULL DEFAULT 0");
  }
  // 0 = creado directamente por el proveedor
  if (customerCols.size && !customerCols.has("reseller_id")) {
    db.exec("ALTER TABLE customers ADD COLUMN reseller_id INTEGER NOT NULL DEFAULT 0");
  }
}

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  created_at: number;
  trial_ends_at: number;
  premium_until: number;
  stripe_customer_id: string;
  stripe_subscription_id: string;
}

export interface PlaylistRow {
  id: number;
  user_id: number;
  name: string;
  type: "xtream" | "m3u";
  url: string;
  username: string;
  password: string;
  created_at: number;
}

export interface ProviderPlanRow {
  id: string;
  name: string;
  price_month: number;
  max_customers: number;
  stripe_price_id: string;
  sort_order: number;
  active: number;
}

export interface ProviderRow {
  id: number;
  email: string;
  password_hash: string;
  company: string;
  plan_id: string;
  plan_expires_at: number;
  trial_ends_at: number;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  brand_name: string;
  status: string;
  created_at: number;
}

export interface CustomerRow {
  id: number;
  provider_id: number;
  username: string;
  password_hash: string;
  label: string;
  playlist_type: "xtream" | "m3u";
  playlist_url: string;
  playlist_username: string;
  playlist_password: string;
  /** Si es > 0, la URL se resuelve desde provider_domains (permite migrar dominios en bloque) */
  domain_id: number;
  /** 0 = dado de alta por el propio proveedor; si no, el revendedor que lo creó */
  reseller_id: number;
  max_devices: number;
  expires_at: number;
  status: string;
  created_at: number;
}

export interface ResellerRow {
  id: number;
  provider_id: number;
  email: string;
  password_hash: string;
  name: string;
  view_all_customers: number;
  domain_access: "full" | "names" | "none";
  max_customers: number;
  status: string;
  created_at: number;
}

export interface ProviderDomainRow {
  id: number;
  provider_id: number;
  host: string;
  port: number;
  protocol: "http" | "https";
  label: string;
  created_at: number;
}

export interface DeviceRow {
  id: number;
  customer_id: number;
  device_key: string;
  platform: string;
  first_seen: number;
  last_seen: number;
}
