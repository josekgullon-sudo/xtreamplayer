import { NextRequest, NextResponse } from "next/server";
import { cargarListaEnMac, vaciarMac, listarListas, activarLista, borrarLista } from "@/lib/tvMac";
import { assertPublicUrl } from "@/lib/safeFetch";

export const dynamic = "force-dynamic";

/**
 * Las listas de un aparato. En una casa conviven varias —la de siempre, la
 * de los críos, la que se está probando— y cambiar de una a otra no puede
 * obligar a escribirlas de nuevo cada vez.
 */
export async function GET(req: NextRequest) {
  const listas = listarListas(req.nextUrl.searchParams.get("mac") || "");
  return NextResponse.json({
    listas: listas.map((l) => ({
      /*
       * Sin url ni usuario. Esta ruta no pide cuenta —una tele se empareja
       * con su MAC y ya— y devolvía la lista entera, con su servidor y su
       * usuario, a quien preguntara por una MAC cualquiera. Una MAC se
       * adivina; una suscripción no se regala. Lo que hace falta para
       * pintar la pantalla es el nombre, y para reproducir, nada: eso lo
       * resuelve el servidor con la MAC en cada petición.
       */
      id: l.id,
      nombre: l.name,
      tipo: l.type,
      activa: l.activa === 1,
    })),
  });
}

/**
 * Añade una lista a la MAC que el usuario lee en su tele, y la deja activa.
 * No pide cuenta: quien compra la app puede no tenerla con nadie.
 */
export async function POST(req: NextRequest) {
  let body: { mac?: string; url?: string; usuario?: string; password?: string; nombre?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  // La URL la va a pedir nuestro servidor: mismo guardia que en el resto
  try {
    await assertPublicUrl(body.url || "");
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Dirección no permitida" }, { status: 400 });
  }

  const r = cargarListaEnMac(body.mac || "", {
    url: body.url || "",
    usuario: body.usuario,
    password: body.password,
    nombre: body.nombre,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, mac: r.mac });
}

/** Elige con cuál de sus listas entra el aparato. */
export async function PUT(req: NextRequest) {
  let body: { mac?: string; id?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }
  if (!activarLista(body.mac || "", Number(body.id))) {
    return NextResponse.json({ error: "Esa lista no es de este aparato" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

/** Sin id borra una lista; sin él, todas las del aparato. */
export async function DELETE(req: NextRequest) {
  const mac = req.nextUrl.searchParams.get("mac") || "";
  const id = Number(req.nextUrl.searchParams.get("id") || 0);

  if (id) {
    if (!borrarLista(mac, id)) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  const r = vaciarMac(mac);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
