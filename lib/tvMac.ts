import { getDb } from "@/lib/db";

/**
 * Altas de televisores por MAC.
 *
 * Es el flujo de toda la vida en los reproductores de IPTV: la tele enseña
 * su MAC, el cliente se la pasa a su proveedor por WhatsApp, el proveedor la
 * registra y la tele entra sola para siempre. Sigue siendo el camino más
 * cómodo para quien no se maneja con códigos ni con móviles, así que convive
 * con el emparejado por código: cada cual usa el que prefiera.
 *
 * En un navegador no se puede leer la MAC de verdad —ningún navegador lo
 * permite—, así que el aparato genera un identificador propio y estable y lo
 * enseña con forma de MAC. Para el proveedor funciona igual: copia lo que ve
 * en la pantalla. En las apps nativas de Samsung o LG, ese identificador se
 * puede sustituir por la MAC real del sistema sin tocar nada más.
 */

/** Normaliza a AA:BB:CC:DD:EE:FF; devuelve "" si no es una MAC válida. */
export function normalizarMac(valor: string): string {
  const limpio = (valor || "").toUpperCase().replace(/[^0-9A-F]/g, "");
  if (limpio.length !== 12) return "";
  return limpio.match(/.{2}/g)!.join(":");
}

export interface TvDevice {
  id: number;
  provider_id: number;
  customer_id: number;
  mac: string;
  label: string;
  /** Lista cargada directamente contra la MAC, sin proveedor de por medio */
  playlist_type: string;
  playlist_url: string;
  playlist_user: string;
  playlist_pass: string;
  created_at: number;
  last_seen: number;
}

/**
 * Carga una lista contra una MAC, sin proveedor: el flujo de los
 * reproductores de siempre — el usuario lee la MAC en su tele, entra en la
 * web, la escribe y pega su lista. No pide sesión porque quien compra la
 * app puede no tener cuenta con nadie; lo que protege el acceso es que la
 * MAC la genera la propia tele con 48 bits al azar, así que no se adivina.
 */
export function cargarListaEnMac(
  mac: string,
  lista: { url: string; usuario?: string; password?: string; nombre?: string }
): { ok: true; mac: string } | { ok: false; error: string } {
  const limpia = normalizarMac(mac);
  if (!limpia) return { ok: false, error: "Esa MAC no es válida. Son 12 caracteres, como 1A:2B:3C:4D:5E:6F" };

  const url = (lista.url || "").trim();
  if (!/^https?:\/\/.+/i.test(url)) return { ok: false, error: "La dirección debe empezar por http:// o https://" };

  const usuario = (lista.usuario || "").trim();
  const password = (lista.password || "").trim();
  // Con usuario y contraseña es un panel Xtream; sin ellos, una lista M3U
  const tipo = usuario && password ? "xtream" : "m3u";
  const nombre = (lista.nombre || "").slice(0, 60);

  const db = getDb();
  const previa = db.prepare("SELECT * FROM tv_devices WHERE mac = ?").get(limpia) as TvDevice | undefined;
  if (previa?.customer_id) {
    return { ok: false, error: "Esa tele ya está dada de alta por un proveedor. Pídele a él el cambio de lista." };
  }
  if (previa) {
    db.prepare(
      "UPDATE tv_devices SET playlist_type = ?, playlist_url = ?, playlist_user = ?, playlist_pass = ?, label = ? WHERE id = ?"
    ).run(tipo, url, usuario, password, nombre, previa.id);
  } else {
    db.prepare(
      `INSERT INTO tv_devices (provider_id, customer_id, mac, label, playlist_type, playlist_url, playlist_user, playlist_pass, created_at)
       VALUES (0, 0, ?, ?, ?, ?, ?, ?, ?)`
    ).run(limpia, nombre, tipo, url, usuario, password, Date.now());
  }
  return { ok: true, mac: limpia };
}

/** Quita la lista de una MAC (solo las que no gestiona un proveedor). */
export function vaciarMac(mac: string): { ok: true } | { ok: false; error: string } {
  const limpia = normalizarMac(mac);
  if (!limpia) return { ok: false, error: "Esa MAC no es válida" };
  const fila = getDb().prepare("SELECT * FROM tv_devices WHERE mac = ?").get(limpia) as TvDevice | undefined;
  if (!fila) return { ok: false, error: "Esa MAC no tiene ninguna lista cargada" };
  if (fila.customer_id) {
    return { ok: false, error: "Esa tele la gestiona un proveedor. Pídeselo a él." };
  }
  getDb().prepare("DELETE FROM tv_devices WHERE id = ?").run(fila.id);
  return { ok: true };
}

/** La lista cargada contra una MAC, si la hay. */
export function listaDeMac(mac: string): TvDevice | null {
  const limpia = normalizarMac(mac);
  if (!limpia) return null;
  const fila = getDb().prepare("SELECT * FROM tv_devices WHERE mac = ?").get(limpia) as TvDevice | undefined;
  if (!fila || fila.customer_id || !fila.playlist_url) return null;
  getDb().prepare("UPDATE tv_devices SET last_seen = ? WHERE id = ?").run(Date.now(), fila.id);
  return fila;
}

/** Da de alta un televisor para un cliente. */
export function registrarMac(
  providerId: number,
  customerId: number,
  mac: string,
  label: string
): { ok: true; mac: string } | { ok: false; error: string } {
  const limpia = normalizarMac(mac);
  if (!limpia) return { ok: false, error: "Esa MAC no es válida. Son 12 caracteres, como 1A:2B:3C:4D:5E:6F" };

  const db = getDb();
  const previa = db.prepare("SELECT * FROM tv_devices WHERE mac = ?").get(limpia) as TvDevice | undefined;
  if (previa) {
    if (previa.customer_id === customerId) return { ok: true, mac: limpia };
    return { ok: false, error: "Esa tele ya está dada de alta con otro cliente" };
  }

  db.prepare(
    "INSERT INTO tv_devices (provider_id, customer_id, mac, label, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(providerId, customerId, limpia, (label || "").slice(0, 60), Date.now());
  return { ok: true, mac: limpia };
}

export function listarMacs(customerId: number): TvDevice[] {
  return getDb()
    .prepare("SELECT * FROM tv_devices WHERE customer_id = ? ORDER BY created_at DESC")
    .all(customerId) as TvDevice[];
}

export function borrarMac(id: number, providerId: number): boolean {
  return (
    getDb().prepare("DELETE FROM tv_devices WHERE id = ? AND provider_id = ?").run(id, providerId).changes > 0
  );
}

/** ¿A qué cliente pertenece esta tele? */
export function clientePorMac(mac: string): number | null {
  const limpia = normalizarMac(mac);
  if (!limpia) return null;
  const fila = getDb().prepare("SELECT * FROM tv_devices WHERE mac = ?").get(limpia) as TvDevice | undefined;
  if (!fila) return null;
  getDb().prepare("UPDATE tv_devices SET last_seen = ? WHERE id = ?").run(Date.now(), fila.id);
  return fila.customer_id;
}
