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

export interface TvLista {
  id: number;
  mac: string;
  name: string;
  type: string;
  url: string;
  username: string;
  password: string;
  activa: number;
  created_at: number;
}

/** Todas las listas cargadas en un aparato, la activa primero. */
export function listarListas(mac: string): TvLista[] {
  const limpia = normalizarMac(mac);
  if (!limpia) return [];
  return getDb()
    .prepare("SELECT * FROM tv_playlists WHERE mac = ? ORDER BY activa DESC, created_at DESC")
    .all(limpia) as TvLista[];
}

/** La lista con la que entra el aparato ahora mismo. */
export function listaActiva(mac: string): TvLista | null {
  const limpia = normalizarMac(mac);
  if (!limpia) return null;
  const db = getDb();
  const activa = db.prepare("SELECT * FROM tv_playlists WHERE mac = ? AND activa = 1").get(limpia) as
    | TvLista
    | undefined;
  if (activa) return activa;
  // Sin ninguna marcada, vale la primera que haya: nunca dejar el aparato
  // con listas guardadas y sin nada que reproducir
  const primera = db
    .prepare("SELECT * FROM tv_playlists WHERE mac = ? ORDER BY created_at DESC LIMIT 1")
    .get(limpia) as TvLista | undefined;
  return primera || null;
}

/** Marca cuál es la lista con la que entra el aparato. */
export function activarLista(mac: string, id: number): boolean {
  const limpia = normalizarMac(mac);
  if (!limpia) return false;
  const db = getDb();
  const suya = db.prepare("SELECT id FROM tv_playlists WHERE id = ? AND mac = ?").get(id, limpia);
  if (!suya) return false;
  db.prepare("UPDATE tv_playlists SET activa = 0 WHERE mac = ?").run(limpia);
  db.prepare("UPDATE tv_playlists SET activa = 1 WHERE id = ?").run(id);
  return true;
}

export function borrarLista(mac: string, id: number): boolean {
  const limpia = normalizarMac(mac);
  if (!limpia) return false;
  return getDb().prepare("DELETE FROM tv_playlists WHERE id = ? AND mac = ?").run(id, limpia).changes > 0;
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

  // Se añade a las que ya tenga y pasa a ser la activa: quien acaba de
  // cargarla quiere verla ahora, no dentro de dos menús
  const yaHabia = db.prepare("SELECT COUNT(*) AS c FROM tv_playlists WHERE mac = ?").get(limpia) as { c: number };
  db.prepare("UPDATE tv_playlists SET activa = 0 WHERE mac = ?").run(limpia);
  db.prepare(
    "INSERT INTO tv_playlists (mac, name, type, url, username, password, activa, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)"
  ).run(limpia, nombre || (yaHabia.c ? `Lista ${yaHabia.c + 1}` : "Mi lista"), tipo, url, usuario, password, Date.now());
  return { ok: true, mac: limpia };
}

/** Quita la lista de una MAC (solo las que no gestiona un proveedor). */
export function vaciarMac(mac: string): { ok: true } | { ok: false; error: string } {
  const limpia = normalizarMac(mac);
  if (!limpia) return { ok: false, error: "Esa MAC no es válida" };
  const fila = getDb().prepare("SELECT * FROM tv_devices WHERE mac = ?").get(limpia) as TvDevice | undefined;
  if (fila?.customer_id) {
    return { ok: false, error: "Esa tele la gestiona un proveedor. Pídeselo a él." };
  }
  const borradas = getDb().prepare("DELETE FROM tv_playlists WHERE mac = ?").run(limpia).changes;
  if (fila) getDb().prepare("DELETE FROM tv_devices WHERE id = ?").run(fila.id);
  if (!borradas && !fila) return { ok: false, error: "Esa MAC no tiene ninguna lista cargada" };
  return { ok: true };
}

/** La lista con la que debe entrar este aparato, si tiene alguna. */
export function listaDeMac(mac: string): TvLista | null {
  const limpia = normalizarMac(mac);
  if (!limpia) return null;
  // Una MAC dada de alta por un proveedor no usa listas propias
  const device = getDb().prepare("SELECT * FROM tv_devices WHERE mac = ?").get(limpia) as TvDevice | undefined;
  if (device?.customer_id) return null;
  return listaActiva(limpia);
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
