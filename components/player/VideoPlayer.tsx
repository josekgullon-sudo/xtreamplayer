"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

export interface PlaySource {
  url: string;
  name: string;
  /** Pista sobre el tipo de stream para elegir motor */
  kind: "hls" | "ts" | "video" | "auto";
}

type Attempt = { url: string; engine: "hls" | "mpegts" | "native" };

function proxied(url: string): string {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
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
 * Cadena de reintentos: directo → mismo motor vía proxy → (para HLS en vivo)
 * variante .ts con mpegts vía proxy. Reduce al mínimo las "pantallas negras" por CORS.
 */
function buildAttempts(src: PlaySource): Attempt[] {
  const engine = guessEngine(src.url, src.kind);
  const attempts: Attempt[] = [
    { url: src.url, engine },
    { url: proxied(src.url), engine },
  ];
  const clean = src.url.split("?")[0];
  if (engine === "hls" && /\/live\//.test(src.url) && clean.endsWith(".m3u8")) {
    attempts.push({ url: proxied(src.url.replace(/\.m3u8(\?.*)?$/, ".ts")), engine: "mpegts" });
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

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;

    let cancelled = false;
    const attempts = buildAttempts(source);
    let index = 0;

    setState("loading");
    setErrorDetail("");

    function destroyEngine() {
      cleanupRef.current?.();
      cleanupRef.current = null;
    }

    function fail(detail: string) {
      if (cancelled) return;
      index += 1;
      if (index < attempts.length) {
        start();
      } else {
        destroyEngine();
        setErrorDetail(detail);
        setState("error");
      }
    }

    async function start() {
      if (cancelled) return;
      destroyEngine();
      const attempt = attempts[index];
      const v = videoRef.current;
      if (!v) return;

      const onPlaying = () => !cancelled && setState("playing");
      v.addEventListener("playing", onPlaying);

      if (attempt.engine === "hls") {
        if (Hls.isSupported()) {
          const hls = new Hls({
            maxBufferLength: 30,
            manifestLoadingTimeOut: 15000,
            levelLoadingTimeOut: 15000,
            fragLoadingTimeOut: 25000,
          });
          hls.on(Hls.Events.ERROR, (_evt, data) => {
            if (data.fatal) {
              hls.destroy();
              fail(`HLS: ${data.details}`);
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
          const onError = () => fail("No se pudo cargar el stream HLS");
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
          player.on(mpegts.Events.ERROR, () => {
            player.destroy();
            fail("MPEG-TS: error de red o formato");
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
        const onError = () => fail("El navegador no pudo reproducir este vídeo (¿códec no soportado?)");
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
        </div>
      )}
      {source && state === "error" && (
        <div className="pa-video-overlay">
          <h2>No se pudo reproducir</h2>
          <p>
            Probamos conexión directa y nuestro motor de compatibilidad sin éxito. Suele deberse a: suscripción
            caducada, límite de conexiones alcanzado, canal caído o proveedor que bloquea la reproducción web.
          </p>
          <p style={{ fontSize: 12.5, color: "var(--text-faint)" }}>Detalle técnico: {errorDetail}</p>
        </div>
      )}
    </div>
  );
}
