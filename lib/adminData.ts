import { getDb } from "./db";

/**
 * Las consultas del panel de administración de la plataforma.
 *
 * Todo lo que mira quien lleva TOTALplayer: cuántos proveedores hay y cómo
 * les va, qué revendedores tienen y cuántas cuentas vivas maneja cada uno,
 * por qué dominios entran sus clientes, quién entró y desde dónde, y qué se
 * ha facturado. En un módulo aparte porque son consultas que cruzan todas
 * las tablas y no pertenecen a ningún proveedor concreto.
 */

const DIA = 86400000;

export interface Resumen {
  proveedores: { total: number; activos: number; suspendidos: number; enPrueba: number; nuevos30: number };
  clientes: { total: number; activos: number; caducados: number; caducanEn7: number; nuevos30: number };
  revendedores: { total: number; activos: number };
  dominios: number;
  dispositivos: { total: number; activos7: number };
  accesos: { hoy: number; fallidos7: number };
  soporte: { abiertos: number; respondidos: number };
  facturado: { mesCents: number; totalCents: number; pendientesCents: number };
}

export function resumen(): Resumen {
  const db = getDb();
  const ahora = Date.now();
  const hace30 = ahora - 30 * DIA;
  const hace7 = ahora - 7 * DIA;
  const inicioMes = new Date(new Date(ahora).getFullYear(), new Date(ahora).getMonth(), 1).getTime();
  const n = (sql: string, ...p: unknown[]) =>
    (db.prepare(sql).get(...p) as { n: number } | undefined)?.n || 0;

  return {
    proveedores: {
      total: n("SELECT COUNT(*) n FROM providers"),
      activos: n("SELECT COUNT(*) n FROM providers WHERE status = 'active'"),
      suspendidos: n("SELECT COUNT(*) n FROM providers WHERE status != 'active'"),
      enPrueba: n("SELECT COUNT(*) n FROM providers WHERE trial_ends_at > ? AND plan_id = ''", ahora),
      nuevos30: n("SELECT COUNT(*) n FROM providers WHERE created_at >= ?", hace30),
    },
    clientes: {
      total: n("SELECT COUNT(*) n FROM customers"),
      activos: n("SELECT COUNT(*) n FROM customers WHERE status = 'active' AND (expires_at = 0 OR expires_at > ?)", ahora),
      caducados: n("SELECT COUNT(*) n FROM customers WHERE expires_at != 0 AND expires_at <= ?", ahora),
      caducanEn7: n(
        "SELECT COUNT(*) n FROM customers WHERE expires_at > ? AND expires_at <= ?",
        ahora,
        ahora + 7 * DIA
      ),
      nuevos30: n("SELECT COUNT(*) n FROM customers WHERE created_at >= ?", hace30),
    },
    revendedores: {
      total: n("SELECT COUNT(*) n FROM resellers"),
      activos: n("SELECT COUNT(*) n FROM resellers WHERE status = 'active'"),
    },
    dominios: n("SELECT COUNT(*) n FROM provider_domains"),
    dispositivos: {
      total: n("SELECT COUNT(*) n FROM devices"),
      activos7: n("SELECT COUNT(*) n FROM devices WHERE last_seen >= ?", hace7),
    },
    accesos: {
      hoy: n("SELECT COUNT(*) n FROM customer_logins WHERE created_at >= ?", ahora - DIA),
      fallidos7: n("SELECT COUNT(*) n FROM customer_logins WHERE ok = 0 AND created_at >= ?", hace7),
    },
    soporte: {
      abiertos: n("SELECT COUNT(*) n FROM tickets WHERE status = 'abierto'"),
      respondidos: n("SELECT COUNT(*) n FROM tickets WHERE status = 'respondido'"),
    },
    facturado: {
      mesCents: n("SELECT COALESCE(SUM(amount_cents), 0) n FROM invoices WHERE status = 'pagada' AND created_at >= ?", inicioMes),
      totalCents: n("SELECT COALESCE(SUM(amount_cents), 0) n FROM invoices WHERE status = 'pagada'"),
      pendientesCents: n("SELECT COALESCE(SUM(amount_cents), 0) n FROM invoices WHERE status = 'pendiente'"),
    },
  };
}

