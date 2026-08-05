import { NextResponse } from "next/server";
import { getDb, ProviderRow } from "@/lib/db";
import { getCurrentCustomer, clearCustomerCookie, resolveCustomerPlaylist } from "@/lib/provider";
import { brandingOf, brandCssVars } from "@/lib/branding";

export const dynamic = "force-dynamic";

/**
 * Quién es el cliente y qué lista le toca, sin decirle de dónde sale.
 *
 * Aquí se devolvía `url`, `username` y `password` de la línea del proveedor.
 * No era solo el dominio: era la suscripción entera, en el cuerpo de un JSON
 * que cualquier cliente ve con F12 y que la aplicación de Android guardaba
 * además en el teléfono. Con esos tres datos se va uno a otro reproductor y
 * deja de pagar, y el proveedor no se entera hasta que le cuadran las
 * conexiones.
 *
 * Ahora sale solo lo que hace falta para pintar la pantalla. El servidor lo
 * resuelve él en cada petición, desde la galleta —lib/origen— y no viaja.
 */
export async function GET() {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ customer: null });

  const provider = getDb().prepare("SELECT * FROM providers WHERE id = ?").get(customer.provider_id) as
    | ProviderRow
    | undefined;

  const branding = brandingOf(provider);

  return NextResponse.json({
    customer: {
      username: customer.username,
      label: customer.label,
      expiresAt: customer.expires_at,
    },
    brand: provider?.brand_name || "",
    // El reproductor se viste con la marca del proveedor mientras dura la sesión
    branding: branding.isWhiteLabel
      ? { name: branding.name, logo: branding.logo, support: branding.support, cssVars: brandCssVars(branding.color) }
      : null,
    playlist: {
      id: `provider-${customer.id}`,
      name: provider?.brand_name || "Mi lista",
      // El tipo sí: el reproductor tiene que saber si pedir catálogo de
      // Xtream o descargar una M3U. De dónde, no
      type: resolveCustomerPlaylist(customer).type,
      managed: true,
    },
  });
}

export async function DELETE() {
  await clearCustomerCookie();
  return NextResponse.json({ ok: true });
}
