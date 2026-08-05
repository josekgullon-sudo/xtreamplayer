import { NextRequest, NextResponse } from "next/server";
import { assertPublicUrl } from "@/lib/safeFetch";
import { origenPedido } from "@/lib/origen";
import { enlaceDeImagen, enlaceDeVideo } from "@/lib/vale";

/**
 * Muchos servidores IPTV filtran por User-Agent y rechazan cualquier cliente
 * que no reconozcan, así que nos identificamos como VLC, que es el que todos
 * admiten. Sin esto, servidores perfectamente accesibles responden 403 o se
 * quedan sin contestar.
 */
const PLAYER_UA = "VLC/3.0.20 LibVLC/3.0.20";

export const dynamic = "force-dynamic";

const MAX_M3U_BYTES = 50 * 1024 * 1024; // 50 MB — listas grandes pero acotadas

/**
 * La lista M3U del cliente, ya sin direcciones dentro.
 *
 * Una M3U es, literalmente, un fichero de texto con la dirección completa de
 * cada canal —servidor, usuario y contraseña— repetida miles de veces.
 * Entregársela al navegador es entregar la línea, y antes se entregaba
 * entera. Aquí se descarga en el servidor y sale con cada dirección y cada
 * logotipo cambiados por un vale.
 */
export async function GET(req: NextRequest) {
  const origen = await origenPedido(req.nextUrl.searchParams.get("lista"), {
    base: req.nextUrl.searchParams.get("url"),
    tipo: "m3u",
  }, req.nextUrl.searchParams.get("mac"));
  if (!origen) {
    return NextResponse.json({ error: "Entra en tu cuenta para ver tu lista" }, { status: 401 });
  }

  try {
    await assertPublicUrl(origen.base);
    const arriba = await fetch(origen.base, {
      signal: AbortSignal.timeout(45000),
      headers: { "User-Agent": PLAYER_UA },
      cache: "no-store",
    });
    if (!arriba.ok) {
      return NextResponse.json({ error: `Tu proveedor respondió ${arriba.status}` }, { status: 502 });
    }

    const lector = arriba.body?.getReader();
    if (!lector) return NextResponse.json({ error: "Respuesta vacía" }, { status: 502 });

    const trozos: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_M3U_BYTES) {
        lector.cancel();
        return NextResponse.json({ error: "La lista es demasiado grande (máx. 50 MB)" }, { status: 413 });
      }
      trozos.push(value);
    }
    const texto = Buffer.concat(trozos).toString("utf8");

    if (!texto.includes("#EXTM3U") && !texto.includes("#EXTINF")) {
      return NextResponse.json(
        { error: "Eso no parece una lista M3U válida." },
        { status: 422 }
      );
    }
    return new NextResponse(sinDirecciones(texto, origen.dueño), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch {
    // El motivo lleva dentro el nombre del servidor: no sale de aquí
    return NextResponse.json(
      { error: "No hemos podido cargar tu lista. Inténtalo en un momento." },
      { status: 502 }
    );
  }
}

/**
 * Cambia por vales las dos cosas que llevan la dirección: la línea del canal
 * y el `tvg-logo` de su cabecera. Lo demás —nombres, grupos, identificadores
 * de guía— se queda tal cual, porque es lo que el reproductor necesita leer.
 */
function sinDirecciones(texto: string, dueño: string): string {
  return texto
    .split("\n")
    .map((linea) => {
      const limpio = linea.trim();
      if (!limpio) return linea;
      if (limpio.startsWith("#")) {
        return linea.replace(/(tvg-logo=")([^"]+)(")/gi, (todo, antes, url, despues) =>
          /^https?:\/\//i.test(url) ? `${antes}${enlaceDeImagen(url, dueño)}${despues}` : todo
        );
      }
      return /^https?:\/\//i.test(limpio) ? enlaceDeVideo(limpio, dueño) : linea;
    })
    .join("\n");
}
