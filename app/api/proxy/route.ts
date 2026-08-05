import { NextRequest, NextResponse } from "next/server";
import { assertPublicUrl } from "@/lib/safeFetch";
import { rewriteManifest } from "@/lib/hlsRewrite";
import { dueñoDeLaSesion } from "@/lib/origen";
import { abrirVale } from "@/lib/vale";

/**
 * Muchos servidores IPTV filtran por User-Agent y rechazan cualquier cliente
 * que no reconozcan, así que nos identificamos como VLC, que es el que todos
 * admiten. Sin esto, servidores perfectamente accesibles responden 403 o se
 * quedan sin contestar.
 */
const PLAYER_UA = "VLC/3.0.20 LibVLC/3.0.20";

export const dynamic = "force-dynamic";

/**
 * El vídeo, servido desde aquí.
 *
 * Ya no se le pasa una URL: se le pasa un vale, que es esa URL cifrada con la
 * clave del servidor y atada a la sesión de quien la pidió. Dos motivos.
 *
 * El primero es que antes iba en claro —«?url=http://servidor:8080/live/
 * pepe/1234/9.ts»—, o sea que el cliente veía el servidor de su proveedor,
 * su usuario y su contraseña en la pestaña de red. En Xtream la dirección
 * del vídeo ES la línea: con eso se va a otro reproductor.
 *
 * El segundo es que aceptaba cualquier dirección de cualquiera sin mirar la
 * sesión: totalplayer.app era un proxy anónimo abierto a internet, y el
 * ancho de banda lo pagábamos nosotros.
 *
 * Los manifiestos HLS se reescriben para que cada segmento salga también con
 * su propio vale; si no, la primera lista de segmentos delataría el origen.
 */

const HLS = ["mpegurl", "m3u8", "vnd.apple.mpegurl"];

export async function GET(req: NextRequest) {
  if (process.env.DISABLE_STREAM_PROXY === "1") {
    return NextResponse.json({ error: "Proxy de streams desactivado" }, { status: 403 });
  }

  const dueño = await dueñoDeLaSesion(req.nextUrl.searchParams.get("mac"));
  const url = abrirVale(req.nextUrl.searchParams.get("v") || "", dueño);
  if (!url) return NextResponse.json({ error: "Este enlace ya no vale" }, { status: 403 });

  try {
    const destino = await assertPublicUrl(url);
    const cabeceras: Record<string, string> = { "User-Agent": PLAYER_UA };
    const rango = req.headers.get("range");
    if (rango) cabeceras["Range"] = rango;

    /*
     * Se corta la petición al proveedor en cuanto el navegador abandona la
     * suya. Sin esto, cada intento descartado del reproductor deja una
     * descarga viva contra el servidor IPTV; como casi todas las suscripciones
     * permiten una sola conexión simultánea, el intento siguiente se encuentra
     * la plaza ocupada por el anterior y le responden 502.
     */
    const abortar = AbortSignal.any([req.signal, AbortSignal.timeout(30000)]);

    const arriba = await fetch(destino.toString(), {
      headers: cabeceras,
      signal: abortar,
      cache: "no-store",
      redirect: "follow",
    });

    if (!arriba.ok && arriba.status !== 206) {
      // Sin el estado del proveedor ni su nombre: solo que no ha podido ser
      return NextResponse.json({ error: "El canal no está disponible ahora mismo" }, { status: 502 });
    }

    const tipo = arriba.headers.get("content-type") || "";
    const esManifiesto =
      HLS.some((t) => tipo.toLowerCase().includes(t)) || destino.pathname.endsWith(".m3u8");

    if (esManifiesto) {
      const texto = await arriba.text();
      // La URL final puede diferir de la original si hubo redirecciones
      const finalUrl = arriba.url || destino.toString();
      return new NextResponse(rewriteManifest(texto, finalUrl, dueño), {
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-store",
        },
      });
    }

    const salida = new Headers();
    salida.set("Content-Type", tipo || "application/octet-stream");
    salida.set("Cache-Control", "no-store");
    for (const h of ["content-length", "content-range", "accept-ranges"]) {
      const v = arriba.headers.get(h);
      if (v) salida.set(h, v);
    }

    return new NextResponse(arriba.body, { status: arriba.status, headers: salida });
  } catch {
    // El navegador se fue: no es un error que haya que reportar
    if (req.signal.aborted) return new NextResponse(null, { status: 499 });
    return NextResponse.json({ error: "El canal no está disponible ahora mismo" }, { status: 502 });
  }
}
