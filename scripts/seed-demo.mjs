/**
 * Datos de demostración para ver el panel con contenido realista.
 *
 *   node scripts/seed-demo.mjs
 *
 * Crea un proveedor con dominios, revendedores y clientes variados.
 * Pensado solo para desarrollo: no lo ejecutes contra la base de producción.
 */
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs";
import { applySchema } from "../lib/schema.mjs";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, "xtreamplayer.db"));
// Crea las tablas y aplica migraciones: el script funciona con una base vacía
applySchema(db);

const EMAIL = "demo@totalplayer.app";
const PASSWORD = "demo12345";
const now = Date.now();
const dias = (n) => n * 86_400_000;

// Si ya existe la demo, la rehacemos desde cero
const existing = db.prepare("SELECT id FROM providers WHERE email = ?").get(EMAIL);
if (existing) {
  db.prepare("DELETE FROM providers WHERE id = ?").run(existing.id);
  console.log("Demo anterior eliminada.");
}

const hash = (s) => bcrypt.hashSync(s, 8);

const provider = db
  .prepare(
    `INSERT INTO providers (email, password_hash, company, plan_id, plan_expires_at, trial_ends_at,
      brand_name, brand_color, brand_slug, brand_support, created_at)
     VALUES (?, ?, ?, 'premium', ?, 0, ?, ?, ?, ?, ?)`
  )
  .run(EMAIL, hash(PASSWORD), "Demo IPTV", now + dias(23), "Demo IPTV", "#e5192b", "demo-iptv", "soporte@demo-iptv.com", now - dias(120));
const providerId = Number(provider.lastInsertRowid);

// Dominios
const domainIds = [
  ["cdn-principal.com", 8080, "http", "DNS principal"],
  ["backup-stream.net", 2086, "http", "Respaldo"],
  ["seguro-tv.eu", 443, "https", "Revendedores"],
].map(([host, port, protocol, label]) =>
  Number(
    db
      .prepare(
        "INSERT INTO provider_domains (provider_id, host, port, protocol, label, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(providerId, host, port, protocol, label, now - dias(100)).lastInsertRowid
  )
);

// Revendedores con permisos distintos, para ver los tres casos
const resellers = [
  ["carlos@revendedor.com", "Carlos — Madrid", 0, "names", 50],
  ["ana@revendedor.com", "Ana — Levante", 1, "full", 0],
  ["luis@revendedor.com", "Luis — Canarias", 0, "none", 20],
].map(([email, name, viewAll, domainAccess, max]) =>
  Number(
    db
      .prepare(
        `INSERT INTO resellers (provider_id, email, password_hash, name, view_all_customers, domain_access, max_customers, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(providerId, email, hash("revendedor123"), name, viewAll, domainAccess, max, now - dias(60)).lastInsertRowid
  )
);

// Clientes
const NOMBRES = [
  "Juan Pérez", "María López", "Carlos Vega", "Laura Ruiz", "Miguel Ángel Soto", "Ana Belén Ortiz",
  "Javier Méndez", "Cristina Navarro", "Pablo Herrera", "Marta Gil", "Sergio Domínguez", "Elena Castro",
  "Andrés Molina", "Rocío Ramos", "Diego Fuentes", "Patricia Blanco", "Álvaro Cano", "Nuria Peña",
  "Raúl Iglesias", "Silvia Márquez", "Tomás Reyes", "Beatriz Lorenzo", "Óscar Prieto", "Lucía Sanz",
];
const PACKS = ["pack anual", "pack 6 meses", "mensual", "prueba 7 días", "anual + adulto"];

const insertCustomer = db.prepare(
  `INSERT INTO customers (provider_id, reseller_id, username, password_hash, label, playlist_type,
    playlist_url, playlist_username, playlist_password, domain_id, max_devices, expires_at, status, created_at)
   VALUES (?, ?, ?, ?, ?, 'xtream', '', ?, ?, ?, ?, ?, ?, ?)`
);
const insertDevice = db.prepare(
  "INSERT INTO devices (customer_id, device_key, platform, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)"
);
const PLATAFORMAS = ["web", "samsung", "lg", "firetv", "android", "ios"];

let creados = 0;
NOMBRES.forEach((nombre, i) => {
  const usuario = nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "")
    .slice(0, 10) + (i + 10);

  // Reparto: dos tercios del proveedor, el resto de sus revendedores
  const resellerId = i % 3 === 0 ? resellers[i % resellers.length] : 0;
  const maxDevices = [1, 2, 2, 3][i % 4];
  const estado = i % 11 === 0 ? "disabled" : "active";
  // Alguno caducado, para ver ese estado en el panel
  const caduca = i % 9 === 0 ? now - dias(3) : i % 4 === 0 ? now + dias(45) : 0;

  const id = Number(
    insertCustomer.run(
      providerId,
      resellerId,
      usuario,
      hash("cliente123"),
      `${nombre} — ${PACKS[i % PACKS.length]}`,
      `iptv_${usuario}`,
      "pass" + (1000 + i),
      domainIds[i % domainIds.length],
      maxDevices,
      caduca,
      estado,
      now - dias(90 - i * 3)
    ).lastInsertRowid
  );
  creados++;

  // Dispositivos vinculados en algunos clientes
  const usados = i % 5 === 0 ? maxDevices : i % 3 === 0 ? 1 : 0;
  for (let d = 0; d < usados; d++) {
    insertDevice.run(
      id,
      `demo-device-${id}-${d}`,
      PLATAFORMAS[(i + d) % PLATAFORMAS.length],
      now - dias(30),
      now - dias(i % 7)
    );
  }
});

console.log(`
Datos de demostración creados:
  Proveedor : ${EMAIL} / ${PASSWORD}
  Clientes  : ${creados} (contraseña de todos: cliente123)
  Revendedor: carlos@revendedor.com / revendedor123  (solo sus clientes, solo nombre de dominios)
              ana@revendedor.com    / revendedor123  (ve todo, gestiona dominios)
              luis@revendedor.com   / revendedor123  (sin acceso a dominios)
  Marca     : /m/demo-iptv

Entra en /acceso y elige «Soy proveedor».
`);
