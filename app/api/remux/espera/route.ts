import { NextRequest, NextResponse } from "next/server";
import { assertPublicUrl } from "@/lib/safeFetch";
import { dueñoDeLaSesion } from "@/lib/origen";
import { abrirVale } from "@/lib/vale";
import { obtenerSesionRemux, esperarSesionLista } from "@/lib/remux";

export const dynamic = "force-dynamic";

/**
 * Sondeo del conversor: arranca (o reutiliza) la conversión y contesta al
 * momento si está lista, sigue en marcha o falló — y en ese caso, por qué.
 *
 * Existe porque cualquier respuesta que se quede muda mientras ffmpeg
 * trabaja acaba cortada por algún intermediario (y el iPhone se quedaba con
 * «la conexión se cortó» sin más). El reproductor pregunta aquí cada pocos
 * segundos, con respuestas instantáneas, y solo carga el vídeo cuando ya
 * está listo.
 */
export async function GET(req: NextRequest) {
  if (process.env.DISABLE_REMUX === "1") {
    return NextResponse.json({ listo: false, error: "Conversor desactivado", detalle: "" });
  }
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ listo: false, error: "Falta la URL", detalle: "" }, { status: 400 });

  try {
    await assertPublicUrl(url);
  } catch (e) {
    return NextResponse.json(
      { listo: false, error: e instanceof Error ? e.message : "URL inválida", detalle: "" },
      { status: 400 }
    );
  }

  try {
    const resultado = await obtenerSesionRemux(url, req.nextUrl.searchParams.get("transcodificar") === "1");
    if ("error" in resultado) {
      return NextResponse.json({ listo: false, error: resultado.error, detalle: resultado.detalle || "" });
    }
    const estado = await esperarSesionLista(resultado.id, 2500);
    // El playlist directo, sin pasar por la redirección de /api/remux: a
    // Safari los 302 en el src de un vídeo le dan motivos para quejarse
    if (estado.ok) return NextResponse.json({ listo: true, codec: estado.codec, playlist: `/api/remux/${resultado.id}/index.m3u8` });
    if (estado.enMarcha) return NextResponse.json({ listo: false, codec: estado.codec });
    return NextResponse.json({ listo: false, error: "La conversión falló.", detalle: estado.detalle, codec: estado.codec });
  } catch (e) {
    console.error("[remux] error en el sondeo:", e);
    return NextResponse.json({
      listo: false,
      error: "El conversor falló de forma inesperada",
      detalle: e instanceof Error ? e.message : String(e),
    });
  }
}
