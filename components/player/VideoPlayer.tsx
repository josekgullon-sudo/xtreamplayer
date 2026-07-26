"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

export interface PlaySource {
  url: string;
  name: string;
  /** Pista sobre el tipo de stream para elegir motor */
  kind: "hls" | "ts" | "video" | "auto";
}

type Attempt = {
  url: string;
  engine: "hls" | "mpegts" | "native";
  label: string;
  /** Va al servidor del proveedor sin pasar por nuestro proxy */
  direct: boolean;
};

/**
 * El plazo se mide sobre el avance, no sobre el reloj.
 *
 * Un plazo fijo obliga a elegir entre dos males: corto, y se corta un canal
 * que estaba descargando sin problemas pero despacio; largo, y un servidor
 * muerto tiene al usuario mirando una ruleta. Contando desde la última señal
 * de vida —manifiesto leído, trozo descargado, primer fotograma— no hay que
 * elegir: lo que avanza sigue, y lo que no avanza cae rápido.
 *
 * El techo existe para el caso raro del servidor que va soltando datos
 * eternamente sin llegar a reproducir nada.
 */
const SIN_AVANCE_MS = 8000;
/*
 * El intento directo espera menos: tiene al proxy esperando detrás, así que
 * cada segundo mirando a un servidor mudo es un segundo robado al camino que
 * sí va a funcionar. Este peaje además solo se paga una vez por servidor,
 * gracias a la memoria de sesión.
 */
const SIN_AVANCE_DIRECTO_MS = 5000;
/* El último intento espera más sin señales: si falla, ya no hay nada detrás,
   y un VOD pesado puede tardar en soltar el primer byte. */
const SIN_AVANCE_ULTIMO_MS = 15000;
const TECHO_INTENTO_MS = 40000;

function proxied(url: string): string {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

/**
 * Memoria por servidor: si un servidor ya rechazó la conexión directa una
 * vez, la rechazará siempre — es un filtro suyo, no mala suerte. Sin esta
 * memoria, cada zapping volvía a pagar el descubrimiento entero (hasta 8 s
 * mirando a un servidor mudo) antes de caer al proxy que sí funciona. Con
 * ella, solo el primer canal de la sesión paga ese peaje; los demás van
 * directos al camino bueno.
 *
 * Va en sessionStorage para sobrevivir a recargas de página, pero no se
 * guarda para siempre: el proveedor puede cambiar de configuración.
 */
const K_SIN_DIRECTO = "xp.sinDirecto.v1";

function leerSinDirecto(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(K_SIN_DIRECTO) || "[]"));
  } catch {
    return new Set();
  }
}

function marcarSinDirecto(url: string) {
  try {
    const origen = new URL(url, window.location.href).origin;
    const set = leerSinDirecto();
    set.add(origen);
    sessionStorage.setItem(K_SIN_DIRECTO, JSON.stringify([...set]));
  } catch {
    /* URL rara: sin memoria, pero sin romper */
  }
}

function origenSinDirecto(url: string): boolean {
  try {
    return leerSinDirecto().has(new URL(url, window.location.href).origin);
  } catch {
    return false;
  }
}

/**
 * Una página servida por HTTPS no puede cargar un stream por HTTP: el
 * navegador lo bloquea siempre, sin excepción. Como la mayoría de paneles
 * IPTV solo hablan HTTP, intentar la conexión directa en producción es
 * tiempo tirado — mejor ir derechos al proxy.
 */
function bloqueadoPorContenidoMixto(url: string): boolean {
  if (typeof window === "undefined") return false;
  return window.location.protocol === "https:" && url.startsWith("http://");
}

/**
 * Un bloqueo CORS o una conexión rechazada llegan al elemento <video> como
 * MEDIA_ERR_NETWORK o como MEDIA_ERR_SRC_NOT_SUPPORTED (el navegador no llega
 * a leer nada, así que dice que no reconoce el formato). Ambos significan lo
 * mismo para nosotros: contra ese servidor, directo, no hay nada que hacer.
 */
function esFalloDeRed(v: HTMLVideoElement): boolean {
  const code = v.error?.code;
  return code === 2 || code === 4;
}

function guessEngine(url: string, kind: PlaySource["kind"]): "hls" | "mpegts" | "native" {
  if (kind === "hls") return "hls";
  if (kind === "ts") return "mpegts";
  if (kind === "video") return "native";
  const clean = url.split("?")[0].toLowerCase();
  if (clean.endsWith(".m3u8") || clean.includes("/hls/")) return "hls";
  if (clean.endsWith(".ts")) return "mpegts";
  return "native";
}

