/**
 * Tipos y helpers para la API de Xtream Codes.
 *
 * Aquí ya no se construye ninguna dirección. Antes se armaban en el
 * navegador —`${base}/live/${usuario}/${clave}/${id}.m3u8`— y para eso el
 * navegador tenía que conocer el servidor del proveedor, el usuario y la
 * contraseña: la línea entera, a la vista de cualquier cliente que abriera
 * F12. Ahora se piden por su número a /api/tele/ver y el servidor devuelve un
 * enlace opaco; a dónde va de verdad no sale de lib/origen.
 */

/**
 * Credenciales de una lista. Solo se usan al darla de alta, cuando el propio
 * usuario las escribe: a partir de ahí viven en el servidor y no vuelven.
 */
export interface XtreamCreds {
  base: string; // http://host:puerto (sin barra final)
  username: string;
  password: string;
}

export interface XtreamCategory {
  category_id: string;
  category_name: string;
}

export interface XtreamLiveStream {
  stream_id: number;
  name: string;
  stream_icon?: string;
  category_id?: string;
  epg_channel_id?: string;
  /** 1 si el canal guarda lo emitido (Catch Up); 0 o ausente si no */
  tv_archive?: string | number;
  /** Cuántos días hacia atrás lo guarda */
  tv_archive_duration?: string | number;
}

export interface XtreamVodStream {
  stream_id: number;
  name: string;
  stream_icon?: string;
  category_id?: string;
  container_extension?: string;
  rating?: string;
  /** Cuándo lo subió el proveedor. XUI lo manda en segundos, y a veces como texto */
  added?: string | number;
}

export interface XtreamSeries {
  series_id: number;
  name: string;
  cover?: string;
  category_id?: string;
  plot?: string;
  rating?: string;
  /** Última vez que se le añadió algo (temporada o episodio), en segundos */
  last_modified?: string | number;
}

export interface XtreamEpisode {
  id: string;
  episode_num: number;
  title: string;
  container_extension?: string;
  season: number;
  info?: { plot?: string; duration?: string; movie_image?: string };
}

export interface XtreamSeriesInfo {
  seasons?: unknown[];
  info?: {
    name?: string;
    plot?: string;
    cover?: string;
    cast?: string;
    director?: string;
    genre?: string;
    releaseDate?: string;
    release_date?: string;
    rating?: string;
    episode_run_time?: string;
  };
  episodes?: Record<string, XtreamEpisode[]>;
}

/** Ficha completa de una película (get_vod_info). */
export interface XtreamVodInfo {
  info?: {
    name?: string;
    movie_image?: string;
    plot?: string;
    description?: string;
    cast?: string;
    actors?: string;
    director?: string;
    genre?: string;
    releasedate?: string;
    release_date?: string;
    rating?: string;
    duration?: string;
    duration_secs?: number;
    youtube_trailer?: string;
  };
  movie_data?: { stream_id?: number; name?: string; container_extension?: string };
}

export interface XtreamUserInfo {
  user_info?: {
    auth?: number;
    username?: string;
    status?: string;
    exp_date?: string | null;
    max_connections?: string;
    active_cons?: string | number;
  };
  server_info?: { url?: string; port?: string; server_protocol?: string };
}

export function normalizeBase(input: string): string {
  let base = input.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) base = `http://${base}`;
  // Elimina rutas tipo /player_api.php o /get.php si el usuario pegó la URL completa
  base = base.replace(/\/(player_api\.php|get\.php|panel_api\.php).*$/i, "");
  return base;
}

/** Extrae credenciales si el usuario pega una URL get.php completa. */
export function parseXtreamUrl(url: string): XtreamCreds | null {
  try {
    const u = new URL(url.trim());
    const username = u.searchParams.get("username");
    const password = u.searchParams.get("password");
    if (username && password) {
      return { base: `${u.protocol}//${u.host}`, username, password };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * De dónde sale una lista, dicho de la única forma que el servidor acepta.
 *
 * Para la lista de un cliente de proveedor y para las guardadas en la nube,
 * su número y nada más: el servidor sabe el resto y no piensa contarlo. Para
 * la que alguien se pega en su propio navegador, sus datos, porque no están
 * guardados en ningún sitio y son suyos.
 */
export interface Fuente {
  lista?: string;
  base?: string;
  username?: string;
  password?: string;
}

export async function xtreamApi<T>(
  fuente: Fuente,
  action: string | null,
  extra?: Record<string, string>
): Promise<T> {
  const params = new URLSearchParams();
  if (fuente.lista) params.set("lista", fuente.lista);
  if (fuente.base) {
    params.set("base", fuente.base);
    params.set("username", fuente.username || "");
    params.set("password", fuente.password || "");
  }
  if (action) params.set("action", action);
  if (extra) for (const [k, v] of Object.entries(extra)) params.set(k, v);

  const res = await fetch(`/api/xtream?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status} al consultar tu lista`);
  }
  return res.json();
}

/** Lo que hay que decirle al servidor para que resuelva una reproducción. */
export interface Peticion extends Fuente {
  clase: "live" | "movie" | "series" | "timeshift";
  id: string;
  ext?: string;
  /** Catch Up: AAAA-MM-DD:HH-MM en la hora del panel */
  inicio?: string;
  minutos?: number;
}

export interface Enlace {
  url: string;
  urlTs?: string;
  vale?: string;
  valeTs?: string;
  directo?: boolean;
}

/** «Quiero ver esto» → un enlace para reproducirlo. */
export async function pedirEnlace(p: Peticion): Promise<Enlace> {
  const res = await fetch("/api/tele/ver", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "No hemos podido abrir este canal");
  }
  return res.json();
}

/**
 * Un vale para una dirección que ya se tiene delante.
 *
 * Las listas M3U traen la dirección de cada canal escrita dentro, así que
 * para esas no hay nada que resolver. Pero el reproductor necesita además
 * poder pedir ese mismo canal por nuestro proxy cuando el servidor no manda
 * cabeceras CORS o filtra al navegador —que es el caso corriente—, y el
 * proxy ya no acepta direcciones sueltas. Esto convierte una en un vale.
 */
export async function valeDe(url: string): Promise<string | undefined> {
  try {
    const res = await fetch("/api/tele/vale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return undefined;
    return (await res.json()).vale;
  } catch {
    // Sin vale se pierde el camino de reserva, no la reproducción
    return undefined;
  }
}

/** El momento de inicio de un Catch Up, en el formato que pide el panel. */
export function momentoDeArchivo(inicio: Date): string {
  const dos = (n: number) => String(n).padStart(2, "0");
  return (
    `${inicio.getFullYear()}-${dos(inicio.getMonth() + 1)}-${dos(inicio.getDate())}:` +
    `${dos(inicio.getHours())}-${dos(inicio.getMinutes())}`
  );
}

export function decodeBase64Maybe(value: string | undefined): string {
  if (!value) return "";
  try {
    // Los títulos del EPG de Xtream vienen en base64
    return decodeURIComponent(escape(atob(value)));
  } catch {
    return value;
  }
}
