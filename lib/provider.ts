import { cookies } from "next/headers";
import { createSessionToken, verifySessionToken } from "./auth";
import { getDb, ProviderRow, ProviderPlanRow, CustomerRow, ProviderDomainRow, ResellerRow } from "./db";

/**
 * Sesiones y reglas de negocio del lado B2B:
 * - Proveedor: paga un plan mensual por tramo de clientes.
 * - Cliente final: lo crea el proveedor y entra con usuario/contraseña.
 */

const PROVIDER_COOKIE = "xp_provider";
const RESELLER_COOKIE = "xp_reseller";
const CUSTOMER_COOKIE = "xp_customer";
const PROVIDER_TRIAL_DAYS = 7;

export const providerTrialEnd = (from = Date.now()) => from + PROVIDER_TRIAL_DAYS * 86_400_000;
export const PROVIDER_TRIAL_CUSTOMERS = 10;

/* ---------------- Sesión de proveedor ---------------- */

export async function setProviderCookie(providerId: number) {
  const store = await cookies();
  store.set(PROVIDER_COOKIE, createSessionToken(providerId, "provider"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 86_400,
    path: "/",
  });
}

export async function clearProviderCookie() {
  (await cookies()).delete(PROVIDER_COOKIE);
}

export async function getCurrentProvider(): Promise<ProviderRow | null> {
  const token = (await cookies()).get(PROVIDER_COOKIE)?.value;
  if (!token) return null;
  const id = verifySessionToken(token, "provider");
  if (id === null) return null;
  const row = getDb().prepare("SELECT * FROM providers WHERE id = ?").get(id) as ProviderRow | undefined;
  if (!row || row.status !== "active") return null;
  return row;
}

/* ---------------- Sesión de revendedor ---------------- */

export async function setResellerCookie(resellerId: number) {
  const store = await cookies();
  store.set(RESELLER_COOKIE, createSessionToken(resellerId, "reseller"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 86_400,
    path: "/",
  });
}

export async function clearResellerCookie() {
  (await cookies()).delete(RESELLER_COOKIE);
}

export async function getCurrentReseller(): Promise<ResellerRow | null> {
  const token = (await cookies()).get(RESELLER_COOKIE)?.value;
  if (!token) return null;
  const id = verifySessionToken(token, "reseller");
  if (id === null) return null;
  const row = getDb().prepare("SELECT * FROM resellers WHERE id = ?").get(id) as ResellerRow | undefined;
  if (!row || row.status !== "active") return null;
  return row;
}

/* ---------------- Actor del panel (proveedor o revendedor) ---------------- */

export interface PanelActor {
  kind: "provider" | "reseller";
  provider: ProviderRow;
  reseller: ResellerRow | null;
  /** Permisos efectivos: el proveedor siempre los tiene todos */
  canViewAllCustomers: boolean;
  domainAccess: "full" | "names" | "none";
  canManageResellers: boolean;
  /** Cupo propio del revendedor (0 = solo limita el plan del proveedor) */
  ownCustomerLimit: number;
}

/**
 * Resuelve quién está usando el panel. Los revendedores comparten panel con su
 * proveedor, pero solo ven lo que este les haya permitido.
 */
export async function getPanelActor(): Promise<PanelActor | null> {
  const provider = await getCurrentProvider();
  if (provider) {
    return {
      kind: "provider",
      provider,
      reseller: null,
      canViewAllCustomers: true,
      domainAccess: "full",
      canManageResellers: true,
      ownCustomerLimit: 0,
    };
  }

  const reseller = await getCurrentReseller();
  if (!reseller) return null;

  const parent = getDb().prepare("SELECT * FROM providers WHERE id = ?").get(reseller.provider_id) as
    | ProviderRow
    | undefined;
  if (!parent || parent.status !== "active") return null;

  return {
    kind: "reseller",
    provider: parent,
    reseller,
    canViewAllCustomers: reseller.view_all_customers === 1,
    domainAccess: reseller.domain_access,
    canManageResellers: false,
    ownCustomerLimit: reseller.max_customers,
  };
}

