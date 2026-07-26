import { NextRequest, NextResponse } from "next/server";
import { assertPublicUrl } from "@/lib/safeFetch";

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
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Falta la URL" }, { status: 400 });

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
    const message = e instanceof Error ? e.message : "";
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return NextResponse.json({
      ok: false,
      status: 0,
      timeout,
      error: timeout ? "El proveedor no respondió al servidor en 10 segundos" : message,
      ms: Date.now() - inicio,
    });
  }
}
