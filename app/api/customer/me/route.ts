import { NextResponse } from "next/server";
import { getDb, ProviderRow } from "@/lib/db";
import { getCurrentCustomer, clearCustomerCookie, resolveCustomerPlaylist } from "@/lib/provider";

export const dynamic = "force-dynamic";

/**
 * Devuelve la lista asignada al cliente para que el reproductor la cargue sola.
 * Las credenciales del proveedor viajan solo a su propietario, por sesión firmada.
 */
export async function GET() {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ customer: null });

  const provider = getDb().prepare("SELECT * FROM providers WHERE id = ?").get(customer.provider_id) as
    | ProviderRow
    | undefined;

  return NextResponse.json({
    customer: {
      username: customer.username,
      label: customer.label,
      expiresAt: customer.expires_at,
    },
    brand: provider?.brand_name || "",
    playlist: {
      id: `provider-${customer.id}`,
      name: provider?.brand_name || "Mi lista",
      ...resolveCustomerPlaylist(customer),
      managed: true,
    },
  });
}

export async function DELETE() {
  await clearCustomerCookie();
  return NextResponse.json({ ok: true });
}
