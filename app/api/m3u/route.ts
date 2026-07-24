import { NextRequest, NextResponse } from "next/server";
import { assertPublicUrl } from "@/lib/safeFetch";

export const dynamic = "force-dynamic";

const MAX_M3U_BYTES = 50 * 1024 * 1024; // 50 MB — listas grandes pero acotadas

/**
 * Descarga una lista M3U desde el servidor (evita CORS) y la devuelve como texto.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Falta la URL de la lista" }, { status: 400 });

  try {
    await assertPublicUrl(url);
    const upstream = await fetch(url, {
      signal: AbortSignal.timeout(45000),
      headers: { "User-Agent": "XtreamPlayer/1.0" },
      cache: "no-store",
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: `El servidor de la lista respondió ${upstream.status}` }, { status: 502 });
    }

    const reader = upstream.body?.getReader();
    if (!reader) return NextResponse.json({ error: "Respuesta vacía" }, { status: 502 });

    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_M3U_BYTES) {
        reader.cancel();
        return NextResponse.json({ error: "La lista es demasiado grande (máx. 50 MB)" }, { status: 413 });
      }
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString("utf8");

    if (!text.includes("#EXTM3U") && !text.includes("#EXTINF")) {
      return NextResponse.json(
        { error: "La URL no parece ser una lista M3U válida. Comprueba el enlace." },
        { status: 422 }
      );
    }
    return new NextResponse(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error de conexión";
    const status = message.includes("permitido") || message.includes("inválida") ? 400 : 502;
    return NextResponse.json(
      { error: status === 400 ? message : "No se pudo descargar la lista M3U. Comprueba la URL." },
      { status }
    );
  }
}
