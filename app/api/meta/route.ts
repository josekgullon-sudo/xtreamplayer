import { NextRequest, NextResponse } from "next/server";
import { dueñoDeLaSesion } from "@/lib/origen";
import { hayTmdb, metaDe } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

/**
 * Lo que se sabe de un puñado de títulos, más allá de lo que manda el panel.
 *
 * La portada de cine y de series manda aquí los títulos que va a enseñar
 * —ciento cincuenta, no el catálogo— y recibe fondo apaisado, sinopsis en
 * español, nota y géneros de los que TMDB reconozca. Lo que no reconozca no
 * viene, y esa pantalla se apaña con lo del proveedor, que es lo que hacía
 * hasta ahora.
 *
 * Va con sesión por delante, y no porque haya nada secreto detrás: sin ella
 * esto sería un proxy abierto a TMDB con nuestra clave, y el primero que lo
 * encontrase nos gastaría el cupo.
 */
export async function POST(req: NextRequest) {
  if (!hayTmdb()) {
    /* Sin clave configurada no es un error: es que esta instalación no lo
       usa. La pantalla lo entiende como «no hay nada que añadir» */
    return NextResponse.json({ meta: [], activo: false });
  }

  /*
   * Sin sesión también se contesta, pero con la mano más corta.
   *
   * Quien usa el reproductor en el navegador con su propia lista M3U no es
   * cliente de ningún proveedor ni tiene cuenta: rechazarlo dejaba la
   * portada sin fondos ni sinopsis justo para el que se instala esto por su
   * cuenta. Lo que se hace es acortarle la tanda, que es lo que de verdad
   * limita el gasto —lo demás sale de la caché, que es común—.
   */
  const dueño = await dueñoDeLaSesion(req.nextUrl.searchParams.get("mac"));
  const tope = dueño === "anon" ? 40 : 200;

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo ilegible" }, { status: 400 });
  }

  const lista = (cuerpo as { titulos?: unknown })?.titulos;
  if (!Array.isArray(lista)) {
    return NextResponse.json({ error: "falta «titulos»" }, { status: 400 });
  }

  const titulos = lista
    .filter((t): t is Record<string, unknown> => Boolean(t) && typeof t === "object")
    .map((t) => ({
      nombre: String(t.nombre ?? "").slice(0, 200),
      anio: String(t.anio ?? "").slice(0, 4),
      serie: Boolean(t.serie),
    }))
    .filter((t) => t.nombre.trim());

  try {
    return NextResponse.json({ meta: await metaDe(titulos.slice(0, tope)), activo: true });
  } catch {
    /* Si TMDB no contesta, la portada se queda como estaba. Nunca es motivo
       para dejar una pantalla sin pintar */
    return NextResponse.json({ meta: [], activo: true });
  }
}
