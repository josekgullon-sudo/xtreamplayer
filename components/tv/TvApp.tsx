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

type Pantalla = "portada" | "directo" | "cine" | "series" | "viendo";

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
  /** Qué hacer al pulsar OK: reproducir, o abrir la lista de episodios */
  abrir: () => void;
}

const K_DEVICE = "xp.tvDevice.v1";

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

  const listaRef = useRef<HTMLDivElement>(null);

  /* ---------- Sesión: o ya la hay, o se empareja con un código ---------- */

  const mirarSesion = useCallback(async () => {
    const d = await fetch("/api/customer/me").then((r) => r.json()).catch(() => ({}));
    if (!d.customer || !d.playlist) {
      setSesion("sin-sesion");
      return false;
    }
    setMarca(d.brand || "TOTALplayer");
    setCaduca(d.customer.expiresAt || 0);
    setSoporte(d.branding?.support || "");
    setLista({
      tipo: d.playlist.type,
      url: d.playlist.url,
      usuario: d.playlist.username || "",
      password: d.playlist.password || "",
    });
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

  // Mientras se enseña el código, se pregunta si ya lo han reclamado
  useEffect(() => {
    if (sesion !== "sin-sesion" || !codigo) return;
    const t = setInterval(async () => {
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
  }, []);

  const cargar = useCallback(
    async (destino: Pantalla) => {
      if (!lista) return;
      setCargando(true);
      setError("");
      setFilas([]);
      setFoco(0);
      setSerieAbierta("");
      try {
        if (lista.tipo === "m3u") {
          const texto = await fetch(`/api/proxy?url=${encodeURIComponent(lista.url)}`).then((r) => r.text());
          const canales = parseM3U(texto).channels;
          setFilas(
            canales.map((c, i) => ({
              id: `m3u-${i}`,
              nombre: c.name || `Canal ${i + 1}`,
              logo: c.logo || "",
              abrir: () => reproducir({ url: c.url, name: c.name || "", kind: "auto" }),
            }))
          );
          return;
        }
        if (!creds) return;
        if (destino === "directo") {
          const canales = (await xtreamApi<XtreamLiveStream[]>(creds, "get_live_streams")) || [];
          setFilas(
            (Array.isArray(canales) ? canales : [])
              .filter((c) => typeof c.name === "string" && c.name.trim())
              .map((c) => ({
                id: `live-${c.stream_id}`,
                nombre: c.name,
                logo: c.stream_icon || "",
                abrir: () =>
                  reproducir({ url: liveStreamUrl(creds, c.stream_id), name: c.name, kind: "hls" }),
              }))
          );
        } else if (destino === "cine") {
          const pelis = (await xtreamApi<XtreamVodStream[]>(creds, "get_vod_streams")) || [];
          setFilas(
            (Array.isArray(pelis) ? pelis : [])
              .filter((v) => typeof v.name === "string" && v.name.trim())
              .map((v) => ({
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
          const series = (await xtreamApi<XtreamSeries[]>(creds, "get_series")) || [];
          setFilas(
            (Array.isArray(series) ? series : [])
              .filter((s) => typeof s.name === "string" && s.name.trim())
              .map((s) => ({
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

  function ir(destino: Pantalla) {
    setPantalla(destino);
    if (destino !== "portada" && destino !== "viendo") cargar(destino);
  }

  function atras() {
    if (pantalla === "viendo") {
      setViendo(null);
      setPantalla(filas.length ? (serieAbierta ? "series" : pantalla) : "portada");
      // Volver del vídeo devuelve a la lista de la que se salió
      setPantalla(filas.length ? ultimaLista.current : "portada");
      return;
    }
    if (serieAbierta) {
      setSerieAbierta("");
      cargar("series");
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

      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        setFoco((f) => (f + 1) % total);
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        setFoco((f) => (f - 1 + total) % total);
      } else if (e.key === "PageDown") {
        e.preventDefault();
        setFoco((f) => Math.min(total - 1, f + 8));
      } else if (e.key === "PageUp") {
        e.preventDefault();
        setFoco((f) => Math.max(0, f - 8));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (pantalla === "portada") DESTINOS[foco]?.abrir(ir);
        else filas[foco]?.abrir();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pantalla, filas, foco]);

  // La fila con el foco siempre a la vista, sin que el usuario persiga nada
  useEffect(() => {
    listaRef.current?.querySelector<HTMLElement>(`[data-i="${foco}"]`)?.scrollIntoView({ block: "center" });
  }, [foco, filas]);

  /* ---------- Pantallas ---------- */

  if (sesion === "cargando") {
    return <div className="tv-app tv-centro"><p className="tv-cargando">Un momento…</p></div>;
  }

  if (sesion === "sin-sesion") {
    return (
      <div className="tv-app tv-centro">
        <div className="tv-activar">
          <p className="tv-marca">{marca}</p>
          <h1>Activa esta tele</h1>
          <p className="tv-activar-paso">
            1. Entra en <strong>{sitio()}/activar</strong> desde tu móvil
          </p>
          <p className="tv-activar-paso">2. Escribe este código:</p>
          <div className="tv-codigo">{codigo || "······"}</div>
          {avisoCodigo ? (
            <p className="tv-activar-error">{avisoCodigo}</p>
          ) : (
            <p className="tv-activar-nota">La tele se activará sola en cuanto lo introduzcas.</p>
          )}
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
          <div className="tv-tiles">
            {DESTINOS.map((d, i) => (
              <button
                key={d.id}
                className={`tv-tile ${foco === i ? "foco" : ""}`}
                onMouseEnter={() => setFoco(i)}
                onClick={() => d.abrir(ir)}
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
        </div>
      </div>
    );
  }

  return (
    <div className="tv-app">
      <header className="tv-cabecera">
        <h2>{serieAbierta || TITULOS[pantalla]}</h2>
        <span className="tv-cabecera-pista">ATRÁS para volver</span>
      </header>
      {cargando && <p className="tv-cargando">Cargando…</p>}
      {error && <p className="tv-activar-error">{error}</p>}
      <div className="tv-lista" ref={listaRef}>
        {filas.map((f, i) => (
          <button
            key={f.id}
            data-i={i}
            className={`tv-fila ${foco === i ? "foco" : ""}`}
            onMouseEnter={() => setFoco(i)}
            onClick={f.abrir}
          >
            <span className="tv-fila-n">{String(i + 1).padStart(3, "0")}</span>
            {imgSrc(f.logo) ? (
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

const DESTINOS: { id: Pantalla; titulo: string; icono: IconName; abrir: (ir: (p: Pantalla) => void) => void }[] = [
  { id: "directo", titulo: "TV en directo", icono: "tv", abrir: (ir) => ir("directo") },
  { id: "cine", titulo: "Películas", icono: "film", abrir: (ir) => ir("cine") },
  { id: "series", titulo: "Series", icono: "series", abrir: (ir) => ir("series") },
  { id: "portada", titulo: "Salir", icono: "power", abrir: () => (window.location.href = "/") },
];

function sitio(): string {
  if (typeof window === "undefined") return "";
  return window.location.host;
}
