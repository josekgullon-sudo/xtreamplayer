import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { assertPublicUrl } from "@/lib/safeFetch";

const PLAYER_UA = "VLC/3.0.20 LibVLC/3.0.20";

export const dynamic = "force-dynamic";

/**
 * Conversor de compatibilidad: cambia el envoltorio del vídeo sin tocar el
 * vídeo en sí.
 *
 * Muchos VOD y series de IPTV vienen en MKV o AVI, que Safari y los iPhone
 * no saben abrir aunque dentro lleven H.264 normal y corriente. ffmpeg copia
 * la pista de vídeo tal cual (-c:v copy: coste de CPU casi nulo) y solo
 * recomprime el audio a AAC, porque los MKV suelen traer AC3/DTS que ningún
 * navegador reproduce. El resultado sale como MP4 fragmentado en streaming:
 * se empieza a ver sin esperar a convertir el fichero entero.
 *
 * Límite deliberado: sin salto a mitad de película (el flujo no admite
 * rangos). Ver desde el principio funciona, que es el 95 % del caso.
 */

// Cada conversión es un proceso ffmpeg: un tope evita que una avalancha
// tire el servidor entero
const MAX_SIMULTANEAS = 4;
let activas = 0;

export async function GET(req: NextRequest) {
  if (process.env.DISABLE_REMUX === "1") {
    return NextResponse.json({ error: "Conversor desactivado" }, { status: 403 });
  }

  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Falta la URL" }, { status: 400 });

  if (activas >= MAX_SIMULTANEAS) {
    return NextResponse.json(
      { error: "El conversor está al máximo de uso. Prueba en unos segundos." },
      { status: 503 }
    );
  }

  try {
    await assertPublicUrl(url);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "URL inválida" }, { status: 400 });
  }

  const ffmpeg = spawn(
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
      "-movflags", "frag_keyframe+empty_moov+default_base_moof",
      "-f", "mp4",
      "pipe:1",
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  activas += 1;

  let terminado = false;
  const soltar = () => {
    if (terminado) return;
    terminado = true;
    activas -= 1;
  };
  ffmpeg.on("close", soltar);
  ffmpeg.stderr.on("data", () => {}); // drenar para que no se bloquee

  // Si el navegador abandona (zapping, cierre), el proceso muere al momento:
  // dejarlo vivo sería seguir descargando del proveedor para nadie
  req.signal.addEventListener("abort", () => {
    ffmpeg.kill("SIGKILL");
    soltar();
  });

  const stream = new ReadableStream({
    start(controller) {
      ffmpeg.stdout.on("data", (chunk: Buffer) => {
        try {
          controller.enqueue(new Uint8Array(chunk));
        } catch {
          ffmpeg.kill("SIGKILL");
        }
      });
      ffmpeg.stdout.on("end", () => {
        try {
          controller.close();
        } catch {
          /* ya cerrado */
        }
      });
      ffmpeg.on("error", () => {
        try {
          controller.error(new Error("ffmpeg no disponible"));
        } catch {
          /* ya cerrado */
        }
      });
    },
    cancel() {
      ffmpeg.kill("SIGKILL");
      soltar();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "video/mp4",
      "Cache-Control": "no-store",
    },
  });
}