/**
 * Orden de intentos, del más probable al más rebuscado:
 *   1. Directo: cuando funciona es lo más rápido y no gasta ancho de banda nuestro
 *   2. El proxy con el mismo formato: es lo que arregla el caso habitual, un
 *      servidor que no manda cabeceras CORS o que filtra por User-Agent
 *   3. El proxy en TS y, ya como último recurso, el TS directo: algunos paneles
 *      sirven solo TS aunque anuncien .m3u8
 *
 * El TS directo va al final justo porque, si el servidor ya ha rechazado al
 * navegador una vez, va a rechazarlo también aquí.
 */
function buildAttempts(src: PlaySource): Attempt[] {
  const engine = guessEngine(src.url, src.kind);
  const clean = src.url.split("?")[0];
  const esDirecto = /\/live\//.test(src.url) && clean.endsWith(".m3u8");
  const tsUrl = esDirecto ? src.url.replace(/\.m3u8(\?.*)?$/, ".ts") : "";
  const mixto = bloqueadoPorContenidoMixto(src.url);

  // Sin directo cuando el navegador lo bloquearía (HTTPS→HTTP) o cuando este
  // servidor ya nos rechazó antes en esta sesión
  const sinDirecto = mixto || origenSinDirecto(src.url);

  const attempts: Attempt[] = [];
  if (!sinDirecto) attempts.push({ url: src.url, engine, label: "conexión directa", direct: true });
  attempts.push({ url: proxied(src.url), engine, label: "proxy de compatibilidad", direct: false });
  if (tsUrl) {
    attempts.push({ url: proxied(tsUrl), engine: "mpegts", label: "proxy en formato TS", direct: false });
    if (!sinDirecto) attempts.push({ url: tsUrl, engine: "mpegts", label: "formato TS directo", direct: true });
  }
  /*
   * Último recurso para películas y series: el conversor del servidor, que
   * reenvuelve el fichero como MP4 al vuelo. Es lo que hace que un MKV se
   * vea en un iPhone. Va el último porque gasta CPU nuestra; si el fichero
   * ya era compatible, nunca se llega aquí.
   */
  if (engine === "native") {
    attempts.push({ url: `/api/remux?url=${encodeURIComponent(src.url)}`, engine: "native", label: "conversor de formato", direct: false });
  }
  return attempts;
}

