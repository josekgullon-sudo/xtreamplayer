import { NextRequest, NextResponse } from "next/server";
import { assertPublicUrl } from "@/lib/safeFetch";
import { dueñoDeLaSesion } from "@/lib/origen";
import { abrirVale } from "@/lib/vale";

const PLAYER_UA = "VLC/3.0.20 LibVLC/3.0.20";

export const dynamic = "force-dynamic";

/**
 * Diagnóstico de conexión: cuando un stream no se reproduce, esta ruta
 * pregunta al proveedor DESDE EL SERVIDOR y cuenta qué pasó. Sirve para
 * distinguir los dos fallos que por fuera se ven idénticos:
 *  - el proveedor rechaza o ignora las IPs de centros de datos (responde a
 *    tu casa pero no a nuestro servidor), o
 *  - el proveedor entrega datos perfectamente y el problema es del formato
 *    del vídeo en ese navegador (p. ej. MKV en un iPhone).
 *
 * Recibe un vale y no una URL. Con la URL suelta, cualquiera podía usar esto
 * para sondear puertos y máquinas ajenas desde nuestra IP y leerse el
 * resultado —cuánto tarda, qué devuelve, cuántos bytes—, que es un escáner
 * de red bastante cómodo pagado por nosotros.
 */
export async function GET(req: NextRequest) {
  const dueño = await dueñoDeLaSesion();
  const url = abrirVale(req.nextUrl.searchParams.get("v") || "", dueño);
  if (!url) return NextResponse.json({ error: "Este enlace ya no vale" }, { status: 403 });

  const inicio = Date.now();
  try {
    await assertPublicUrl(url);
    const res = await fetch(url, {
      headers: { "User-Agent": PLAYER_UA, Range: "bytes=0-65535" },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
      redirect: "follow",
    });

    // Con leer el primer trozo basta para saber si entrega datos
    let bytes = 0;
    if (res.body) {
      const reader = res.body.getReader();
      const plazo = Date.now() + 6000;
      while (bytes < 65536 && Date.now() < plazo) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
      }
      reader.cancel().catch(() => {});
    }

    return NextResponse.json({
      ok: res.ok || res.status === 206,
      status: res.status,
      contentType: res.headers.get("content-type") || "",
      bytes,
      ms: Date.now() - inicio,
    });
  } catch (e) {
    /* El mensaje de una excepción de red trae el host dentro
       —«ENOTFOUND cdn.loquesea.com»—, así que se cuenta el qué y no el quién */
    return NextResponse.json({
      ok: false,
      status: 0,
      contentType: "",
      bytes: 0,
      ms: Date.now() - inicio,
      motivo: e instanceof Error && e.name === "TimeoutError" ? "tiempo" : "conexión",
    });
  }
}
