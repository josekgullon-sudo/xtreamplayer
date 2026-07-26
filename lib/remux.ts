import { spawn, ChildProcess } from "child_process";
import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const PLAYER_UA = "VLC/3.0.20 LibVLC/3.0.20";

/**
 * Sesiones del conversor de compatibilidad (MKV/AVI → HLS al vuelo).
 *
 * La primera versión devolvía un MP4 en flujo continuo y funcionaba en
 * Chrome… pero no en iPhone: Safari se niega a reproducir vídeo progresivo
 * sin longitud conocida ni soporte de rangos. HLS es su formato nativo de
 * streaming —lista de segmentos que crece mientras ffmpeg convierte— y
 * además regala lo que el flujo continuo no podía: saltar a mitad de
 * película dentro de lo ya convertido.
 *
 * ffmpeg copia la pista de vídeo tal cual (CPU casi nula) y recomprime solo
 * el audio a AAC (los MKV suelen traer AC3/DTS, que ningún navegador
 * reproduce). Segmentos fMP4: valen para H.264, HEVC y VP9 por igual.
 */

interface Sesion {
  id: string;
  dir: string;
  proc: ChildProcess | null;
  ultimoUso: number;
}

const RAIZ = path.join(os.tmpdir(), "tp-remux");
const MAX_SIMULTANEAS = 4;
const INACTIVIDAD_MS = 10 * 60_000;

// Sobrevive a los recargados en desarrollo sin duplicar el temporizador
const g = globalThis as unknown as { __tpRemux?: { sesiones: Map<string, Sesion>; timer: NodeJS.Timeout } };
if (!g.__tpRemux) {
  const sesiones = new Map<string, Sesion>();
  const timer = setInterval(() => {
    const ahora = Date.now();
    for (const [id, s] of sesiones) {
      if (ahora - s.ultimoUso > INACTIVIDAD_MS) {
        try {
          s.proc?.kill("SIGKILL");
        } catch { /* ya muerto */ }
        fs.rm(s.dir, { recursive: true, force: true }, () => {});
        sesiones.delete(id);
      }
    }
  }, 60_000);
  timer.unref?.();
  g.__tpRemux = { sesiones, timer };
}
const sesiones = g.__tpRemux.sesiones;

function conversionesVivas(): number {
  let n = 0;
  for (const s of sesiones.values()) if (s.proc && s.proc.exitCode === null) n += 1;
  return n;
}

/** El playlist está listo cuando ya referencia al menos un segmento. */
async function esperarPlaylist(dir: string, maxMs: number): Promise<boolean> {
  const playlist = path.join(dir, "index.m3u8");
  const limite = Date.now() + maxMs;
  while (Date.now() < limite) {
    try {
      const texto = fs.readFileSync(playlist, "utf8");
      if (texto.includes(".m4s")) return true;
    } catch { /* aún no existe */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

export async function obtenerSesionRemux(url: string): Promise<{ id: string } | { error: string; status: number }> {
  const id = createHash("sha1").update(url).digest("hex").slice(0, 16);
  const dir = path.join(RAIZ, id);

  // Dos espectadores del mismo fichero comparten conversión
  const previa = sesiones.get(id);
  if (previa) {
    previa.ultimoUso = Date.now();
    if (fs.existsSync(path.join(dir, "index.m3u8")) || (previa.proc && previa.proc.exitCode === null)) {
      const lista = await esperarPlaylist(dir, 14000);
      return lista ? { id } : { error: "La conversión no arranca. Prueba de nuevo.", status: 502 };
    }
    sesiones.delete(id);
  }

  if (conversionesVivas() >= MAX_SIMULTANEAS) {
    return { error: "El conversor está al máximo de uso. Prueba en unos segundos.", status: 503 };
  }

  fs.mkdirSync(dir, { recursive: true });
  const proc = spawn(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel", "error",
      "-user_agent", PLAYER_UA,
      "-i", url,
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "160k",
      "-ac", "2",
      "-f", "hls",
      "-hls_time", "4",
      "-hls_list_size", "0",
      "-hls_playlist_type", "event",
      "-hls_segment_type", "fmp4",
      "-hls_fmp4_init_filename", "init.mp4",
      "-hls_segment_filename", path.join(dir, "seg%05d.m4s"),
      path.join(dir, "index.m3u8"),
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
  proc.stderr?.on("data", () => {}); // drenar

  const sesion: Sesion = { id, dir, proc, ultimoUso: Date.now() };
  sesiones.set(id, sesion);
  proc.on("close", () => {
    // Los ficheros se quedan: el playlist terminado sigue sirviendo (y hasta
    // permite verlo entero con salto libre). La limpieza va por inactividad.
    sesion.proc = null;
  });

  const lista = await esperarPlaylist(dir, 14000);
  if (!lista) {
    proc.kill("SIGKILL");
    fs.rm(dir, { recursive: true, force: true }, () => {});
    sesiones.delete(id);
    return { error: "La conversión no arranca: el fichero no llega o su formato no se puede reenvolver.", status: 502 };
  }
  return { id };
}

/** Resuelve un fichero de la sesión, sin dejar escapar rutas fuera de ella. */
export function ficheroDeSesion(id: string, nombre: string): { ruta: string; tipo: string } | null {
  if (!/^[a-f0-9]{16}$/.test(id) || !/^[\w.-]+$/.test(nombre)) return null;
  const ext = path.extname(nombre).toLowerCase();
  const tipo =
    ext === ".m3u8" ? "application/vnd.apple.mpegurl" : ext === ".m4s" || ext === ".mp4" ? "video/mp4" : "";
  if (!tipo) return null;

  const sesion = sesiones.get(id);
  if (sesion) sesion.ultimoUso = Date.now();

  const ruta = path.join(RAIZ, id, nombre);
  if (!fs.existsSync(ruta)) return null;
  return { ruta, tipo };
}
