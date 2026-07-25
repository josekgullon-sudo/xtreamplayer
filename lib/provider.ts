import { cookies } from "next/headers";
import { createSessionToken, verifySessionToken } from "./auth";
import { getDb, ProviderRow, ProviderPlanRow, CustomerRow, ProviderDomainRow } from "./db";

/**
 * Sesiones y reglas de negocio del lado B2B:
 * - Proveedor: paga un plan mensual por tramo de clientes.
 * - Cliente final: lo crea el proveedor y entra con usuario/contraseña.
 */

const PROVIDER_COOKIE = "xp_provider";
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
export function registerDevice(customer: CustomerRow, deviceKey: string, platform: string): DeviceCheck {
  const db = getDb();
  const now = Date.now();

  const existing = db
    .prepare("SELECT * FROM devices WHERE customer_id = ? AND device_key = ?")
    .get(customer.id, deviceKey) as { id: number } | undefined;

  if (existing) {
    db.prepare("UPDATE devices SET last_seen = ?, platform = ? WHERE id = ?").run(now, platform, existing.id);
    const used = (
      db.prepare("SELECT COUNT(*) AS c FROM devices WHERE customer_id = ?").get(customer.id) as { c: number }
    ).c;
    return { allowed: true, used, max: customer.max_devices };
  }

  const used = (
    db.prepare("SELECT COUNT(*) AS c FROM devices WHERE customer_id = ?").get(customer.id) as { c: number }
  ).c;

  if (used >= customer.max_devices) {
    return {
      allowed: false,
      reason: `Has alcanzado el límite de ${customer.max_devices} dispositivos. Pide a tu proveedor que libere uno.`,
      used,
      max: customer.max_devices,
    };
  }

  db.prepare(
    "INSERT INTO devices (customer_id, device_key, platform, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)"
  ).run(customer.id, deviceKey, platform, now, now);

  return { allowed: true, used: used + 1, max: customer.max_devices };
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
