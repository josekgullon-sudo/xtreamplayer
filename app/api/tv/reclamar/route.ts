import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/provider";
import { reclamarCodigo } from "@/lib/tvPairing";

export const dynamic = "force-dynamic";

/**
 * El cliente, ya identificado en su móvil, escribe el código que ve en la
 * tele. Requiere su sesión: sin ella, cualquiera con un código a la vista
 * podría llevarse la tele de otro.
 */
export async function POST(req: NextRequest) {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: "Entra con tu usuario antes de activar la tele" }, { status: 401 });

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const r = reclamarCodigo(body.code || "", customer.id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
