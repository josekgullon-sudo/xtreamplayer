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
 * Cada intento tiene un plazo máximo. Sin él, un servidor que acepta la
 * conexión pero no envía datos deja el reproductor girando indefinidamente,
 * que es justo lo que hacen muchos proveedores cuando bloquean el navegador.
 *
 * Los intentos que tienen alternativa detrás esperan poco: alargarlos solo
 * retrasa el que sí va a funcionar. El último espera más porque, si falla,
 * ya no hay nada después.
 */
const PLAZO_INTENTO_MS = 6000;
const PLAZO_ULTIMO_INTENTO_MS = 15000;

function proxied(url: string): string {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
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
 * Orden de intentos, del más rápido al más compatible:
 *   1. Directo con el motor que corresponde a la extensión
 *   2. Para canales en directo, la variante .ts: muchos paneles Xtream sirven
 *      solo TS aunque anuncien .m3u8
 *   3. Los mismos dos, a través de nuestro proxy, para saltar el bloqueo CORS
 */
function buildAttempts(src: PlaySource): Attempt[] {
  const engine = guessEngine(src.url, src.kind);
  const clean = src.url.split("?")[0];
  const esDirecto = /\/live\//.test(src.url) && clean.endsWith(".m3u8");
  const tsUrl = esDirecto ? src.url.replace(/\.m3u8(\?.*)?$/, ".ts") : "";

  const attempts: Attempt[] = [];
  if (!bloqueadoPorContenidoMixto(src.url)) {
    attempts.push({ url: src.url, engine, label: "conexión directa", direct: true });
    if (tsUrl) attempts.push({ url: tsUrl, engine: "mpegts", label: "formato TS", direct: true });
  }
  attempts.push({ url: proxied(src.url), engine, label: "proxy de compatibilidad", direct: false });
  if (tsUrl) attempts.push({ url: proxied(tsUrl), engine: "mpegts", label: "proxy en formato TS", direct: false });
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

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;

    let cancelled = false;
    const attempts = buildAttempts(source);
    let index = 0;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    const problems: string[] = [];

    setState("loading");
    setErrorDetail("");

    function clearWatchdog() {
      if (watchdog) clearTimeout(watchdog);
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
        while (index < attempts.length && attempts[index].direct) {
          problems.push(`${attempts[index].label}: omitido (el servidor no acepta al navegador)`);
          index += 1;
        }
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
      const onPlaying = () => {
        if (cancelled) return;
        arrancado = true;
        clearWatchdog();
        setState("playing");
      };
      v.addEventListener("playing", onPlaying);

      // Si en este plazo no ha empezado a verse, pasamos al siguiente intento
      watchdog = setTimeout(
        () => {
          if (!cancelled && !arrancado) fail("sin respuesta a tiempo", true);
        },
        esUltimo ? PLAZO_ULTIMO_INTENTO_MS : PLAZO_INTENTO_MS
      );

      if (attempt.engine === "hls") {
        if (Hls.isSupported()) {
          const hls = new Hls({
            maxBufferLength: 30,
            // Empieza a pedir el primer trozo sin esperar a terminar de
            // analizar el manifiesto: es el arranque que nota el usuario.
            startFragPrefetch: true,
            /*
             * Los reintentos internos de hls.js sobran mientras quede otro
             * intento nuestro por probar: duplican la espera antes de dejar
             * paso al proxy. En el último sí interesan, porque detrás no hay
             * nada y un corte pasajero merece una segunda oportunidad.
             */
            manifestLoadingMaxRetry: esUltimo ? 2 : 0,
            levelLoadingMaxRetry: esUltimo ? 2 : 0,
            manifestLoadingTimeOut: esUltimo ? 15000 : 5000,
            levelLoadingTimeOut: esUltimo ? 15000 : 5000,
            fragLoadingTimeOut: esUltimo ? 25000 : 12000,
          });
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
            v.removeEventListener("playing", onPlaying);
            hls.destroy();
          };
        } else if (v.canPlayType("application/vnd.apple.mpegurl")) {
          // Safari/iOS: HLS nativo
          const onError = () => fail("No se pudo cargar el stream HLS", esFalloDeRed(v));
          v.addEventListener("error", onError);
          v.src = attempt.url;
          v.play().catch(() => {});
          cleanupRef.current = () => {
            v.removeEventListener("playing", onPlaying);
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
          player.on(mpegts.Events.ERROR, (tipo: string) => {
            player.destroy();
            fail("MPEG-TS: error de red o formato", tipo === mpegts.ErrorTypes.NETWORK_ERROR);
          });
          player.attachMediaElement(v);
          player.load();
          player.play()?.catch?.(() => {});
          cleanupRef.current = () => {
            v.removeEventListener("playing", onPlaying);
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
          v.removeEventListener("playing", onPlaying);
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
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigator.clipboard?.writeText(source.url)}
            style={{ pointerEvents: "auto" }}
          >
            Copiar URL del canal (para probarla en VLC)
          </button>
        </div>
      )}
    </div>
  );
}