/** Altas por día de los últimos N días, para la gráfica del resumen. */
export function altasPorDia(dias = 30) {
  const db = getDb();
  const desde = Date.now() - dias * DIA;
  const filas = db
    .prepare(
      `SELECT (created_at / 86400000) AS dia, COUNT(*) AS n
       FROM customers WHERE created_at >= ? GROUP BY dia ORDER BY dia`
    )
    .all(desde) as { dia: number; n: number }[];
  const porDia = new Map(filas.map((f) => [f.dia, f.n]));
  const hoy = Math.floor(Date.now() / DIA);
  return Array.from({ length: dias }, (_, i) => {
    const dia = hoy - (dias - 1 - i);
    return { fecha: dia * DIA, altas: porDia.get(dia) || 0 };
  });
}

export interface ProveedorFila {
  id: number;
  email: string;
  empresa: string;
  marca: string;
  plan: string;
  planNombre: string;
  planCaduca: number;
  pruebaHasta: number;
  estado: string;
  alta: number;
  clientes: number;
  clientesActivos: number;
  revendedores: number;
  dominios: number;
  ultimoAcceso: number;
  facturadoCents: number;
  ticketsAbiertos: number;
}

/** Todos los proveedores con sus números. El corazón del panel. */
export function proveedores(buscar = ""): ProveedorFila[] {
  const db = getDb();
  const ahora = Date.now();
  const q = buscar.trim().toLowerCase();
  const where = q ? "WHERE LOWER(p.email) LIKE ? OR LOWER(p.company) LIKE ? OR LOWER(p.brand_name) LIKE ?" : "";
  const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];

  const filas = db
    .prepare(
      `SELECT p.id, p.email, p.company, p.brand_name, p.plan_id, p.plan_expires_at, p.trial_ends_at,
              p.status, p.created_at,
              COALESCE(pl.name, '') AS plan_name,
              (SELECT COUNT(*) FROM customers c WHERE c.provider_id = p.id) AS clientes,
              (SELECT COUNT(*) FROM customers c WHERE c.provider_id = p.id AND c.status = 'active'
                 AND (c.expires_at = 0 OR c.expires_at > ?)) AS clientes_activos,
              (SELECT COUNT(*) FROM resellers r WHERE r.provider_id = p.id) AS revendedores,
              (SELECT COUNT(*) FROM provider_domains d WHERE d.provider_id = p.id) AS dominios,
              (SELECT MAX(c.last_seen) FROM customers c WHERE c.provider_id = p.id) AS ultimo_acceso,
              (SELECT COALESCE(SUM(i.amount_cents), 0) FROM invoices i
                 WHERE i.provider_id = p.id AND i.status = 'pagada') AS facturado,
              (SELECT COUNT(*) FROM tickets t WHERE t.provider_id = p.id AND t.status = 'abierto') AS tickets_abiertos
       FROM providers p
       LEFT JOIN provider_plans pl ON pl.id = p.plan_id
       ${where}
       ORDER BY clientes DESC, p.created_at DESC
       LIMIT 500`
    )
    .all(ahora, ...params) as Rec[];

  return filas.map(mapProveedor);
}

type Rec = Record<string, number | string | null>;

function mapProveedor(r: Rec): ProveedorFila {
  return {
    id: Number(r.id),
    email: String(r.email),
    empresa: String(r.company || ""),
    marca: String(r.brand_name || ""),
    plan: String(r.plan_id || ""),
    planNombre: String(r.plan_name || ""),
    planCaduca: Number(r.plan_expires_at || 0),
    pruebaHasta: Number(r.trial_ends_at || 0),
    estado: String(r.status || "active"),
    alta: Number(r.created_at || 0),
    clientes: Number(r.clientes || 0),
    clientesActivos: Number(r.clientes_activos || 0),
    revendedores: Number(r.revendedores || 0),
    dominios: Number(r.dominios || 0),
    ultimoAcceso: Number(r.ultimo_acceso || 0),
    facturadoCents: Number(r.facturado || 0),
    ticketsAbiertos: Number(r.tickets_abiertos || 0),
  };
}

export interface RevendedorFila {
  id: number;
  email: string;
  nombre: string;
  proveedor: string;
  proveedorId: number;
  estado: string;
  alta: number;
  cupo: number;
  clientes: number;
  clientesActivos: number;
  ultimaAlta: number;
}

/**
 * Todos los revendedores de la plataforma con sus cuentas vivas. Un
 * revendedor con muchas altas y ninguna activa suele ser una prueba
 * abandonada; al revés, es quien de verdad mueve el negocio.
 */
