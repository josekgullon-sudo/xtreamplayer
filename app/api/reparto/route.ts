import { NextRequest, NextResponse } from "next/server";
import { dueñoDeLaSesion } from "@/lib/origen";
import { hayTmdb, repartoDe } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

/**
 * El reparto de UN título: nombre, personaje y foto.
 *
 * Aparte de `/api/meta` y no dentro, porque son dos cosas con otro coste.
 * A `/api/meta` la portada le manda ciento cincuenta títulos de golpe y lo
 * que recibe —fondo, sinopsis, nota— ya está en el caché casi siempre. Un
 * reparto es una petición más a TMDB por cada título que no lo tenga, y en
 * una fila de carátulas no se ve: pedirlo ahí sería pagar ciento cincuenta
 * veces por algo que no se enseña.
 *
 * Aquí se pide de uno en uno, al abrir una ficha, que es la única pantalla
 * donde el reparto se mira. Y se guarda, así que la segunda vez no cuesta
 * nada — ni para ese cliente ni para ningún otro de ninguna plataforma.
 *
 * Con sesión por delante por lo mismo que `/api/meta`: sin ella esto sería
 * un proxy abierto a TMDB con nuestra clave.
 */
export async function POST(req: NextRequest) {
  if (!hayTmdb()) {
    /* Sin clave configurada no es un error: es que esta instalación no usa
       TMDB. La ficha lo entiende como «no hay fotos» y enseña los nombres
       que manda el panel, que es lo que hacía antes de todo esto */
    return NextResponse.json({ reparto: [], activo: false });
  }

  /* La sesión se mira pero no se exige, igual que en `/api/meta`: quien usa
     el reproductor con su propia lista M3U no es cliente de nadie, y
     dejarle la ficha a medias por eso no arregla ningún gasto */
  await dueñoDeLaSesion(req.nextUrl.searchParams.get("mac"));

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo ilegible" }, { status: 400 });
  }

  const c = (cuerpo || {}) as Record<string, unknown>;
  const nombre = String(c.nombre ?? "").slice(0, 200).trim();
  const anio = String(c.anio ?? "").slice(0, 4);
  const serie = Boolean(c.serie);
  if (!nombre) return NextResponse.json({ error: "falta «nombre»" }, { status: 400 });

  try {
    return NextResponse.json({ reparto: await repartoDe(nombre, anio, serie), activo: true });
  } catch {
    /* Si TMDB no contesta, la ficha se queda con los nombres del panel */
    return NextResponse.json({ reparto: [], activo: true });
  }
}