/** Clientes que este actor puede ver: todos los del proveedor o solo los suyos. */
export function customerScopeClause(actor: PanelActor): { sql: string; params: unknown[] } {
  if (actor.canViewAllCustomers) {
    return { sql: "provider_id = ?", params: [actor.provider.id] };
  }
  return { sql: "provider_id = ? AND reseller_id = ?", params: [actor.provider.id, actor.reseller!.id] };
}

/** Cuántos clientes lleva creados el revendedor (para su cupo propio). */
export function resellerCustomerCount(resellerId: number): number {
  return (
    getDb().prepare("SELECT COUNT(*) AS c FROM customers WHERE reseller_id = ?").get(resellerId) as { c: number }
  ).c;
}

export function listResellers(providerId: number): ResellerRow[] {
  return getDb()
    .prepare("SELECT * FROM resellers WHERE provider_id = ? ORDER BY created_at DESC")
    .all(providerId) as ResellerRow[];
}

/* ---------------- Sesión de cliente final ---------------- */

export async function setCustomerCookie(customerId: number) {
  const store = await cookies();
  store.set(CUSTOMER_COOKIE, createSessionToken(customerId, "customer"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 86_400,
    path: "/",
  });
}

export async function clearCustomerCookie() {
  (await cookies()).delete(CUSTOMER_COOKIE);
}

export async function getCurrentCustomer(): Promise<CustomerRow | null> {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;
  const id = verifySessionToken(token, "customer");
  if (id === null) return null;
  const row = getDb().prepare("SELECT * FROM customers WHERE id = ?").get(id) as CustomerRow | undefined;
  if (!row) return null;
  if (row.status !== "active") return null;
  if (row.expires_at > 0 && row.expires_at < Date.now()) return null;
  return row;
}

/* ---------------- Plan y cupos ---------------- */

export interface ProviderStatus {
  plan: ProviderPlanRow | null;
  planName: string;
  onTrial: boolean;
  active: boolean;
  maxCustomers: number;
  usedCustomers: number;
  expiresAt: number;
}

export function getProviderStatus(provider: ProviderRow, now = Date.now()): ProviderStatus {
  const db = getDb();
  const plan = provider.plan_id
    ? (db.prepare("SELECT * FROM provider_plans WHERE id = ?").get(provider.plan_id) as ProviderPlanRow | undefined)
    : undefined;

  const planActive = Boolean(plan) && provider.plan_expires_at > now;
  const onTrial = !planActive && provider.trial_ends_at > now;

  const used = (
    db.prepare("SELECT COUNT(*) AS c FROM customers WHERE provider_id = ?").get(provider.id) as { c: number }
  ).c;

  return {
    plan: plan ?? null,
    planName: planActive ? plan!.name : onTrial ? "Prueba" : "Sin plan",
    onTrial,
    active: planActive || onTrial,
    maxCustomers: planActive ? plan!.max_customers : onTrial ? PROVIDER_TRIAL_CUSTOMERS : 0,
    usedCustomers: used,
    expiresAt: planActive ? provider.plan_expires_at : provider.trial_ends_at,
  };
}

export function listPlans(): ProviderPlanRow[] {
  return getDb()
    .prepare("SELECT * FROM provider_plans WHERE active = 1 ORDER BY sort_order ASC")
    .all() as ProviderPlanRow[];
}

/* ---------------- Dispositivos ---------------- */

export interface DeviceCheck {
  allowed: boolean;
  reason?: string;
  used: number;
  max: number;
}

/**
 * Registra el dispositivo si hay cupo. En TV la clave es la MAC;
 * en web, un UUID persistente del navegador.
 */
