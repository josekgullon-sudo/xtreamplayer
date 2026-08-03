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
import { encryptSecret } from "./secretBox.mjs";

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
  `INSERT INTO customers (provider_id, reseller_id, username, password_hash, password_box, label, playlist_type,
    playlist_url, playlist_username, playlist_password, domain_id, max_devices, expires_at, status, created_at, last_seen)
   VALUES (?, ?, ?, ?, ?, ?, 'xtream', '', ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertDevice = db.prepare(
  "INSERT INTO devices (customer_id, device_key, platform, ip, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?)"
);
const insertLogin = db.prepare(
  "INSERT INTO customer_logins (customer_id, device_key, platform, ip, ok, created_at) VALUES (?, ?, ?, ?, ?, ?)"
);
const IPS = ["93.156.230.183", "77.228.161.224", "88.12.45.9", "212.170.33.201", "83.45.199.10"];
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
      encryptSecret("cliente123"),
      `${nombre} — ${PACKS[i % PACKS.length]}`,
      `iptv_${usuario}`,
      "pass" + (1000 + i),
      domainIds[i % domainIds.length],
      maxDevices,
      caduca,
      estado,
      now - dias(90 - i * 3),
      0
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
      IPS[(i + d) % IPS.length],
      now - dias(30),
      now - dias(i % 7) - d * 7200_000
    );
  }

  // La última conexión del cliente es la de su dispositivo más reciente:
  // así el resumen y la pestaña de dispositivos cuentan lo mismo.
  if (usados) {
    const ultima = now - dias(i % 7);
    db.prepare("UPDATE customers SET last_seen = ? WHERE id = ?").run(ultima, id);
  }

  // Historial de accesos, con algún intento rechazado por límite
  for (let l = 0; l < (usados ? 4 : 0); l++) {
    insertLogin.run(
      id,
      `demo-device-${id}-${l % Math.max(usados, 1)}`,
      PLATAFORMAS[(i + l) % PLATAFORMAS.length],
      IPS[(i + l) % IPS.length],
      l === 3 && i % 4 === 0 ? 0 : 1,
      now - dias(l) - l * 5400_000
    );
  }
});

// ---- Administrador de la plataforma (atiende los tickets en /admin) ----
const ADMIN_EMAIL = "admin@totalplayer.app";
db.prepare("DELETE FROM users WHERE email = ?").run(ADMIN_EMAIL);
db.prepare("INSERT INTO users (email, password_hash, is_admin, created_at) VALUES (?, ?, 1, ?)").run(
  ADMIN_EMAIL,
  hash("admin12345"),
  now - dias(200)
);

/* ---- La cuenta de la casa ----
 * Mismo correo que el administrador, sin plan y con la prueba caducada hace
 * tres días: exactamente el caso en el que el dueño de la plataforma se
 * quedaba fuera de su propio producto y sus clientes veían «el servicio de tu
 * proveedor no está activo». Sembrarla así deja la regla comprobada de verdad.
 */
const casaAnterior = db.prepare("SELECT id FROM providers WHERE email = ?").get(ADMIN_EMAIL);
if (casaAnterior) db.prepare("DELETE FROM providers WHERE id = ?").run(casaAnterior.id);
const casaId = Number(
  db
    .prepare(
      `INSERT INTO providers (email, password_hash, company, plan_id, plan_expires_at, trial_ends_at, brand_name, created_at)
       VALUES (?, ?, ?, '', 0, ?, ?, ?)`
    )
    .run(ADMIN_EMAIL, hash("admin12345"), "TOTALplayer", now - dias(3), "TOTALplayer", now - dias(300)).lastInsertRowid
);
db.prepare("DELETE FROM customers WHERE username = ?").run("casa");
db.prepare(
  `INSERT INTO customers (provider_id, username, password_hash, label, status, expires_at, max_devices, created_at)
   VALUES (?, 'casa', ?, 'Cliente de la casa', 'active', 0, 3, ?)`
).run(casaId, hash("casa12345"), now - dias(30));

// ---- Tickets de soporte de muestra ----
db.prepare("DELETE FROM ticket_messages WHERE ticket_id IN (SELECT id FROM tickets WHERE provider_id = ?)").run(providerId);
db.prepare("DELETE FROM tickets WHERE provider_id = ?").run(providerId);
const TICKETS = [
  {
    subject: "Un cliente no puede entrar desde su Smart TV",
    status: "respondido",
    hace: 6,
    msgs: [
      ["provider", "El usuario jose11tc dice que en su tele Samsung le da error de acceso, pero en el movil le funciona."],
      ["admin", "Hola: hemos revisado sus accesos y la tele tenia guardada una contrasena antigua. Pidele que cierre sesion en la tele y vuelva a entrar; si sigue fallando, reinicia sus dispositivos desde la ficha del cliente."],
    ],
  },
  {
    subject: "Duda con la migracion de dominio",
    status: "cerrado",
    hace: 20,
    msgs: [
      ["provider", "Si cambio el dominio principal, cuanto tardan mis clientes en verse afectados?"],
      ["admin", "Es inmediato: los clientes enganchados al dominio usan la nueva direccion en su siguiente carga de lista. No tienen que tocar nada."],
      ["provider", "Perfecto, gracias."],
    ],
  },
  {
    subject: "Quiero ampliar el limite de un revendedor",
    status: "abierto",
    hace: 0.2,
    msgs: [["provider", "Necesito que carlos@revendedor.com pueda dar de alta 100 clientes en vez de 40. Se puede desde el panel?"]],
  },
];
for (const t of TICKETS) {
  const creado = now - dias(t.hace);
  const info = db
    .prepare("INSERT INTO tickets (provider_id, subject, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(providerId, t.subject, t.status, creado, creado + 3600_000 * t.msgs.length);
  t.msgs.forEach(([author, body], i) => {
    db.prepare("INSERT INTO ticket_messages (ticket_id, author, body, created_at) VALUES (?, ?, ?, ?)").run(
      info.lastInsertRowid,
      author,
      body,
      creado + 3600_000 * i
    );
  });
}

// ---- Facturas de muestra: los tres ultimos meses del plan Premium ----
db.prepare("DELETE FROM invoices WHERE provider_id = ?").run(providerId);
for (let m = 3; m >= 1; m--) {
  const fecha = now - dias(30 * m - 7);
  const numero = `TP-${new Date(fecha).getFullYear()}-${String(9000 + m)}`;
  db.prepare(
    `INSERT INTO invoices (provider_id, number, concept, amount_cents, currency, period_start, period_end, status, created_at)
     VALUES (?, ?, 'Plan Premium — hasta 600 clientes', 9000, 'EUR', ?, ?, 'pagada', ?)`
  ).run(providerId, numero, fecha, fecha + dias(30), fecha);
}

console.log(`
Datos de demostración creados:
  Proveedor : ${EMAIL} / ${PASSWORD}
  Clientes  : ${creados} (contraseña de todos: cliente123)
  Revendedor: carlos@revendedor.com / revendedor123  (solo sus clientes, solo nombre de dominios)
              ana@revendedor.com    / revendedor123  (ve todo, gestiona dominios)
              luis@revendedor.com   / revendedor123  (sin acceso a dominios)
  Marca     : /m/demo-iptv

  Admin     : admin@totalplayer.app / admin12345  (bandeja de tickets en /admin)
  Extras    : 3 tickets de soporte y 3 facturas de muestra en el panel

Entra en /acceso y elige «Soy proveedor».
`);
