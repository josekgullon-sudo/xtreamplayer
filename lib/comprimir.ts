import { NextRequest, NextResponse } from "next/server";
import { gzip } from "node:zlib";
import { promisify } from "node:util";

const agzip = promisify(gzip);

/**
 * Comprimir lo que sale de aquí, que es lo que tarda.
 *
 * Next comprime las páginas, pero no lo que devuelven las rutas de `/api`:
 * salen tal cual, byte a byte. En casi todas da igual —son cuatro campos—,
 * pero el catálogo no: la lista de canales de un proveedor con ocho mil
 * canales son varios megas de JSON, y ESO es lo que el cliente ve como «la
 * aplicación tarda en abrir». Un móvil con cobertura regular se pasa
 * segundos ahí, mirando una pantalla vacía, antes de que haya nada que
 * pintar. Comprimido baja a la tercera parte larga.
 *
 * Por debajo de un kilobyte no se toca: comprimir cuesta más de lo que
 * ahorra y encima queda más grande.
 */
const MINIMO = 1024;

function aceptaGzip(req: NextRequest): boolean {
  return /\bgzip\b/i.test(req.headers.get("accept-encoding") || "");
}

async function comprimida(
  req: NextRequest,
  cuerpo: string,
  tipo: string,
  init?: ResponseInit
): Promise<NextResponse> {
  const cabeceras = new Headers(init?.headers);
  cabeceras.set("Content-Type", tipo);
  /* Sin esto, un proxy por el medio puede servirle a un cliente que no
     entiende gzip la respuesta comprimida que guardó para otro */
  cabeceras.set("Vary", "Accept-Encoding");

  if (cuerpo.length < MINIMO || !aceptaGzip(req)) {
    return new NextResponse(cuerpo, { ...init, headers: cabeceras });
  }

  try {
    const apretado = await agzip(cuerpo);
    cabeceras.set("Content-Encoding", "gzip");
    cabeceras.set("Content-Length", String(apretado.length));
    return new NextResponse(new Uint8Array(apretado), { ...init, headers: cabeceras });
  } catch {
    // Si zlib falla por lo que sea, se sirve sin comprimir: lento, pero sirve
    return new NextResponse(cuerpo, { ...init, headers: cabeceras });
  }
}

/** Como `NextResponse.json`, pero comprimido si el navegador lo admite. */
export function jsonComprimido(
  req: NextRequest,
  dato: unknown,
  init?: ResponseInit
): Promise<NextResponse> {
  return comprimida(req, JSON.stringify(dato), "application/json", init);
}

/** Lo mismo para el texto de una lista M3U, que también son megas. */
export function textoComprimido(
  req: NextRequest,
  texto: string,
  tipo: string,
  init?: ResponseInit
): Promise<NextResponse> {
  return comprimida(req, texto, tipo, init);
}