export function registerDevice(
  customer: CustomerRow,
  deviceKey: string,
  platform: string,
  ip = ""
): DeviceCheck {
  const db = getDb();
  const now = Date.now();

  const existing = db
    .prepare("SELECT * FROM devices WHERE customer_id = ? AND device_key = ?")
    .get(customer.id, deviceKey) as { id: number } | undefined;

  const countDevices = () =>
    (db.prepare("SELECT COUNT(*) AS c FROM devices WHERE customer_id = ?").get(customer.id) as { c: number }).c;

  if (existing) {
    db.prepare("UPDATE devices SET last_seen = ?, platform = ?, ip = ? WHERE id = ?").run(
      now,
      platform,
      ip,
      existing.id
    );
    db.prepare("UPDATE customers SET last_seen = ? WHERE id = ?").run(now, customer.id);
    return { allowed: true, used: countDevices(), max: customer.max_devices };
  }

  const used = countDevices();
  if (used >= customer.max_devices) {
    return {
      allowed: false,
      reason: `Has alcanzado el límite de ${customer.max_devices} dispositivos. Pide a tu proveedor que libere uno.`,
      used,
      max: customer.max_devices,
    };
  }

  db.prepare(
    "INSERT INTO devices (customer_id, device_key, platform, ip, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(customer.id, deviceKey, platform, ip, now, now);
  db.prepare("UPDATE customers SET last_seen = ? WHERE id = ?").run(now, customer.id);

  return { allowed: true, used: used + 1, max: customer.max_devices };
}

/** Deja constancia del intento de acceso, para el historial del panel. */
export function recordLogin(
  customerId: number,
  deviceKey: string,
  platform: string,
  ip: string,
  ok: boolean
): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO customer_logins (customer_id, device_key, platform, ip, ok, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(customerId, deviceKey.slice(0, 128), platform.slice(0, 40), ip.slice(0, 64), ok ? 1 : 0, Date.now());

  // Historial acotado: nos quedamos con los 50 accesos más recientes
  db.prepare(
    `DELETE FROM customer_logins WHERE customer_id = ? AND id NOT IN (
       SELECT id FROM customer_logins WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50
     )`
  ).run(customerId, customerId);
}

/** IP del cliente detrás del proxy inverso. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 64);
  return (headers.get("x-real-ip") || "").slice(0, 64);
}

export function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9._-]{3,32}$/.test(username);
}

/* ---------------- Dominios del proveedor ---------------- */

/** Host limpio: sin protocolo, sin barras, sin puerto pegado. */
export function normalizeHost(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .toLowerCase();
}

export function isValidHost(host: string): boolean {
  return /^[a-z0-9.-]{3,253}$/.test(host) && host.includes(".");
}

export function domainBaseUrl(domain: ProviderDomainRow): string {
  const defaultPort = domain.protocol === "https" ? 443 : 80;
  const port = domain.port === defaultPort ? "" : `:${domain.port}`;
  return `${domain.protocol}://${domain.host}${port}`;
}

export function listDomains(providerId: number): ProviderDomainRow[] {
  return getDb()
    .prepare("SELECT * FROM provider_domains WHERE provider_id = ? ORDER BY created_at ASC")
    .all(providerId) as ProviderDomainRow[];
}

/**
 * URL efectiva del cliente. Si tiene dominio asignado, se construye desde
 * `provider_domains`, de modo que cambiar el dominio actualiza a todos sus
 * clientes de golpe (útil cuando bloquean un dominio).
 */
export function resolveCustomerPlaylist(customer: CustomerRow): {
  type: "xtream" | "m3u";
  url: string;
  username: string;
  password: string;
} {
  let url = customer.playlist_url;
  if (customer.domain_id) {
    const domain = getDb()
      .prepare("SELECT * FROM provider_domains WHERE id = ?")
      .get(customer.domain_id) as ProviderDomainRow | undefined;
    if (domain) url = domainBaseUrl(domain);
  }
  return {
    type: customer.playlist_type,
    url,
    username: customer.playlist_username,
    password: customer.playlist_password,
  };
}
