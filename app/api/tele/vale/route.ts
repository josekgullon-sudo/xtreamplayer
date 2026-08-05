import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/provider";
import { getCurrentUser } from "@/lib/auth";
import { assertPublicUrl } from "@/lib/safeFetch";
import { emitirVale } from "@/lib/vale";

export const dynamic = "force-dynamic";

/**
 * Un vale para una dirección que el propio usuario ha escrito.
 *
 * Existe solo para las listas que uno se pega en su navegador: son suyas, las
 * ha tecleado él, y no hay nada que ocultarle de algo que ya conoce. Lo que
 * hace falta es que el proxy no acepte direcciones sueltas de cualquiera, y
 * eso se consigue obligando a pasar por aquí.
 *
 * A un cliente de proveedor se le niega siempre. Su línea la resuelve el
 * servidor en /api/tele/ver y no hay ningún camino por el que pueda pedir un
 * vale para una dirección de su elección: si lo hubiera, bastaría con
 * adivinar la del proveedor para volver a tenerla.
 */

/** Cuántos vales por dirección y minuto. Esto no es un proxy público. */
const TOPE = 60;
const ventanas = new Map<string, { hasta: number; cuantos: number }>();

function pasa(quien: string): boolean {
  const ahora = Date.now();
  const v = ventanas.get(quien);
  if (!v || v.hasta < ahora) {
    ventanas.set(quien, { hasta: ahora + 60000, cuantos: 1 });
    // La tabla no crece sin fin: se barre lo caducado de vez en cuando
    if (ventanas.size > 5000) {
      for (const [k, x] of ventanas) if (x.hasta < ahora) ventanas.delete(k);
    }
    return true;
  }
  v.cuantos += 1;
  return v.cuantos <= TOPE;
}

export async function POST(req: NextRequest) {
  if (await getCurrentCustomer()) {
    return NextResponse.json({ error: "No disponible" }, { status: 403 });
  }

  let cuerpo: { url?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const usuario = await getCurrentUser();
  const quien = usuario
    ? `u${usuario.id}`
    : `ip:${req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "?"}`;
  if (!pasa(quien)) {
    return NextResponse.json({ error: "Demasiadas peticiones seguidas" }, { status: 429 });
  }

  const url = (cuerpo.url || "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "Dirección inválida" }, { status: 400 });
  }
  try {
    await assertPublicUrl(url);
  } catch {
    return NextResponse.json({ error: "Dirección no permitida" }, { status: 400 });
  }

  return NextResponse.json({ vale: emitirVale(url, quien) });
}
