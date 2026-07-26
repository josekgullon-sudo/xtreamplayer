import { NextRequest, NextResponse } from "next/server";
import { assertPublicUrl } from "@/lib/safeFetch";
import { obtenerSesionRemux } from "@/lib/remux";

export const dynamic = "force-dynamic";

/**
 * Conversor de compatibilidad: reenvuelve MKV/AVI como HLS al vuelo para que
 * películas y series se vean también en Safari y iPhone. Esta ruta arranca
 * (o reutiliza) la conversión y redirige al playlist; los segmentos los
 * sirve /api/remux/[id]/[file].
 */
export async function GET(req: NextRequest) {
  if (process.env.DISABLE_REMUX === "1") {
    return NextResponse.json({ error: "Conversor desactivado" }, { status: 403 });
  }

  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Falta la URL" }, { status: 400 });

  try {
    await assertPublicUrl(url);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "URL inválida" }, { status: 400 });
  }

  const resultado = await obtenerSesionRemux(url);
  if ("error" in resultado) {
    return NextResponse.json({ error: resultado.error }, { status: resultado.status });
  }

  return NextResponse.redirect(new URL(`/api/remux/${resultado.id}/index.m3u8`, req.url), 302);
}
