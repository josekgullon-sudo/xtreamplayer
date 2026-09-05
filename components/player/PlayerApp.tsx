"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Icon, { IconName } from "@/components/Icon";
import {
  type Descarga,
  comoVa,
  encargarDescarga,
  falloDelEnvoltorio,
  leerDescargas,
  quitarDescarga,
  sePuedeDescargar,
  tamanoLegible,
} from "@/components/tv/descargas";
import VideoPlayer, { PlaySource } from "./VideoPlayer";
import AddPlaylistModal from "./AddPlaylistModal";
import ProfileGate from "./ProfileGate";
import SectionGate from "./SectionGate";
import ListaVirtual from "./ListaVirtual";
import RejillaInfinita from "./RejillaInfinita";
import { useAtras } from "./useAtras";
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
import { indiceEnAntena, type Emision } from "@/lib/epg";
import PortadaCatalogo from "./PortadaCatalogo";
import { Titulo, anioDe, type Actor, type MetaTitulo } from "@/lib/portada";
import { duracionDe, minutosDe, tituloDeEpisodio } from "@/lib/episodios";
import { iconoDeCategoria } from "@/lib/categorias";
import { enCristiano } from "@/lib/errores";
import {
  Fuente,
  pedirEnlace,
  type Enlace,
  momentoDeArchivo,
  valeDe,
  XtreamCategory,
  XtreamLiveStream,
  XtreamVodStream,
  XtreamSeries,
  XtreamSeriesInfo,
  XtreamVodInfo,
  xtreamApi,
  decodeBase64Maybe,
} from "@/lib/xtream";

type Tab = "live" | "guia" | "vod" | "series" | "favs" | "bajadas";

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
const K_VISTA_CANALES = "xp.vistaCanales.v1";

/**
 * De dónde sale esta lista, en el lenguaje que entiende el servidor.
 *
 * Si está guardada —la de un cliente de proveedor, o una de las de la nube—
 * va su número y nada más: el servidor sabe a qué servidor apunta y no lo
 * cuenta. Si es una que el usuario se ha pegado aquí y vive solo en este
 * navegador, van sus datos, porque no están en ningún otro sitio y además
 * son suyos.
 */
function credsOf(p: StoredPlaylist): Fuente {
  if (p.managed || p.remote) return { lista: idDeLista(p) };
  return { base: p.url, username: p.username || "", password: p.password || "" };
}

