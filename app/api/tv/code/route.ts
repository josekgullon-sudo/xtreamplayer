import { NextRequest, NextResponse } from "next/server";
import { crearCodigo, recogerCodigo } from "@/lib/tvPairing";
import { setCustomerCookie, getCurrentCustomer, registerDevice } from "@/lib/provider";
import { getDb, CustomerRow } from "@/lib/db";

export const dynamic = "force-dynamic";

/** La tele pide un código para enseñarlo en pantalla. */
export async function POST(req: NextRequest) {
  let body: { deviceKey?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* sin cuerpo: el aparato aún no tiene identificador */
  }
  const codigo = crearCodigo(body.deviceKey || "");
  return NextResponse.json(codigo);
}

/**
 * La tele pregunta cada pocos segundos si ya lo reclamaron. Cuando sí, se le
 * entrega la sesión del cliente en su cookie y no vuelve a pedir nada más.
 */
export async function GET(req: NextRequest) {
  // Si ya tiene sesión, no hay nada que emparejar
  if (await getCurrentCustomer()) return NextResponse.json({ estado: "listo" });

  const code = req.nextUrl.searchParams.get("code") || "";
  const r = recogerCodigo(code);
  if (r.estado !== "listo") return NextResponse.json({ estado: r.estado });

  const cliente = getDb().prepare("SELECT * FROM customers WHERE id = ?").get(r.customerId) as
    | CustomerRow
    | undefined;
  if (!cliente || cliente.status !== "active") {
    return NextResponse.json({ estado: "caducado" });
  }

  // La tele cuenta como un dispositivo más del cliente, con su propio cupo
  const alta = registerDevice(cliente, r.deviceKey || `tv-${code}`, "tv", req.headers.get("x-forwarded-for") || "");
  if (!alta.allowed) {
    return NextResponse.json({ estado: "sin-hueco", error: alta.reason });
  }

  await setCustomerCookie(cliente.id);
  return NextResponse.json({ estado: "listo" });
}
