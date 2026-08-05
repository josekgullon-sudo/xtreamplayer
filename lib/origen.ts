import { getDb, PlaylistRow } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentCustomer, resolveCustomerPlaylist } from "@/lib/provider";
import { emitirVale, enlaceDeImagen } from "@/lib/vale";

/**
 * De qué servidor come cada sesión. Esto no se pregunta al cliente: se mira.
 *
 * Antes el navegador mandaba en cada petición a qué servidor había que ir y
 * con qué usuario y contraseña. Eso obliga a que el cliente los conozca, y en
 * el momento en que los conoce, ya se los ha llevado. Aquí se resuelven desde
 * la galleta de sesión —quién eres— y no salen de este proceso.
 */

export interface Origen {
  tipo: "xtream" | "m3u";
  /** La dirección del proveedor. No debe aparecer en ninguna respuesta. */
  base: string;
  usuario: string;
  clave: string;
  /**
   * A quién pertenece esta sesión. Los vales se atan a esto, así que el de
   * uno no le sirve a otro aunque se lo pase por WhatsApp.
   */
  dueño: string;
  /** Un cliente de proveedor no puede ver nunca su línea; un usuario que se
   *  pegó su propia lista sí, porque es suya y la escribió él. */
  gestionada: boolean;
}

/**
 * A nombre de quién van los vales de esta sesión.
 *
 * Para un cliente de proveedor es lo que impide que el vale de uno le sirva a
 * otro. Para quien usa su propia lista sin cuenta no hay nada que separar
 * —la dirección es suya y ya la conoce—, así que van todos a nombre de
 * «anon»; lo que le impide abusar del proxy es el tope de /api/tele/vale, no
 * el nombre del vale.
 */
export async function dueñoDeLaSesion(): Promise<string> {
  const cliente = await getCurrentCustomer();
  if (cliente) return `c${cliente.id}`;
  const usuario = await getCurrentUser();
  if (usuario) return `u${usuario.id}`;
  return "anon";
}

/**
 * El origen de quien está pidiendo.
 *
 * Primero el cliente de un proveedor, que es el caso que hay que proteger.
 * Después el usuario con listas propias, y ahí `lista` dice cuál de ellas
 * —comprobando siempre que sea suya, que si no cualquiera leería las de
 * cualquiera cambiando un número.
 */
export async function origenDeLaSesion(lista?: string | null): Promise<Origen | null> {
  const cliente = await getCurrentCustomer();
  if (cliente) {
    const suya = resolveCustomerPlaylist(cliente);
    return {
      tipo: suya.type,
      base: suya.url,
      usuario: suya.username,
      clave: suya.password,
      dueño: `c${cliente.id}`,
      gestionada: true,
    };
  }

  const usuario = await getCurrentUser();
  if (!usuario) return null;

  const id = Number(lista || 0);
  const fila = id
    ? (getDb().prepare("SELECT * FROM playlists WHERE id = ?").get(id) as PlaylistRow | undefined)
    : undefined;
  // La lista de otro no es la tuya aunque sepas su número
  if (!fila || fila.user_id !== usuario.id) return null;

  return {
    tipo: fila.type === "xtream" ? "xtream" : "m3u",
    base: fila.url,
    usuario: fila.username || "",
    clave: fila.password || "",
    dueño: `u${usuario.id}`,
    gestionada: false,
  };
}

/**
 * El origen, admitiendo también el que el usuario escribe en el momento.
 *
 * Una lista que alguien se pega en su navegador no está guardada en ningún
 * sitio, así que no hay nada que resolver: la manda él en la petición. No es
 * una fuga —es su lista y se la sabe— pero por eso mismo esta puerta se le
 * cierra en las narices a un cliente de proveedor: si pudiera mandar una
 * dirección suya, le bastaría con mandar la del proveedor para recuperarla.
 */
export async function origenPedido(
  lista: string | null | undefined,
  propia: { base?: string | null; usuario?: string | null; clave?: string | null; tipo?: string | null }
): Promise<Origen | null> {
  const cliente = await getCurrentCustomer();
  if (cliente) {
    const suya = resolveCustomerPlaylist(cliente);
    return {
      tipo: suya.type,
      base: suya.url,
      usuario: suya.username,
      clave: suya.password,
      dueño: `c${cliente.id}`,
      gestionada: true,
    };
  }

  const guardada = await origenDeLaSesion(lista);
  if (guardada) return guardada;

  const base = (propia.base || "").trim();
  if (!/^https?:\/\//i.test(base)) return null;
  return {
    tipo: propia.tipo === "m3u" ? "m3u" : "xtream",
    base,
    usuario: (propia.usuario || "").trim(),
    clave: propia.clave || "",
    dueño: await dueñoDeLaSesion(),
    gestionada: false,
  };
}

/**
 * Deja una respuesta del proveedor sin una sola dirección suya dentro.
 *
 * Las respuestas de Xtream vienen sembradas de direcciones absolutas: el
 * logotipo de cada canal, la carátula de cada película, el `server_info` con
 * el host y el puerto en bandeja. Devolverlas tal cual es enseñar el servidor
 * en el cuerpo del JSON aunque la URL de la petición ya no lo lleve.
 *
 * Cada dirección se cambia por un vale. Se recorre entero y a ciegas: no se
 * mira el nombre del campo, porque el día que un panel devuelva la URL en un
 * campo nuevo seguiría saliendo por ahí.
 */
export function limpiar(dato: unknown, dueño: string): unknown {
  if (typeof dato === "string") {
    return /^https?:\/\//i.test(dato.trim()) ? enlaceDeImagen(dato.trim(), dueño) : dato;
  }
  if (Array.isArray(dato)) return dato.map((x) => limpiar(x, dueño));
  if (dato && typeof dato === "object") {
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(dato as Record<string, unknown>)) {
      // El servidor y el puerto, en bandeja y con nombre propio
      if (k === "server_info") continue;
      salida[k] = limpiar(v, dueño);
    }
    return salida;
  }
  return dato;
}

/** Las direcciones de vídeo de Xtream, construidas aquí y no en el navegador. */
export function urlDeXtream(
  origen: Origen,
  clase: "live" | "movie" | "series",
  id: string,
  extension: string
): string {
  const base = origen.base.replace(/\/+$/, "");
  const u = encodeURIComponent(origen.usuario);
  const c = encodeURIComponent(origen.clave);
  return `${base}/${clase}/${u}/${c}/${encodeURIComponent(id)}.${extension.replace(/[^a-z0-9]/gi, "")}`;
}

/** Catch Up: lo ya emitido. Mismo camino, otro guion del panel. */
export function urlDeTimeshift(origen: Origen, streamId: string, inicio: string, minutos: number): string {
  const q = new URLSearchParams({
    username: origen.usuario,
    password: origen.clave,
    stream: streamId,
    start: inicio,
    duration: String(Math.max(1, Math.round(minutos))),
  });
  return `${origen.base.replace(/\/+$/, "")}/streaming/timeshift.php?${q.toString()}`;
}

/** Un vale suelto, para cuando hace falta el crudo y no un enlace. */
export function valeDe(url: string, origen: Origen): string {
  return emitirVale(url, origen.dueño);
}
