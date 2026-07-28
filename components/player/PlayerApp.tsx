"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import VideoPlayer, { PlaySource } from "./VideoPlayer";
import AddPlaylistModal from "./AddPlaylistModal";
import ProfileGate from "./ProfileGate";
import SectionGate from "./SectionGate";
import AdSlot from "@/components/AdSlot";
import Loading, { SkeletonList, MENSAJES_CANALES, MENSAJES_CINE, MENSAJES_SERIES } from "@/components/Loading";
import {
  StoredPlaylist,
  getLocalPlaylists,
  saveLocalPlaylists,
  getFavorites,
  toggleFavorite,
  getRecents,
  pushRecent,
  RecentItem,
} from "@/lib/storage";
import { parseM3U, M3UChannel } from "@/lib/m3u";
import { imgSrc } from "@/lib/img";
import {
  XtreamCreds,
  XtreamCategory,
  XtreamLiveStream,
  XtreamVodStream,
  XtreamSeries,
  XtreamSeriesInfo,
  XtreamVodInfo,
  xtreamApi,
  liveStreamUrl,
  timeshiftUrl,
  vodStreamUrl,
  seriesEpisodeUrl,
  decodeBase64Maybe,
} from "@/lib/xtream";

type Tab = "live" | "guia" | "vod" | "series" | "favs";

interface NowPlaying {
  source: PlaySource;
  logo?: string;
  playlistId: string;
  kind: "live" | "vod" | "episode" | "m3u";
  streamId?: number;
  favKey?: string;
}

interface XtreamData {
  liveCats: XtreamCategory[];
  liveStreams: XtreamLiveStream[];
  vodCats: XtreamCategory[];
  vodStreams: XtreamVodStream[];
  seriesCats: XtreamCategory[];
  seriesList: XtreamSeries[];
}

const K_LAST_PLAYLIST = "xp.lastPlaylist.v1";

function credsOf(p: StoredPlaylist): XtreamCreds {
  return { base: p.url, username: p.username || "", password: p.password || "" };
}

/* ---------- Parrilla ---------- */

/** Media hora: la unidad en la que piensa cualquiera al mirar una parrilla */
const MEDIA_HORA = 1800000;
/** Lo que se ve de una vez; con más, los títulos no caben */
const VENTANA_GUIA = 4 * 3600000;

interface ProgramaGuia {
  id: string;
  titulo: string;
  desc: string;
  ini: number;
  fin: number;
}

/**
 * Hora de un programa. XUI la manda de dos maneras a la vez: unix en
 * segundos (a veces como texto) y «2026-07-28 21:00:00» en la hora del
 * servidor. Se prefiere la unix, que no depende de husos horarios.
 */
function horaEpg(unix?: string | number, texto?: string): number {
  const n = Number(unix);
  if (Number.isFinite(n) && n > 0) return n > 1e11 ? n : n * 1000;
  const m = (texto || "").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return 0;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
}

/** A la media hora en punto, para que la regla empiece donde se espera */
function aMediaHora(ms: number) {
  return Math.floor(ms / MEDIA_HORA) * MEDIA_HORA;
}

