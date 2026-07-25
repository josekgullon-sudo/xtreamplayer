/**
 * Esquema de la base de datos, en un único sitio.
 *
 * Lo usan tanto la aplicación (lib/db.ts) como los scripts sueltos
 * (scripts/seed-demo.mjs), para que un script no pueda encontrarse con una
 * base a medio crear ni quedarse atrás cuando el esquema cambia.
 */

export const SCHEMA_SQL = `
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

    -- Historial de accesos: el proveedor ve desde dónde y cuándo entra su cliente
    CREATE TABLE IF NOT EXISTS customer_logins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      device_key TEXT NOT NULL DEFAULT '',
      platform TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT '',
      ok INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_logins_customer ON customer_logins(customer_id, created_at DESC);
  `;

/** Migraciones aditivas: añade columnas nuevas a bases de datos ya existentes. */
export function migrate(db) {
  const columnsOf = (table) =>
    new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));

  const userCols = columnsOf("users");
  const addUser = (name, ddl) => {
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
  // Contraseña de acceso cifrada, para que el proveedor pueda consultarla
  if (customerCols.size && !customerCols.has("password_box")) {
    db.exec("ALTER TABLE customers ADD COLUMN password_box TEXT NOT NULL DEFAULT ''");
  }
  if (customerCols.size && !customerCols.has("last_seen")) {
    db.exec("ALTER TABLE customers ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0");
  }

  const deviceCols = columnsOf("devices");
  if (deviceCols.size && !deviceCols.has("ip")) {
    db.exec("ALTER TABLE devices ADD COLUMN ip TEXT NOT NULL DEFAULT ''");
  }
  if (deviceCols.size && !deviceCols.has("name")) {
    db.exec("ALTER TABLE devices ADD COLUMN name TEXT NOT NULL DEFAULT ''");
  }

  // Marca blanca del proveedor
  const providerCols = columnsOf("providers");
  const addProvider = (name, ddl) => {
    if (providerCols.size && !providerCols.has(name)) db.exec(`ALTER TABLE providers ADD COLUMN ${ddl}`);
  };
  addProvider("brand_color", "brand_color TEXT NOT NULL DEFAULT ''");
  addProvider("brand_logo", "brand_logo TEXT NOT NULL DEFAULT ''");
  addProvider("brand_slug", "brand_slug TEXT NOT NULL DEFAULT ''");
  addProvider("brand_support", "brand_support TEXT NOT NULL DEFAULT ''");
  // Conexión con el panel Xtream del proveedor, para importar clientes en bloque
  addProvider("panel_url", "panel_url TEXT NOT NULL DEFAULT ''");
  addProvider("panel_user", "panel_user TEXT NOT NULL DEFAULT ''");
  addProvider("panel_pass", "panel_pass TEXT NOT NULL DEFAULT ''");
  addProvider("panel_checked_at", "panel_checked_at INTEGER NOT NULL DEFAULT 0");
  // El slug identifica el enlace público del proveedor: debe ser único
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_providers_slug ON providers(brand_slug) WHERE brand_slug != ''");
}


/**
 * Tramos por capacidad de clientes (modelo SaaS recurrente).
 * Los precios son editables: basta con cambiar la fila y su stripe_price_id.
 */
const DEFAULT_PLANS = [
  ["starter", "Starter", 2000, 100, 1],
  ["basic", "Basic", 4500, 250, 2],
  ["premium", "Premium", 9000, 600, 3],
  ["enterprise", "Enterprise", 18000, 1500, 4],
  ["large", "Large", 27000, 3000, 5],
  ["mega", "Mega", 45000, 5000, 6],
];

export function seedPlans(db) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO provider_plans (id, name, price_month, max_customers, sort_order) VALUES (?, ?, ?, ?, ?)"
  );
  const tx = db.transaction(() => {
    for (const [id, name, price, max, order] of DEFAULT_PLANS) insert.run(id, name, price, max, order);
  });
  tx();
}

/** Deja la base lista: tablas, columnas nuevas y planes por defecto. */
export function applySchema(db) {
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA_SQL);
  migrate(db);
  seedPlans(db);
}
