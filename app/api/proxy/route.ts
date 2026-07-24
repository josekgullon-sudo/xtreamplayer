import { NextRequest, NextResponse } from "next/server";
import { assertPublicUrl } from "@/lib/safeFetch";
import { rewriteManifest } from "@/lib/hlsRewrite";

export const dynamic = "force-dynamic";

/**
 * Proxy de compatibilidad para streams cuyo servidor no envía cabeceras CORS.
 * - Manifiestos HLS (.m3u8): se reescriben las URLs de segmentos para que
 *   también pasen por el proxy.
 * - Segmentos/streams: passthrough en streaming con soporte de Range.
 *
 * Se usa como último recurso automático cuando la reproducción directa falla.
 * Puede desactivarse con DISABLE_STREAM_PROXY=1 (p. ej. para ahorrar ancho de banda).
 */

const HLS_TYPES = ["mpegurl", "m3u8", "vnd.apple.mpegurl"];

export async function GET(req: NextRequest) {
  if (process.env.DISABLE_STREAM_PROXY === "1") {
    return NextResponse.json({ error: "Proxy de streams desactivado" }, { status: 403 });
  }

  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Falta la URL" }, { status: 400 });

  try {
    const target = await assertPublicUrl(url);
    const headers: Record<string, string> = { "User-Agent": "XtreamPlayer/1.0" };
    const range = req.headers.get("range");
    if (range) headers["Range"] = range;

    const upstream = await fetch(target.toString(), {
      headers,
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
      redirect: "follow",
    });

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json({ error: `El servidor respondió ${upstream.status}` }, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") || "";
    const isManifest =
      HLS_TYPES.some((t) => contentType.toLowerCase().includes(t)) || target.pathname.endsWith(".m3u8");

    if (isManifest) {
      const text = await upstream.text();
      // La URL final puede diferir de la original si hubo redirecciones
      const finalUrl = upstream.url || target.toString();
      return new NextResponse(rewriteManifest(text, finalUrl), {
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-store",
        },
      });
    }

    const passthroughHeaders = new Headers();
    passthroughHeaders.set("Content-Type", contentType || "application/octet-stream");
    passthroughHeaders.set("Cache-Control", "no-store");
    for (const h of ["content-length", "content-range", "accept-ranges"]) {
      const v = upstream.headers.get(h);
      if (v) passthroughHeaders.set(h, v);
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: passthroughHeaders,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error de conexión";
    const status = message.includes("permitido") || message.includes("inválida") ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
