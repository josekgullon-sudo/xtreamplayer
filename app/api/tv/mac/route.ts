import { NextRequest, NextResponse } from "next/server";
import { getDb, CustomerRow } from "@/lib/db";
import { clientePorMac, listaDeMac } from "@/lib/tvMac";
import { setCustomerCookie, getCurrentCustomer, registerDevice } from "@/lib/provider";

export const dynamic = "force-dynamic";

/**
 * La tele pregunta si su MAC ya está dada de alta. Si lo está, entra sola —
 * el flujo de siempre en los reproductores de IPTV, sin escribir nada. La
 * MAC puede venir de un proveedor (con su cliente detrás) o de alguien que
 * cargó su propia lista desde la web.
 */
export async function GET(req: NextRequest) {
  if (await getCurrentCustomer()) return NextResponse.json({ estado: "listo" });

  const mac = req.nextUrl.searchParams.get("mac") || "";

  // Lista cargada contra la MAC, sin proveedor: se entrega tal cual
  const propia = listaDeMac(mac);
  if (propia) {
    return NextResponse.json({
      estado: "lista",
      lista: {
        tipo: propia.playlist_type || "m3u",
        url: propia.playlist_url,
        usuario: propia.playlist_user,
        password: propia.playlist_pass,
        nombre: propia.label,
      },
    });
  }

  const customerId = clientePorMac(mac);
  if (!customerId) return NextResponse.json({ estado: "no-registrada" });

  const cliente = getDb().prepare("SELECT * FROM customers WHERE id = ?").get(customerId) as CustomerRow | undefined;
  if (!cliente || cliente.status !== "active") return NextResponse.json({ estado: "no-registrada" });

  // La tele ocupa un dispositivo del cupo del cliente, como cualquier otro
  const alta = registerDevice(cliente, `mac-${mac}`, "tv", req.headers.get("x-forwarded-for") || "");
  if (!alta.allowed) return NextResponse.json({ estado: "sin-hueco", error: alta.reason });

  await setCustomerCookie(cliente.id);
  return NextResponse.json({ estado: "listo" });
}
