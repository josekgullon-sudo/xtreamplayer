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
  /** Cola del stderr de ffmpeg: si algo falla, aquí está el porqué */
  salida: string;
  fallo: string;
  /** Códec de vídeo detectado y qué se hizo con él (para el diagnóstico) */
  codec: string;
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

/**
 * Lee códec, perfil y etiqueta del init.mp4 recién producido. Es un fichero
 * local: la respuesta es instantánea y no depende de que el proveedor
 * conteste a un segundo sondeo (el sondeo remoto fallaba con proveedores
 * lentos y dejaba el códec «desconocido» — y el HEVC sin su etiqueta).
 */
async function codecDelInit(dir: string): Promise<{ codec: string; perfil: string; tag: string }> {
  return new Promise((resolve) => {
    const p = spawn(
      "ffprobe",
      [
        "-v", "error",
        "-select_streams", "v:0",
        // ffprobe imprime en su orden canónico: codec_name, profile, tag
        "-show_entries", "stream=codec_name,profile,codec_tag_string",
        "-of", "csv=p=0",
        path.join(dir, "init.mp4"),
      ],
      { stdio: ["ignore", "pipe", "ignore"] }
    );
    let out = "";
    const t = setTimeout(() => {
      p.kill("SIGKILL");
      resolve({ codec: "", perfil: "", tag: "" });
    }, 5000);
    p.stdout?.on("data", (c: Buffer) => (out += c.toString()));
    p.on("close", () => {
      clearTimeout(t);
      const [codec = "", perfil = "", tag = ""] = out.trim().split("\n")[0]?.split(",") || [];
      resolve({ codec: codec.trim(), perfil: perfil.trim(), tag: tag.trim() });
    });
    p.on("error", () => {
      clearTimeout(t);
      resolve({ codec: "", perfil: "", tag: "" });
    });
  });
}

function playlistListo(dir: string): boolean {
  try {
    return fs.readFileSync(path.join(dir, "index.m3u8"), "utf8").includes(".m4s");
  } catch {
    return false;
  }
}

/**
 * Espera a que el playlist referencie al menos un segmento, o a que ffmpeg
 * muera sin conseguirlo — en ese caso no tiene sentido agotar el plazo.
 */