function hhmm(ms: number) {
  return new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

/** Categoría inventada por nosotros: lo último que ha subido el proveedor. */
const NOVEDADES = "__nuevo__";
/*
 * Qué cuenta como novedad: dos meses. Sin ventana, «Novedades» acababa
 * enseñando películas de hace tres años ordenadas por fecha —lo más nuevo
 * de un catálogo parado sigue siendo viejo—, y eso es justo lo contrario de
 * lo que se viene a mirar. Si no hay nada reciente se dice, que es honesto.
 */
const VENTANA_NOVEDADES = 60 * 86400000;

/**
 * Fecha de alta de un título. XUI la manda en segundos y, según la versión,
 * como número o como texto; alguna devuelve cadenas vacías o ceros. Todo lo
 * que no sea una fecha creíble vale 0 y se queda fuera de «Novedades».
 */
function alta(valor?: string | number): number {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const ms = n > 1e11 ? n : n * 1000;
  return ms > 946684800000 && ms < Date.now() + 86400000 ? ms : 0;
}

export default function PlayerApp() {
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [customer, setCustomer] = useState<{ username: string; brand: string } | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [playlists, setPlaylists] = useState<StoredPlaylist[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [profile, setProfile] = useState<{ id: number; name: string } | null>(null);
  const [perfilResuelto, setPerfilResuelto] = useState(false);
  /**
   * Estado de la pantalla de «¿qué quieres ver?». Se decide una sola vez al
   * entrar y no se recalcula en cada render: si dependiera de si hay favoritos
   * o de la pestaña abierta, aparecería de golpe en mitad de la sesión al
   * marcar el primer favorito.
   */
  const [seccionGate, setSeccionGate] = useState<"pendiente" | "mostrando" | "hecho">("pendiente");
  /**
   * En cine y series se navega a pantalla completa: el vídeo solo aparece
   * cuando se ha elegido algo que ver. Tener el reproductor siempre arriba
   * dejaba las carátulas en una franja al fondo y un stream sonando encima
   * mientras se buscaba otra cosa.
   */
  const [viendo, setViendo] = useState(false);
  /** Carpeta abierta en la parrilla de canales (null = todas) */
  const [grupoSel, setGrupoSel] = useState<string | null>(null);
  /**
   * En el móvil las tres columnas son tres pantallas. Este estado marca el
   * paso «canales»; no vale mirar grupoSel porque «Todos los canales»
   * también abre la lista y ahí no hay carpeta elegida.
   */
  const [verCanales, setVerCanales] = useState(false);
  /** El buscador vive plegado en una lupa hasta que se pide */
  const [buscando, setBuscando] = useState(false);

  const [tab, setTab] = useState<Tab>("live");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [xtreamData, setXtreamData] = useState<Record<string, Partial<XtreamData>>>({});
  const [m3uData, setM3uData] = useState<Record<string, M3UChannel[]>>({});
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [catFilter, setCatFilter] = useState<string>("all");
  /** Carpetas de canales abiertas en el móvil (cerradas por defecto) */
  const [carpetasAbiertas, setCarpetasAbiertas] = useState<Record<string, boolean>>({});

  const [current, setCurrent] = useState<NowPlaying | null>(null);
  const [epg, setEpg] = useState<{ now?: string; next?: string } | null>(null);
  const [favorites, setFavorites] = useState<Record<string, true>>({});
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [seriesDetail, setSeriesDetail] = useState<{ series: XtreamSeries; info: XtreamSeriesInfo; season: string } | null>(null);
  const [vodDetail, setVodDetail] = useState<{ vod: XtreamVodStream; info: XtreamVodInfo | null } | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  const active = playlists.find((p) => p.id === activeId) || null;
  const data = active ? xtreamData[active.id] : undefined;

  /* ---------- Carga inicial: auth, listas locales y en la nube ---------- */

  useEffect(() => {
    setFavorites(getFavorites());
    setRecents(getRecents());
    const locals = getLocalPlaylists();
    setPlaylists(locals);
    const last = localStorage.getItem(K_LAST_PLAYLIST);
    if (last && locals.some((p) => p.id === last)) setActiveId(last);
    else if (locals.length) setActiveId(locals[0].id);

    // Cliente dado de alta por un proveedor: su lista se carga sola
    fetch("/api/customer/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.customer || !d.playlist) return;
        setCustomer({ username: d.customer.username, brand: d.brand || "" });
        // Marca blanca: viste el reproductor con el color del proveedor
        if (d.branding?.cssVars) {
          const style = document.createElement("style");
          style.dataset.branding = "1";
          style.textContent = `:root{${d.branding.cssVars}}`;
          document.head.appendChild(style);
        }
        const managed: StoredPlaylist = {
          id: d.playlist.id,
          name: d.playlist.name,
          type: d.playlist.type,
          url: d.playlist.url,
          username: d.playlist.username,
          password: d.playlist.password,
          managed: true,
        };
        setPlaylists((prev) => [managed, ...prev.filter((p) => p.id !== managed.id)]);
        setActiveId(managed.id);
      })
      .catch(() => {});

    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(async (d) => {
        if (d.user) {
          setUser(d.user);
          const res = await fetch("/api/playlists");
          if (res.ok) {
            const body = await res.json();
            const remote: StoredPlaylist[] = (body.playlists || []).map(
              (p: { id: string; name: string; type: "xtream" | "m3u"; url: string; username: string; password: string }) => ({
                id: `cloud-${p.id}`,
                name: p.name,
                type: p.type,
                url: p.url,
                username: p.username,
                password: p.password,
                remote: true,
              })
            );
            setPlaylists((prev) => {
              const merged = [...remote, ...prev.filter((x) => !x.remote)];
              setActiveId((cur) => cur ?? (merged[0]?.id || null));
              return merged;
            });
          }
        }
      })
      .catch(() => {})
      .finally(() => setAuthLoaded(true));
  }, []);

  useEffect(() => {
    if (activeId) localStorage.setItem(K_LAST_PLAYLIST, activeId);
  }, [activeId]);

  // Cambiar de lista es empezar de nuevo: se vuelve a preguntar qué ver,
  // porque lo que ofrece cada lista no tiene por qué ser lo mismo.
  useEffect(() => {
    setSeccionGate("pendiente");
  }, [activeId]);

  /*
   * Abrimos la conexión con el servidor del proveedor en cuanto se elige la
   * lista, sin esperar al primer clic. Así el DNS, el TCP y el TLS ya están
   * resueltos cuando el usuario pincha un canal, que en una Smart TV o en una
   * conexión móvil es casi un segundo menos de espera.
   */
  useEffect(() => {
    if (!active) return;
    let origen = "";
    try {
      origen = new URL(active.url).origin;
    } catch {
      return;
    }
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = origen;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
    return () => link.remove();
  }, [active]);

  /* ---------- Carga de datos por lista y pestaña ---------- */

  const loadTab = useCallback(
    async (p: StoredPlaylist, t: Tab) => {
      setLoadError(null);
      setSeriesDetail(null);
      if (p.type === "m3u") {
        if (m3uData[p.id]) return;
        setLoading(true);
        try {
          const res = await fetch(`/api/m3u?url=${encodeURIComponent(p.url)}`);
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || "No se pudo cargar la lista");
          }
          const text = await res.text();
          const parsed = parseM3U(text);
          setM3uData((prev) => ({ ...prev, [p.id]: parsed.channels }));
        } catch (e) {
          setLoadError(e instanceof Error ? e.message : "Error al cargar la lista");
        } finally {
          setLoading(false);
        }
        return;
      }

      const creds = credsOf(p);
      const cache = xtreamData[p.id] || {};
      const need =
        (t === "live" && !cache.liveStreams) ||
        (t === "vod" && !cache.vodStreams) ||
        (t === "series" && !cache.seriesList);
      if (!need) return;

      setLoading(true);
      // Algunos paneles devuelven objetos de error en vez de arrays: nunca confiar en la forma
      const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
      /*
       * Y a veces devuelven títulos con name: null. Un solo título sucio
       * tumbaba la búsqueda entera (toLowerCase sobre nada): se sanea todo
       * al entrar y el resto del código puede confiar en que name es texto.
       */
      const conNombre = <T extends { name?: unknown },>(xs: T[]): T[] =>
        xs.map((x) => ({ ...x, name: typeof x.name === "string" ? x.name : "" }));
      try {
        if (t === "live") {
          const [cats, streams] = await Promise.all([
            xtreamApi<unknown>(creds, "get_live_categories"),
            xtreamApi<unknown>(creds, "get_live_streams"),
          ]);
          setXtreamData((prev) => ({
            ...prev,
            [p.id]: { ...prev[p.id], liveCats: asArray<XtreamCategory>(cats), liveStreams: conNombre(asArray<XtreamLiveStream>(streams)) },
          }));
        } else if (t === "vod") {
          const [cats, streams] = await Promise.all([
            xtreamApi<unknown>(creds, "get_vod_categories"),
            xtreamApi<unknown>(creds, "get_vod_streams"),
          ]);
          setXtreamData((prev) => ({
            ...prev,
            [p.id]: { ...prev[p.id], vodCats: asArray<XtreamCategory>(cats), vodStreams: conNombre(asArray<XtreamVodStream>(streams)) },
          }));
        } else if (t === "series") {
          const [cats, list] = await Promise.all([
            xtreamApi<unknown>(creds, "get_series_categories"),
            xtreamApi<unknown>(creds, "get_series"),
          ]);
          setXtreamData((prev) => ({
            ...prev,
            [p.id]: { ...prev[p.id], seriesCats: asArray<XtreamCategory>(cats), seriesList: conNombre(asArray<XtreamSeries>(list)) },
          }));
        }
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Error al conectar con el servidor");
      } finally {
        setLoading(false);
      }
    },
    [m3uData, xtreamData]
  );

  /*
   * Cambiar de pestaña desde sus botones cierra lo que se estaba viendo y
   * vuelve a la parrilla. Va en el gesto y no en un efecto sobre `tab`: la
   * portada cambia de pestaña Y arranca un vídeo en el mismo clic, y un
   * efecto que limpiara en cualquier cambio apagaba ese vídeo al nacer.
   */
  function irAPestana(t: typeof tab) {
    setTab(t);
    setViendo(false);
    setGrupoSel(null);
  }

  useEffect(() => {
    setViendo(false);
    setGrupoSel(null);
  }, [activeId]);

  /*
   * Cada ficha vive en su pestaña: se cierra al SALIR de ella o al cambiar
   * de lista, nunca al entrar. La portada abre una ficha y cambia de
   * pestaña en el mismo gesto — limpiarla en cualquier cambio de pestaña la
   * mataba antes de nacer.
   */
  useEffect(() => {
    if (tab !== "vod") setVodDetail(null);
    if (tab !== "series") setSeriesDetail(null);
  }, [tab]);
  useEffect(() => {
    setVodDetail(null);
    setSeriesDetail(null);
  }, [activeId]);

  useEffect(() => {
    if (!active) return;
    setCatFilter("all");
    if (active.type === "m3u" && (tab === "vod" || tab === "series")) {
      setTab("live");
      return;
    }
    const effective = tab === "favs" ? "live" : tab;
    loadTab(active, effective);
  }, [active, tab, loadTab]);

  /* ---------- EPG del canal en reproducción ---------- */

  useEffect(() => {
    setEpg(null);
    if (!current || current.kind !== "live" || !current.streamId) return;
    const p = playlists.find((x) => x.id === current.playlistId);
    if (!p || p.type !== "xtream") return;
    let cancelled = false;
    xtreamApi<{ epg_listings?: { title?: string; start?: string; end?: string }[] }>(
      credsOf(p),
      "get_short_epg",
      { stream_id: String(current.streamId), limit: "2" }
    )
      .then((res) => {
        if (cancelled) return;
        const listings = res.epg_listings || [];
        setEpg({
          now: decodeBase64Maybe(listings[0]?.title),
          next: decodeBase64Maybe(listings[1]?.title),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [current, playlists]);

  /* ---------- Acciones ---------- */

  async function handleAddPlaylist(p: StoredPlaylist, saveToCloud: boolean) {
    if (saveToCloud && user) {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: p.name, type: p.type, url: p.url, username: p.username, password: p.password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "No se pudo guardar la lista");
      const saved: StoredPlaylist = { ...p, id: `cloud-${body.playlist.id}`, remote: true };
      setPlaylists((prev) => [...prev, saved]);
      setActiveId(saved.id);
    } else {
      setPlaylists((prev) => {
        const next = [...prev, p];
        saveLocalPlaylists(next);
        return next;
      });
      setActiveId(p.id);
    }
    setShowAdd(false);
    setTab("live");
  }

  async function handleDeletePlaylist(p: StoredPlaylist) {
    if (p.managed) {
      alert("Esta lista la gestiona tu proveedor y no se puede eliminar.");
      return;
    }
    if (!confirm(`¿Eliminar la lista «${p.name}»?`)) return;
    if (p.remote) {
      await fetch(`/api/playlists/${p.id.replace("cloud-", "")}`, { method: "DELETE" }).catch(() => {});
    }
    setPlaylists((prev) => {
      const next = prev.filter((x) => x.id !== p.id);
      saveLocalPlaylists(next);
      if (activeId === p.id) setActiveId(next[0]?.id || null);
      return next;
    });
    if (current?.playlistId === p.id) setCurrent(null);
  }

  const playLive = useCallback(
    (p: StoredPlaylist, ch: XtreamLiveStream) => {
      const favKey = `${p.id}:live:${ch.stream_id}`;
      setViendo(true);
      setCurrent({
        source: { url: liveStreamUrl(credsOf(p), ch.stream_id), name: ch.name, kind: "hls" },
        logo: ch.stream_icon,
        playlistId: p.id,
        kind: "live",
        streamId: ch.stream_id,
        favKey,
      });
      setRecents(
        pushRecent({
          key: favKey,
          name: ch.name,
          logo: ch.stream_icon,
          playlistId: p.id,
          kind: "live",
          payload: { stream_id: ch.stream_id, name: ch.name, stream_icon: ch.stream_icon },
        })
      );
    },
    []
  );

  /**
   * Catch Up: volver a poner un programa que ya se emitió. El panel guarda
   * los últimos días de cada canal que lo tenga activado, y hasta ahora esa
   * grabación no había forma de pedirla desde aquí.
   */
  const playArchivo = useCallback(
    (p: StoredPlaylist, streamId: number, logo: string | undefined, titulo: string, ini: number, fin: number) => {
      const minutos = Math.max(1, Math.round((fin - ini) / 60000));
      setViendo(true);
      setCurrent({
        source: {
          url: timeshiftUrl(credsOf(p), streamId, new Date(ini), minutos),
          name: titulo,
          kind: "hls",
        },
        logo,
        playlistId: p.id,
        kind: "live",
        streamId,
        favKey: "",
      });
    },
    []
  );

  const playM3u = useCallback((p: StoredPlaylist, ch: M3UChannel) => {
    const favKey = `${p.id}:m3u:${ch.url}`;
    setViendo(true);
    setCurrent({
      source: { url: ch.url, name: ch.name, kind: "auto" },
      logo: ch.logo,
      playlistId: p.id,
      kind: "m3u",
      favKey,
    });
    setRecents(
      pushRecent({
        key: favKey,
        name: ch.name,
        logo: ch.logo,
        playlistId: p.id,
        kind: "m3u",
        payload: { url: ch.url, name: ch.name, logo: ch.logo },
      })
    );
  }, []);

  async function openVod(p: StoredPlaylist, item: XtreamVodStream) {
    setVodDetail({ vod: item, info: null });
    try {
      const info = await xtreamApi<XtreamVodInfo>(credsOf(p), "get_vod_info", { vod_id: String(item.stream_id) });
      setVodDetail((prev) => (prev && prev.vod.stream_id === item.stream_id ? { vod: item, info } : prev));
    } catch {
      // Sin ficha no pasa nada: el botón de reproducir sigue ahí
      setVodDetail((prev) => (prev && prev.vod.stream_id === item.stream_id ? { vod: item, info: {} } : prev));
    }
  }

  function playVod(p: StoredPlaylist, item: XtreamVodStream) {
    const ext = item.container_extension || "mp4";
    setViendo(true);
    setCurrent({
      source: { url: vodStreamUrl(credsOf(p), item.stream_id, ext), name: item.name, kind: "video" },
      logo: item.stream_icon,
      playlistId: p.id,
      kind: "vod",
      favKey: `${p.id}:vod:${item.stream_id}`,
    });
    setRecents(
      pushRecent({
        key: `${p.id}:vod:${item.stream_id}`,
        name: item.name,
        logo: item.stream_icon,
        playlistId: p.id,
        kind: "vod",
        payload: { stream_id: item.stream_id, name: item.name, ext },
      })
    );
  }

  async function openSeries(p: StoredPlaylist, s: XtreamSeries) {
    setLoading(true);
    setLoadError(null);
    try {
      const info = await xtreamApi<XtreamSeriesInfo>(credsOf(p), "get_series_info", {
        series_id: String(s.series_id),
      });
      const seasons = Object.keys(info.episodes || {});
      setSeriesDetail({ series: s, info, season: seasons[0] || "" });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No se pudo cargar la serie");
    } finally {
      setLoading(false);
    }
  }

  function playEpisode(p: StoredPlaylist, s: XtreamSeries, epId: string, title: string, ext?: string) {
    setViendo(true);
    setCurrent({
      source: { url: seriesEpisodeUrl(credsOf(p), epId, ext || "mp4"), name: `${s.name} — ${title}`, kind: "video" },
      logo: s.cover,
      playlistId: p.id,
      kind: "episode",
    });
  }

  function onToggleFav(key: string) {
    setFavorites(toggleFavorite(key));
  }

  function playRecent(item: RecentItem) {
    const p = playlists.find((x) => x.id === item.playlistId);
    if (!p) return;
    if (item.kind === "live") {
      playLive(p, item.payload as unknown as XtreamLiveStream);
    } else if (item.kind === "m3u") {
      playM3u(p, item.payload as unknown as M3UChannel);
    } else if (item.kind === "vod") {
      const pl = item.payload as { stream_id: number; name: string; ext?: string };
      setCurrent({
        source: { url: vodStreamUrl(credsOf(p), pl.stream_id, pl.ext || "mp4"), name: pl.name, kind: "video" },
        logo: item.logo,
        playlistId: p.id,
        kind: "vod",
      });
    }
  }

  /* ---------- Listas visibles (búsqueda + categorías + favoritos) ---------- */

  const q = search.trim().toLowerCase();

  const liveGroups = useMemo(() => {
    if (!active)
      return [] as {
        name: string;
        channels: { id: string; name: string; logo?: string; favKey: string; archivo: boolean; play: () => void }[];
      }[];

    if (active.type === "m3u") {
      const channels = m3uData[active.id] || [];
      const byGroup = new Map<string, M3UChannel[]>();
      for (const ch of channels) {
        if (q && !(ch.name || "").toLowerCase().includes(q)) continue;
        const g = ch.group || "Sin categoría";
        if (!byGroup.has(g)) byGroup.set(g, []);
        byGroup.get(g)!.push(ch);
      }
      const groups = Array.from(byGroup.entries()).map(([name, chs]) => ({
        name,
        channels: chs.map((ch) => ({
          id: ch.id,
          name: ch.name,
          logo: ch.logo,
          favKey: `${active.id}:m3u:${ch.url}`,
          archivo: false,
          play: () => playM3u(active, ch),
        })),
      }));
      if (tab === "favs") {
        return groups
          .map((g) => ({ ...g, channels: g.channels.filter((c) => favorites[c.favKey]) }))
          .filter((g) => g.channels.length);
      }
      return groups;
    }

    const cache = xtreamData[active.id];
    if (!cache?.liveStreams) return [];
    const catName = new Map((cache.liveCats || []).map((c) => [c.category_id, c.category_name]));
    const byCat = new Map<string, XtreamLiveStream[]>();
    /*
     * Las carpetas salen en el orden que manda el panel, no en el que
     * aparezcan los canales ni por orden alfabético: ese orden lo ha puesto
     * el proveedor a propósito —sus destacados primero, luego TDT,
     * autonómicos…— y reordenarlo le deshace el escaparate.
     */
    for (const c of cache.liveCats || []) byCat.set(c.category_name, []);
    for (const ch of cache.liveStreams) {
      if (q && !(ch.name || "").toLowerCase().includes(q)) continue;
      const g = catName.get(ch.category_id || "") || "Otros";
      if (!byCat.has(g)) byCat.set(g, []);
      byCat.get(g)!.push(ch);
    }
    // Las categorías que se queden vacías (por la búsqueda) no se enseñan
    for (const [nombre, chs] of byCat) if (!chs.length) byCat.delete(nombre);
    const groups = Array.from(byCat.entries()).map(([name, chs]) => ({
      name,
      channels: chs.map((ch) => ({
        id: String(ch.stream_id),
        name: ch.name,
        logo: ch.stream_icon,
        favKey: `${active.id}:live:${ch.stream_id}`,
        archivo: Number(ch.tv_archive) > 0,
        play: () => playLive(active, ch),
      })),
    }));
    if (tab === "favs") {
      return groups
        .map((g) => ({ ...g, channels: g.channels.filter((c) => favorites[c.favKey]) }))
        .filter((g) => g.channels.length);
    }
    return groups;
  }, [active, m3uData, xtreamData, q, tab, favorites, playLive, playM3u]);

  const flatChannels = useMemo(() => liveGroups.flatMap((g) => g.channels), [liveGroups]);

  /*
   * Búsqueda global. Hasta ahora el buscador solo miraba dentro de la
   * pestaña abierta: escribir el nombre de una película estando en el
   * directo no daba nada, y no había forma de saber que había que cambiar
   * de sección antes de buscar. Con dos letras se busca en todo a la vez y
   * los resultados salen separados por tipo.
   */
  const canalesTodos = useMemo(() => {
    if (!active) return [] as { id: string; name: string; logo?: string; favKey: string; play: () => void }[];
    if (active.type === "m3u") {
      return (m3uData[active.id] || []).map((ch) => ({
        id: ch.id,
        name: ch.name,
        logo: ch.logo,
        favKey: `${active.id}:m3u:${ch.url}`,
        play: () => playM3u(active, ch),
      }));
    }
    return (xtreamData[active.id]?.liveStreams || []).map((ch) => ({
      id: String(ch.stream_id),
      name: ch.name,
      logo: ch.stream_icon,
      favKey: `${active.id}:live:${ch.stream_id}`,
      play: () => playLive(active, ch),
    }));
  }, [active, m3uData, xtreamData, playLive, playM3u]);

  /* ---------- Parrilla: el EPG de muchos canales a la vez ---------- */

  const [guiaDesde, setGuiaDesde] = useState(() => aMediaHora(Date.now()) - MEDIA_HORA);
  const [guiaEpg, setGuiaEpg] = useState<Record<string, ProgramaGuia[]>>({});
  const [guiaCargando, setGuiaCargando] = useState(false);

  /* Una parrilla de cinco mil canales no la lee nadie: se enseña la de la
     categoría elegida, igual que en el directo, y de treinta en treinta */
  const canalesGuia = useMemo(() => {
    if (tab !== "guia" || !liveGroups.length) return [];
    const grupo = liveGroups.find((g) => g.name === grupoSel) || liveGroups[0];
    return grupo.channels.slice(0, 30);
  }, [tab, liveGroups, grupoSel]);

  useEffect(() => {
    setGuiaEpg({});
  }, [activeId]);

  useEffect(() => {
    if (tab !== "guia" || !active || active.type !== "xtream" || !canalesGuia.length) return;
    const faltan = canalesGuia.filter((c) => !guiaEpg[c.id]).map((c) => c.id);
    if (!faltan.length) return;

    let cancelado = false;
    setGuiaCargando(true);
    const creds = credsOf(active);

    /*
     * De seis en seis. Treinta peticiones a la vez contra un panel modesto
     * acaban en tiempos de espera y en una parrilla a medio pintar; así
     * tarda un poco más y llega entera.
     */
    (async () => {
      for (let i = 0; i < faltan.length && !cancelado; i += 6) {
        const tanda = faltan.slice(i, i + 6);
        const hechas = await Promise.all(
          tanda.map(async (id) => {
            try {
              const res = await xtreamApi<{
                epg_listings?: {
                  id?: string;
                  title?: string;
                  description?: string;
                  start?: string;
                  end?: string;
                  start_timestamp?: string | number;
                  stop_timestamp?: string | number;
                }[];
              }>(creds, "get_short_epg", { stream_id: id, limit: "24" });
              const progs = (res.epg_listings || [])
                .map((pr, n) => ({
                  id: pr.id || `${id}-${n}`,
                  titulo: decodeBase64Maybe(pr.title) || "Sin título",
                  desc: decodeBase64Maybe(pr.description) || "",
                  ini: horaEpg(pr.start_timestamp, pr.start),
                  fin: horaEpg(pr.stop_timestamp, pr.end),
                }))
                .filter((pr) => pr.ini > 0 && pr.fin > pr.ini);
              return [id, progs] as const;
            } catch {
              // Un canal sin EPG no puede dejar toda la parrilla en blanco
              return [id, [] as ProgramaGuia[]] as const;
            }
          })
        );
        if (cancelado) return;
        setGuiaEpg((prev) => {
          const siguiente = { ...prev };
          for (const [id, progs] of hechas) siguiente[id] = progs;
          return siguiente;
        });
      }
      if (!cancelado) setGuiaCargando(false);
    })();

    return () => {
      cancelado = true;
    };
  }, [tab, active, canalesGuia, guiaEpg]);

  /** Franjas de media hora de la ventana visible, para la regla de arriba */
  const franjas = useMemo(
    () => Array.from({ length: VENTANA_GUIA / MEDIA_HORA }, (_, i) => guiaDesde + i * MEDIA_HORA),
    [guiaDesde]
  );

  /** Con menos de dos letras no se busca: media lista coincide con una sola */
  const buscandoTodo = q.length >= 2;

  const resultados = useMemo(() => {
    if (!buscandoTodo) return { canales: [], pelis: [], series: [], total: 0 };
    const coincide = (n?: string) => (n || "").toLowerCase().includes(q);
    const canales = canalesTodos.filter((c) => coincide(c.name));
    const pelis = (data?.vodStreams || []).filter((v) => coincide(v.name));
    const series = (data?.seriesList || []).filter((s) => coincide(s.name));
    return { canales, pelis, series, total: canales.length + pelis.length + series.length };
  }, [buscandoTodo, q, canalesTodos, data]);

  const vodVisible = useMemo(() => {
    if (!active || active.type !== "xtream") return [];
    const items = data?.vodStreams || [];
    const vistos = items.filter(
      (v) => (catFilter === NOVEDADES || catFilter === "all" || v.category_id === catFilter) &&
        (!q || (v.name || "").toLowerCase().includes(q))
    );
    if (catFilter !== NOVEDADES) return vistos;
    const desde = Date.now() - VENTANA_NOVEDADES;
    return vistos
      .filter((v) => alta(v.added) >= desde)
      .sort((a, b) => alta(b.added) - alta(a.added))
      .slice(0, 120);
  }, [active, data, catFilter, q]);

  const seriesVisible = useMemo(() => {
    if (!active || active.type !== "xtream") return [];
    const items = data?.seriesList || [];
    const vistas = items.filter(
      (s) => (catFilter === NOVEDADES || catFilter === "all" || s.category_id === catFilter) &&
        (!q || (s.name || "").toLowerCase().includes(q))
    );
    if (catFilter !== NOVEDADES) return vistas;
    const desde = Date.now() - VENTANA_NOVEDADES;
    return vistas
      .filter((s) => alta(s.last_modified) >= desde)
      .sort((a, b) => alta(b.last_modified) - alta(a.last_modified))
      .slice(0, 120);
  }, [active, data, catFilter, q]);

  /* Sin nada reciente no se ofrece «Novedades»: un botón que solo lleva a
     «no hay nada» es una promesa que la lista no puede cumplir */
  const hayNovedades = useMemo(() => {
    if (!active || active.type !== "xtream") return false;
    const desde = Date.now() - VENTANA_NOVEDADES;
    return (
      (data?.vodStreams || []).some((v) => alta(v.added) >= desde) ||
      (data?.seriesList || []).some((s) => alta(s.last_modified) >= desde)
    );
  }, [active, data]);

  /* ---------- Atajos de teclado ---------- */

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) {
        if (e.key === "Escape") (el as HTMLElement).blur();
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        setBuscando(true);
        setTimeout(() => searchRef.current?.focus(), 0);
      } else if (e.key === "f" || e.key === "F") {
        document.querySelector<HTMLVideoElement>(".pa-video-zone video")?.requestFullscreen?.().catch(() => {});
      } else if (e.key === "m" || e.key === "M") {
        const v = document.querySelector<HTMLVideoElement>(".pa-video-zone video");
        if (v) v.muted = !v.muted;
      } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && current?.favKey && flatChannels.length) {
        const idx = flatChannels.findIndex((c) => c.favKey === current.favKey);
        if (idx >= 0) {
          e.preventDefault();
          const next = e.key === "ArrowDown" ? (idx + 1) % flatChannels.length : (idx - 1 + flatChannels.length) % flatChannels.length;
          flatChannels[next].play();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, flatChannels]);

  /* ---------- Render ---------- */

  const isXtream = active?.type === "xtream";
  const showSidebar = tab === "live" || tab === "favs" || !isXtream;
  /** Cine/series sin nada elegido: catálogo a pantalla completa, sin vídeo */
  const modoCatalogo = isXtream && (tab === "vod" || tab === "series") && !viendo;
  /**
   * El directo funciona igual que el cine: primero se navega la parrilla de
   * canales y carpetas a pantalla completa, y el reproductor solo aparece al
   * elegir. Cargar un vídeo nada más entrar decidía por el usuario qué ver.
   */
  const modoCanales = Boolean(active) && (tab === "live" || tab === "favs") && !viendo;
  const explorando = modoCatalogo || modoCanales;
  /*
   * Solo se pregunta cuando hay más de un sitio al que ir. Una lista M3U sin
   * favoritos únicamente trae canales, así que preguntar entre una sola opción
   * sería meter un clic por el gusto de meterlo.
   */
  const hayDondeElegir = isXtream || Object.keys(favorites).length > 0;

  // Se resuelve una sola vez por lista, en cuanto se sabe quién está viendo
  useEffect(() => {
    if (seccionGate !== "pendiente" || !perfilResuelto || !active) return;
    setSeccionGate(hayDondeElegir ? "mostrando" : "hecho");
  }, [seccionGate, perfilResuelto, active, hayDondeElegir]);

  // La portada enseña cine y series sin entrar en sus pestañas: en cuanto se
  // muestra el selector se precargan en segundo plano y las carátulas van
  // apareciendo solas (el render es reactivo a xtreamData)
  useEffect(() => {
    if (seccionGate !== "mostrando" || !active || active.type !== "xtream") return;
    loadTab(active, "vod");
    loadTab(active, "series");
  }, [seccionGate, active, loadTab]);
  const vodCats = data?.vodCats || [];
  const seriesCats = data?.seriesCats || [];

  /*
   * Canales de la carpeta abierta. Sin carpeta elegida se enseñan todos
   * seguidos, con un tope: pintar diez mil botones de golpe deja el
   * navegador clavado, y para eso están las categorías.
   */
  /**
   * Episodios de la temporada abierta. Van al lado del vídeo para pasar al
   * siguiente sin volver a la ficha, que es como se ve una serie de verdad.
   */
  const episodiosDeLaSerie = useMemo(
    () => (seriesDetail ? seriesDetail.info.episodes?.[seriesDetail.season] || [] : []),
    [seriesDetail]
  );

  /** Al acabar un episodio, encadena con el siguiente de la temporada */
  function siguienteEpisodio() {
    if (!active || !seriesDetail || !current) return;
    const i = episodiosDeLaSerie.findIndex((ep) =>
      current.source.name.includes(ep.title || `Episodio ${ep.episode_num}`)
    );
    const sig = episodiosDeLaSerie[i + 1];
    if (sig) {
      playEpisode(active, seriesDetail.series, sig.id, sig.title || `Episodio ${sig.episode_num}`, sig.container_extension);
    }
  }

  const canalesVisibles = useMemo(() => {
    const grupo = grupoSel ? liveGroups.find((g) => g.name === grupoSel) : null;
    if (grupo) return grupo.channels;
    return liveGroups.flatMap((g) => g.channels).slice(0, 500);
  }, [liveGroups, grupoSel]);

  return (
    <>
    <ProfileGate
      onReady={(p) => setProfile({ id: p.id, name: p.name })}
      onResuelto={() => setPerfilResuelto(true)}
    />
    {seccionGate === "mostrando" && (
      <SectionGate
        marca={customer?.brand || "TOTALplayer"}
        perfil={profile?.name}
        conCine={isXtream}
        conFavoritos={Object.keys(favorites).length > 0}
        onElegir={(s) => {
          irAPestana(s);
          setSeccionGate("hecho");
        }}
        portada={active ? {
          recientes: recents.slice(0, 5).map((r) => ({
            key: r.key,
            nombre: r.name,
            play: () => {
              setSeccionGate("hecho");
              playRecent(r);
            },
          })),
          canales: flatChannels.filter((c) => c.name.trim()).slice(0, 14).map((c) => ({
            key: c.favKey,
            nombre: c.name,
            logo: imgSrc(c.logo) || "",
            play: () => {
              setSeccionGate("hecho");
              setTab("live");
              c.play();
            },
          })),
          /* En la portada manda lo último subido: es lo que se viene a
             mirar, y el orden del panel deja arriba lo de hace tres años */
          pelis: [...vodVisible].filter((v) => v.name.trim())
            .sort((a, b) => alta(b.added) - alta(a.added))
            .slice(0, 12).map((v) => ({
            key: v.stream_id,
            nombre: v.name,
            poster: imgSrc(v.stream_icon) || "",
            abrir: () => {
              setSeccionGate("hecho");
              setTab("vod");
              setViendo(false); // si había un canal sonando, la ficha manda
              openVod(active, v);
            },
          })),
          series: [...seriesVisible].filter((s) => s.name.trim())
            .sort((a, b) => alta(b.last_modified) - alta(a.last_modified))
            .slice(0, 12).map((s) => ({
            key: s.series_id,
            nombre: s.name,
            poster: imgSrc(s.cover) || "",
            abrir: () => {
              setSeccionGate("hecho");
              setTab("series");
              setViendo(false);
              openSeries(active, s);
            },
          })),
        } : undefined}
      />
    )}
    {/*
      El directo, en tres columnas: carpetas, canales de la carpeta y
      reproductor. Es la forma en que se usa una lista de verdad —se entra
      por una categoría, se ve qué hay, se prueba un canal y se sigue
      mirando sin perder el sitio— y la que usan los reproductores de
      escritorio a los que ya está acostumbrado el cliente.
    */}
    {/* Barra de secciones: en escritorio es la única forma de cambiar de
        sitio ahora que el directo ocupa las tres columnas */}
    {active && (
      <nav className="pa-nav" aria-label="Secciones">
        {hayDondeElegir && (
          <button
            className="pa-inicio"
            onClick={() => setSeccionGate("mostrando")}
            title="Volver a elegir qué ver"
          >
            <Icon name="back" size={14} /> <span className="oculta-movil">Elegir qué ver</span>
          </button>
        )}
        <div className="pa-nav-secciones">
          <button className={`pa-nav-item ${tab === "live" ? "activo" : ""}`} onClick={() => irAPestana("live")}>
            <Icon name="tv" size={16} /> {isXtream ? "TV en directo" : "Canales"}
          </button>
          {isXtream && (
            <>
              <button className={`pa-nav-item ${tab === "guia" ? "activo" : ""}`} onClick={() => irAPestana("guia")}>
                <Icon name="clock" size={16} /> Guía
              </button>
              <button className={`pa-nav-item ${tab === "vod" ? "activo" : ""}`} onClick={() => irAPestana("vod")}>
                <Icon name="film" size={16} /> Películas
              </button>
              <button className={`pa-nav-item ${tab === "series" ? "activo" : ""}`} onClick={() => irAPestana("series")}>
                <Icon name="series" size={16} /> Series
              </button>
            </>
          )}
          <button className={`pa-nav-item ${tab === "favs" ? "activo" : ""}`} onClick={() => irAPestana("favs")}>
            <Icon name="star" size={16} /> Favoritos
          </button>
        </div>
        {/* Una lupa, y el campo solo cuando hace falta: un buscador siempre
            abierto con su texto de ayuda ocupaba media barra para algo que
            se usa de vez en cuando */}
        <div className={`pa-nav-busca ${buscando || search ? "abierta" : ""}`}>
          <button
            className="pa-icon-btn"
            onClick={() => { setBuscando(true); setTimeout(() => searchRef.current?.focus(), 0); }}
            title="Buscar"
            aria-label="Buscar"
          >
            <Icon name="search" size={16} />
          </button>
          <input
            ref={searchRef}
            className="input"
            placeholder="Buscar…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={() => { if (!search) setBuscando(false); }}
            aria-label="Buscar canales y contenido"
          />
        </div>
        {/* Siempre visible, aunque solo haya una: es lo único que dice qué
            lista se está viendo ahora que la barra lateral no está */}
        {playlists.length > 0 && (
          <select
            className="input pa-nav-lista"
            value={activeId || ""}
            onChange={(e) => setActiveId(e.target.value || null)}
            aria-label="Seleccionar lista"
          >
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        {/* Añadir lista: sin esto, quien no tiene proveedor se quedaba sin
            manera de meter otra desde el reproductor */}
        <button className="pa-icon-btn" onClick={() => setShowAdd(true)} title="Añadir lista" aria-label="Añadir lista">
          <Icon name="plus" size={16} />
        </button>
        {active && !active.managed && (
          <button
            className="pa-icon-btn pa-icon-btn-danger"
            onClick={() => handleDeletePlaylist(active)}
            title="Eliminar esta lista"
            aria-label="Eliminar esta lista"
          >
            <Icon name="trash" size={15} />
          </button>
        )}
      </nav>
    )}

    {active && buscandoTodo ? (
      /* Resultados de la búsqueda global, en lugar del contenido de la
         pestaña: lo que se busca manda sobre dónde se estaba */
      <div className="pa-buscador">
        <div className="pa-buscador-cab">
          <h2>
            {resultados.total} resultado{resultados.total === 1 ? "" : "s"} para «{search.trim()}»
          </h2>
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(""); setBuscando(false); }}>
            <Icon name="cerrar" size={14} /> Limpiar
          </button>
        </div>

        {resultados.total === 0 ? (
          <p className="pa-empty">Nada con ese nombre en esta lista.</p>
        ) : (
          <div className="pa-buscador-cuerpo">
            {resultados.canales.length > 0 && (
              <section className="pa-buscador-bloque">
                <h3><Icon name="tv" size={15} /> Canales <span>{resultados.canales.length}</span></h3>
                <div className="pa-buscador-canales">
                  {resultados.canales.slice(0, 60).map((ch) => (
                    <button
                      key={ch.favKey}
                      className="pa-live-chan"
                      onClick={() => { setTab("live"); setSearch(""); setBuscando(false); ch.play(); }}
                      title={ch.name}
                    >
                      {imgSrc(ch.logo) ? (
                        <img src={imgSrc(ch.logo)} alt="" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
                      ) : (
                        <span className="ph">{ch.name.trim().slice(0, 1).toUpperCase()}</span>
                      )}
                      <span className="name">{ch.name}</span>
                    </button>
                  ))}
                </div>
                {resultados.canales.length > 60 && (
                  <p className="pa-buscador-mas">y {resultados.canales.length - 60} más — afina un poco la búsqueda</p>
                )}
              </section>
            )}

            {resultados.pelis.length > 0 && (
              <section className="pa-buscador-bloque">
                <h3><Icon name="film" size={15} /> Películas <span>{resultados.pelis.length}</span></h3>
                <div className="portada-posters">
                  {resultados.pelis.slice(0, 30).map((v) => (
                    <button
                      key={v.stream_id}
                      className="portada-poster"
                      onClick={() => { setTab("vod"); setSearch(""); setBuscando(false); setViendo(false); openVod(active, v); }}
                      title={v.name}
                    >
                      {imgSrc(v.stream_icon) ? (
                        <img src={imgSrc(v.stream_icon)} alt="" loading="lazy" />
                      ) : (
                        <span className="portada-poster-ph"><Icon name="film" size={22} /></span>
                      )}
                      <span className="portada-poster-nombre">{v.name}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {resultados.series.length > 0 && (
              <section className="pa-buscador-bloque">
                <h3><Icon name="series" size={15} /> Series <span>{resultados.series.length}</span></h3>
                <div className="portada-posters">
                  {resultados.series.slice(0, 30).map((se) => (
                    <button
                      key={se.series_id}
                      className="portada-poster"
                      onClick={() => { setTab("series"); setSearch(""); setBuscando(false); setViendo(false); openSeries(active, se); }}
                      title={se.name}
                    >
                      {imgSrc(se.cover) ? (
                        <img src={imgSrc(se.cover)} alt="" loading="lazy" />
                      ) : (
                        <span className="portada-poster-ph"><Icon name="series" size={22} /></span>
                      )}
                      <span className="portada-poster-nombre">{se.name}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    ) : active && tab === "guia" ? (
      /* La parrilla: qué echan ahora y en las próximas horas, de un vistazo.
         Categorías a la izquierda como en el directo, y a la derecha una
         rejilla que se desliza en el tiempo. */
      <div className="pa-guia">
        <aside className="pa-live-cats" aria-label="Categorías">
          <div className="pa-live-head">
            <span>Categorías</span>
            <span className="pa-live-n">{canalesGuia.length}</span>
          </div>
          <div className="pa-live-scroll">
            {liveGroups.map((g) => (
              <button
                key={g.name}
                className={`pa-live-cat ${(grupoSel || liveGroups[0]?.name) === g.name ? "activa" : ""}`}
                onClick={() => setGrupoSel(g.name)}
                title={g.name}
              >
                <span className="name">{g.name}</span>
                <span className="pa-live-n">{g.channels.length}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="pa-guia-main">
          <div className="pa-guia-barra">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setGuiaDesde((d) => d - 2 * MEDIA_HORA)}
              aria-label="Una hora antes"
            >
              <Icon name="back" size={14} /> 1 h
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setGuiaDesde(aMediaHora(Date.now()) - MEDIA_HORA)}
            >
              Ahora
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setGuiaDesde((d) => d + 2 * MEDIA_HORA)}
              aria-label="Una hora después"
            >
              1 h <Icon name="chevronRight" size={14} />
            </button>
            <span className="pa-guia-dia">
              {new Date(guiaDesde).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
            </span>
            {guiaCargando && <span className="pa-guia-cargando">Cargando la parrilla…</span>}
          </div>

          <div className="pa-guia-scroll">
            <div className="pa-guia-rejilla">
              <div className="pa-guia-regla">
                <div className="pa-guia-esquina" />
                <div className="pa-guia-horas">
                  {franjas.map((f) => (
                    <span key={f} className="pa-guia-hora" style={{ width: `${(MEDIA_HORA / VENTANA_GUIA) * 100}%` }}>
                      {hhmm(f)}
                    </span>
                  ))}
                  {/* La línea de ahora solo se pinta si «ahora» cae dentro */}
                  {Date.now() >= guiaDesde && Date.now() <= guiaDesde + VENTANA_GUIA && (
                    <span
                      className="pa-guia-ahora"
                      style={{ left: `${((Date.now() - guiaDesde) / VENTANA_GUIA) * 100}%` }}
                      aria-hidden="true"
                    />
                  )}
                </div>
              </div>

              {canalesGuia.map((ch) => {
                const progs = (guiaEpg[ch.id] || []).filter(
                  (pr) => pr.fin > guiaDesde && pr.ini < guiaDesde + VENTANA_GUIA
                );
                return (
                  <div className="pa-guia-fila" key={ch.favKey}>
                    <button
                      className="pa-guia-canal"
                      onClick={() => { setTab("live"); ch.play(); }}
                      title={`Ver ${ch.name}`}
                    >
                      {imgSrc(ch.logo) ? (
                        <img src={imgSrc(ch.logo)} alt="" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
                      ) : (
                        <span className="ph">{ch.name.trim().slice(0, 1).toUpperCase()}</span>
                      )}
                      <span className="name">{ch.name}</span>
                      {ch.archivo && (
                        <span className="pa-guia-marca" title="Guarda lo emitido: puedes volver atrás">
                          <Icon name="clock" size={12} />
                        </span>
                      )}
                    </button>
                    <div className="pa-guia-progs">
                      {progs.length === 0 && (
                        <span className="pa-guia-vacio">{guiaEpg[ch.id] ? "Sin guía" : "…"}</span>
                      )}
                      {progs.map((pr) => {
                        const ini = Math.max(pr.ini, guiaDesde);
                        const fin = Math.min(pr.fin, guiaDesde + VENTANA_GUIA);
                        const ahora = Date.now() >= pr.ini && Date.now() < pr.fin;
                        /* Ya emitido y el canal lo guarda: se puede volver a
                           ver. Sin Catch Up, pulsarlo pone el directo, que es
                           lo único que hay */
                        const recuperable = !ahora && pr.fin <= Date.now() && ch.archivo;
                        return (
                          <button
                            key={pr.id}
                            className={`pa-guia-prog ${ahora ? "emitiendo" : ""} ${recuperable ? "recuperable" : ""}`}
                            style={{
                              left: `${((ini - guiaDesde) / VENTANA_GUIA) * 100}%`,
                              width: `${((fin - ini) / VENTANA_GUIA) * 100}%`,
                            }}
                            /* setTab y no irAPestana: irAPestana limpia lo que
                               se esté viendo, y aquí el vídeo nace en este
                               mismo clic */
                            onClick={() => {
                              setTab("live");
                              if (recuperable) {
                                playArchivo(active, Number(ch.id), ch.logo, pr.titulo, pr.ini, pr.fin);
                              } else {
                                ch.play();
                              }
                            }}
                            title={
                              `${hhmm(pr.ini)}–${hhmm(pr.fin)} · ${pr.titulo}` +
                              (recuperable ? "\n\nYa emitido: se puede volver a ver" : "") +
                              (pr.desc ? `\n\n${pr.desc}` : "")
                            }
                          >
                            <span className="pa-guia-prog-hora">
                              {hhmm(pr.ini)}
                              {recuperable && (
                                <Icon name="back" size={10} className="pa-guia-rec" aria-label="Se puede volver a ver" />
                              )}
                            </span>
                            <span className="pa-guia-prog-titulo">{pr.titulo}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {!canalesGuia.length && <p className="pa-empty">Esta lista no trae canales de televisión.</p>}
            </div>
          </div>
        </section>
      </div>
    ) : active && (tab === "live" || tab === "favs") ? (
      <div className={`pa-live ${current ? "con-video" : ""} ${verCanales ? "con-canales" : ""}`}>
        <aside className="pa-live-cats" aria-label="Categorías">
          <div className="pa-live-head">
            <span>Categorías</span>
            <span className="pa-live-n">{liveGroups.reduce((n, g) => n + g.channels.length, 0)}</span>
          </div>
          <div className="pa-live-scroll">
            {/* Lo último visto, primero: en la práctica se vuelve al mismo
                puñado de canales, y buscarlos entre miles cada vez sobra */}
            {recents.length > 0 && tab === "live" && (
              <>
                <p className="pa-live-sub">Seguir viendo</p>
                {recents.slice(0, 4).map((r) => (
                  <button key={r.key} className="pa-live-cat pa-live-reciente" onClick={() => playRecent(r)} title={r.name}>
                    <Icon name="play" size={13} />
                    <span className="name">{r.name}</span>
                  </button>
                ))}
                <p className="pa-live-sub">Categorías</p>
              </>
            )}
            <button
              className={`pa-live-cat ${!grupoSel ? "activa" : ""}`}
              onClick={() => { setGrupoSel(null); setVerCanales(true); }}
            >
              <span className="name">Todos los canales</span>
            </button>
            {liveGroups.map((g) => (
              <button
                key={g.name}
                className={`pa-live-cat ${grupoSel === g.name ? "activa" : ""}`}
                onClick={() => { setGrupoSel(g.name); setVerCanales(true); }}
                title={g.name}
              >
                <span className="name">{g.name}</span>
                <span className="pa-live-n">{g.channels.length}</span>
              </button>
            ))}
            {!liveGroups.length && !loading && (
              <p className="pa-empty">
                {tab === "favs" ? "Aún no tienes favoritos." : "No hay canales que coincidan."}
              </p>
            )}
          </div>
        </aside>

        <section className="pa-live-chans" aria-label="Canales">
          <div className="pa-live-head">
            <button className="pa-live-atras" onClick={() => setVerCanales(false)} aria-label="Volver a categorías">
              <Icon name="back" size={15} />
            </button>
            <span>{grupoSel || "Todos los canales"}</span>
          </div>
          <div className="pa-live-scroll">
            {loading && <SkeletonList rows={8} />}
            {canalesVisibles.map((ch, i) => (
              <button
                key={ch.favKey}
                className={`pa-live-chan ${current?.favKey === ch.favKey ? "activo" : ""}`}
                onClick={ch.play}
                title={ch.name}
              >
                <span className="pa-live-num">{i + 1}</span>
                {imgSrc(ch.logo) ? (
                  <img src={imgSrc(ch.logo)} alt="" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
                ) : (
                  <span className="ph">{ch.name.trim().slice(0, 1).toUpperCase()}</span>
                )}
                <span className="name">{ch.name}</span>
                {favorites[ch.favKey] && <Icon name="star" size={13} className="pa-live-fav" />}
              </button>
            ))}
            {!loading && !canalesVisibles.length && <p className="pa-empty">Aquí no hay canales.</p>}
          </div>
        </section>

        <main className="pa-live-stage">
          {current ? (
            <>
              <div className="pa-live-titulo">
                <button className="pa-live-atras" onClick={() => { setCurrent(null); setViendo(false); }} aria-label="Cerrar el vídeo">
                  <Icon name="back" size={15} />
                </button>
                {imgSrc(current.logo) && (
                  <img
                    className="pa-live-titulo-logo"
                    src={imgSrc(current.logo)}
                    alt=""
                    onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2>{current.source.name}</h2>
                  <p>
                    {epg?.now ? `Ahora: ${epg.now}` : "En directo"}
                    {epg?.next ? <span className="pa-epg-next"> · Después: {epg.next}</span> : null}
                  </p>
                </div>
                {current.favKey && (
                  <button className="btn btn-ghost btn-sm" onClick={() => onToggleFav(current.favKey!)}>
                    <><Icon name="star" size={14} /> {favorites[current.favKey] ? "En favoritos" : "Favorito"}</>
                  </button>
                )}
              </div>
              <VideoPlayer source={current.source} />
            </>
          ) : (
            <div className="pa-live-vacio">
              <Icon name="tv" size={44} />
              <p>Elige un canal y empieza a verlo aquí.</p>
            </div>
          )}
        </main>
      </div>
    ) : (
    <div className="pa-cat-layout">
      {/* Cine y series comparten esqueleto con el directo: géneros a la
          izquierda y el contenido a la derecha. Un solo lenguaje para toda
          la aplicación en vez de una pantalla distinta por sección. */}
      {active && (tab === "vod" || tab === "series") && (
        <aside className="pa-live-cats" aria-label="Géneros">
          <div className="pa-live-head">
            <span>{tab === "vod" ? "Géneros" : "Categorías"}</span>
            <span className="pa-live-n">{(tab === "vod" ? vodVisible : seriesVisible).length}</span>
          </div>
          <div className="pa-live-scroll">
            <button
              className={`pa-live-cat ${catFilter === "all" ? "activa" : ""}`}
              onClick={() => setCatFilter("all")}
            >
              <span className="name">Todo</span>
            </button>
            {/* Lo recién subido, arriba del todo: es a lo que se entra a
                mirar, y hasta ahora había que sabérselo de memoria para
                distinguirlo entre miles de títulos viejos */}
            {hayNovedades && (
              <button
                className={`pa-live-cat pa-live-nuevo ${catFilter === NOVEDADES ? "activa" : ""}`}
                onClick={() => setCatFilter(NOVEDADES)}
              >
                <Icon name="sparkle" size={13} />
                <span className="name">Novedades</span>
              </button>
            )}
            {(tab === "vod" ? vodCats : seriesCats).map((c) => (
              <button
                key={c.category_id}
                className={`pa-live-cat ${catFilter === c.category_id ? "activa" : ""}`}
                onClick={() => setCatFilter(c.category_id)}
                title={c.category_name}
              >
                <span className="name">{c.category_name}</span>
              </button>
            ))}
          </div>
        </aside>
      )}

      <main className="pa-cat-main">
        {!active && (
          <div className="pa-welcome">
            <h2>Bienvenido a TOTALplayer</h2>
            <p>
              Añade tu lista M3U o tus credenciales Xtream Codes y empieza a ver TV en directo, películas y series
              directamente en el navegador.
            </p>
            <button className="btn btn-primary btn-lg" onClick={() => setShowAdd(true)}>
              <><Icon name="plus" size={17} /> Añadir mi primera lista</>
            </button>
            {recents.length > 0 && (
              <>
                <h3 style={{ marginTop: 20, fontSize: 15, color: "var(--text-dim)" }}>Visto recientemente</h3>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                  {recents.slice(0, 6).map((r) => (
                    <button key={r.key} className="btn btn-ghost btn-sm" onClick={() => playRecent(r)}>
                      <><Icon name="play" size={13} /> {r.name}</>
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="pa-shortcuts">
              <span><span className="kbd">↑↓</span> Zapping</span>
              <span><span className="kbd">/</span> Buscar</span>
              <span><span className="kbd">F</span> Pantalla completa</span>
              <span><span className="kbd">M</span> Silenciar</span>
            </div>
          </div>
        )}

        {/* Viendo una película o un episodio: el vídeo manda, y al lado
            quedan los episodios para pasar al siguiente sin volver atrás */}
        {active && viendo && current && (
          <div className={`pa-watch ${episodiosDeLaSerie.length ? "con-episodios" : ""}`}>
            <div className="pa-watch-video">
              <div className="pa-live-titulo">
                <button
                  className="pa-live-atras"
                  onClick={() => { setViendo(false); setCurrent(null); }}
                  aria-label="Volver"
                >
                  <Icon name="back" size={15} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2>{current.source.name}</h2>
                </div>
              </div>
              <VideoPlayer source={current.source} onEnded={siguienteEpisodio} />
            </div>
            {episodiosDeLaSerie.length > 0 && (
              <aside className="pa-watch-eps" aria-label="Episodios">
                <div className="pa-live-head"><span>Episodios</span></div>
                <div className="pa-live-scroll">
                  {episodiosDeLaSerie.map((ep) => (
                    <button
                      key={ep.id}
                      className={`pa-ep-fila ${current.source.name.includes(ep.title || `Episodio ${ep.episode_num}`) ? "activo" : ""}`}
                      onClick={() =>
                        playEpisode(active, seriesDetail!.series, ep.id, ep.title || `Episodio ${ep.episode_num}`, ep.container_extension)
                      }
                    >
                      <span className="pa-ep-n">{ep.episode_num}</span>
                      <span className="pa-ep-t">{ep.title || `Episodio ${ep.episode_num}`}</span>
                    </button>
                  ))}
                </div>
              </aside>
            )}
          </div>
        )}

        {/* Catálogo de cine */}
        {active && modoCatalogo && tab === "vod" && !vodDetail && (
          <div className="pa-cat-scroll">
            {loading && <Loading messages={MENSAJES_CINE} />}
            {loadError && <div className="pa-empty"><div className="error-box">{loadError}</div></div>}
            <div className="pa-grid">
              {vodVisible.slice(0, 400).map((v) => (
                <button className="pa-card" key={v.stream_id} onClick={() => openVod(active, v)} title={v.name}>
                  {v.stream_icon ? (
                    <img className="poster" src={imgSrc(v.stream_icon)} alt={v.name} loading="lazy" onError={(e) => ((e.target as HTMLImageElement).outerHTML = '<div class="poster-ph">·</div>')} />
                  ) : (
                    <div className="poster-ph"><Icon name="play" size={26} /></div>
                  )}
                  <div className="meta">
                    <div className="title">{v.name}</div>
                  </div>
                </button>
              ))}
            </div>
            {!loading && !loadError && !vodVisible.length && (
              <p className="pa-empty">
                {catFilter === NOVEDADES ? "Tu proveedor no ha subido nada últimamente." : "Aquí no hay películas."}
              </p>
            )}
            {vodVisible.length > 400 && (
              <p style={{ textAlign: "center", color: "var(--text-faint)", padding: "0 0 20px" }}>
                Mostrando 400 de {vodVisible.length} — usa la búsqueda para afinar.
              </p>
            )}
          </div>
        )}

        {/* Catálogo de series */}
        {active && modoCatalogo && tab === "series" && !seriesDetail && (
          <div className="pa-cat-scroll">
            {loading && <Loading messages={MENSAJES_SERIES} />}
            {loadError && <div className="pa-empty"><div className="error-box">{loadError}</div></div>}
            <div className="pa-grid">
              {!loading && !loadError && !seriesVisible.length && (
              <p className="pa-empty">
                {catFilter === NOVEDADES ? "Tu proveedor no ha subido nada últimamente." : "Aquí no hay series."}
              </p>
            )}
            {seriesVisible.slice(0, 400).map((s) => (
                <button className="pa-card" key={s.series_id} onClick={() => openSeries(active, s)} title={s.name}>
                  {s.cover ? (
                    <img className="poster" src={imgSrc(s.cover)} alt={s.name} loading="lazy" onError={(e) => ((e.target as HTMLImageElement).outerHTML = '<div class="poster-ph">·</div>')} />
                  ) : (
                    <div className="poster-ph"><Icon name="tv" size={26} /></div>
                  )}
                  <div className="meta">
                    <div className="title">{s.name}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
    )}

    {/* Ficha en ventana: la carátula, la sinopsis y los episodios encima de
        lo que estabas viendo, sin cambiar de pantalla ni perder el sitio */}
    {/* Mientras se ve, la ficha se aparta; al volver sigue ahí, que es
        donde el usuario estaba */}
    {active && vodDetail && !viendo && (
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setVodDetail(null)}>
        <div className="ficha" role="dialog" aria-modal="true" aria-label={vodDetail.vod.name}>
          <button className="ficha-cerrar" onClick={() => setVodDetail(null)} aria-label="Cerrar">
            <Icon name="cerrar" size={18} />
          </button>
          <div className="ficha-cabeza">
            {imgSrc(vodDetail.info?.info?.movie_image || vodDetail.vod.stream_icon) && (
              <img src={imgSrc(vodDetail.info?.info?.movie_image || vodDetail.vod.stream_icon)} alt="" />
            )}
            <div className="ficha-datos">
              <h2>{vodDetail.vod.name}</h2>
              <FichaMeta
                genero={vodDetail.info?.info?.genre}
                fecha={vodDetail.info?.info?.releasedate || vodDetail.info?.info?.release_date}
                duracion={vodDetail.info?.info?.duration}
                nota={vodDetail.info?.info?.rating || vodDetail.vod.rating}
              />
              {vodDetail.info === null ? (
                <p className="ficha-cargando">Cargando la ficha…</p>
              ) : (
                <>
                  {(vodDetail.info.info?.plot || vodDetail.info.info?.description) && (
                    <p className="ficha-plot">{vodDetail.info.info?.plot || vodDetail.info.info?.description}</p>
                  )}
                  <FichaCredito etiqueta="Reparto" valor={vodDetail.info.info?.cast || vodDetail.info.info?.actors} />
                  <FichaCredito etiqueta="Dirección" valor={vodDetail.info.info?.director} />
                </>
              )}
              <button
                className="btn btn-primary"
                style={{ marginTop: 18 }}
                onClick={() => playVod(active, {
                  ...vodDetail.vod,
                  container_extension: vodDetail.info?.movie_data?.container_extension || vodDetail.vod.container_extension,
                })}
              >
                <Icon name="play" size={16} /> Reproducir
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {active && seriesDetail && !viendo && (
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setSeriesDetail(null)}>
        <div className="ficha" role="dialog" aria-modal="true" aria-label={seriesDetail.series.name}>
          <button className="ficha-cerrar" onClick={() => setSeriesDetail(null)} aria-label="Cerrar">
            <Icon name="cerrar" size={18} />
          </button>
          <div className="ficha-cabeza">
            {imgSrc(seriesDetail.info.info?.cover || seriesDetail.series.cover) && (
              <img src={imgSrc(seriesDetail.info.info?.cover || seriesDetail.series.cover)} alt="" />
            )}
            <div className="ficha-datos">
              <h2>{seriesDetail.series.name}</h2>
              <FichaMeta
                genero={seriesDetail.info.info?.genre}
                fecha={seriesDetail.info.info?.releaseDate || seriesDetail.info.info?.release_date}
                duracion={seriesDetail.info.info?.episode_run_time ? `${seriesDetail.info.info.episode_run_time} min/ep` : undefined}
                nota={seriesDetail.info.info?.rating || seriesDetail.series.rating}
              />
              <p className="ficha-plot">{seriesDetail.info.info?.plot || seriesDetail.series.plot || ""}</p>
              <FichaCredito etiqueta="Reparto" valor={seriesDetail.info.info?.cast} />
              <FichaCredito etiqueta="Dirección" valor={seriesDetail.info.info?.director} />
            </div>
          </div>

          <div className="ficha-temporadas">
            {Object.keys(seriesDetail.info.episodes || {}).map((season) => (
              <button
                key={season}
                className={`ficha-temporada ${seriesDetail.season === season ? "activa" : ""}`}
                onClick={() => setSeriesDetail({ ...seriesDetail, season })}
              >
                Temporada {season}
              </button>
            ))}
          </div>

          <div className="ficha-episodios">
            {(seriesDetail.info.episodes?.[seriesDetail.season] || []).map((ep) => (
              <button
                key={ep.id}
                className="pa-episode"
                onClick={() =>
                  playEpisode(active, seriesDetail.series, ep.id, ep.title || `Episodio ${ep.episode_num}`, ep.container_extension)
                }
              >
                <span className="ep-num">{ep.episode_num}</span>
                <span className="ep-t">{ep.title || `Episodio ${ep.episode_num}`}</span>
                <Icon name="play" size={15} />
              </button>
            ))}
          </div>
        </div>
      </div>
    )}

    <div className="pa-flotantes">
      {active && (
        <nav className="pa-bottomnav" aria-label="Secciones">
          <button
            className={`pa-bottomnav-item ${tab === "live" ? "active" : ""}`}
            onClick={() => { irAPestana("live"); setSeccionGate("hecho"); }}
          >
            <Icon name="tv" size={21} />
            <span>{isXtream ? "Directo" : "Canales"}</span>
          </button>
          {isXtream && (
            <>
              {/* La parrilla también abajo: en el móvil esta barra es la
                  única forma de cambiar de sección */}
              <button
                className={`pa-bottomnav-item ${tab === "guia" ? "active" : ""}`}
                onClick={() => { irAPestana("guia"); setSeccionGate("hecho"); }}
              >
                <Icon name="clock" size={21} />
                <span>Guía</span>
              </button>
              <button
                className={`pa-bottomnav-item ${tab === "vod" ? "active" : ""}`}
                onClick={() => { irAPestana("vod"); setSeccionGate("hecho"); }}
              >
                <Icon name="film" size={21} />
                <span>Cine</span>
              </button>
              <button
                className={`pa-bottomnav-item ${tab === "series" ? "active" : ""}`}
                onClick={() => { irAPestana("series"); setSeccionGate("hecho"); }}
              >
                <Icon name="series" size={21} />
                <span>Series</span>
              </button>
            </>
          )}
          <button
            className={`pa-bottomnav-item ${tab === "favs" ? "active" : ""}`}
            onClick={() => { irAPestana("favs"); setSeccionGate("hecho"); }}
          >
            <Icon name="star" size={21} />
            <span>Favoritos</span>
          </button>
        </nav>
      )}

      {showAdd && <AddPlaylistModal loggedIn={!!user} onAdd={handleAddPlaylist} onClose={() => setShowAdd(false)} />}
    </div>
    </>
  );
}

/** Chips de metadatos de la ficha (género, año, duración, nota). */
function FichaMeta({ genero, fecha, duracion, nota }: { genero?: string; fecha?: string; duracion?: string; nota?: string }) {
  const año = (fecha || "").slice(0, 4);
  const notaNum = parseFloat(nota || "");
  const chips = [
    genero,
    año && año !== "0000" ? año : "",
    duracion,
    Number.isFinite(notaNum) && notaNum > 0 ? `★ ${notaNum.toFixed(1)}` : "",
  ].filter(Boolean);
  if (!chips.length) return null;
  return (
    <div className="ficha-meta">
      {chips.map((c) => (
        <span className="ficha-chip" key={c}>{c}</span>
      ))}
    </div>
  );
}

/** Línea de créditos (Reparto: …, Dirección: …). No pinta nada si no hay dato. */
function FichaCredito({ etiqueta, valor }: { etiqueta: string; valor?: string }) {
  if (!valor?.trim()) return null;
  return (
    <p className="ficha-credito">
      <span>{etiqueta}</span> {valor}
    </p>
  );
}
