"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon, { IconName } from "@/components/Icon";
import VideoPlayer, { PlaySource } from "@/components/player/VideoPlayer";
import { parseM3U } from "@/lib/m3u";
import { imgSrc } from "@/lib/img";
import {
  XtreamCreds,
  XtreamCategory,
  XtreamLiveStream,
  XtreamVodStream,
  XtreamSeries,
  XtreamSeriesInfo,
  xtreamApi,
  liveStreamUrl,
  vodStreamUrl,
  seriesEpisodeUrl,
} from "@/lib/xtream";

/**
 * La aplicación de televisión.
 *
 * Una tele no es un ordenador pequeño: se maneja con cuatro flechas y un
 * OK, desde el sofá, a tres metros. Por eso esto no es el reproductor web
 * con la letra más grande, sino otra aplicación: una portada con cuatro
 * accesos, listas de una columna que se recorren con el mando y el vídeo a
 * pantalla completa. Nada de menús laterales, pestañas, buscadores ni
 * ajustes — lo que no se puede usar cómodamente con un mando, no está.
 *
 * Y no se escribe: la tele enseña un código y el cliente lo teclea desde su
 * móvil, donde escribir es gratis.
 */

type Pantalla = "portada" | "directo" | "cine" | "series" | "viendo" | "salir";

interface Lista {
  tipo: "xtream" | "m3u";
  url: string;
  usuario: string;
  password: string;
}

interface Fila {
  id: string;
  nombre: string;
  logo: string;
  /** Una carpeta se pinta distinto y al abrirla enseña lo que hay dentro */
  carpeta?: boolean;
  /** Qué hacer al pulsar OK: reproducir, o abrir la lista de episodios */
  abrir: () => void;
}

const K_DEVICE = "xp.tvDevice.v1";
const K_MAC = "xp.tvMac.v1";
const K_LISTA_MANUAL = "xp.tvLista.v1";
/**
 * La última sesión que funcionó y el último canal que se puso.
 *
 * Una tele enciende antes de tener red: cuando la app arranca, el wifi lleva
 * un par de segundos negociando. Preguntando al servidor y creyéndonos el
 * fallo, lo que salía era la pantalla de activación —a alguien que lleva
 * meses activado— o una espera en blanco. Con lo de la última vez se entra
 * igual y la comprobación se hace por detrás.
 */
const K_SESION = "xp.tvSesion.v1";
const K_ULTIMO = "xp.tvUltimo.v1";

interface SesionGuardada {
  marca: string;
  caduca: number;
  soporte: string;
  lista: Lista;
}

interface UltimoCanal {
  nombre: string;
  source: PlaySource;
}

function guardar<T>(clave: string, valor: T) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* almacenamiento lleno o bloqueado: no es motivo para romper nada */
  }
}