async function esperarPlaylist(dir: string, maxMs: number, sesion?: Sesion): Promise<boolean> {
  const limite = Date.now() + maxMs;
  while (Date.now() < limite) {
    if (playlistListo(dir)) return true;
    if (sesion && (!sesion.proc || sesion.proc.exitCode !== null)) {
      // ffmpeg ya terminó: o dejó el playlist hecho, o falló y está el porqué
      return playlistListo(dir);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return playlistListo(dir);
}

/**
 * Para la ruta del playlist: espera a que la conversión de una sesión tenga
 * su primer segmento. Es ahí donde se puede esperar sin peligro — los
 * reproductores de vídeo aguantan un manifiesto lento; una petición fetch
 * colgada 20 s sin cabeceras, en cambio, la corta cualquier intermediario.
 */
export async function esperarSesionLista(
  id: string,
  maxMs: number
): Promise<{ ok: boolean; enMarcha: boolean; detalle: string; codec: string }> {
  const dir = path.join(RAIZ, id);
  const sesion = sesiones.get(id);
  if (sesion) sesion.ultimoUso = Date.now();
  // Sin sesión ni ficheros no hay nada que esperar (reinicio o caducidad)
  if (!sesion && !playlistListo(dir)) {
    return { ok: false, enMarcha: false, detalle: "la sesión de conversión ya no existe: vuelve a darle al play", codec: "" };
  }
  /*
   * «Lista» exige playlist con segmentos Y códec ya identificado: si el
   * vigilante aún está mirando el init, puede estar a punto de tirar esta
   * conversión y relanzarla corregida — darla por buena sería servirle al
   * iPhone justo la versión que va a rechazar. Si el plazo se agota con el
   * playlist hecho, se abre la mano para no bloquear a nadie.
   */
  const fin = Date.now() + maxMs;
  let ok = false;
  for (;;) {
    const s2 = sesiones.get(id);
    if (playlistListo(dir) && (!s2 || s2.codec !== "detectando")) {
      ok = true;
      break;
    }
    if (s2 && (!s2.proc || s2.proc.exitCode !== null) && !playlistListo(dir)) break; // murió sin playlist
    if (Date.now() > fin) {
      ok = playlistListo(dir);
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  const codec = sesiones.get(id)?.codec || "";
  if (ok) return { ok: true, enMarcha: false, detalle: "", codec };
  const s = sesiones.get(id);
  const enMarcha = Boolean(s && s.proc && s.proc.exitCode === null);
  return {
    ok: false,
    enMarcha,
    codec,
    detalle: enMarcha
      ? "la conversión sigue en marcha"
      : s
        ? s.fallo || s.salida.trim() || "ffmpeg terminó sin producir vídeo ni explicar por qué"
        : "sesión desaparecida",
  };
}

/** Lanza (o relanza) el ffmpeg de una sesión con los args de vídeo dados. */
function arrancarFfmpeg(sesion: Sesion, url: string, videoArgs: string[]) {
  const proc = spawn(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel", "error",
      "-nostdin",
      "-user_agent", PLAYER_UA,
      "-i", url,
      /*
       * Selección explícita de pistas: 0:V salta las carátulas incrustadas
       * (attached_pic), el ? hace opcional el audio, y fuera subtítulos,
       * datos y capítulos — nada de eso cabe en HLS y cualquiera puede
       * tumbar la conversión con contenido real.
       */
      "-map", "0:V:0",
      "-map", "0:a:0?",
      "-sn",
      "-dn",
      "-map_chapters", "-1",
      ...videoArgs,
      "-c:a", "aac",
      "-b:a", "160k",
      "-ac", "2",
      "-f", "hls",
      "-hls_time", "4",
      "-hls_list_size", "0",
      "-hls_playlist_type", "event",
      "-hls_segment_type", "fmp4",
      "-hls_fmp4_init_filename", "init.mp4",
      "-hls_segment_filename", path.join(sesion.dir, "seg%05d.m4s"),
      path.join(sesion.dir, "index.m3u8"),
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
  sesion.proc = proc;
  proc.stderr?.on("data", (chunk: Buffer) => {
    sesion.salida = (sesion.salida + chunk.toString()).slice(-600);
  });
  proc.on("error", (e) => {
    // spawn falló: normalmente ffmpeg no está instalado en la imagen
    sesion.fallo = `No se pudo lanzar ffmpeg: ${e.message}`;
  });
  proc.on("close", () => {
    // Los ficheros se quedan: el playlist terminado sigue sirviendo (y hasta
    // permite verlo entero con salto libre). La limpieza va por inactividad.
    // El guardia evita que el cierre de un ffmpeg sustituido borre al nuevo.
    if (sesion.proc === proc) sesion.proc = null;
  });
}

/**
 * Mira el códec real en cuanto existe el init.mp4 y corrige si hace falta:
 *  - HEVC etiquetado hev1 → relanzar con -tag:v hvc1 (Safari solo acepta esa)
 *  - H.264 de 10 bits, MPEG-4, VC-1… → recodificar a H.264 de 8 bits
 *  - Lo demás (H.264 normal, VP9/AV1) → se queda como está
 */
async function vigilarCodec(sesion: Sesion, url: string) {
  const init = path.join(sesion.dir, "init.mp4");
  const limite = Date.now() + 120000;
  while (!fs.existsSync(init)) {
    if (Date.now() > limite) return;
    if (!sesion.proc || sesion.proc.exitCode !== null) return; // murió: no hay nada que corregir
    await new Promise((r) => setTimeout(r, 300));
  }

  // El init puede estar a medio escribir en la primera mirada: reintentos
  let v = await codecDelInit(sesion.dir);
  for (let i = 0; i < 5 && !v.codec; i++) {
    await new Promise((r) => setTimeout(r, 500));
    v = await codecDelInit(sesion.dir);
  }
  const diezBits = /10/.test(v.perfil);
  const etiqueta = `${v.codec}${v.perfil ? ` ${v.perfil}` : ""}`;
  let argsCorregidos: string[] | null = null;
  if (v.codec === "hevc" && v.tag !== "hvc1") {
    argsCorregidos = ["-c:v", "copy", "-tag:v", "hvc1"];
    sesion.codec = `${etiqueta} (reetiquetado hvc1)`;
  } else if ((v.codec === "h264" && diezBits) || ["mpeg4", "msmpeg4v3", "vc1", "wmv3", "mpeg2video"].includes(v.codec)) {
    argsCorregidos = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p"];
    sesion.codec = `${etiqueta} → recodificado a H.264`;
  } else {
    sesion.codec = etiqueta || "desconocido";
    return;
  }

  console.error("[remux] códec corregido:", url, "→", sesion.codec);
  // Sin await entre matar y relanzar: nadie puede observar la sesión «muerta»
  const viejo = sesion.proc;
  try {
    viejo?.kill("SIGKILL");
  } catch { /* ya muerto */ }
  fs.rmSync(sesion.dir, { recursive: true, force: true });
  fs.mkdirSync(sesion.dir, { recursive: true });
  sesion.salida = "";
  sesion.fallo = "";
  arrancarFfmpeg(sesion, url, argsCorregidos);
}

export async function obtenerSesionRemux(
  url: string
): Promise<{ id: string } | { error: string; detalle?: string; status: number }> {
  const id = createHash("sha1").update(url).digest("hex").slice(0, 16);
  const dir = path.join(RAIZ, id);

  // Dos espectadores del mismo fichero comparten conversión
  const previa = sesiones.get(id);
  if (previa) {
    previa.ultimoUso = Date.now();
    if (playlistListo(dir) || (previa.proc && previa.proc.exitCode === null)) {
      // Lista o en marcha: se responde ya; la espera fina la hace el playlist
      return { id };
    }
    // Murió sin producir nada: se limpia y se intenta de cero
    sesiones.delete(id);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  if (conversionesVivas() >= MAX_SIMULTANEAS) {
    return { error: "El conversor está al máximo de uso. Prueba en unos segundos.", status: 503 };
  }

  // Sesión nueva, directorio limpio: restos de una conversión anterior (por
  // ejemplo tras un reinicio del servidor) mezclan ficheros de dos ffmpeg
  // distintos y confunden al vigilante de códec
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  /*
   * Se arranca copiando el vídeo tal cual — el caso bueno (H.264) no paga
   * ningún peaje ni segunda conexión al proveedor. En cuanto ffmpeg escribe
   * el init.mp4, un vigilante mira el códec real en local y, si Safari lo
   * va a rechazar (HEVC etiquetado hev1, H.264 de 10 bits, códecs viejos),
   * reinicia la conversión corregida. Eso pasa antes del primer segmento,
   * así que ningún espectador llega a ver la versión mala.
   */
  const sesion: Sesion = { id, dir, proc: null, ultimoUso: Date.now(), salida: "", fallo: "", codec: "detectando" };
  sesiones.set(id, sesion);
  arrancarFfmpeg(sesion, url, ["-c:v", "copy"]);
  vigilarCodec(sesion, url).catch((e) => console.error("[remux] vigilante de códec:", e));

  /*
   * Espera corta, solo para cazar los fallos inmediatos (URL mala, códec
   * imposible, ffmpeg ausente) y devolverlos con su porqué. Si ffmpeg sigue
   * vivo se responde ya con optimismo: la espera larga la hace la ruta del
   * playlist, donde los reproductores aguantan sin cortarse. Aquí colgar la
   * respuesta 20 s sin cabeceras hacía que los intermediarios (y algún
   * navegador) cortaran la conexión a mitad.
   */
  const lista = await esperarPlaylist(dir, 6000, sesion);
  if (lista) return { id };

  if (!sesion.proc || sesion.proc.exitCode !== null) {
    fs.rm(dir, { recursive: true, force: true }, () => {});
    sesiones.delete(id);
    const detalle = sesion.fallo || sesion.salida.trim() || "ffmpeg terminó sin producir vídeo ni explicar por qué";
    // Al log del servidor: es lo que se ve en Railway → Deploy Logs
    console.error("[remux] conversión fallida:", url, "→", detalle);
    return { error: "La conversión falló.", detalle, status: 502 };
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
