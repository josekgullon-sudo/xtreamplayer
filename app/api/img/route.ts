import { NextRequest, NextResponse } from "next/server";
import { assertPublicUrl } from "@/lib/safeFetch";
import { dueñoDeLaSesion } from "@/lib/origen";
import { abrirVale } from "@/lib/vale";

const PLAYER_UA = "VLC/3.0.20 LibVLC/3.0.20";
const MAX_IMG_BYTES = 3 * 1024 * 1024;

export const dynamic = "force-dynamic";

/**
 * Carátulas y logotipos, con la dirección en un vale.
 *
 * Los paneles IPTV sirven las imágenes por http:// y desde su propio
 * servidor, así que además de que una página HTTPS las bloquea, cada
 * logotipo era una línea en la pestaña de red con el host del proveedor
 * dentro. Y una lista tiene miles: el catálogo entero era un directorio de
 * la dirección del proveedor, repetida una vez por canal.
 *
 * Ahora la dirección va cifrada y atada a la sesión, y esta ruta ya no acepta
 * cualquier URL de cualquiera: era, tal cual, un proxy de imágenes abierto.
 */
export async function GET(req: NextRequest) {
  const dueño = await dueñoDeLaSesion(req.nextUrl.searchParams.get("mac"));
  const url = abrirVale(req.nextUrl.searchParams.get("v") || "", dueño);
  if (!url) return new NextResponse(null, { status: 403 });

  try {
    await assertPublicUrl(url);
    const arriba = await fetch(url, {
      headers: { "User-Agent": PLAYER_UA },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    if (!arriba.ok) return new NextResponse(null, { status: 502 });

    const tipo = arriba.headers.get("content-type") || "";
    if (!tipo.startsWith("image/")) return new NextResponse(null, { status: 415 });

    const buf = await arriba.arrayBuffer();
    if (buf.byteLength > MAX_IMG_BYTES) return new NextResponse(null, { status: 413 });

    return new NextResponse(buf, {
      headers: {
        "Content-Type": tipo,
        "Content-Length": String(buf.byteLength),
        /* Privada: la caché es del navegador de ese cliente y de nadie más.
           Con «public» un intermediario podría guardar la carátula y servirla
           a otra sesión con otro vale */
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