export function revendedores(buscar = ""): RevendedorFila[] {
  const db = getDb();
  const ahora = Date.now();
  const q = buscar.trim().toLowerCase();
  const where = q ? "WHERE LOWER(r.email) LIKE ? OR LOWER(r.name) LIKE ?" : "";
  const params = q ? [`%${q}%`, `%${q}%`] : [];

  const filas = db
    .prepare(
      `SELECT r.id, r.email, r.name, r.status, r.created_at, r.max_customers, r.provider_id,
              COALESCE(NULLIF(p.company, ''), p.email) AS proveedor,
              (SELECT COUNT(*) FROM customers c WHERE c.reseller_id = r.id) AS clientes,
              (SELECT COUNT(*) FROM customers c WHERE c.reseller_id = r.id AND c.status = 'active'
                 AND (c.expires_at = 0 OR c.expires_at > ?)) AS clientes_activos,
              (SELECT MAX(c.created_at) FROM customers c WHERE c.reseller_id = r.id) AS ultima_alta
       FROM resellers r
       JOIN providers p ON p.id = r.provider_id
       ${where}
       ORDER BY clientes_activos DESC, r.created_at DESC
       LIMIT 500`
    )
    .all(ahora, ...params) as Rec[];

  return filas.map((r) => ({
    id: Number(r.id),
    email: String(r.email),
    nombre: String(r.name || ""),
    proveedor: String(r.proveedor || ""),
    proveedorId: Number(r.provider_id),
    estado: String(r.status || "active"),
    alta: Number(r.created_at || 0),
    cupo: Number(r.max_customers || 0),
    clientes: Number(r.clientes || 0),
    clientesActivos: Number(r.clientes_activos || 0),
    ultimaAlta: Number(r.ultima_alta || 0),
  }));
}

export interface ClienteFila {
  id: number;
  usuario: string;
  nombre: string;
  proveedor: string;
  revendedor: string;
  estado: string;
  caduca: number;
  alta: number;
  ultimoAcceso: number;
  dispositivos: number;
}

