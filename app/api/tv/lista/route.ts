import { NextRequest, NextResponse } from "next/server";
import { cargarListaEnMac, vaciarMac, listaDeMac } from "@/lib/tvMac";
import { assertPublicUrl } from "@/lib/safeFetch";

export const dynamic = "force-dynamic";

/** Qué lista tiene cargada una MAC (para poder verla antes de cambiarla). */
export async function GET(req: NextRequest) {
  const t = listaDeMac(req.nextUrl.searchParams.get("mac") || "");
  if (!t) return NextResponse.json({ lista: null });
  return NextResponse.json({
    lista: { tipo: t.playlist_type, url: t.playlist_url, usuario: t.playlist_user, nombre: t.label },
  });
}

/**
 * Carga una lista contra la MAC que el usuario lee en su tele. Es el flujo
 * de los reproductores de siempre y no pide cuenta: quien compra la app
 * puede no tenerla con nadie.
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

export async function DELETE(req: NextRequest) {
  const r = vaciarMac(req.nextUrl.searchParams.get("mac") || "");
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
