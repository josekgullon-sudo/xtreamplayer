"use client";

/**
 * Persistencia local (modo invitado): listas, favoritos y historial
 * viven en localStorage y nunca salen del navegador.
 */

export interface StoredPlaylist {
  id: string;
  name: string;
  type: "xtream" | "m3u";
  url: string; // Para xtream: la base http://host:puerto
  username?: string;
  password?: string;
  remote?: boolean; // true si está sincronizada en la nube
  managed?: boolean; // true si la gestiona el proveedor (no editable por el cliente)
}

export interface RecentItem {
  key: string;
  name: string;
  logo?: string;
  playlistId: string;
  kind: "live" | "vod" | "episode" | "m3u";
  payload: Record<string, unknown>;
}

const K_PLAYLISTS = "xp.playlists.v1";
const K_FAVORITES = "xp.favorites.v1";
const K_RECENTS = "xp.recents.v1";
const K_VISTOS = "xp.vistos.v1";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
}

export function getLocalPlaylists(): StoredPlaylist[] {
  return read<StoredPlaylist[]>(K_PLAYLISTS, []);
}

export function saveLocalPlaylists(playlists: StoredPlaylist[]) {
  write(K_PLAYLISTS, playlists.filter((p) => !p.remote));
}

export function getFavorites(): Record<string, true> {
  return read<Record<string, true>>(K_FAVORITES, {});
}

export function toggleFavorite(key: string): Record<string, true> {
  const favs = getFavorites();
  if (favs[key]) delete favs[key];
  else favs[key] = true;
  write(K_FAVORITES, favs);
  return { ...favs };
}

export function getRecents(): RecentItem[] {
  return read<RecentItem[]>(K_RECENTS, []);
}

export function pushRecent(item: RecentItem): RecentItem[] {
  const rest = getRecents().filter((r) => r.key !== item.key);
  const next = [item, ...rest].slice(0, 12);
  write(K_RECENTS, next);
  return next;
}

export function newLocalId(): string {
  return `local-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/**
 * Por dónde iba cada cosa, en el aparato.
 *
 * Quien se pega su propia lista no tiene cuenta —esa es la gracia de la web
 * pública—, así que no hay dónde guardarlo en el servidor. Vale lo mismo
 * que para las listas y los favoritos: vive aquí y no sale del navegador.
 *
 * Con cuenta —un cliente de proveedor, o quien se registra— manda lo que
 * hay en el servidor, que es lo que hace que la tele del salón y el móvil
 * cuenten lo mismo. Esto sigue escribiéndose igual, y sirve de copia para
 * el rato en que el servidor no conteste.
 */
export interface VistoLocal {
  llave: string;
  titulo: string;
  cartel: string;
  clase: string;
  idStream: string;
  extension: string;
  serieId: string;
  temporada: number;
  episodio: number;
  segundo: number;
  duracion: number;
  acabado: boolean;
  vistoEn: number;
}

/** El mismo tope que en el servidor: ver CUANTOS en lib/vistos.ts */
const VISTOS_TOPE = 50;

export function getVistos(): Record<string, VistoLocal> {
  return read<Record<string, VistoLocal>>(K_VISTOS, {});
}

export function putVisto(v: VistoLocal): Record<string, VistoLocal> {
  const todos = { ...getVistos(), [v.llave]: v };
  /* Y se tiran los más viejos, que si no esto crece sin fin en el navegador
     de alguien que zapea mucho */
  const ordenados = Object.values(todos).sort((a, b) => b.vistoEn - a.vistoEn).slice(0, VISTOS_TOPE);
  const recortado: Record<string, VistoLocal> = {};
  for (const x of ordenados) recortado[x.llave] = x;
  write(K_VISTOS, recortado);
  return recortado;
}

export function borrarVisto(llave: string): Record<string, VistoLocal> {
  const todos = getVistos();
  delete todos[llave];
  write(K_VISTOS, todos);
  return todos;
}
