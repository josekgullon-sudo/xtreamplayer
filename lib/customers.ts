import bcrypt from "bcryptjs";
import { getDb, CustomerRow, ProviderDomainRow, ProviderRow } from "@/lib/db";
import {
  PanelActor,
  getProviderStatus,
  isValidUsername,
  resellerCustomerCount,
  resolveCustomerPlaylist,
} from "@/lib/provider";
import { normalizeBase, parseXtreamUrl } from "@/lib/xtream";
import { encryptSecret } from "@/lib/secretBox";

/**
 * Alta de clientes, compartida entre el panel y la API pública.
 *
 * Vive aquí para que las dos puertas apliquen exactamente las mismas reglas
 * —cupos del plan, permisos del revendedor, validaciones—. Si cada puerta
 * tuviera su copia, acabarían divergiendo y una de las dos dejaría colarse
 * algo que la otra prohíbe.
 */

export interface AltaClienteInput {
  username?: string;
  password?: string;
  label?: string;
  domainId?: number;
  playlistType?: string;
  playlistUrl?: string;
  playlistUsername?: string;
  playlistPassword?: string;
  maxDevices?: number;
  maxProfiles?: number;
  expiresAt?: number;
}

export type AltaClienteResultado =
  | { ok: true; customer: CustomerRow }
  | { ok: false; error: string; status: number; needsPlan?: boolean; needsUpgrade?: boolean };

/** El proveedor actuando por sí mismo (API pública): todos los permisos. */
export function actorDeProveedor(provider: ProviderRow): PanelActor {
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

export async function crearCliente(actor: PanelActor, body: AltaClienteInput): Promise<AltaClienteResultado> {
  const provider = actor.provider;

  const status = getProviderStatus(provider);
  if (!status.active) {
    return {
      ok: false,
      error:
        actor.kind === "reseller"
          ? "El plan de tu proveedor no está activo. Contacta con él."
          : "Tu plan no está activo. Contrata un plan para dar de alta clientes.",
      status: 403,
      needsPlan: actor.kind === "provider",
    };
  }
  if (status.usedCustomers >= status.maxCustomers) {
    return {
      ok: false,
      error:
        actor.kind === "reseller"
          ? "Tu proveedor ha alcanzado el límite de clientes de su plan. Contacta con él."
          : `Has alcanzado el límite de ${status.maxCustomers} clientes de tu plan ${status.planName}. Amplía tu plan para añadir más.`,
      status: 403,
      needsUpgrade: actor.kind === "provider",
    };
  }
  if (actor.kind === "reseller" && actor.ownCustomerLimit > 0) {
    const own = resellerCustomerCount(actor.reseller!.id);
    if (own >= actor.ownCustomerLimit) {
      return {
        ok: false,
        error: `Has alcanzado tu límite de ${actor.ownCustomerLimit} clientes. Pide ampliación a tu proveedor.`,
        status: 403,
      };
    }
  }

  const username = (body.username || "").trim().toLowerCase();
  const password = body.password || "";
  if (!isValidUsername(username)) {
    return {
      ok: false,
      error: "El usuario debe tener entre 3 y 32 caracteres (letras, números, punto, guion o guion bajo)",
      status: 400,
    };
  }
  if (password.length < 4) {
    return { ok: false, error: "La contraseña debe tener al menos 4 caracteres", status: 400 };
  }

  const db = getDb();
  const dup = db.prepare("SELECT id FROM customers WHERE provider_id = ? AND username = ?").get(provider.id, username);
  if (dup) return { ok: false, error: "Ya tienes un cliente con ese usuario", status: 409 };

  let type = body.playlistType === "m3u" ? "m3u" : "xtream";
  let url = (body.playlistUrl || "").trim();
  let plUser = (body.playlistUsername || "").trim();
  let plPass = body.playlistPassword || "";
  let domainId = 0;

  // Vía normal: se elige uno de los dominios ya configurados
  if (body.domainId) {
    if (actor.domainAccess === "none") {
      return { ok: false, error: "No tienes acceso a los dominios de tu proveedor", status: 403 };
    }
    const domain = db
      .prepare("SELECT * FROM provider_domains WHERE id = ? AND provider_id = ?")
      .get(Number(body.domainId), provider.id) as ProviderDomainRow | undefined;
    if (!domain) return { ok: false, error: "Ese dominio no existe en tu cuenta", status: 400 };

    // Si pegan la URL get.php en el usuario, extraemos las credenciales igualmente
    const parsed = parseXtreamUrl(plUser);
    if (parsed) {
      plUser = parsed.username;
      plPass = plPass || parsed.password;
    }
    if (!plUser || !plPass) {
      return { ok: false, error: "Indica el usuario y la contraseña IPTV del cliente", status: 400 };
    }
    domainId = domain.id;
    type = "xtream";
    url = "";
  } else if (type === "xtream") {
    // Vía manual: URL escrita a mano (acepta un get.php completo)
    const parsed = parseXtreamUrl(url);
    if (parsed) {
      url = parsed.base;
      plUser = plUser || parsed.username;
      plPass = plPass || parsed.password;
    } else if (url) {
      url = normalizeBase(url);
    }
    if (!url || !plUser || !plPass) {
      return { ok: false, error: "Elige un dominio o indica servidor, usuario y contraseña", status: 400 };
    }
  } else {
    const parsed = parseXtreamUrl(url);
    if (parsed && /get\.php/i.test(url)) {
      // Un get.php es Xtream: mejor experiencia por la API
      type = "xtream";
      url = parsed.base;
      plUser = parsed.username;
      plPass = parsed.password;
    } else if (!url) {
      return { ok: false, error: "Indica la URL de la lista M3U", status: 400 };
    }
  }

  const hash = await bcrypt.hash(password, 10);
  const maxDevices = Math.min(Math.max(Number(body.maxDevices) || 2, 1), 10);

  const result = db
    .prepare(
      `INSERT INTO customers
       (provider_id, reseller_id, username, password_hash, password_box, label, playlist_type, playlist_url,
        playlist_username, playlist_password, domain_id, max_devices, max_profiles, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      provider.id,
      actor.reseller?.id ?? 0,
      username,
      hash,
      encryptSecret(password),
      (body.label || "").trim().slice(0, 120),
      type,
      url,
      plUser,
      plPass,
      domainId,
      maxDevices,
      Math.min(Math.max(Number(body.maxProfiles) || 1, 1), 10),
      Number(body.expiresAt) || 0,
      Date.now()
    );

  const row = db.prepare("SELECT * FROM customers WHERE id = ?").get(result.lastInsertRowid) as CustomerRow;
  return { ok: true, customer: row };
}

/** Forma pública de un cliente (panel y API usan la misma). */
export function serializarCliente(row: CustomerRow, devices: number) {
  const resolved = resolveCustomerPlaylist(row);
  return {
    id: row.id,
    username: row.username,
    label: row.label,
    playlistType: row.playlist_type,
    playlistUrl: resolved.url,
    playlistUsername: row.playlist_username,
    domainId: row.domain_id,
    maxDevices: row.max_devices,
    devices,
    expiresAt: row.expires_at,
    status: row.status,
    createdAt: row.created_at,
  };
}
