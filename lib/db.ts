import Database from "better-sqlite3";
import { applySchema } from "./schema.mjs";
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
  applySchema(_db);
  return _db;
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
  /** Color principal de la marca blanca (#rrggbb). Vacío = marca TOTALplayer */
  brand_color: string;
  /** URL del logotipo del proveedor */
  brand_logo: string;
  /** Identificador para su enlace: /m/<slug> */
  brand_slug: string;
  /** Contacto de soporte que ve su cliente */
  brand_support: string;
  /** Panel Xtream del proveedor, para importar sus clientes */
  panel_url: string;
  panel_user: string;
  panel_pass: string;
  panel_checked_at: number;
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
