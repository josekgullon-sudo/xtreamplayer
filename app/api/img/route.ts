import { NextRequest, NextResponse } from "next/server";
import { assertPublicUrl } from "@/lib/safeFetch";

const PLAYER_UA = "VLC/3.0.20 LibVLC/3.0.20";
const MAX_IMG_BYTES = 3 * 1024 * 1024;

export const dynamic = "force-dynamic";

/**
 * Proxy de imágenes: los paneles IPTV sirven carátulas y logos por http://,
 * y una página HTTPS no puede cargarlos — el navegador los bloquea en
 * silencio y el catálogo se queda sin portadas. Pasarlas por aquí las
 * convierte en HTTPS, con caché de un día porque una carátula no cambia.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Falta la URL" }, { status: 400 });

  try {
    await assertPublicUrl(url);
    const upstream = await fetch(url, {
      headers: { "User-Agent": PLAYER_UA },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    if (!upstream.ok) return new NextResponse(null, { status: 502 });

    const tipo = upstream.headers.get("content-type") || "";
    if (!tipo.startsWith("image/")) return new NextResponse(null, { status: 415 });

    const buf = await upstream.arrayBuffer();
    if (buf.byteLength > MAX_IMG_BYTES) return new NextResponse(null, { status: 413 });

    return new NextResponse(buf, {
      headers: {
        "Content-Type": tipo,
        "Content-Length": String(buf.byteLength),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