/** El número con el que el servidor conoce la lista. */
function idDeLista(p: StoredPlaylist): string {
  return p.id.startsWith("cloud-") ? p.id.slice(6) : p.id;
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

/*
 * El nombre del canal, o algo que se pueda leer.
 *
 * Hay paneles que mandan canales con `name: null`. Al entrar se saneaba a
 * cadena vacía —para que el resto del código pueda fiarse de que es texto— y
 * en la lista quedaba un renglón en blanco: un canal que funciona, que se
 * pone al pulsarlo, y que no se distingue de un fallo de dibujado. Con su
 * número al lado, decir que no tiene nombre basta para saber cuál es.
 *
 * Fuera del componente a propósito: lo usan varios `useMemo`, y el primero
 * de ellos se ejecuta antes de que una constante declarada dentro llegue a
 * existir —lo que deja la pantalla en blanco y sin una sola pista de por qué—.
 */
function rotulo(n?: string): string {
  return (n || "").trim() || "Canal sin nombre";
}

/**
 * @param enUnaApp Dentro de uno de nuestros envoltorios —el APK del móvil—
 *   y no en el navegador. Quita lo que solo tiene sentido en la web.
 */
export default function PlayerApp({ enUnaApp = false }: { enUnaApp?: boolean }) {
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
  /** El panel de listas, colgado del carril; cerrado salvo que se pida */
  const [verListas, setVerListas] = useState(false);

  const [tab, setTab] = useState<Tab>("live");
  /*
   * Descargas, donde el envoltorio sepa hacerlas.
   *
   * En el navegador esto no existe —lo que hay ahí es almacenamiento del
   * sitio, que se borra solo cuando hace falta espacio— y por eso no se
   * enseña nada: ni pestaña, ni botón. En el APK de Android sí, y es la
   * misma pantalla. Ver components/tv/descargas.ts.
   *
   * Se pregunta en un efecto y no al pintar porque la respuesta la da
   * `window`, que en el servidor no existe.
   */
  const [conDescargas, setConDescargas] = useState(false);
  const [descargas, setDescargas] = useState<Descarga[]>([]);
  /** El identificador de lo que se está resolviendo, mientras se resuelve */
  const [preparando, setPreparando] = useState("");
  useEffect(() => {
    setConDescargas(sePuedeDescargar());
    setDescargas(leerDescargas());
  }, []);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [xtreamData, setXtreamData] = useState<Record<string, Partial<XtreamData>>>({});
  const [m3uData, setM3uData] = useState<Record<string, M3UChannel[]>>({});
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [catFilter, setCatFilter] = useState<string>("all");
  /*
   * «Ver todo el catálogo»: en qué sección se ha pedido la rejilla entera.
   *
   * Hace falta guardarlo aparte porque la portada se decide por «no hay
   * filtro y no hay búsqueda», y ese botón no cambia ninguna de las dos
   * cosas. Y se guarda **la sección**, no un sí/no: con un sí/no había que
   * apagarlo en un efecto al cambiar de pestaña, los efectos corren después
   * de pintar, y en ese hueco se veía un parpadeo de la rejilla vieja antes
   * de la portada nueva.
   */
  const [verRejilla, setVerRejilla] = useState<string>("");
  /** Carpetas de canales abiertas en el móvil (cerradas por defecto) */
  const [carpetasAbiertas, setCarpetasAbiertas] = useState<Record<string, boolean>>({});

  const [current, setCurrent] = useState<NowPlaying | null>(null);
  const [epg, setEpg] = useState<{ now?: string; next?: string } | null>(null);
  /**
   * Qué echan ahora en cada canal, por lista y número de canal.
   *
   * Es el dato que decide qué se pone y hasta ahora solo se pintaba DESPUÉS
   * de entrar: había que probar canales para saber qué había en cada uno.
   * Cadena vacía significa «preguntado y no hay guía», que no es lo mismo
   * que «todavía sin preguntar» —eso es no tener la clave— y por eso se
   * guarda en vez de dejarlo sin poner.
   */
  const [epgAhora, setEpgAhora] = useState<Record<string, string>>({});
  /** Los que ya se han pedido, para no volver a pedirlos al desplazar */
  const epgPedidos = useRef<Set<string>>(new Set());
  /** Qué trozo de la lista de canales se está viendo, que nos lo dice ella */
  const [rangoCanales, setRangoCanales] = useState<[number, number]>([0, 0]);
  /**
   * Los canales, en lista o en rejilla.
   *
   * La lista da el nombre y qué echan; la rejilla da el logotipo grande, que
   * es como se reconoce un canal de un vistazo cuando no te sabes el nombre
   * exacto. Ninguna de las dos sobra, y cuál prefiere cada uno no lo sabemos:
   * se elige y se recuerda.
   */
  const [vistaCanales, setVistaCanales] = useState<"lista" | "rejilla">("lista");
  /**
   * El canal por el que va el ratón, para enseñarlo en grande al lado.
   *
   * Sin nada puesto, dos tercios de la pantalla del directo eran un cuadro
   * gris con «Elige un canal y empieza a verlo aquí»: el sitio más grande
   * que hay, ocupado por una instrucción. Ahí va ahora el canal que se está
   * mirando —su logotipo, su nombre y qué echan— y el botón de verlo. Es la
   * misma idea que en la tele, donde ese sitio lo llena el canal que tiene
   * el foco; aquí el foco es el ratón.
   */
  const [canalMirado, setCanalMirado] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Record<string, true>>({});
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [seriesDetail, setSeriesDetail] = useState<{ series: XtreamSeries; info: XtreamSeriesInfo; season: string } | null>(null);
  const [vodDetail, setVodDetail] = useState<{ vod: XtreamVodStream; info: XtreamVodInfo | null } | null>(null);
  /**
   * El reparto con cara y nombre, del título que esté abierto.
   *
   * El panel manda una lista de nombres separados por comas y nada más. Las
   * caras las sabe TMDB, y se piden al abrir la ficha —una petición, y la
   * respuesta se guarda en el servidor para todos—: en una fila de
   * carátulas el reparto no se ve, así que pedirlo para los ciento
   * cincuenta títulos de una portada sería pagar por lo que nadie mira.
   */
  const [reparto, setReparto] = useState<Actor[]>([]);
  /**
   * Y el fondo apaisado del título abierto, que el panel no manda.
   *
   * Un panel Xtream manda una carátula vertical y ya está. La ficha se abría
   * como una hoja de datos: un rectángulo gris a la izquierda cuando esa
   * carátula tampoco llegaba, y el resto texto. La portada lleva desde el
   * principio pidiéndole a TMDB el fondo apaisado para el banner de arriba;
   * la ficha, que es donde se decide si se pone o no, no lo usaba.
   *
   * Se pide en la misma tanda que el reparto y sale de la misma fila
   * guardada, así que no cuesta una petición a TMDB más.
   */
  const [arte, setArte] = useState<MetaTitulo | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  const active = playlists.find((p) => p.id === activeId) || null;
  const data = active ? xtreamData[active.id] : undefined;

  /* ---------- Carga inicial: auth, listas locales y en la nube ---------- */

  useEffect(() => {
    setFavorites(getFavorites());
    setRecents(getRecents());
    const locals = getLocalPlaylists();
    setPlaylists(locals);
    if (localStorage.getItem(K_VISTA_CANALES) === "rejilla") setVistaCanales("rejilla");
    const last = localStorage.getItem(K_LAST_PLAYLIST);
    if (last && locals.some((p) => p.id === last)) setActiveId(last);
    else if (locals.length) setActiveId(locals[0].id);

    /*
     * Quién es el cliente, para su marca.
     *
     * Si llega hasta aquí es que está dentro de una aplicación: la página
     * de servidor ya ha decidido que un cliente de proveedor en un navegador
     * de a pie no reproduce (ver `lib/envoltorio.ts`). Lo que se pide es su
     * nombre y el de su proveedor, que es lo que se enseña en la pantalla de
     * elegir sección — hasta ahora ponía «TOTALplayer» a todo el mundo
     * porque este estado no se rellenaba nunca.
     */
    fetch("/api/customer/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.customer) return;
        setCustomer({ username: d.customer.username, brand: d.brand || "" });
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
  /*
   * Abrir la conexión antes de que haga falta ahorra el saludo TLS al primer
   * canal. Solo se puede con las listas propias: de la de un cliente de
   * proveedor no se sabe el origen aquí, que es justamente el objetivo.
   */
  useEffect(() => {
    if (!active || !active.url) return;
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
          /* Igual que el catálogo: por su número si está guardada, y con sus
             datos solo si es una que vive en este navegador */
          const f = credsOf(p);
          const q = new URLSearchParams();
          if (f.lista) q.set("lista", f.lista);
          if (f.base) q.set("url", f.base);
          const res = await fetch(`/api/m3u?${q.toString()}`);
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || "No se pudo cargar la lista");
          }
          const text = await res.text();
          const parsed = parseM3U(text);
          setM3uData((prev) => ({ ...prev, [p.id]: parsed.channels }));
        } catch (e) {
          setLoadError(enCristiano(e, "Error al cargar la lista"));
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
        setLoadError(enCristiano(e, "Error al conectar con el servidor"));
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

  /** La lupa del carril y la del móvil hacen lo mismo: abrir y poner el cursor */
  function abrirBusqueda() {
    setBuscando(true);
    setVerListas(false);
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  function cerrarBusqueda() {
    setSearch("");
    setBuscando(false);
  }

  /**
   * Volver a pedirle el catálogo al proveedor.
   *
   * Lo que se ve está guardado desde que se entró: si el proveedor añade un
   * canal o sube una película, aquí no aparece hasta recargar la página
   * entera. Vaciar lo guardado de esta lista basta —el efecto que carga la
   * pestaña vuelve a dispararse solo al ver que ya no está—, y así se
   * refresca sin perder ni el perfil ni lo que se estuviera viendo.
   */
  function recargar() {
    if (!active) return;
    setVerListas(false);
    setLoadError(null);
    setXtreamData((prev) => ({ ...prev, [active.id]: {} }));
    setM3uData((prev) => {
      const siguiente = { ...prev };
      delete siguiente[active.id];
      return siguiente;
    });
    setGuiaEpg({});
    setEpgAhora({});
    epgPedidos.current = new Set();
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

  /*
   * Y al abrir una ficha, sus caras.
   *
   * Se vacía primero: sin eso, al abrir la segunda película se quedaría un
   * instante el reparto de la primera, que es peor que no tener ninguno.
   */
  useEffect(() => {
    /* El año, exactamente igual que en `titulosPortada`: la llave del caché
       lo lleva dentro —«Alien (1979)» y «Alien (2017)» no son la misma
       película— y si aquí se calculara de otra manera se preguntaría por un
       título que no está guardado y no habría reparto nunca */
    const abierto = vodDetail
      ? {
          nombre: vodDetail.vod.name,
          anio: anioDe(vodDetail.vod.year ?? vodDetail.vod.releasedate),
          serie: false,
        }
      : seriesDetail
        ? {
            nombre: seriesDetail.series.name,
            anio: anioDe(seriesDetail.series.releaseDate ?? seriesDetail.series.release_date),
            serie: true,
          }
        : null;
    setReparto([]);
    setArte(null);
    if (!abierto) return;
    let vivo = true;
    fetch("/api/reparto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(abierto),
    })
      .then((r) => r.json())
      .then((d) => {
        if (vivo && Array.isArray(d?.reparto)) setReparto(d.reparto);
      })
      /* Sin reparto de TMDB, la ficha enseña los nombres del panel. No es un
         error que deba llegar a ninguna pantalla */
      .catch(() => {});
    fetch("/api/meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulos: [abierto] }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (vivo && Array.isArray(d?.meta) && d.meta[0]) setArte(d.meta[0] as MetaTitulo);
      })
      /* Sin fondo, la ficha se queda con la carátula del panel, que es lo
         que hacía hasta ahora */
      .catch(() => {});
    return () => {
      vivo = false;
    };
    /*
     * Por el identificador del título, no por el objeto entero.
     *
     * La ficha se completa sola: se abre con lo que trae el catálogo y
     * `get_vod_info` llega después, y eso cambia el objeto. Con el objeto en
     * la lista, cada retoque vaciaba el reparto y lo volvía a pedir — la
     * fila de caras desaparecía un instante y volvía, que es exactamente lo
     * que hacía fallar la prueba una vez de cada tantas.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vodDetail?.vod?.stream_id, seriesDetail?.series?.series_id]);

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

  /*
   * Lo guardado del catálogo, en Favoritos.
   *
   * Favoritos pedía solo los canales, así que una película guardada no
   * tenía dónde salir. Ahora se piden también cine y series, pero SOLO si
   * hay algo suyo en la lista: en un proveedor grande son treinta mil
   * títulos, y traerlos para enseñar un hueco vacío es la peor manera de
   * abrir una pantalla.
   */
  const hayGuardadoDelCatalogo = useMemo(
    () => Object.keys(favorites).some((k) => k.includes(":vod:") || k.includes(":serie:")),
    [favorites]
  );

  useEffect(() => {
    if (!active || tab !== "favs" || active.type !== "xtream" || !hayGuardadoDelCatalogo) return;
    loadTab(active, "vod");
    loadTab(active, "series");
  }, [active, tab, hayGuardadoDelCatalogo, loadTab]);

  /** Las películas y las series de la lista, resueltas contra el catálogo. */
  const miListaCatalogo = useMemo(() => {
    if (!active || active.type !== "xtream") return [];
    const datos = xtreamData[active.id] || {};
    const pelis = (datos.vodStreams || [])
      .filter((v) => favorites[`${active.id}:vod:${v.stream_id}`])
      .map((v) => ({
        llave: `${active.id}:vod:${v.stream_id}`,
        nombre: v.name,
        cartel: v.stream_icon || "",
        abrir: () => openVod(active, v),
      }));
    const series = (datos.seriesList || [])
      .filter((s) => favorites[`${active.id}:serie:${s.series_id}`])
      .map((s) => ({
        llave: `${active.id}:serie:${s.series_id}`,
        nombre: s.name,
        cartel: s.cover || "",
        abrir: () => openSeries(active, s),
      }));
    return [...pelis, ...series];
  }, [active, xtreamData, favorites]);

  /* ---------- EPG del canal en reproducción ---------- */

  useEffect(() => {
    setEpg(null);
    if (!current || current.kind !== "live" || !current.streamId) return;
    const p = playlists.find((x) => x.id === current.playlistId);
    if (!p || p.type !== "xtream") return;
    let cancelled = false;
    /* Tres y no dos: si el panel empieza la tira en el bloque anterior —que
       muchos lo hacen— con dos solo caben «lo que ya terminó» y «lo de
       ahora», y no queda ninguno para el «después» */
    xtreamApi<{ epg_listings?: Emision[] }>(
      credsOf(p),
      "get_short_epg",
      { stream_id: String(current.streamId), limit: "3" }
    )
      .then((res) => {
        if (cancelled) return;
        const listings = res.epg_listings || [];
        const i = indiceEnAntena(listings);
        setEpg({
          now: decodeBase64Maybe(listings[i]?.title),
          next: decodeBase64Maybe(listings[i + 1]?.title),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [current, playlists]);

  /* ---------- «Qué echan ahora» en la lista de canales ---------- */

  /*
   * El mismo dato que ya se pedía para el canal que suena —`get_short_epg`—,
   * pero para los canales que se están viendo en la lista. Es lo que hace
   * que se elija canal sin entrar a probar: hasta ahora la lista era una
   * columna de nombres, y saber qué echaban costaba un clic por canal.
   *
   * Solo de los que están a la vista. Una lista de proveedor trae ocho mil
   * canales y esto son ocho mil peticiones; la lista virtual dice cuáles son
   * las treinta que se ven y se piden esas, de seis en seis, según se baja.
   */
  const verRangoCanales = useCallback((desde: number, hasta: number) => {
    setRangoCanales((v) => (v[0] === desde && v[1] === hasta ? v : [desde, hasta]));
  }, []);

  useEffect(() => {
    setEpgAhora({});
    epgPedidos.current = new Set();
  }, [activeId]);

  useEffect(() => {
    setCanalMirado(null);
  }, [activeId, tab, grupoSel]);

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

  /*
   * Los enlaces ya resueltos, para no volver a pedirlos.
   *
   * Poner un canal son tres viajes seguidos: pedirle al servidor la dirección
   * —eso es este—, bajar el manifiesto y bajar el primer trozo. El primero no
   * depende del proveedor, solo de nosotros, y su respuesta vale doce horas
   * (lo que dura el vale). O sea que es puro tiempo de espera que se puede
   * quitar del camino: pidiéndolo antes de que haga falta, y no volviéndolo a
   * pedir para un canal que ya se ha puesto en esta sesión.
   *
   * En un mando esto es la diferencia entre zapear y esperar.
   */
  const enlacesLive = useRef<Map<string, Promise<Enlace>>>(new Map());

  const enlaceLive = useCallback((p: StoredPlaylist, streamId: number | string) => {
    const llave = `${p.id}:${streamId}`;
    let ya = enlacesLive.current.get(llave);
    if (!ya) {
      ya = pedirEnlace({ ...credsOf(p), clase: "live", id: String(streamId) });
      /* Un fallo no se guarda: si el servidor contestó mal una vez, el
         siguiente intento tiene que volver a preguntarle y no heredar el
         error para toda la sesión */
      ya.catch(() => enlacesLive.current.delete(llave));
      enlacesLive.current.set(llave, ya);
    }
    return ya;
  }, []);

  /** Se llama al pasar por encima o al enfocar: para cuando se pulse, ya está. */
  const precargarLive = useCallback(
    (p: StoredPlaylist, streamId: number | string) => {
      enlaceLive(p, streamId).catch(() => {});
    },
    [enlaceLive]
  );

  const playLive = useCallback(
    async (p: StoredPlaylist, ch: XtreamLiveStream) => {
      const favKey = `${p.id}:live:${ch.stream_id}`;
      setViendo(true);
      /*
       * El canal se pone en pantalla ya, y la dirección llega después.
       *
       * La resuelve el servidor —aquí solo se sabe el número de canal, que es
       * todo lo que hace falta saber—, y eso es un viaje de ida y vuelta.
       * Esperar a que vuelva para pintar el nombre y pedir la guía retrasaba
       * medio segundo cosas que no tienen nada que ver con el vídeo.
       */
      const encabezado = {
        logo: ch.stream_icon,
        playlistId: p.id,
        kind: "live" as const,
        streamId: ch.stream_id,
        favKey,
      };
      setCurrent({ source: { url: "", name: ch.name, kind: "hls", recordar: p.id }, ...encabezado });
      /*
       * Y si pedir la dirección falla, se dice.
       *
       * Sin esto la excepción se perdía aquí mismo: el `setCurrent` de
       * debajo no llegaba a ejecutarse nunca, el reproductor se quedaba con
       * la dirección vacía que se le puso arriba y la pantalla giraba para
       * siempre en «Conectando con…». Ni vídeo, ni error, ni forma de saber
       * qué pasaba — y el motivo casi siempre es de los que se arreglan
       * solos volviendo a entrar, porque es la sesión caducada.
       */
      let enlace;
      try {
        enlace = await enlaceLive(p, ch.stream_id);
      } catch (e) {
        setCurrent({
          source: { url: "", name: ch.name, kind: "hls", fallo: enCristiano(e, "No hemos podido abrir este canal") },
          ...encabezado,
        });
        return;
      }
      setCurrent({ source: { ...enlace, name: ch.name, kind: "hls", recordar: p.id }, ...encabezado });
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
    [enlaceLive]
  );

  /**
   * Catch Up: volver a poner un programa que ya se emitió. El panel guarda
   * los últimos días de cada canal que lo tenga activado, y hasta ahora esa
   * grabación no había forma de pedirla desde aquí.
   */
  const playArchivo = useCallback(
    async (p: StoredPlaylist, streamId: number, logo: string | undefined, titulo: string, ini: number, fin: number) => {
      const minutos = Math.max(1, Math.round((fin - ini) / 60000));
      setViendo(true);
      /* Mismo cuidado que en `playLive`: una grabación que no se puede pedir
         tiene que decirlo, no dejar la rueda girando */
      let enlace;
      try {
        enlace = await pedirEnlace({
          ...credsOf(p),
          clase: "timeshift",
          id: String(streamId),
          inicio: momentoDeArchivo(new Date(ini)),
          minutos,
        });
      } catch (e) {
        setCurrent({
          source: { url: "", name: titulo, kind: "hls", fallo: enCristiano(e, "No hemos podido abrir esta grabación") },
          logo, playlistId: p.id, kind: "live", streamId, favKey: "",
        });
        return;
      }
      setCurrent({
        source: { ...enlace, name: titulo, kind: "hls" },
        logo,
        playlistId: p.id,
        kind: "live",
        streamId,
        favKey: "",
      });
    },
    []
  );

  const playM3u = useCallback(async (p: StoredPlaylist, ch: M3UChannel) => {
    const favKey = `${p.id}:m3u:${ch.url}`;
    setViendo(true);
    /* La dirección viene escrita en la lista, pero el proxy no acepta
       direcciones sueltas: sin vale no habría camino de reserva cuando el
       servidor del canal no deja entrar al navegador */
    const vale = ch.url.startsWith("/api/") ? undefined : await valeDe(ch.url);
    setCurrent({
      source: { url: ch.url, vale, name: ch.name, kind: "auto" },
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

  async function playVod(p: StoredPlaylist, item: XtreamVodStream) {
    const ext = item.container_extension || "mp4";
    setViendo(true);
    const enlace = await pedirEnlace({ ...credsOf(p), clase: "movie", id: String(item.stream_id), ext });
    setCurrent({
      source: { ...enlace, name: item.name, kind: "video" },
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
      setLoadError(enCristiano(e, "No se pudo cargar la serie"));
    } finally {
      setLoading(false);
    }
  }

  async function playEpisode(p: StoredPlaylist, s: XtreamSeries, epId: string, title: string, ext?: string) {
    setViendo(true);
    const enlace = await pedirEnlace({ ...credsOf(p), clase: "series", id: epId, ext: ext || "mp4" });
    setCurrent({
      source: { ...enlace, name: `${s.name} — ${title}`, kind: "video" },
      logo: s.cover,
      playlistId: p.id,
      kind: "episode",
    });
  }

  function onToggleFav(key: string) {
    setFavorites(toggleFavorite(key));
  }

  async function playRecent(item: RecentItem) {
    const p = playlists.find((x) => x.id === item.playlistId);
    if (!p) return;
    if (item.kind === "live") {
      playLive(p, item.payload as unknown as XtreamLiveStream);
    } else if (item.kind === "m3u") {
      playM3u(p, item.payload as unknown as M3UChannel);
    } else if (item.kind === "vod") {
      const pl = item.payload as { stream_id: number; name: string; ext?: string };
      const enlace = await pedirEnlace({ ...credsOf(p), clase: "movie", id: String(pl.stream_id), ext: pl.ext || "mp4" });
      setCurrent({
        source: { ...enlace, name: pl.name, kind: "video" },
        logo: item.logo,
        playlistId: p.id,
        kind: "vod",
      });
    }
  }

  /* ---------- Listas visibles (búsqueda + categorías + favoritos) ---------- */

  /*
   * Lo que se escribe y lo que se filtra son dos cosas.
   *
   * Filtrar rehace la lista entera —con una de proveedor son 8.000 canales y
   * sus 8.000 funciones de reproducir—, y eso se hacía en cada tecla. En este
   * ordenador se nota poco; en un aparato de televisión, medido, escribir
   * nueve letras dejaba el hilo principal bloqueado 1,8 segundos en diez
   * tirones, el peor de casi medio segundo. Con el mando, que es como se
   * escribe en una tele, eso es una aplicación colgada.
   *
   * El campo sigue respondiendo a cada tecla; lo que espera a que pares es
   * la lista. Un octavo de segundo no se percibe al escribir y convierte una
   * ráfaga de nueve reconstrucciones en una.
   */
  const q = useBusquedaCalmada(search);

  /*
   * Las carpetas con todos sus canales, sin filtrar por nada.
   *
   * Construir esto cuesta: con una lista de proveedor son 8.000 objetos, y
   * cada uno lleva su propia función de reproducir. Antes se rehacía también
   * al escribir en el buscador, y eso —medido en un aparato de televisión—
   * es lo que dejaba el hilo principal bloqueado casi medio segundo por
   * tecla. Se hace una vez por lista; buscar solo criba lo ya construido.
   */
  const gruposCompletos = useMemo(() => {
    type Canal = {
      id: string; name: string; logo?: string; favKey: string; archivo: boolean;
      play: () => void;
      /** Adelanta el trabajo que no depende del proveedor. Ver `enlaceLive`. */
      precargar?: () => void;
      /** La carpeta de la que sale, para decirlo en «Todos los canales» */
      grupo: string;
      /** El nombre ya en minúsculas: buscar no puede rebajar 8.000 cadenas en cada tecla */
      busca: string;
    };
    if (!active) return [] as { name: string; channels: Canal[] }[];

    if (active.type === "m3u") {
      const channels = m3uData[active.id] || [];
      const byGroup = new Map<string, M3UChannel[]>();
      for (const ch of channels) {
        const g = ch.group || "Sin categoría";
        if (!byGroup.has(g)) byGroup.set(g, []);
        byGroup.get(g)!.push(ch);
      }
      return Array.from(byGroup.entries()).map(([name, chs]) => ({
        name,
        channels: chs.map((ch) => ({
          id: ch.id,
          name: rotulo(ch.name),
          logo: ch.logo,
          favKey: `${active.id}:m3u:${ch.url}`,
          archivo: false,
          play: () => playM3u(active, ch),
          grupo: name,
          busca: (ch.name || "").toLowerCase(),
        })),
      }));
    }

    const cache = xtreamData[active.id];
    if (!cache?.liveStreams) return [] as { name: string; channels: Canal[] }[];
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
      const g = catName.get(ch.category_id || "") || "Otros";
      if (!byCat.has(g)) byCat.set(g, []);
      byCat.get(g)!.push(ch);
    }
    for (const [nombre, chs] of byCat) if (!chs.length) byCat.delete(nombre);
    return Array.from(byCat.entries()).map(([name, chs]) => ({
      name,
      channels: chs.map((ch) => ({
        id: String(ch.stream_id),
        name: rotulo(ch.name),
        logo: ch.stream_icon,
        favKey: `${active.id}:live:${ch.stream_id}`,
        archivo: Number(ch.tv_archive) > 0,
        play: () => playLive(active, ch),
        precargar: () => precargarLive(active, ch.stream_id),
        grupo: name,
        busca: (ch.name || "").toLowerCase(),
      })),
    }));
  }, [active, m3uData, xtreamData, playLive, playM3u]);

  /* Y aquí solo se criba: una comparación de cadenas por canal, sin crear
     ni un objeto de los que cuestan. Las carpetas que se quedan vacías por
     la búsqueda no se enseñan. */
  const liveGroups = useMemo(() => {
    let grupos = gruposCompletos;
    if (q) {
      const cribados = [];
      for (const g of grupos) {
        const chs = g.channels.filter((c) => c.busca.includes(q));
        if (chs.length) cribados.push({ name: g.name, channels: chs });
      }
      grupos = cribados;
    }
    if (tab === "favs") {
      return grupos
        .map((g) => ({ name: g.name, channels: g.channels.filter((c) => favorites[c.favKey]) }))
        .filter((g) => g.channels.length);
    }
    return grupos;
  }, [gruposCompletos, q, tab, favorites]);

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
        name: rotulo(ch.name),
        logo: ch.logo,
        favKey: `${active.id}:m3u:${ch.url}`,
        play: () => playM3u(active, ch),
      }));
    }
    return (xtreamData[active.id]?.liveStreams || []).map((ch) => ({
      id: String(ch.stream_id),
      name: rotulo(ch.name),
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

  /* Los canales en una sola lista, ya construidos. La búsqueda global miraba
     `canalesTodos`, que obliga a rebajar a minúsculas los 8.000 nombres en
     cada tecla; estos ya vienen con el nombre rebajado de fábrica. */
  const canalesPlanos = useMemo(() => gruposCompletos.flatMap((g) => g.channels), [gruposCompletos]);

  const resultados = useMemo(() => {
    if (!buscandoTodo) return { canales: [], pelis: [], series: [], total: 0 };
    const coincide = (n?: string) => (n || "").toLowerCase().includes(q);
    const canales = canalesPlanos.filter((c) => c.busca.includes(q));
    const pelis = (data?.vodStreams || []).filter((v) => coincide(v.name));
    const series = (data?.seriesList || []).filter((s) => coincide(s.name));
    return { canales, pelis, series, total: canales.length + pelis.length + series.length };
  }, [buscandoTodo, q, canalesPlanos, data]);

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
        abrirBusqueda();
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
  /*
   * Los destinos, escritos una sola vez.
   *
   * El carril de escritorio y la cápsula del móvil son el mismo menú puesto
   * de canto o tumbado: cuando estaban escritos dos veces, «Guía» se añadió
   * abajo y arriba no, y durante un mes en el escritorio no había forma de
   * llegar a la parrilla.
   */
  /* Mientras baje algo, se vuelve a preguntar: el envoltorio no avisa —son
     cuatro envoltorios distintos y cada uno tendría que saber cómo llamar a
     la web—, así que se le pregunta cada segundo y medio. Con nada bajando y
     sin mirar la pantalla de descargas, no se pregunta. */
  const bajandoAlgo = descargas.some((d) => d.estado === "bajando");
  const enBajadas = tab === "bajadas";
  useEffect(() => {
    if (!conDescargas) return;
    if (!bajandoAlgo && !enBajadas) return;
    const t = setInterval(() => setDescargas(leerDescargas()), 1500);
    return () => clearInterval(t);
  }, [conDescargas, bajandoAlgo, enBajadas]);
  useEffect(() => {
    if (enBajadas) setDescargas(leerDescargas());
  }, [enBajadas]);

  /**
   * La dirección con la que se guarda, que no es siempre la que se reproduce.
   *
   * Reproducir lo hace el navegador, con su sesión puesta; guardar lo hace un
   * proceso del aparato, que no la tiene. Ver `/api/tele/ver`.
   */
  const dondeGuardar = (e: { url: string; paraGuardar?: string }) => e.paraGuardar || e.url;

  /* Y justo después de encargar algo, se pregunta un rato pase lo que pase:
     el reloj de arriba solo corre si YA hay algo bajando, y saber si lo hay
     se pregunta con una `lista()` que devuelve la respuesta anterior —tiene
     que ser síncrona, ver `descargas.ts`—, que nada más encargar todavía
     está vacía. Sin esto, pulsar «Descargar» no hacía nada visible */
  const [reciénEncargado, setReciénEncargado] = useState(0);
  useEffect(() => {
    if (!reciénEncargado) return;
    const t = setInterval(() => {
      setDescargas(leerDescargas());
      /* Y de paso se le pregunta qué se le ha roto: si el encargo no llegó a
         empezar no habrá fila ninguna que mirar, y sin esto la pantalla se
         quedaba como si no hubieras pulsado */
      const roto = falloDelEnvoltorio();
      if (roto) {
        setLoadError(roto);
        setReciénEncargado(0);
      }
    }, 1000);
    const fin = setTimeout(() => setReciénEncargado(0), 15000);
    return () => { clearInterval(t); clearTimeout(fin); };
  }, [reciénEncargado]);

  /**
   * Guardar algo en el aparato: se resuelve la dirección y se le pasa al
   * envoltorio, que es quien tiene disco. El mismo botón pone y quita.
   */
  async function bajarloAqui(
    id: string,
    nombre: string,
    cartel: string,
    resolver: () => Promise<string>
  ) {
    if (descargas.some((d) => d.id === id)) {
      quitarDescarga(id);
      setDescargas(leerDescargas());
      return;
    }
    /* «Preparando…» en cuanto se pulsa: resolver la dirección contra el panel
       del proveedor tarda, y un botón que no hace nada se pulsa otra vez */
    setPreparando(id);
    try {
      const url = await resolver();
      if (!url) throw new Error("Tu proveedor no ha dado la dirección de este vídeo");
      const roto = encargarDescarga({ id, nombre, cartel, url });
      if (roto) throw new Error(roto);
      setDescargas(leerDescargas());
      setReciénEncargado(Date.now());
    } catch (e) {
      setLoadError(enCristiano(e, "No se ha podido empezar la descarga"));
    } finally {
      setPreparando("");
    }
  }

  const destinos: { id: Tab; icono: IconName; texto: string }[] = [
    { id: "live", icono: "tv", texto: isXtream ? "Directo" : "Canales" },
    ...(isXtream
      ? ([
          { id: "guia", icono: "clock", texto: "Guía" },
          { id: "vod", icono: "film", texto: "Cine" },
          { id: "series", icono: "series", texto: "Series" },
        ] as const)
      : []),
    { id: "favs", icono: "star", texto: "Favoritos" },
    /* Solo donde se puede guardar de verdad: en un navegador este acceso no
       existe, y no se dice «tu dispositivo no es compatible» */
    ...(conDescargas ? ([{ id: "bajadas", icono: "bajar", texto: "Descargas" }] as const) : []),
  ];
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
   * El catálogo de la sección, masticado para la portada.
   *
   * `Titulo` es un dato pelado a propósito —lo que `lib/portada.ts` necesita
   * para ordenar y comparar sin arrastrar media aplicación detrás—, así que
   * hay que poder volver del identificador al objeto del panel: eso es
   * `abrirDeLaPortada`.
   */
  const titulosPortada = useMemo<Titulo[]>(() => {
    if (!active || active.type !== "xtream") return [];
    if (tab === "vod") {
      return (data?.vodStreams || [])
        .filter((v) => (v.name || "").trim())
        .map((v) => ({
          id: `vod-${v.stream_id}`,
          nombre: v.name,
          imagen: v.stream_icon || "",
          anio: anioDe(v.year ?? v.releasedate),
          nota: String(v.rating ?? ""),
          alta: Math.floor(alta(v.added) / 1000),
          sinopsis: String(v.plot ?? ""),
          generos: String(v.genre ?? ""),
          esSerie: false,
          categoria: String(v.category_id ?? ""),
        }));
    }
    if (tab === "series") {
      return (data?.seriesList || [])
        .filter((s) => (s.name || "").trim())
        .map((s) => ({
          id: `serie-${s.series_id}`,
          nombre: s.name,
          imagen: s.cover || "",
          anio: anioDe(s.releaseDate ?? s.release_date),
          nota: String(s.rating ?? ""),
          alta: Math.floor(alta(s.last_modified) / 1000),
          sinopsis: String(s.plot ?? ""),
          generos: String(s.genre ?? ""),
          esSerie: true,
          categoria: String(s.category_id ?? ""),
        }));
    }
    return [];
  }, [active, data, tab]);

  const categoriasPortada = useMemo(
    () =>
      (tab === "vod" ? vodCats : seriesCats).map((c) => ({
        id: String(c.category_id),
        nombre: c.category_name || "Sin nombre",
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, data]
  );

  /** Del identificador de la portada al objeto del panel, para abrirlo. */
  function abrirDeLaPortada(id: string) {
    if (!active) return;
    const corte = id.indexOf("-");
    const clase = id.slice(0, corte);
    const numero = id.slice(corte + 1);
    if (clase === "vod") {
      const v = (data?.vodStreams || []).find((x) => String(x.stream_id) === numero);
      if (v) openVod(active, v);
      return;
    }
    const s = (data?.seriesList || []).find((x) => String(x.series_id) === numero);
    if (s) openSeries(active, s);
  }

  /*
   * Y cuándo se ve la portada: solo sin categoría elegida y sin búsqueda.
   *
   * En cuanto el cliente filtra por un género o escribe algo, lo que quiere
   * es la rejilla entera de eso, no un escaparate de diez.
   */
  const enPortada = catFilter === "all" && !q && verRejilla !== tab && titulosPortada.length > 0;

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

  /* «Atrás» cierra lo de encima, no la aplicación. De fuera adentro: la
     ficha está debajo del vídeo, porque al salir del vídeo se vuelve a la
     ficha de la que se salió — ver useAtras. */
  useAtras([
    { abierta: !!active && (!!vodDetail || !!seriesDetail), cerrar: () => { setVodDetail(null); setSeriesDetail(null); } },
    { abierta: !!active && viendo, cerrar: () => { setViendo(false); setCurrent(null); } },
    /* El buscador y el panel de listas flotan por encima de todo lo demás:
       son los primeros que tiene que cerrar «atrás», no la aplicación */
    { abierta: !!active && verListas, cerrar: () => setVerListas(false) },
    { abierta: !!active && buscando, cerrar: cerrarBusqueda },
  ]);

  const canalesVisibles: {
    id: string;
    name: string;
    logo?: string;
    favKey: string;
    archivo: boolean;
    play: () => void;
    /** Adelanta el trabajo que no depende del proveedor. Ver `enlaceLive`. */
    precargar?: () => void;
    /** De qué categoría es, para decirlo en «Todos los canales» */
    grupo?: string;
  }[] = useMemo(() => {
    const grupo = grupoSel ? liveGroups.find((g) => g.name === grupoSel) : null;
    if (grupo) return grupo.channels;
    /* En «Todos los canales», cada fila dice de qué categoría es: es el dato
       que falta justo ahí —mil canales seguidos sin contexto— y de paso la
       fila deja de ser una sola línea de texto suelta.

       Aquí estaban todos menos los que no cabían: un `.slice(0, 500)` dejaba
       fuera 7.500 canales de una lista normal de proveedor, sin decirlo. Ya
       no hay tope; lo que no se ve no se pinta (ListaVirtual). */
    /* Cada canal ya sabe de qué carpeta es desde que se construyó: copiarlos
       aquí para añadírselo eran otros 8.000 objetos por cada tecla */
    return liveGroups.flatMap((g) => g.channels);
  }, [liveGroups, grupoSel]);

  /*
   * Los canales que se están viendo ahora mismo, como una cadena.
   *
   * Y como cadena a propósito: la lista de canales se rehace entera cada vez
   * que llega algo por detrás —cine y series se precargan al entrar—, y con
   * la lista como dependencia el efecto de abajo se relanzaba cinco veces
   * seguidas, cancelando cada vez las guías a medio traer. Con los números
   * pegados con comas, «los mismos canales» es la misma cadena y el efecto
   * no se entera de nada.
   */
  const canalesALaVista = useMemo(() => {
    if (!active || active.type !== "xtream") return "";
    if (tab !== "live" && tab !== "favs") return "";
    /* Con tope: la rejilla pinta ciento veinte de golpe y eso son ciento
       veinte peticiones al proveedor por asomarse a una carpeta. Sesenta es
       lo que cabe en dos pantallas; el resto llega al seguir bajando */
    return canalesVisibles
      .slice(rangoCanales[0], Math.min(rangoCanales[1], rangoCanales[0] + 60))
      .map((c) => c.id)
      .join(",");
  }, [active, tab, canalesVisibles, rangoCanales]);

  /*
   * El canal del panel grande: el que se está mirando, y si no, el primero.
   *
   * Que haya uno por defecto es lo que hace que la pantalla no nazca vacía:
   * al entrar en el directo ya se ve un canal con su nombre y lo que echan,
   * antes de mover el ratón.
   */
  const canalEnGrande = useMemo(
    () => canalesVisibles.find((c) => c.favKey === canalMirado) || canalesVisibles[0] || null,
    [canalesVisibles, canalMirado]
  );

  /*
   * Y aquí se piden sus guías, de seis en seis: treinta peticiones a la vez
   * contra un panel modesto acaban en tiempos de espera.
   *
   * Sin cancelar nada. Una guía que llega tarde sigue siendo la guía de ese
   * canal, así que se guarda igual; lo que la ata a su lista es la clave,
   * que lleva delante cuál era. Cancelar era peor: los canales quedaban
   * marcados como pedidos y sin respuesta, y ya no se volvían a pedir nunca.
   */
  useEffect(() => {
    if (!canalesALaVista || !active) return;
    const lista = active.id;
    const faltan = canalesALaVista
      .split(",")
      .filter((id) => id && !epgPedidos.current.has(`${lista}:${id}`));
    if (!faltan.length) return;
    for (const id of faltan) epgPedidos.current.add(`${lista}:${id}`);

    const creds = credsOf(active);
    (async () => {
      for (let i = 0; i < faltan.length; i += 6) {
        const tanda = faltan.slice(i, i + 6);
        const hechas = await Promise.all(
          tanda.map(async (id) => {
            try {
              /* Dos, para poder descartar el que ya terminó: pidiendo uno
                 solo no hay forma de saber si el que llega es el de ahora o
                 el de la hora pasada, y se anunciaba lo segundo */
              const res = await xtreamApi<{ epg_listings?: Emision[] }>(
                creds,
                "get_short_epg",
                { stream_id: id, limit: "2" }
              );
              const listado = res.epg_listings || [];
              const enAntena = listado[indiceEnAntena(listado)];
              return [id, decodeBase64Maybe(enAntena?.title) || ""] as const;
            } catch {
              /* Un canal sin guía no puede dejar en blanco a los otros cinco */
              return [id, ""] as const;
            }
          })
        );
        setEpgAhora((prev) => {
          const siguiente = { ...prev };
          for (const [id, titulo] of hechas) siguiente[`${lista}:${id}`] = titulo;
          return siguiente;
        });
      }
    })();
  }, [canalesALaVista, active]);

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
          canales: flatChannels.slice(0, 14).map((c) => ({
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
    {/*
      El carril. En escritorio y en tele, la navegación entera vive en esta
      columna de iconos pegada a la izquierda: secciones arriba,
      herramientas abajo. Sustituye a la franja horizontal que había encima
      de las tres columnas del directo, que sumaba una cuarta barra apilada
      antes de llegar al primer canal.
    */}
    {active && (
      <nav className="pa-rail" aria-label="Secciones">
        {hayDondeElegir && (
          <button
            className="pa-rail-item"
            onClick={() => { setSeccionGate("mostrando"); setVerListas(false); }}
            title="Volver a elegir qué ver"
            aria-label="Elegir qué ver"
          >
            <span className="pa-rail-icono"><Icon name="casa" size={20} /></span>
            <span className="pa-rail-txt">Inicio</span>
          </button>
        )}
        {destinos.map((d) => (
          <button
            key={d.id}
            className={`pa-rail-item ${tab === d.id ? "activo" : ""}`}
            onClick={() => { irAPestana(d.id); setSeccionGate("hecho"); }}
            aria-current={tab === d.id ? "page" : undefined}
          >
            <span className="pa-rail-icono"><Icon name={d.icono} size={20} /></span>
            <span className="pa-rail-txt">{d.texto}</span>
          </button>
        ))}
        <div className="pa-rail-pie">
          <button className="pa-rail-item" onClick={abrirBusqueda} title="Buscar" aria-label="Buscar">
            <span className="pa-rail-icono"><Icon name="search" size={20} /></span>
            <span className="pa-rail-txt">Buscar</span>
          </button>
          {/* Recargar: el catálogo se guarda al entrar y lo que el proveedor
              suba después no aparece hasta pedirlo otra vez */}
          <button className="pa-rail-item" onClick={recargar} title="Volver a pedir el catálogo" aria-label="Recargar">
            <span className="pa-rail-icono"><Icon name="recargar" size={20} /></span>
            <span className="pa-rail-txt">Recargar</span>
          </button>
          <button
            className={`pa-rail-item ${verListas ? "activo" : ""}`}
            onClick={() => { setVerListas((v) => !v); setBuscando(false); }}
            title={active.name}
            aria-label="Listas"
          >
            <span className="pa-rail-icono"><Icon name="list" size={20} /></span>
            <span className="pa-rail-txt">Listas</span>
          </button>
        </div>
      </nav>
    )}

    {/* En el móvil no cabe el carril: las secciones se van a la cápsula de
        abajo y aquí arriba queda lo que no es navegar */}
    {active && (
      <div className="pa-tira">
        {hayDondeElegir && (
          <button
            className="pa-icon-btn"
            onClick={() => { setSeccionGate("mostrando"); setVerListas(false); }}
            title="Volver a elegir qué ver"
            aria-label="Elegir qué ver"
          >
            <Icon name="back" size={16} />
          </button>
        )}
        <button
          className="pa-tira-lista"
          onClick={() => { setVerListas((v) => !v); setBuscando(false); }}
          aria-label="Listas"
        >
          <Icon name="list" size={15} />
          <span>{active.name}</span>
        </button>
        <button className="pa-icon-btn" onClick={abrirBusqueda} title="Buscar" aria-label="Buscar">
          <Icon name="search" size={16} />
        </button>
      </div>
    )}

    {/* El buscador, encima de lo que haya: lo que se busca no pertenece a
        ninguna sección, así que no vive dentro de ninguna */}
    {active && buscando && (
      <div className="pa-busca">
        <Icon name="search" size={17} />
        <input
          ref={searchRef}
          className="input"
          placeholder="Buscar canales, películas o series…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") cerrarBusqueda(); }}
          aria-label="Buscar canales y contenido"
        />
        <button className="pa-icon-btn" onClick={cerrarBusqueda} title="Cerrar la búsqueda" aria-label="Cerrar la búsqueda">
          <Icon name="cerrar" size={15} />
        </button>
      </div>
    )}

    {/* Las listas del usuario: cambiar de una a otra, añadir y quitar. Era
        un desplegable y dos botones sueltos en la barra de arriba */}
    {active && verListas && (
      <>
        <button className="pa-listas-fondo" onClick={() => setVerListas(false)} aria-label="Cerrar el panel de listas" />
        <div className="pa-listas" role="dialog" aria-label="Tus listas">
          <p className="pa-listas-t">Tus listas</p>
          {playlists.map((p) => (
            <button
              key={p.id}
              className={`pa-listas-item ${p.id === activeId ? "activa" : ""}`}
              onClick={() => { setActiveId(p.id); setVerListas(false); }}
            >
              <Icon name={p.id === activeId ? "check" : "list"} size={14} />
              <span>{p.name}</span>
            </button>
          ))}
          <div className="pa-listas-sep" />
          <button
            className="pa-listas-acc"
            onClick={() => { setVerListas(false); setShowAdd(true); }}
            aria-label="Añadir lista"
          >
            <Icon name="plus" size={14} /> Añadir lista
          </button>
          {!active.managed && (
            <button
              className="pa-listas-acc pa-listas-borrar"
              onClick={() => { setVerListas(false); handleDeletePlaylist(active); }}
              aria-label="Eliminar esta lista"
            >
              <Icon name="trash" size={14} /> Eliminar esta lista
            </button>
          )}
        </div>
      </>
    )}

    <div className={`pa-marco ${active ? "con-carril" : ""}`}>
    {active && buscandoTodo ? (
      /* Resultados de la búsqueda global, en lugar del contenido de la
         pestaña: lo que se busca manda sobre dónde se estaba */
      <div className="pa-buscador">
        <div className="pa-buscador-cab">
          <h2>
            {resultados.total} resultado{resultados.total === 1 ? "" : "s"} para «{search.trim()}»
          </h2>
          <button className="btn btn-ghost btn-sm" onClick={cerrarBusqueda}>
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
                <span className="pa-cat-icono"><Icon name={iconoDeCategoria(g.name)} size={16} /></span>
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
    ) : active && tab === "bajadas" ? (
      /*
        Lo que hay guardado en el aparato.

        Una fila por cosa, con su carátula, en qué va y cuánto ocupa: lo que
        se pregunta aquí es «¿ya la tengo?» y «¿cuánto me está comiendo el
        disco?». Verla y quitarla van juntas porque son las dos únicas cosas
        que se hacen en esta pantalla; esconder la segunda en un menú de
        ajustes es lo que hace que un disco se llene y no se vacíe nunca.
      */
      viendo && current ? (
        /*
          Viendo algo guardado, aquí mismo.

          El vídeo de las películas y las series vive en la rama del
          catálogo, y desde Descargas esa rama no se pinta: al darle a ver
          una película descargada se encendía el reproductor y no había
          ningún sitio donde enseñarlo. Se quedaba la lista igual que
          estaba, como si el botón no hiciera nada — y no lo hacía.

          Sin la columna de episodios: lo que se guarda se guarda de uno en
          uno, y al lado de una película descargada no hay nada que listar.
        */
        <div className="pa-watch">
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
            <VideoPlayer source={current.source} />
          </div>
        </div>
      ) : (
      <div className="pa-bajadas">
        <h2 className="pa-bajadas-t">Descargas</h2>
        {!descargas.length ? (
          <p className="pa-empty">
            Todavía no has guardado nada. En la ficha de una película o de un episodio tienes el
            botón de descargar.
          </p>
        ) : (
          descargas.map((d) => (
            <div className="pa-bajada" key={d.id}>
              <span className="pa-bajada-cartel">
                {imgSrc(d.cartel) ? (
                  <img src={imgSrc(d.cartel)} alt="" />
                ) : (
                  <Icon name="film" size={22} />
                )}
              </span>
              <button
                className="pa-bajada-txt"
                disabled={d.estado !== "lista"}
                onClick={() => {
                  if (!d.url) return;
                  /*
                   * Y encender el reproductor, no solo elegir qué poner.
                   *
                   * `current` dice QUÉ suena; `viendo` dice que hay que
                   * enseñar la pantalla del vídeo. Faltaba lo segundo, así
                   * que al darle a ver una película descargada se guardaba
                   * la elección y no pasaba nada más: ni vídeo, ni cambio de
                   * pantalla, ni un aviso. El botón parecía roto porque lo
                   * estaba.
                   */
                  setViendo(true);
                  setCurrent({
                    source: { url: d.url, name: d.nombre, kind: "video" },
                    logo: d.cartel,
                    playlistId: active.id,
                    kind: "vod",
                  });
                }}
              >
                <span className="pa-bajada-nombre">{d.nombre}</span>
                {d.estado === "bajando" ? (
                  <>
                    <span className="pa-bajada-estado">Bajando · {comoVa(d.parte, d.bytes)}</span>
                    <span className="pa-bajada-barra" aria-hidden="true">
                      <i style={{ width: `${d.parte}%` }} />
                    </span>
                  </>
                ) : d.estado === "fallo" ? (
                  /* Un fallo se dice y se deja a la vista con su papelera al
                     lado: media descarga ocupando disco sin que nadie sepa
                     que está ahí es peor que el fallo */
                  <span className="pa-bajada-estado pa-bajada-fallo">
                    {d.motivo ? `No se ha podido terminar · ${d.motivo}` : "No se ha podido terminar"}
                  </span>
                ) : (
                  <span className="pa-bajada-estado">
                    En este aparato{tamanoLegible(d.bytes) ? ` · ${tamanoLegible(d.bytes)}` : ""}
                  </span>
                )}
              </button>
              <button
                className="pa-bajada-quitar"
                aria-label={`Quitar ${d.nombre} del aparato`}
                onClick={() => { quitarDescarga(d.id); setDescargas(leerDescargas()); }}
              >
                <Icon name="papelera" size={18} />
              </button>
            </div>
          ))
        )}
      </div>
      )
    ) : active && (tab === "live" || tab === "favs") ? (
      <div className={`pa-live ${current ? "con-video" : ""} ${verCanales ? "con-canales" : ""}`}>
        <aside className="pa-live-cats" aria-label="Categorías">
          <div className="pa-live-head">
            <span>Categorías</span>
            {/* La pastilla cuenta lo que dice el rótulo que tiene al lado.
                Contaba canales —«Categorías 9» con tres carpetas a la
                vista—, y un número que no cuadra con lo que se ve debajo
                hace dudar de la lista entera. Los canales de cada una ya
                van escritos en su fila */}
            <span className="pa-live-n">{liveGroups.length}</span>
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
            {/* «Todos los canales» solo cuando hay alguno: en favoritos sin
                nada marcado era un botón a una lista vacía, encima del texto
                que ya decía que no había nada */}
            {liveGroups.length > 0 && (
              <button
                className={`pa-live-cat ${!grupoSel ? "activa" : ""}`}
                onClick={() => { setGrupoSel(null); setVerCanales(true); }}
              >
                <span className="name">Todos los canales</span>
              </button>
            )}
            {/* Con su icono: en sesenta carpetas que empiezan igual, el
                dibujo distingue antes que el nombre — ver lib/categorias */}
            {liveGroups.map((g) => (
              <button
                key={g.name}
                className={`pa-live-cat ${grupoSel === g.name ? "activa" : ""}`}
                onClick={() => { setGrupoSel(g.name); setVerCanales(true); }}
                title={g.name}
              >
                <span className="pa-cat-icono"><Icon name={iconoDeCategoria(g.name)} size={16} /></span>
                <span className="pa-cat-txt">
                  <span className="name">{g.name}</span>
                  {/* Cuántos hay dentro, escrito. En el escritorio cabe la
                      pastilla del número; en el móvil, donde la fila es alta
                      y hay sitio, se dice con todas las letras */}
                  <span className="pa-cat-cuantos">
                    {g.channels.length} {g.channels.length === 1 ? "canal" : "canales"}
                  </span>
                </span>
                <span className="pa-live-n">{g.channels.length}</span>
                <Icon name="chevronRight" size={16} className="pa-cat-flecha" />
              </button>
            ))}
            {/* Favoritos sin nada: un solo bloque con su dibujo y la salida,
                en vez de un rótulo, un botón y una frase repartidos por la
                columna diciendo lo mismo tres veces */}
            {!liveGroups.length && !loading && tab === "favs" && (
              <div className="pa-vacio">
                <Icon name="star" size={30} />
                <p>Aún no has marcado ningún canal.</p>
                <p className="pa-vacio-pista">Con un canal puesto, dale a «Favorito» y aparecerá aquí.</p>
                <button className="btn btn-primary btn-sm" onClick={() => setTab("live")}>
                  Ir a los canales
                </button>
              </div>
            )}
            {!liveGroups.length && !loading && tab !== "favs" && (
              <p className="pa-empty">
                {q
                  ? "Nada con ese nombre en esta lista."
                  : /* Sin buscar nada y sin un solo canal, la lista viene
                         vacía. Decir «no hay canales que coincidan» ahí suena
                         a que hay un filtro puesto y manda a buscarlo: el
                         cliente cuya suscripción ha caducado se quedaba
                       mirando un buscador que no era el problema. */
                    "Esta lista no trae ningún canal. Suele ser que la suscripción ha caducado, o que la dirección no es la que toca: pregúntale a quien te la dio."}
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
            {/* Lista o rejilla. La rejilla enseña el logotipo grande, que es
                como se reconoce un canal cuando no te sabes el nombre */}
            <button
              className="pa-vista"
              onClick={() => {
                const otra = vistaCanales === "lista" ? "rejilla" : "lista";
                setVistaCanales(otra);
                try {
                  localStorage.setItem(K_VISTA_CANALES, otra);
                } catch {
                  /* almacenamiento bloqueado: vale para esta sesión igual */
                }
              }}
              title={vistaCanales === "lista" ? "Ver en rejilla" : "Ver en lista"}
              aria-label={vistaCanales === "lista" ? "Ver en rejilla" : "Ver en lista"}
            >
              <Icon name={vistaCanales === "lista" ? "rejilla" : "list"} size={16} />
            </button>
          </div>
          <div className={`pa-live-scroll ${vistaCanales === "rejilla" ? "pa-canales-rejilla" : ""}`}>
            {loading && <SkeletonList rows={8} />}
            {vistaCanales === "rejilla" ? (
              <RejillaInfinita
                items={canalesVisibles}
                clave={`${tab}:${grupoSel || "todos"}`}
                onRango={verRangoCanales}
                tarjeta={(ch) => {
                  const ahora = epgAhora[`${active.id}:${ch.id}`];
                  return (
                    <button
                      key={ch.favKey}
                      className={`pa-canal-tarjeta ${current?.favKey === ch.favKey ? "activo" : ""}`}
                      onClick={ch.play}
                      onMouseEnter={() => { setCanalMirado(ch.favKey); ch.precargar?.(); }}
                      onFocus={() => { setCanalMirado(ch.favKey); ch.precargar?.(); }}
                      title={ahora ? `${ch.name} — ${ahora}` : ch.name}
                    >
                      <span className="pa-canal-logo">
                        {imgSrc(ch.logo) ? (
                          <img src={imgSrc(ch.logo)} alt="" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
                        ) : (
                          <span className="ph">{ch.name.trim().slice(0, 1).toUpperCase()}</span>
                        )}
                        {favorites[ch.favKey] && <Icon name="star" size={13} className="pa-canal-fav" />}
                      </span>
                      <span className="pa-canal-nombre">{ch.name}</span>
                      {ahora && (
                        <span className="pa-live-ahora">
                          <span className="pa-punto" aria-hidden="true" />
                          {ahora}
                        </span>
                      )}
                    </button>
                  );
                }}
              />
            ) : (
            <ListaVirtual
              items={canalesVisibles}
              clave={`${tab}:${grupoSel || "todos"}`}
              onRango={verRangoCanales}
              fila={(ch, i) => {
                /* Qué echan ahora manda sobre de qué carpeta es: lo segundo
                   se sabe por dónde has entrado, lo primero es a lo que se
                   viene. Si el canal no trae guía, vuelve la carpeta. */
                const ahora = epgAhora[`${active.id}:${ch.id}`];
                return (
                  <button
                    key={ch.favKey}
                    className={`pa-live-chan ${current?.favKey === ch.favKey ? "activo" : ""}`}
                    onClick={ch.play}
                    onMouseEnter={() => { setCanalMirado(ch.favKey); ch.precargar?.(); }}
                    onFocus={() => { setCanalMirado(ch.favKey); ch.precargar?.(); }}
                    title={ahora ? `${ch.name} — ${ahora}` : ch.name}
                  >
                    <span className="pa-live-num">{i + 1}</span>
                    {imgSrc(ch.logo) ? (
                      <img src={imgSrc(ch.logo)} alt="" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
                    ) : (
                      <span className="ph">{ch.name.trim().slice(0, 1).toUpperCase()}</span>
                    )}
                    <span className="pa-live-txt">
                      <span className="name">{ch.name}</span>
                      {ahora ? (
                        <span className="pa-live-ahora">
                          <span className="pa-punto" aria-hidden="true" />
                          {ahora}
                        </span>
                      ) : (
                        ch.grupo && <span className="pa-live-sub">{ch.grupo}</span>
                      )}
                    </span>
                    {favorites[ch.favKey] && <Icon name="star" size={13} className="pa-live-fav" />}
                  </button>
                );
              }}
            />
            )}

            {!loading && !canalesVisibles.length && (
              <p className="pa-empty">
                {q ? "Nada con ese nombre en esta lista." : "Aquí no hay canales."}
              </p>
            )}
            {/*
              Y debajo, lo guardado que no es un canal.
              Aquí y no en el hueco del vídeo: ahí solo se veía con nada
              puesto, y en esta pantalla lo normal es poner un canal
              favorito — con lo cual la lista desaparecía entera justo
              después de entrar a buscarla.
            */}
            {tab === "favs" && miListaCatalogo.length > 0 && (
              <div className="pa-milista">
                <h3 className="pa-milista-t">Películas y series</h3>
                <div className="pa-milista-grid">
                  {miListaCatalogo.map((it) => (
                    <button className="pa-card" key={it.llave} onClick={it.abrir} title={it.nombre}>
                      {imgSrc(it.cartel) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="poster" src={imgSrc(it.cartel)} alt="" loading="lazy" />
                      ) : (
                        <div className="poster-ph">{it.nombre}</div>
                      )}
                      <div className="meta">
                        <div className="title">{it.nombre}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
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
          ) : canalEnGrande ? (
            <div className="pa-avance">
              <span className="pa-avance-logo">
                {imgSrc(canalEnGrande.logo) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imgSrc(canalEnGrande.logo)}
                    alt=""
                    onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
                  />
                ) : (
                  <span className="ph">{canalEnGrande.name.trim().slice(0, 1).toUpperCase()}</span>
                )}
              </span>
              <h3 className="pa-avance-nombre">{canalEnGrande.name}</h3>
              {epgAhora[`${active.id}:${canalEnGrande.id}`] ? (
                <p className="pa-avance-ahora">
                  <span className="pa-punto" aria-hidden="true" />
                  {epgAhora[`${active.id}:${canalEnGrande.id}`]}
                </p>
              ) : (
                /* Cadena vacía es «preguntado y no hay guía»; sin poner es
                   «todavía sin preguntar». Solo lo primero merece decirse */
                epgAhora[`${active.id}:${canalEnGrande.id}`] === "" && (
                  <p className="pa-avance-sin">Tu proveedor no manda la guía de este canal.</p>
                )
              )}
              <button className="btn btn-primary btn-lg" onClick={canalEnGrande.play}>
                <Icon name="play" size={17} /> Ver ahora
              </button>
              <p className="pa-avance-pista">Pasa por encima de un canal para ver qué echan.</p>
            </div>
          ) : (
            <div className="pa-live-vacio">
              <Icon name="tv" size={44} />
              <p>
                {tab === "favs"
                  ? "Aquí sale lo que guardes. La estrella está en cada canal, y «Mi lista» en la ficha de cada película y de cada serie."
                  : "Elige un canal y empieza a verlo aquí."}
              </p>
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
        {/*
          Los chips, y solo en el móvil.
          En el escritorio los géneros son la columna de la izquierda; en el
          móvil esa columna no cabe y se escondía, así que no había ninguna
          forma de filtrar: se entraba en «Películas» y salían las cuatro mil
          seguidas. Esta fila se arrastra con el dedo y hace lo mismo.
        */}
        {active && (tab === "vod" || tab === "series") && !viendo && (
          <div className="pa-chips" role="tablist" aria-label={tab === "vod" ? "Géneros" : "Categorías"}>
            <button
              className={`pa-chip ${catFilter === "all" ? "activo" : ""}`}
              onClick={() => setCatFilter("all")}
              role="tab"
              aria-selected={catFilter === "all"}
            >
              Todo
            </button>
            {hayNovedades && (
              <button
                className={`pa-chip ${catFilter === NOVEDADES ? "activo" : ""}`}
                onClick={() => setCatFilter(NOVEDADES)}
                role="tab"
                aria-selected={catFilter === NOVEDADES}
              >
                <Icon name="sparkle" size={13} /> Novedades
              </button>
            )}
            {(tab === "vod" ? vodCats : seriesCats).map((c) => (
              <button
                key={c.category_id}
                className={`pa-chip ${catFilter === c.category_id ? "activo" : ""}`}
                onClick={() => setCatFilter(c.category_id)}
                role="tab"
                aria-selected={catFilter === c.category_id}
              >
                {c.category_name}
              </button>
            ))}
          </div>
        )}

        {!active && (
          <div className="pa-welcome escena">
            <h2>Bienvenido a TOTALplayer</h2>
            <p>
              Hay dos formas de empezar: con el usuario que te dio tu proveedor, o con tu propia lista M3U o
              Xtream Codes.
            </p>
            {/*
              Quien instala esto en el móvil suele ser cliente de un proveedor:
              abre la aplicación y lo único que veía era «añade tu lista», que
              no es lo suyo — su usuario y contraseña no aparecían por ningún
              lado y acababa preguntándole a quien se lo vendió.
            */}
            <div className="pa-welcome-vias">
              <a className="btn btn-primary btn-lg" href="/acceso">
                <><Icon name="users" size={17} /> Entrar con mi usuario</>
              </a>
              <button className="btn btn-ghost btn-lg" onClick={() => setShowAdd(true)}>
                <><Icon name="plus" size={17} /> Tengo mi propia lista</>
              </button>
            </div>
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
            {/* Sin filtro, la portada; con filtro, la rejilla de siempre */}
            {enPortada && !loading ? (
              <PortadaCatalogo
                titulos={titulosPortada}
                categorias={categoriasPortada}
                alAbrir={abrirDeLaPortada}
                alVerTodo={() => setVerRejilla(tab)}
              />
            ) : (
            <div className="pa-grid">
              <RejillaInfinita
                items={vodVisible}
                clave={`vod:${catFilter}:${q}`}
                tarjeta={(v) => (
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
                )}
              />
            </div>
            )}
            {!loading && !loadError && !vodVisible.length && !enPortada && (
              <p className="pa-empty">
                {catFilter === NOVEDADES ? "Tu proveedor no ha subido nada últimamente." : "Aquí no hay películas."}
              </p>
            )}
          </div>
        )}

        {/* Catálogo de series */}
        {active && modoCatalogo && tab === "series" && !seriesDetail && (
          <div className="pa-cat-scroll">
            {loading && <Loading messages={MENSAJES_SERIES} />}
            {loadError && <div className="pa-empty"><div className="error-box">{loadError}</div></div>}
            {enPortada && !loading ? (
              <PortadaCatalogo
                titulos={titulosPortada}
                categorias={categoriasPortada}
                alAbrir={abrirDeLaPortada}
                alVerTodo={() => setVerRejilla(tab)}
              />
            ) : (
            <div className="pa-grid">
              {!loading && !loadError && !seriesVisible.length && (
              <p className="pa-empty">
                {catFilter === NOVEDADES ? "Tu proveedor no ha subido nada últimamente." : "Aquí no hay series."}
              </p>
            )}
            <RejillaInfinita
              items={seriesVisible}
              clave={`series:${catFilter}:${q}`}
              tarjeta={(s) => (
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
              )}
            />

            </div>
            )}
          </div>
        )}
      </main>
    </div>
    )}
    </div>

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
          <FondoDeFicha arte={arte} />
          <div className="ficha-cabeza">
            {(imgSrc(vodDetail.info?.info?.movie_image || vodDetail.vod.stream_icon) || arte?.cartel) && (
              <img
                src={imgSrc(vodDetail.info?.info?.movie_image || vodDetail.vod.stream_icon) || arte?.cartel}
                alt=""
              />
            )}
            <div className="ficha-datos">
              <h2>{vodDetail.vod.name}</h2>
              <FichaMeta
                genero={vodDetail.info?.info?.genre}
                fecha={vodDetail.info?.info?.releasedate || vodDetail.info?.info?.release_date}
                duracion={duracionDe(vodDetail.info?.info?.duration, vodDetail.info?.info?.duration_secs)}
                nota={vodDetail.info?.info?.rating || vodDetail.vod.rating}
              />
              {vodDetail.info === null ? (
                <p className="ficha-cargando">Cargando la ficha…</p>
              ) : (
                <>
                  {(vodDetail.info.info?.plot || vodDetail.info.info?.description) && (
                    <p className="ficha-plot">{vodDetail.info.info?.plot || vodDetail.info.info?.description}</p>
                  )}
                  <Reparto
                    gente={reparto}
                    delPanel={vodDetail.info.info?.cast || vodDetail.info.info?.actors}
                  />
                  <FichaCredito etiqueta="Dirección" valor={vodDetail.info.info?.director} />
                </>
              )}
              <div className="ficha-acciones">
                <button
                  className="btn btn-primary"
                  onClick={() => playVod(active, {
                    ...vodDetail.vod,
                    container_extension: vodDetail.info?.movie_data?.container_extension || vodDetail.vod.container_extension,
                  })}
                >
                  <Icon name="play" size={16} /> Reproducir
                </button>
                <BotonMiLista
                  llave={`${active.id}:vod:${vodDetail.vod.stream_id}`}
                  puesto={favorites}
                  alPulsar={onToggleFav}
                />
                {/* Y guardarla, donde se pueda. En el navegador este botón no
                    existe: lo que hay ahí es almacenamiento del sitio, que se
                    borra solo cuando hace falta espacio */}
                {conDescargas && (() => {
                  const id = `vod-${vodDetail.vod.stream_id}`;
                  const ya = descargas.find((d) => d.id === id);
                  const ext =
                    vodDetail.info?.movie_data?.container_extension ||
                    vodDetail.vod.container_extension ||
                    "mp4";
                  return (
                    <button
                      className="btn btn-ghost"
                      onClick={() =>
                        bajarloAqui(id, vodDetail.vod.name, vodDetail.vod.stream_icon || "", async () =>
                          dondeGuardar(
                            await pedirEnlace({
                              ...credsOf(active),
                              clase: "movie",
                              id: String(vodDetail.vod.stream_id),
                              ext,
                            })
                          )
                        )
                      }
                    >
                      <Icon name={ya?.estado === "lista" ? "papelera" : "bajar"} size={16} />
                      {preparando === id
                        ? "Preparando…"
                        : ya?.estado === "lista"
                          ? "Quitar del aparato"
                          : ya?.estado === "bajando"
                            ? `Bajando ${comoVa(ya.parte, ya.bytes)}`
                            : "Descargar"}
                    </button>
                  );
                })()}
              </div>
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
          <FondoDeFicha arte={arte} />
          <div className="ficha-cabeza">
            {(imgSrc(seriesDetail.info.info?.cover || seriesDetail.series.cover) || arte?.cartel) && (
              <img
                src={imgSrc(seriesDetail.info.info?.cover || seriesDetail.series.cover) || arte?.cartel}
                alt=""
              />
            )}
            <div className="ficha-datos">
              <h2>{seriesDetail.series.name}</h2>
              <FichaMeta
                genero={seriesDetail.info.info?.genre}
                fecha={seriesDetail.info.info?.releaseDate || seriesDetail.info.info?.release_date}
                duracion={minutosDe(String(seriesDetail.info.info?.episode_run_time ?? "")).replace(/ min$/, " min/ep")}
                nota={seriesDetail.info.info?.rating || seriesDetail.series.rating}
                temporadas={Object.keys(seriesDetail.info.episodes || {}).length}
              />
              <p className="ficha-plot">{seriesDetail.info.info?.plot || seriesDetail.series.plot || ""}</p>
              <Reparto gente={reparto} delPanel={seriesDetail.info.info?.cast} />
              <FichaCredito etiqueta="Dirección" valor={seriesDetail.info.info?.director} />
              <div className="ficha-acciones">
                {/*
                  Empezar por el principio, en un botón.
                  La ficha de una serie abría con las temporadas y la lista de
                  episodios, y ninguna forma de decir «ponme el primero» sin
                  buscarlo: quien llega a una serie que no ha visto tiene que
                  bajar la vista, encontrar el 1 y pulsarlo. En la tele ese
                  botón ya estaba.
                */}
                {(() => {
                  const primeraTemporada = Object.keys(seriesDetail.info.episodes || {})[0];
                  const primero = seriesDetail.info.episodes?.[primeraTemporada]?.[0];
                  if (!primero) return null;
                  const comoSeLlama = primero.title || `Episodio ${primero.episode_num}`;
                  return (
                    <button
                      className="btn btn-primary"
                      onClick={() =>
                        playEpisode(active, seriesDetail.series, primero.id, comoSeLlama, primero.container_extension)
                      }
                    >
                      <Icon name="play" size={16} /> Ver el primer episodio
                    </button>
                  );
                })()}
                <BotonMiLista
                  llave={`${active.id}:serie:${seriesDetail.series.series_id}`}
                  puesto={favorites}
                  alPulsar={onToggleFav}
                />
              </div>
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

          {/*
            Cada episodio, con lo que se hace con él al lado.
            Ponerlo es lo normal y ocupa la fila entera; guardarlo en el
            aparato va en un botón pequeño a su derecha, y solo donde se
            puede guardar. De una serie se baja el episodio que quieras y no
            la serie entera: cuarenta ficheros y varios gigas no es una
            decisión que se tome sin querer, pulsando un botón.
          */}
          <div className="ficha-episodios">
            {(seriesDetail.info.episodes?.[seriesDetail.season] || []).map((ep) => {
              const id = `ep-${ep.id}`;
              const ya = descargas.find((d) => d.id === id);
              /* Sin el nombre de la serie ni el «S01E03» por delante: estás
                 dentro de esa serie y el número está en la fila, así que lo
                 único que aporta el título es lo que viene después — y es
                 justo lo que se corta cuando no cabe */
              const titulo =
                tituloDeEpisodio(ep.title || "", seriesDetail.series.name) || `Episodio ${ep.episode_num}`;
              const foto = imgSrc(ep.info?.movie_image || "");
              const minutos = minutosDe(ep.info?.duration);
              return (
                <div className="pa-episode-fila" key={ep.id}>
                  <button
                    className="pa-episode"
                    onClick={() =>
                      playEpisode(active, seriesDetail.series, ep.id, titulo, ep.container_extension)
                    }
                  >
                    {/*
                      El fotograma del episodio, como en la tele.
                      Aquí solo había número y título: dos episodios seguidos
                      de la misma serie se distinguen por el fotograma antes
                      que por el nombre, sobre todo cuando el proveedor los
                      llama «S01E03» y «S01E04».
                    */}
                    <span className="pa-episode-foto">
                      {foto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={foto} alt="" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
                      ) : (
                        /* Sin fotograma, el número en grande: un hueco gris
                           parece un fallo, y esto se lee como una decisión */
                        <span className="pa-episode-n">{ep.episode_num}</span>
                      )}
                      {minutos && <span className="pa-episode-min">{minutos}</span>}
                    </span>
                    <span className="pa-episode-txt">
                      <span className="ep-num">
                        T{seriesDetail.season}: E{ep.episode_num}
                      </span>
                      <span className="ep-t">{titulo}</span>
                      {ep.info?.plot && <span className="ep-p">{ep.info.plot}</span>}
                    </span>
                    <Icon name="play" size={15} />
                  </button>
                  {conDescargas && (
                    <button
                      className={`pa-episode-bajar ${ya ? "puesto" : ""}`}
                      title={
                        ya?.estado === "lista"
                          ? "Quitar del aparato"
                          : ya?.estado === "bajando"
                            ? `Bajando ${comoVa(ya.parte, ya.bytes)}`
                            : "Descargar"
                      }
                      aria-label={`Descargar ${titulo}`}
                      onClick={() =>
                        bajarloAqui(
                          id,
                          `${seriesDetail.series.name} · T${seriesDetail.season}E${ep.episode_num}`,
                          seriesDetail.series.cover || "",
                          async () =>
                            dondeGuardar(
                              await pedirEnlace({
                                ...credsOf(active),
                                clase: "series",
                                id: ep.id,
                                ext: ep.container_extension || "mp4",
                              })
                            )
                        )
                      }
                    >
                      {preparando === id ? (
                        <span className="pa-episode-parte">…</span>
                      ) : ya?.estado === "bajando" ? (
                        <span className="pa-episode-parte">{ya.parte}%</span>
                      ) : (
                        <Icon name={ya?.estado === "lista" ? "papelera" : "bajar"} size={15} />
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    )}

    <div className="pa-flotantes">
      {/* La cápsula: los mismos destinos que el carril, tumbados y al
          alcance del pulgar. El icono va dentro de una pastilla que se
          enciende, para que la sección activa se vea sin leer */}
      {active && (
        <nav className="pa-bottomnav" aria-label="Secciones">
          {destinos.map((d) => (
            <button
              key={d.id}
              className={`pa-bottomnav-item ${tab === d.id ? "active" : ""}`}
              onClick={() => { irAPestana(d.id); setSeccionGate("hecho"); }}
              aria-current={tab === d.id ? "page" : undefined}
            >
              <span className="pa-bottomnav-pastilla"><Icon name={d.icono} size={20} /></span>
              <span>{d.texto}</span>
            </button>
          ))}
        </nav>
      )}

      {showAdd && <AddPlaylistModal loggedIn={!!user} onAdd={handleAddPlaylist} onClose={() => setShowAdd(false)} />}
    </div>
    </>
  );
}

/**
 * «Mi lista», en la ficha de una película o de una serie.
 *
 * La estrella de los canales existía desde el principio; el catálogo no
 * tenía nada. O sea que en el reproductor web se podía guardar el canal de
 * deportes y no se podía guardar una película para verla el sábado, que es
 * exactamente para lo que sirve una lista. En la tele ya está, y lo que se
 * guarda es lo mismo: el almacén de favoritos es uno solo y la llave lleva
 * dentro de qué es cada cosa.
 */
function BotonMiLista({
  llave,
  puesto,
  alPulsar,
}: {
  llave: string;
  puesto: Record<string, true>;
  alPulsar: (llave: string) => void;
}) {
  const ya = Boolean(puesto[llave]);
  return (
    <button
      className={`btn btn-ghost ${ya ? "puesto" : ""}`}
      onClick={() => alPulsar(llave)}
      aria-pressed={ya}
    >
      <Icon name="star" size={16} />
      {ya ? "En mi lista" : "Mi lista"}
    </button>
  );
}

/**
 * El fondo apaisado, detrás de la cabecera de la ficha.
 *
 * Es la misma imagen que la portada usa en el banner de arriba y la tele
 * detrás de su ficha, y sale de la misma fila guardada. Va difuminándose
 * hacia abajo hasta el color del panel: entero se lee como una foto pegada
 * encima del texto, y lo que tiene que hacer es dar el tono del título sin
 * quitarle sitio a lo que se ha venido a leer.
 *
 * Si TMDB no conoce el título —o esta instalación no tiene clave— no se
 * pinta nada y la ficha queda exactamente como estaba.
 */
function FondoDeFicha({ arte }: { arte: MetaTitulo | null }) {
  const [rota, setRota] = useState(false);
  useEffect(() => setRota(false), [arte?.fondo]);
  if (!arte?.fondo || rota) return null;
  return (
    <span className="ficha-fondo" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={arte.fondo} alt="" onError={() => setRota(true)} />
    </span>
  );
}

/** Chips de metadatos de la ficha (género, año, temporadas, duración, nota). */
function FichaMeta({
  genero,
  fecha,
  duracion,
  nota,
  temporadas,
}: { genero?: string; fecha?: string; duracion?: string; nota?: string; temporadas?: number }) {
  const año = (fecha || "").slice(0, 4);
  const notaNum = parseFloat(nota || "");
  const chips = [
    genero,
    año && año !== "0000" ? año : "",
    /* Cuántas temporadas, que es lo primero que se pregunta de una serie:
       no es lo mismo empezar algo de una temporada que algo de nueve. Es lo
       que ya dice la ficha de la tele; aquí había que contar los botones */
    temporadas ? `${temporadas} ${temporadas === 1 ? "temporada" : "temporadas"}` : "",
    duracion,
    /* Con coma, que es como se escriben aquí los decimales: un «7.8» en
       medio de una ficha en castellano se lee como un error de traducción */
    Number.isFinite(notaNum) && notaNum > 0 ? `★ ${notaNum.toFixed(1).replace(".", ",")}` : "",
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

/**
 * El reparto, con la cara de cada uno.
 *
 * Una lista de nombres separados por comas —que es lo que manda el panel—
 * se lee como una ficha técnica: no dice nada hasta que reconoces uno, y
 * para reconocerlo hay que leerlos todos. Con la cara delante se reconoce
 * sin leer, que es como se decide de verdad si una película apetece.
 *
 * Cuando TMDB no conoce el título no hay caras, y entonces se enseñan los
 * nombres del panel en una línea, como se hacía antes. Es peor, pero es lo
 * que hay, y no enseñar nada sería peor todavía.
 */
function Reparto({ gente, delPanel }: { gente: Actor[]; delPanel?: string }) {
  if (!gente.length) return <FichaCredito etiqueta="Reparto" valor={delPanel} />;
  return (
    <div className="ficha-reparto">
      <p className="ficha-reparto-t">Reparto</p>
      <ul className="ficha-caras">
        {gente.map((a) => (
          <li key={`${a.nombre}-${a.personaje}`}>
            <span className="ficha-cara">
              {a.foto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.foto} alt="" loading="lazy" />
              ) : (
                /* Sin foto, sus iniciales. Un hueco gris en medio de una
                   fila de caras se lee como una imagen que no ha cargado */
                <span className="ficha-cara-ph">
                  {a.nombre
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join("")
                    .toUpperCase()}
                </span>
              )}
            </span>
            <span className="ficha-cara-n">{a.nombre}</span>
            {a.personaje && <span className="ficha-cara-pj">{a.personaje}</span>}
          </li>
        ))}
      </ul>
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

/**
 * El texto de búsqueda, ya en minúsculas y sin espacios, pero esperando a
 * que quien escribe pare un momento.
 *
 * Está aquí abajo y no en un fichero aparte porque solo lo usa esta
 * pantalla, y porque lo que explica por qué existe está donde se llama.
 */
function useBusquedaCalmada(texto: string, espera = 130): string {
  const limpio = texto.trim().toLowerCase();
  const [calmado, setCalmado] = useState(limpio);

  useEffect(() => {
    /* Vaciar el buscador tiene que notarse ya: se está deshaciendo algo, y
       esperar a que vuelva la lista completa parece que no ha funcionado */
    if (!limpio) {
      setCalmado("");
      return;
    }
    const reloj = setTimeout(() => setCalmado(limpio), espera);
    return () => clearTimeout(reloj);
  }, [limpio, espera]);

  return calmado;
}