export default function VideoPlayer({
  source,
  onEnded,
}: {
  source: PlaySource | null;
  onEnded?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [errorDetail, setErrorDetail] = useState<string>("");
  const [progress, setProgress] = useState<{ step: number; total: number; label: string } | null>(null);
  const [diag, setDiag] = useState<string | null>(null);
  const [diagnosticando, setDiagnosticando] = useState(false);

  /**
   * Pregunta al servidor qué le respondió el proveedor y lo traduce a un
   * veredicto en cristiano. Distingue los dos fallos que por fuera se ven
   * iguales: proveedor que bloquea IPs de servidores, y formato que este
   * navegador no sabe decodificar.
   */
  async function diagnosticar() {
    if (!source) return;
    setDiagnosticando(true);
    setDiag(null);
    try {
      const res = await fetch(`/api/diag?url=${encodeURIComponent(source.url)}`);
      const d = await res.json();
      const ext = (source.url.split("?")[0].match(/\.([a-z0-9]{2,4})$/i)?.[1] || "").toLowerCase();
      const esAppleSinSoporte = ["mkv", "avi", "wmv", "flv"].includes(ext);
      if (d.ok && d.bytes > 0) {
        setDiag(
          esAppleSinSoporte
            ? `El proveedor entrega el vídeo sin problema, pero es un fichero .${ext} y ni este navegador ni el conversor han podido con su contenido. Suele ser el códec interno (p. ej. vídeo HEVC en un navegador sin soporte). Prueba desde otro dispositivo.`
            : "El proveedor entrega datos al servidor sin problema. El fallo está en la decodificación en este dispositivo: prueba desde otro navegador o dispositivo."
        );
      } else if (d.timeout || d.status === 0) {
        setDiag(
          "Tu proveedor no responde a nuestro servidor (sí respondería a tu casa). Suele significar que bloquea las IPs de centros de datos: pídele que permita el acceso desde servidores, o desde la IP de este servicio."
        );
      } else {
        setDiag(
          `Tu proveedor respondió ${d.status} al servidor: rechaza la conexión (bloqueo de IPs de servidores, o suscripción sin conexiones libres).`
        );
      }
    } catch {
      setDiag("No se pudo completar el diagnóstico. Inténtalo de nuevo.");
    } finally {
      setDiagnosticando(false);
    }
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;

    let cancelled = false;
    const attempts = buildAttempts(source);
    let index = 0;
    let watchdog: ReturnType<typeof setInterval> | null = null;
    /** El servidor ya ha rechazado al navegador: no vale la pena volver a él */
    let directoDescartado = false;
    const problems: string[] = [];

    setState("loading");
    setErrorDetail("");
    setDiag(null);

    function clearWatchdog() {
      if (watchdog) clearInterval(watchdog);
      watchdog = null;
    }

    function destroyEngine() {
      clearWatchdog();
      cleanupRef.current?.();
      cleanupRef.current = null;
    }

    /**
     * @param redCaida el fallo fue de red (CORS, conexión rechazada, servidor
     *   caído), no de formato. Distinguirlo importa: si el servidor no deja
     *   entrar al navegador, los demás intentos directos contra ese mismo
     *   servidor van a fallar igual, y probarlos uno a uno gasta un plazo de
     *   espera entero por cada uno antes de llegar al proxy, que es el que
     *   sí funciona.
     */
    function fail(detail: string, redCaida = false) {
      if (cancelled) return;
      clearWatchdog();
      const actual = attempts[index];
      problems.push(`${actual?.label ?? "intento"}: ${detail}`);
      index += 1;

      if (redCaida && actual?.direct) {
        directoDescartado = true;
        // Y se recuerda para toda la sesión: el próximo canal de este mismo
        // servidor irá al proxy sin pagar otra vez el descubrimiento
        marcarSinDirecto(actual.url);
      }
      // Se descartan todos los intentos directos que queden, estén donde estén
      // en la lista: si el servidor no acepta al navegador, no lo va a aceptar
      // por cambiarle la extensión al fichero.
      while (index < attempts.length && directoDescartado && attempts[index].direct) {
        problems.push(`${attempts[index].label}: omitido (el servidor no acepta al navegador)`);
        index += 1;
      }

      if (index < attempts.length) {
        start();
      } else {
        destroyEngine();
        setErrorDetail(problems.join(" · "));
        setState("error");
      }
    }

    async function start() {
      if (cancelled) return;
      destroyEngine();
      const attempt = attempts[index];
      const v = videoRef.current;
      if (!v) return;

      const esUltimo = index === attempts.length - 1;
      setProgress({ step: index + 1, total: attempts.length, label: attempt.label });

      /*
       * Hay que mirar si ha empezado a verse de verdad, no el currentTime: en
       * directo, hls.js coloca el cursor en el borde de emisión en cuanto lee
       * el manifiesto, así que currentTime deja de ser 0 aunque no llegue ni
       * un fotograma. Con esa comprobación el plazo nunca saltaba y el
       * reproductor se quedaba girando.
       */
      let arrancado = false;
      const inicio = Date.now();
      let ultimoAvance = inicio;
      const avanza = () => {
        ultimoAvance = Date.now();
      };

      const onPlaying = () => {
        if (cancelled) return;
        arrancado = true;
        clearWatchdog();
        setState("playing");
      };
      v.addEventListener("playing", onPlaying);
      // Cualquier señal de que están llegando datos cuenta como avance
      const EVENTOS_AVANCE = ["loadedmetadata", "loadeddata", "progress", "canplay"];
      for (const evt of EVENTOS_AVANCE) v.addEventListener(evt, avanza);
      const soltarEventos = () => {
        v.removeEventListener("playing", onPlaying);
        for (const evt of EVENTOS_AVANCE) v.removeEventListener(evt, avanza);
      };

      const sinAvanceMax = esUltimo ? SIN_AVANCE_ULTIMO_MS : attempt.direct ? SIN_AVANCE_DIRECTO_MS : SIN_AVANCE_MS;
      watchdog = setInterval(() => {
        if (cancelled || arrancado) return;
        const ahora = Date.now();
        if (ahora - ultimoAvance > sinAvanceMax) {
          fail("el servidor dejó de responder", true);
        } else if (ahora - inicio > TECHO_INTENTO_MS) {
          fail("tarda demasiado en arrancar");
        }
      }, 1000);

      if (attempt.engine === "hls") {
        if (Hls.isSupported()) {
          const hls = new Hls({
            maxBufferLength: 30,
            /*
             * Los reintentos internos de hls.js sobran mientras quede otro
             * intento nuestro por probar: duplican la espera antes de dejar
             * paso al proxy. En el último sí interesan, porque detrás no hay
             * nada y un corte pasajero merece una segunda oportunidad.
             */
            manifestLoadingMaxRetry: esUltimo ? 2 : 0,
            levelLoadingMaxRetry: esUltimo ? 2 : 0,
            manifestLoadingTimeOut: 12000,
            levelLoadingTimeOut: 12000,
            fragLoadingTimeOut: 25000,
          });
          // El manifiesto y cada trozo que llega son señales de vida
          for (const evt of [
            Hls.Events.MANIFEST_LOADED,
            Hls.Events.MANIFEST_PARSED,
            Hls.Events.LEVEL_LOADED,
            Hls.Events.FRAG_LOADED,
            Hls.Events.FRAG_BUFFERED,
          ]) {
            hls.on(evt, avanza);
          }
          hls.on(Hls.Events.ERROR, (_evt, data) => {
            if (data.fatal) {
              hls.destroy();
              fail(`HLS: ${data.details}`, data.type === Hls.ErrorTypes.NETWORK_ERROR);
            }
          });
          hls.loadSource(attempt.url);
          hls.attachMedia(v);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            v.play().catch(() => {});
          });
          cleanupRef.current = () => {
            soltarEventos();
            hls.destroy();
          };
        } else if (v.canPlayType("application/vnd.apple.mpegurl")) {
          // Safari/iOS: HLS nativo
          const onError = () => fail("No se pudo cargar el stream HLS", esFalloDeRed(v));
          v.addEventListener("error", onError);
          v.src = attempt.url;
          v.play().catch(() => {});
          cleanupRef.current = () => {
            soltarEventos();
            v.removeEventListener("error", onError);
            v.removeAttribute("src");
            v.load();
          };
        } else {
          fail("Este navegador no soporta HLS");
        }
      } else if (attempt.engine === "mpegts") {
        try {
          const mpegts = (await import("mpegts.js")).default;
          if (!mpegts.isSupported()) {
            fail("Este navegador no soporta MPEG-TS");
            return;
          }
          const player = mpegts.createPlayer({
            type: "mpegts",
            isLive: true,
            url: attempt.url,
          });
          player.on(mpegts.Events.MEDIA_INFO, avanza);
          player.on(mpegts.Events.STATISTICS_INFO, avanza);
          player.on(mpegts.Events.ERROR, (tipo: string) => {
            player.destroy();
            fail("MPEG-TS: error de red o formato", tipo === mpegts.ErrorTypes.NETWORK_ERROR);
          });
          player.attachMediaElement(v);
          player.load();
          player.play()?.catch?.(() => {});
          cleanupRef.current = () => {
            soltarEventos();
            try {
              player.destroy();
            } catch {
              /* ya destruido */
            }
          };
        } catch {
          fail("No se pudo iniciar el motor MPEG-TS");
        }
      } else {
        const onError = () =>
          fail("El navegador no pudo reproducir este vídeo (¿códec no soportado?)", esFalloDeRed(v));
        v.addEventListener("error", onError);
        v.src = attempt.url;
        v.play().catch(() => {});
        cleanupRef.current = () => {
          soltarEventos();
          v.removeEventListener("error", onError);
          v.removeAttribute("src");
          v.load();
        };
      }
    }

    start();

    return () => {
      cancelled = true;
      destroyEngine();
    };
  }, [source]);

  return (
    <div className="pa-video-zone">
      <video
        ref={videoRef}
        controls
        playsInline
        onEnded={onEnded}
        aria-label={source ? `Reproduciendo ${source.name}` : "Reproductor de vídeo"}
      />
      {!source && (
        <div className="pa-video-overlay">
          <h2>Elige algo para reproducir</h2>
          <p>Selecciona un canal, película o serie de la lista para empezar a verlo aquí.</p>
        </div>
      )}
      {source && state === "loading" && (
        <div className="pa-video-overlay" style={{ pointerEvents: "none" }}>
          <div className="pa-spinner" />
          <p>Conectando con {source.name}…</p>
          {progress && progress.total > 1 && (
            <p style={{ fontSize: 13, color: "var(--text-faint)" }}>
              Probando {progress.label} ({progress.step} de {progress.total})
            </p>
          )}
        </div>
      )}
      {source && state === "error" && (
        <div className="pa-video-overlay">
          <h2>No se pudo reproducir</h2>
          <p>
            Probamos conexión directa y nuestro motor de compatibilidad sin éxito. Suele deberse a: suscripción
            caducada, límite de conexiones alcanzado, canal caído o proveedor que bloquea la reproducción web.
          </p>
          <p style={{ fontSize: 12.5, color: "var(--text-faint)", maxWidth: 560 }}>
            Intentos realizados — {errorDetail}
          </p>
          {diag && (
            <p style={{ fontSize: 13.5, maxWidth: 560, color: "var(--warning)", pointerEvents: "auto" }} role="status">
              {diag}
            </p>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", pointerEvents: "auto" }}>
            <button className="btn btn-primary btn-sm" onClick={diagnosticar} disabled={diagnosticando}>
              {diagnosticando ? "Diagnosticando…" : "Diagnosticar conexión"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(source.url)}>
              Copiar URL (para VLC)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