function leer<T>(clave: string): T | null {
  try {
    const raw = localStorage.getItem(clave);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function deviceKey(): string {
  try {
    let k = localStorage.getItem(K_DEVICE);
    if (!k) {
      k = `tv-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
      localStorage.setItem(K_DEVICE, k);
    }
    return k;
  } catch {
    return "tv-anonimo";
  }
}

/**
 * La MAC del aparato, la que el cliente le pasa a su proveedor.
 *
 * Ningún navegador deja leer la MAC de verdad, así que se genera una propia
 * y estable con forma de MAC — para el proveedor es lo mismo: copia lo que
 * ve en la pantalla. En las apps nativas de Samsung o LG basta con
 * sustituir esto por la MAC real del sistema.
 */
function macDelAparato(): string {
  try {
    let m = localStorage.getItem(K_MAC);
    if (!m) {
      const hex = "0123456789ABCDEF";
      const bytes: string[] = [];
      // Primer byte par: así es una MAC de aparato, no de difusión
      bytes.push(hex[Math.floor(Math.random() * 16)] + hex[[0, 2, 4, 6, 8, 10, 12, 14][Math.floor(Math.random() * 8)]]);
      for (let i = 1; i < 6; i++) {
        bytes.push(hex[Math.floor(Math.random() * 16)] + hex[Math.floor(Math.random() * 16)]);
      }
      m = bytes.join(":");
      localStorage.setItem(K_MAC, m);
    }
    return m;
  } catch {
    return "00:00:00:00:00:00";
  }
}

interface ListaManual {
  tipo: "xtream" | "m3u";
  url: string;
  usuario: string;
  password: string;
}

function leerListaManual(): ListaManual | null {
  try {
    const raw = localStorage.getItem(K_LISTA_MANUAL);
    return raw ? (JSON.parse(raw) as ListaManual) : null;
  } catch {
    return null;
  }
}

export default function TvApp() {
  const [sesion, setSesion] = useState<"cargando" | "sin-sesion" | "dentro">("cargando");
  const [codigo, setCodigo] = useState<string>("");
  const [avisoCodigo, setAvisoCodigo] = useState("");
  const [marca, setMarca] = useState("TOTALplayer");
  const [caduca, setCaduca] = useState(0);
  const [soporte, setSoporte] = useState("");
  const [lista, setLista] = useState<Lista | null>(null);

  const [pantalla, setPantalla] = useState<Pantalla>("portada");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [foco, setFoco] = useState(0);
  const [viendo, setViendo] = useState<{ source: PlaySource } | null>(null);
  /** Serie abierta: sus episodios sustituyen a la lista mientras dure */
  const [serieAbierta, setSerieAbierta] = useState<string>("");
  /** Carpeta abierta dentro de una sección (null = viendo las carpetas) */
  const [carpetaAbierta, setCarpetaAbierta] = useState<string>("");
  const [poniendoLista, setPoniendoLista] = useState(false);
  const [haciendoLogin, setHaciendoLogin] = useState(false);
  const [entrando, setEntrando] = useState(false);
  /** Arrancamos con lo de la última vez porque no hubo forma de preguntar */
  const [sinRed, setSinRed] = useState(false);
  /** Lo último que se estaba viendo, para volver con un solo OK */
  const [ultimo, setUltimo] = useState<UltimoCanal | null>(null);

  useEffect(() => {
    setUltimo(leer<UltimoCanal>(K_ULTIMO));
  }, []);

  /** Entrar con el usuario del proveedor, desde la propia tele */
  async function entrarConUsuario(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setEntrando(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/customer/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: fd.get("usuario"),
        password: fd.get("password"),
        // La tele se identifica con su MAC: así el proveedor la reconoce
        deviceKey: `mac-${macDelAparato()}`,
        platform: "tv",
      }),
    });
    const data = await res.json();
    setEntrando(false);
    if (!res.ok) {
      setError(data.error || "No hemos podido entrar con esos datos");
      return;
    }
    setHaciendoLogin(false);
    await mirarSesion();
  }

  /** Lista puesta a mano en la propia tele, para quien no tiene proveedor */
  function guardarListaManual(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    const url = String(fd.get("url") || "").trim();
    const usuario = String(fd.get("usuario") || "").trim();
    const password = String(fd.get("password") || "").trim();
    if (!/^https?:\/\//i.test(url)) {
      setError("La dirección debe empezar por http:// o https://");
      return;
    }
    // Con usuario y contraseña es un panel Xtream; sin ellos, una lista M3U
    const nueva: ListaManual = { tipo: usuario && password ? "xtream" : "m3u", url, usuario, password };
    try {
      localStorage.setItem(K_LISTA_MANUAL, JSON.stringify(nueva));
    } catch {
      /* almacenamiento bloqueado: se usa igual mientras dure la sesión */
    }
    setLista(nueva);
    setPoniendoLista(false);
    setSesion("dentro");
  }

  const listaRef = useRef<HTMLDivElement>(null);

  /* ---------- Sesión: o ya la hay, o se empareja con un código ---------- */

  const mirarSesion = useCallback(async () => {
    /*
     * Distinguimos «el servidor dice que no hay sesión» de «no hemos podido
     * preguntar». Antes las dos acababan en la pantalla de activación, y la
     * segunda es lo que le pasa a una tele que enciende antes que el wifi.
     */
    let d: Record<string, unknown> | null = null;
    try {
      d = await fetch("/api/customer/me").then((r) => r.json());
    } catch {
      const guardada = leer<SesionGuardada>(K_SESION);
      if (guardada) {
        setMarca(guardada.marca);
        setCaduca(guardada.caduca);
        setSoporte(guardada.soporte);
        setLista(guardada.lista);
        setSesion("dentro");
        setSinRed(true);
        return true;
      }
      const manualSinRed = leerListaManual();
      if (manualSinRed) {
        setLista(manualSinRed);
        setSesion("dentro");
        setSinRed(true);
        return true;
      }
      setSesion("sin-sesion");
      setSinRed(true);
      return false;
    }
    setSinRed(false);
    if (!d || !d.customer || !d.playlist) {
      /*
       * Sin cliente puede haber una lista puesta a mano en esta tele: quien
       * compra la app sin proveedor detrás también tiene derecho a verla.
       */
      const manual = leerListaManual();
      if (manual) {
        setLista(manual);
        setSesion("dentro");
        return true;
      }
      setSesion("sin-sesion");
      return false;
    }
    const respuesta = d as unknown as {
      brand?: string;
      customer?: { expiresAt?: number };
      branding?: { support?: string };
      playlist: { type: "xtream" | "m3u"; url: string; username?: string; password?: string };
    };
    const nueva: SesionGuardada = {
      marca: respuesta.brand || "TOTALplayer",
      caduca: respuesta.customer?.expiresAt || 0,
      soporte: respuesta.branding?.support || "",
      lista: {
        tipo: respuesta.playlist.type,
        url: respuesta.playlist.url,
        usuario: respuesta.playlist.username || "",
        password: respuesta.playlist.password || "",
      },
    };
    setMarca(nueva.marca);
    setCaduca(nueva.caduca);
    setSoporte(nueva.soporte);
    setLista(nueva.lista);
    // Guardada para el próximo encendido, que puede ser sin red todavía
    guardar(K_SESION, nueva);
    setSesion("dentro");
    return true;
  }, []);

  useEffect(() => {
    mirarSesion().then((dentro) => {
      if (!dentro) pedirCodigo();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pedirCodigo() {
    setAvisoCodigo("");
    const r = await fetch("/api/tv/code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceKey: deviceKey() }),
    }).then((x) => x.json());
    setCodigo(r.code || "");
  }

  /*
   * Mientras espera, la tele mira por los dos caminos a la vez: si su MAC ya
   * está dada de alta por el proveedor, o si alguien ha reclamado su código.
   * El cliente usa el que le resulte más cómodo y la tele no pregunta cuál.
   */
  useEffect(() => {
    if (sesion !== "sin-sesion") return;
    const t = setInterval(async () => {
      const porMac = await fetch(`/api/tv/mac?mac=${encodeURIComponent(macDelAparato())}`)
        .then((x) => x.json())
        .catch(() => ({}));
      if (porMac.estado === "listo") {
        clearInterval(t);
        await mirarSesion();
        return;
      }
      // Lista cargada contra la MAC desde la web, sin proveedor de por medio
      if (porMac.estado === "lista" && porMac.lista?.url) {
        clearInterval(t);
        const l: ListaManual = {
          tipo: porMac.lista.tipo === "xtream" ? "xtream" : "m3u",
          url: porMac.lista.url,
          usuario: porMac.lista.usuario || "",
          password: porMac.lista.password || "",
        };
        try {
          localStorage.setItem(K_LISTA_MANUAL, JSON.stringify(l));
        } catch {
          /* almacenamiento bloqueado */
        }
        setMarca(porMac.lista.nombre || "TOTALplayer");
        setLista(l);
        setSesion("dentro");
        return;
      }
      if (porMac.estado === "sin-hueco") {
        clearInterval(t);
        setAvisoCodigo(porMac.error || "No quedan dispositivos libres en tu cuenta");
        return;
      }
      if (!codigo) return;
      const r = await fetch(`/api/tv/code?code=${codigo}`).then((x) => x.json()).catch(() => ({}));
      if (r.estado === "listo") {
        clearInterval(t);
        await mirarSesion();
      } else if (r.estado === "caducado") {
        pedirCodigo();
      } else if (r.estado === "sin-hueco") {
        clearInterval(t);
        setAvisoCodigo(r.error || "No quedan dispositivos libres en tu cuenta");
      }
    }, 3000);
    return () => clearInterval(t);
  }, [sesion, codigo, mirarSesion]);

  /* ---------- Contenido ---------- */

  const creds: XtreamCreds | null = lista
    ? { base: lista.url, username: lista.usuario, password: lista.password }
    : null;

  const reproducir = useCallback((source: PlaySource) => {
    setViendo({ source });
    setPantalla("viendo");
    /* En una tele se vuelve casi siempre a lo mismo. Guardarlo cuesta una
       línea y ahorra recorrer otra vez carpeta, categoría y canal */
    const ultimoCanal: UltimoCanal = { nombre: source.name, source };
    setUltimo(ultimoCanal);
    guardar(K_ULTIMO, ultimoCanal);
  }, []);

  /** Entra en una carpeta: su contenido sustituye a la lista de carpetas */
  const entrarEnCarpeta = useCallback((nombre: string, contenido: Fila[]) => {
    setCarpetaAbierta(nombre);
    setFilas(contenido);
    setFoco(0);
  }, []);

  /**
   * Agrupa por categoría con el nombre que da el panel. Lo que no encaja en
   * ninguna (pasa a menudo) va a una carpeta propia en vez de desaparecer.
   */
  const carpetasDe = useCallback(
    function <T>(
      cats: XtreamCategory[] | unknown,
      elementos: T[],
      catDe: (x: T) => string | undefined,
      aFila: (x: T) => Fila
    ): Fila[] {
      const nombres = new Map<string, string>();
      for (const c of Array.isArray(cats) ? (cats as XtreamCategory[]) : []) {
        nombres.set(String(c.category_id), c.category_name || "Sin nombre");
      }
      const porCat = new Map<string, T[]>();
      for (const el of elementos) {
        const id = String(catDe(el) ?? "");
        const clave = nombres.has(id) ? id : "__sueltos__";
        if (!porCat.has(clave)) porCat.set(clave, []);
        porCat.get(clave)!.push(el);
      }
      return [...porCat.entries()].map(([clave, suyos]) => {
        const titulo = clave === "__sueltos__" ? "Otros" : nombres.get(clave) || "Sin nombre";
        return {
          id: `cat-${clave}`,
          nombre: `${titulo}  (${suyos.length})`,
          logo: "",
          carpeta: true,
          abrir: () => entrarEnCarpeta(titulo, suyos.map(aFila)),
        };
      });
    },
    [entrarEnCarpeta]
  );

  const cargar = useCallback(
    async (destino: Pantalla) => {
      if (!lista) return;
      setCargando(true);
      setError("");
      setFilas([]);
      setFoco(0);
      setSerieAbierta("");
      setCarpetaAbierta("");
      try {
        /*
         * Primero las carpetas, nunca la lista entera de golpe. Con una lista
         * real son miles de canales seguidos y encontrar uno con las flechas
         * del mando es imposible: se entra por su categoría, como en
         * cualquier reproductor de tele.
         */
        if (lista.tipo === "m3u") {
          const texto = await fetch(`/api/proxy?url=${encodeURIComponent(lista.url)}`).then((r) => r.text());
          const canales = parseM3U(texto).channels;
          const porGrupo = new Map<string, typeof canales>();
          for (const c of canales) {
            const g = c.group || "Sin carpeta";
            if (!porGrupo.has(g)) porGrupo.set(g, []);
            porGrupo.get(g)!.push(c);
          }
          setFilas(
            [...porGrupo.entries()].map(([grupo, suyos]) => ({
              id: `grupo-${grupo}`,
              nombre: `${grupo}  (${suyos.length})`,
              logo: "",
              carpeta: true,
              abrir: () =>
                entrarEnCarpeta(
                  grupo,
                  suyos.map((c, i) => ({
                    id: `m3u-${grupo}-${i}`,
                    nombre: c.name || `Canal ${i + 1}`,
                    logo: c.logo || "",
                    abrir: () => reproducir({ url: c.url, name: c.name || "", kind: "auto" }),
                  }))
                ),
            }))
          );
          return;
        }
        if (!creds) return;
        if (destino === "directo") {
          const [cats, canales] = await Promise.all([
            xtreamApi<XtreamCategory[]>(creds, "get_live_categories"),
            xtreamApi<XtreamLiveStream[]>(creds, "get_live_streams"),
          ]);
          const limpios = (Array.isArray(canales) ? canales : []).filter(
            (c) => typeof c.name === "string" && c.name.trim()
          );
          setFilas(
            carpetasDe(cats, limpios, (c) => c.category_id, (c) => ({
              id: `live-${c.stream_id}`,
              nombre: c.name,
              logo: c.stream_icon || "",
              abrir: () => reproducir({ url: liveStreamUrl(creds, c.stream_id), name: c.name, kind: "hls" }),
            }))
          );
        } else if (destino === "cine") {
          const [cats, pelis] = await Promise.all([
            xtreamApi<XtreamCategory[]>(creds, "get_vod_categories"),
            xtreamApi<XtreamVodStream[]>(creds, "get_vod_streams"),
          ]);
          const limpias = (Array.isArray(pelis) ? pelis : []).filter(
            (v) => typeof v.name === "string" && v.name.trim()
          );
          setFilas(
            carpetasDe(cats, limpias, (v) => v.category_id, (v) => ({
              id: `vod-${v.stream_id}`,
              nombre: v.name,
              logo: v.stream_icon || "",
              abrir: () =>
                reproducir({
                  url: vodStreamUrl(creds, v.stream_id, v.container_extension || "mp4"),
                  name: v.name,
                  kind: "video",
                }),
            }))
          );
        } else if (destino === "series") {
          const [cats, series] = await Promise.all([
            xtreamApi<XtreamCategory[]>(creds, "get_series_categories"),
            xtreamApi<XtreamSeries[]>(creds, "get_series"),
          ]);
          const limpias = (Array.isArray(series) ? series : []).filter(
            (s) => typeof s.name === "string" && s.name.trim()
          );
          setFilas(
            carpetasDe(cats, limpias, (s) => s.category_id, (s) => ({
              id: `serie-${s.series_id}`,
              nombre: s.name,
              logo: s.cover || "",
              abrir: () => abrirSerie(s),
            }))
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo cargar");
      } finally {
        setCargando(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lista, reproducir]
  );

  async function abrirSerie(s: XtreamSeries) {
    if (!creds) return;
    setCargando(true);
    try {
      const info = await xtreamApi<XtreamSeriesInfo>(creds, "get_series_info", { series_id: String(s.series_id) });
      const temporadas = Object.entries(info.episodes || {});
      const eps: Fila[] = [];
      for (const [temporada, lista] of temporadas) {
        for (const ep of lista || []) {
          eps.push({
            id: `ep-${ep.id}`,
            nombre: `T${temporada} · E${ep.episode_num} — ${ep.title || "Episodio"}`,
            logo: s.cover || "",
            abrir: () =>
              reproducir({
                url: seriesEpisodeUrl(creds, ep.id, ep.container_extension || "mp4"),
                name: `${s.name} — ${ep.title || ""}`,
                kind: "video",
              }),
          });
        }
      }
      setSerieAbierta(s.name);
      setFilas(eps);
      setFoco(0);
    } catch {
      setError("No se pudieron cargar los episodios");
    } finally {
      setCargando(false);
    }
  }

  /**
   * «Salir» cierra de verdad: suelta la sesión del cliente y la lista que
   * tuviera puesta este aparato, y vuelve a la pantalla de activación. Antes
   * llevaba a la web, que en una tele no sirve de nada.
   */
  async function salir() {
    if (!confirm("¿Salir de esta lista? Tendrás que volver a activar la tele.")) return;
    await fetch("/api/customer/me", { method: "DELETE" }).catch(() => {});
    try {
      localStorage.removeItem(K_LISTA_MANUAL);
    } catch {
      /* almacenamiento bloqueado */
    }
    // La lista guardada contra la MAC también se suelta: si no, la tele
    // volvería a entrar sola con ella en el siguiente sondeo
    await fetch(`/api/tv/lista?mac=${encodeURIComponent(macDelAparato())}`, { method: "DELETE" }).catch(() => {});
    window.location.reload();
  }

  function elegirDestino(destino?: Pantalla) {
    if (!destino) return;
    if (destino === "salir") {
      salir();
      return;
    }
    ir(destino);
  }

  function ir(destino: Pantalla) {
    setPantalla(destino);
    if (destino !== "portada" && destino !== "viendo") cargar(destino);
  }

  /**
   * ATRÁS deshace un paso cada vez, en el orden en que se entró:
   * vídeo → episodios → carpeta → carpetas de la sección → portada.
   */
  function atras() {
    if (pantalla === "viendo") {
      setViendo(null);
      // Vuelve a la lista de la que se salió, no a la portada
      setPantalla(filas.length ? ultimaLista.current : "portada");
      return;
    }
    if (serieAbierta) {
      setSerieAbierta("");
      // Los episodios se abrieron desde dentro de una carpeta de series
      cargar("series");
      setCarpetaAbierta("");
      return;
    }
    if (carpetaAbierta) {
      setCarpetaAbierta("");
      cargar(pantalla);
      return;
    }
    setPantalla("portada");
    setFilas([]);
  }

  const ultimaLista = useRef<Pantalla>("directo");
  useEffect(() => {
    if (pantalla === "directo" || pantalla === "cine" || pantalla === "series") ultimaLista.current = pantalla;
  }, [pantalla]);

  /* ---------- El mando ---------- */

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // En un input (el emparejado no tiene, pero por si acaso) manda el input
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;

      if (e.key === "Escape" || e.key === "Backspace" || e.key === "GoBack" || e.key === "BrowserBack") {
        e.preventDefault();
        atras();
        return;
      }
      if (pantalla === "viendo") return;

      const total = pantalla === "portada" ? 4 : filas.length;
      if (!total) return;
      /* «Seguir viendo» es el −1 de la portada: por encima de los cuatro
         accesos, que es donde lo busca quien enciende para seguir con lo suyo */
      const primero = pantalla === "portada" && ultimo ? -1 : 0;

      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        setFoco((f) => (f + 1 > total - 1 ? primero : f + 1));
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        setFoco((f) => (f - 1 < primero ? total - 1 : f - 1));
      } else if (e.key === "PageDown") {
        e.preventDefault();
        setFoco((f) => Math.min(total - 1, f + 8));
      } else if (e.key === "PageUp") {
        e.preventDefault();
        setFoco((f) => Math.max(primero, f - 8));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (pantalla === "portada") {
          if (foco === -1 && ultimo) reproducir(ultimo.source);
          else elegirDestino(DESTINOS[foco]?.id);
        } else filas[foco]?.abrir();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pantalla, filas, foco, ultimo, reproducir]);

  // La fila con el foco siempre a la vista, sin que el usuario persiga nada
  useEffect(() => {
    listaRef.current?.querySelector<HTMLElement>(`[data-i="${foco}"]`)?.scrollIntoView({ block: "center" });
  }, [foco, filas]);

  /* ---------- Pantallas ---------- */

  if (sesion === "cargando") {
    /* Presentación con la marca mientras se comprueba la sesión: una tele
       tarda un par de segundos en tener red y «Un momento…» sobre negro se
       parece demasiado a una app que no arranca */
    return (
      <div className="tv-app tv-centro">
        <div className="tv-splash">
          <span className="tv-splash-marca">{marca}</span>
          <span className="tv-splash-barra" aria-hidden="true" />
          <p className="tv-cargando">Encendiendo…</p>
        </div>
      </div>
    );
  }

  /*
   * La pantalla de inicio es la misma en la tele, en el móvil y en el
   * Firestick, y contesta de un vistazo a las tres preguntas que hace
   * cualquiera al abrir la app: qué lista tengo y hasta cuándo, cuál es mi
   * MAC (lo primero que pide el proveedor), y por dónde entro si tengo
   * usuario. Solo se salta cuando ya está activada: entonces se va directo
   * a ver la tele, que es a lo que se venía.
   */
  const caducado = caduca > 0 && caduca < Date.now();

  if (sesion === "sin-sesion" || caducado) {
    if (haciendoLogin) {
      return (
        <div className="tv-app tv-centro">
          <form className="tv-activar tv-form" onSubmit={entrarConUsuario}>
            <h1>Entrar con mi usuario</h1>
            <p className="tv-activar-paso">El usuario y la contraseña que te dio tu proveedor.</p>
            <input name="usuario" className="tv-input" placeholder="Usuario" required autoFocus autoComplete="off" />
            <input name="password" className="tv-input" type="password" placeholder="Contraseña" required autoComplete="off" />
            {error && <p className="tv-activar-error">{error}</p>}
            <div className="tv-form-fila">
              <button type="submit" className="tv-boton" disabled={entrando}>
                {entrando ? "Entrando…" : "Entrar"}
              </button>
              <button type="button" className="tv-boton tv-boton-suave" onClick={() => setHaciendoLogin(false)}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      );
    }
    if (poniendoLista) {
      return (
        <div className="tv-app tv-centro">
          <form className="tv-activar tv-form" onSubmit={guardarListaManual}>
            <h1>Poner mi lista</h1>
            <p className="tv-activar-paso">Pega tu URL M3U, o tu servidor Xtream con usuario y contraseña.</p>
            <input name="url" className="tv-input" placeholder="http://servidor.com:8080  o  http://…/get.php?…" required autoFocus />
            <div className="tv-form-fila">
              <input name="usuario" className="tv-input" placeholder="Usuario (solo Xtream)" autoComplete="off" />
              <input name="password" className="tv-input" placeholder="Contraseña (solo Xtream)" autoComplete="off" />
            </div>
            {error && <p className="tv-activar-error">{error}</p>}
            <div className="tv-form-fila">
              <button type="submit" className="tv-boton">Guardar y ver</button>
              <button type="button" className="tv-boton tv-boton-suave" onClick={() => setPoniendoLista(false)}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      );
    }
    return (
      <div className="tv-app tv-centro">
        <div className="tv-activar">
          <p className="tv-marca">{marca}</p>

          {/* Lo primero y en grande: qué tengo y hasta cuándo */}
          <div className={`tv-estado ${caducado ? "caducado" : ""}`}>
            {caducado ? (
              <>
                <h1>Tu lista ha caducado</h1>
                <p className="tv-estado-linea">
                  Venció el {new Date(caduca).toLocaleDateString("es-ES")}
                  {soporte ? ` · Renueva con ${soporte}` : ""}
                </p>
              </>
            ) : (
              <>
                <h1>Activa esta tele</h1>
                <p className="tv-estado-linea">Aún no tiene ninguna lista. Elige una de estas tres formas.</p>
              </>
            )}
          </div>

          <div className="tv-dos-caminos">
            <div className="tv-camino">
              <p className="tv-camino-t">Con tu proveedor</p>
              <p className="tv-activar-paso">Pásale esta MAC y te activará la tele:</p>
              <div className="tv-mac">{macDelAparato()}</div>
            </div>
            <div className="tv-camino">
              <p className="tv-camino-t">Tú mismo, desde el móvil</p>
              <p className="tv-activar-paso">
                Entra en <strong>{sitio()}/activar</strong> y escribe:
              </p>
              <div className="tv-codigo">{codigo || "······"}</div>
            </div>
          </div>

          {avisoCodigo ? (
            <p className="tv-activar-error">{avisoCodigo}</p>
          ) : (
            <p className="tv-activar-nota">La tele entrará sola por cualquiera de las dos vías.</p>
          )}

          {/* Y siempre a la vista, sin esconderse: entrar con usuario */}
          <div className="tv-form-fila tv-acciones">
            <button className="tv-boton" onClick={() => { setError(""); setHaciendoLogin(true); }}>
              Entrar con usuario y contraseña
            </button>
            <button className="tv-boton tv-boton-suave" onClick={() => setPoniendoLista(true)}>
              Tengo mi propia lista M3U
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pantalla === "viendo" && viendo) {
    return (
      <div className="tv-app tv-viendo">
        <VideoPlayer source={viendo.source} />
        <p className="tv-viendo-pie">Pulsa ATRÁS para volver</p>
      </div>
    );
  }

  if (pantalla === "portada") {
    return (
      <div className="tv-app tv-centro">
        <div className="tv-portada">
          <p className="tv-marca">{marca}</p>
          {sinRed && (
            <p className="tv-sinred" role="status">
              Sin conexión: estás viendo lo de la última vez. Se reintenta solo.
            </p>
          )}
          {ultimo && (
            <button
              className={`tv-seguir ${foco === -1 ? "foco" : ""}`}
              onMouseEnter={() => setFoco(-1)}
              onClick={() => reproducir(ultimo.source)}
            >
              <Icon name="play" size={28} />
              <span>
                Seguir viendo
                <b>{ultimo.nombre}</b>
              </span>
            </button>
          )}
          <div className="tv-tiles">
            {DESTINOS.map((d, i) => (
              <button
                key={d.id}
                className={`tv-tile ${foco === i ? "foco" : ""}`}
                onMouseEnter={() => setFoco(i)}
                onClick={() => elegirDestino(d.id)}
              >
                <Icon name={d.icono} size={64} />
                <span>{d.titulo}</span>
              </button>
            ))}
          </div>
          <p className="tv-pie">
            {caduca ? `Tu acceso vence el ${new Date(caduca).toLocaleDateString("es-ES")}` : "Acceso sin fecha de fin"}
            {soporte ? ` · Soporte: ${soporte}` : ""}
          </p>
          {/* La MAC siempre a la vista, como en los reproductores de siempre:
              es lo primero que le pide el proveedor cuando algo falla */}
          <p className="tv-pie tv-pie-mac">MAC: {macDelAparato()}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tv-app">
      <header className="tv-cabecera">
        <h2>{serieAbierta || carpetaAbierta || TITULOS[pantalla]}</h2>
        {(serieAbierta || carpetaAbierta) && <span className="tv-cabecera-de">{TITULOS[pantalla]}</span>}
        <span className="tv-cabecera-pista">ATRÁS para volver</span>
      </header>
      {cargando && <p className="tv-cargando">Cargando…</p>}
      {error && <p className="tv-activar-error">{error}</p>}
      <div className="tv-lista" ref={listaRef}>
        {filas.map((f, i) => (
          <button
            key={f.id}
            data-i={i}
            className={`tv-fila ${foco === i ? "foco" : ""} ${f.carpeta ? "tv-carpeta" : ""}`}
            onMouseEnter={() => setFoco(i)}
            onClick={f.abrir}
          >
            <span className="tv-fila-n">{String(i + 1).padStart(3, "0")}</span>
            {f.carpeta ? (
              <span className="tv-fila-ph"><Icon name="globe" size={20} /></span>
            ) : imgSrc(f.logo) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imgSrc(f.logo)} alt="" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
            ) : (
              <span className="tv-fila-ph">{f.nombre.trim().slice(0, 1).toUpperCase()}</span>
            )}
            <span className="tv-fila-nombre">{f.nombre}</span>
          </button>
        ))}
        {!cargando && !filas.length && !error && <p className="tv-cargando">Aquí no hay nada todavía.</p>}
      </div>
    </div>
  );
}

const TITULOS: Record<string, string> = {
  directo: "TV en directo",
  cine: "Películas",
  series: "Series",
};

const DESTINOS: { id: Pantalla; titulo: string; icono: IconName }[] = [
  { id: "directo", titulo: "TV en directo", icono: "tv" },
  { id: "cine", titulo: "Películas", icono: "film" },
  { id: "series", titulo: "Series", icono: "series" },
  { id: "salir", titulo: "Salir", icono: "power" },
];

function sitio(): string {
  if (typeof window === "undefined") return "";
  return window.location.host;
}