/** Buscador global de clientes finales: por usuario, nombre o proveedor. */
export function clientes(buscar = "", estado = ""): ClienteFila[] {
  const db = getDb();
  const ahora = Date.now();
  const cond: string[] = [];
  const params: unknown[] = [];
  const q = buscar.trim().toLowerCase();
  if (q) {
    cond.push("(LOWER(c.username) LIKE ? OR LOWER(c.label) LIKE ? OR LOWER(p.email) LIKE ? OR LOWER(p.company) LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (estado === "activos") {
    cond.push("c.status = 'active' AND (c.expires_at = 0 OR c.expires_at > ?)");
    params.push(ahora);
  } else if (estado === "caducados") {
    cond.push("c.expires_at != 0 AND c.expires_at <= ?");
    params.push(ahora);
  } else if (estado === "desactivados") {
    cond.push("c.status != 'active'");
  }

  const filas = db
    .prepare(
      `SELECT c.id, c.username, c.label, c.status, c.expires_at, c.created_at, c.last_seen,
              COALESCE(NULLIF(p.company, ''), p.email) AS proveedor,
              COALESCE(NULLIF(r.name, ''), r.email, '') AS revendedor,
              (SELECT COUNT(*) FROM devices d WHERE d.customer_id = c.id) AS dispositivos
       FROM customers c
       JOIN providers p ON p.id = c.provider_id
       LEFT JOIN resellers r ON r.id = c.reseller_id
       ${cond.length ? "WHERE " + cond.join(" AND ") : ""}
       ORDER BY c.last_seen DESC, c.created_at DESC
       LIMIT 300`
    )
    .all(...params) as Rec[];

  return filas.map((c) => ({
    id: Number(c.id),
    usuario: String(c.username),
    nombre: String(c.label || ""),
    proveedor: String(c.proveedor || ""),
    revendedor: String(c.revendedor || ""),
    estado: String(c.status || "active"),
    caduca: Number(c.expires_at || 0),
    alta: Number(c.created_at || 0),
    ultimoAcceso: Number(c.last_seen || 0),
    dispositivos: Number(c.dispositivos || 0),
  }));
}

export interface DominioFila {
  id: number;
  host: string;
  puerto: number;
  protocolo: string;
  etiqueta: string;
  proveedor: string;
  proveedorId: number;
  clientes: number;
  alta: number;
}

/**
 * Todos los dominios de streaming en uso. Cuando uno cae, esta lista dice de
 * golpe a cuántos clientes y de qué proveedores afecta.
 */
export function dominios(buscar = ""): DominioFila[] {
  const db = getDb();
  const q = buscar.trim().toLowerCase();
  const where = q ? "WHERE LOWER(d.host) LIKE ? OR LOWER(d.label) LIKE ?" : "";
  const params = q ? [`%${q}%`, `%${q}%`] : [];

  const filas = db
    .prepare(
      `SELECT d.id, d.host, d.port, d.protocol, d.label, d.created_at, d.provider_id,
              COALESCE(NULLIF(p.company, ''), p.email) AS proveedor,
              (SELECT COUNT(*) FROM customers c WHERE c.domain_id = d.id) AS clientes
       FROM provider_domains d
       JOIN providers p ON p.id = d.provider_id
       ${where}
       ORDER BY clientes DESC, d.host
       LIMIT 500`
    )
    .all(...params) as Rec[];

  return filas.map((d) => ({
    id: Number(d.id),
    host: String(d.host),
    puerto: Number(d.port || 0),
    protocolo: String(d.protocol || "http"),
    etiqueta: String(d.label || ""),
    proveedor: String(d.proveedor || ""),
    proveedorId: Number(d.provider_id),
    clientes: Number(d.clientes || 0),
    alta: Number(d.created_at || 0),
  }));
}

export interface AccesoFila {
  id: number;
  cuando: number;
  usuario: string;
  proveedor: string;
  ip: string;
  plataforma: string;
  ok: number;
}

/** Accesos de clientes finales, los últimos primero. `soloFallidos` los filtra. */
export function accesos(soloFallidos = false, buscar = ""): AccesoFila[] {
  const db = getDb();
  const cond: string[] = [];
  const params: unknown[] = [];
  if (soloFallidos) cond.push("l.ok = 0");
  const q = buscar.trim().toLowerCase();
  if (q) {
    cond.push("(LOWER(c.username) LIKE ? OR l.ip LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }

  const filas = db
    .prepare(
      `SELECT l.id, l.created_at, l.ip, l.platform, l.ok,
              c.username,
              COALESCE(NULLIF(p.company, ''), p.email) AS proveedor
       FROM customer_logins l
       JOIN customers c ON c.id = l.customer_id
       JOIN providers p ON p.id = c.provider_id
       ${cond.length ? "WHERE " + cond.join(" AND ") : ""}
       ORDER BY l.created_at DESC
       LIMIT 300`
    )
    .all(...params) as Rec[];

  return filas.map((l) => ({
    id: Number(l.id),
    cuando: Number(l.created_at),
    usuario: String(l.username || ""),
    proveedor: String(l.proveedor || ""),
    ip: String(l.ip || ""),
    plataforma: String(l.platform || ""),
    ok: Number(l.ok),
  }));
}

export interface AuditoriaFila {
  id: number;
  cuando: number;
  admin: string;
  accion: string;
  sobre: string;
  detalle: string;
}

/** Lo que ha hecho la administración: quién, qué y sobre quién. */
export function auditoria(): AuditoriaFila[] {
  const filas = getDb()
    .prepare("SELECT * FROM admin_audit ORDER BY created_at DESC LIMIT 300")
    .all() as Rec[];
  return filas.map((a) => ({
    id: Number(a.id),
    cuando: Number(a.created_at),
    admin: String(a.admin_email),
    accion: String(a.action),
    sobre: String(a.target || ""),
    detalle: String(a.detail || ""),
  }));
}

/** Deja constancia de una acción de administración. */
export function anotar(adminEmail: string, accion: string, sobre = "", detalle = "") {
  getDb()
    .prepare("INSERT INTO admin_audit (admin_email, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(adminEmail, accion, sobre, detalle, Date.now());
}

export interface FacturaFila {
  id: number;
  numero: string;
  concepto: string;
  proveedor: string;
  importeCents: number;
  moneda: string;
  estado: string;
  emitida: number;
}

/** Todas las facturas de la plataforma. */
export function facturas(estado = ""): FacturaFila[] {
  const db = getDb();
  const where = ["pagada", "pendiente", "anulada"].includes(estado) ? "WHERE i.status = ?" : "";
  const params = where ? [estado] : [];
  const filas = db
    .prepare(
      `SELECT i.id, i.number, i.concept, i.amount_cents, i.currency, i.status, i.created_at,
              COALESCE(NULLIF(p.company, ''), p.email) AS proveedor
       FROM invoices i
       JOIN providers p ON p.id = i.provider_id
       ${where}
       ORDER BY i.created_at DESC
       LIMIT 300`
    )
    .all(...params) as Rec[];

  return filas.map((i) => ({
    id: Number(i.id),
    numero: String(i.number),
    concepto: String(i.concept),
    proveedor: String(i.proveedor || ""),
    importeCents: Number(i.amount_cents || 0),
    moneda: String(i.currency || "EUR"),
    estado: String(i.status || "pagada"),
    emitida: Number(i.created_at),
  }));
}
