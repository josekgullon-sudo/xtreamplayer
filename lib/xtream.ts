/**
 * Tipos y helpers para la API de Xtream Codes.
 * Las peticiones JSON pasan por /api/xtream (servidor) para evitar CORS;
 * las URLs de streaming se construyen aquí y se reproducen directamente.
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

/** Llama a la API JSON de Xtream a través de nuestro proxy de servidor. */
export async function xtreamApi<T>(
  creds: XtreamCreds,
  action: string | null,
  extra?: Record<string, string>
): Promise<T> {
  const params = new URLSearchParams({
    base: creds.base,
    username: creds.username,
    password: creds.password,
  });
  if (action) params.set("action", action);
  if (extra) for (const [k, v] of Object.entries(extra)) params.set(k, v);

  const res = await fetch(`/api/xtream?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status} al consultar el servidor Xtream`);
  }
  return res.json();
}

export function liveStreamUrl(creds: XtreamCreds, streamId: number, ext: "m3u8" | "ts" = "m3u8"): string {
  return `${creds.base}/live/${encodeURIComponent(creds.username)}/${encodeURIComponent(creds.password)}/${streamId}.${ext}`;
}

export function vodStreamUrl(creds: XtreamCreds, streamId: number, ext = "mp4"): string {
  return `${creds.base}/movie/${encodeURIComponent(creds.username)}/${encodeURIComponent(creds.password)}/${streamId}.${ext}`;
}

export function seriesEpisodeUrl(creds: XtreamCreds, episodeId: string, ext = "mp4"): string {
  return `${creds.base}/series/${encodeURIComponent(creds.username)}/${encodeURIComponent(creds.password)}/${episodeId}.${ext}`;
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
