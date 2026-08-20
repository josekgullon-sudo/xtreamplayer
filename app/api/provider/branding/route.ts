import { NextRequest, NextResponse } from "next/server";
import { getDb, ProviderRow } from "@/lib/db";
import { getCurrentProvider } from "@/lib/provider";
import { brandingOf, normalizeHexColor, normalizeSlug, isValidSlug } from "@/lib/branding";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Marca blanca del proveedor. Solo el proveedor (no sus revendedores). */
export async function GET() {
  const provider = await getCurrentProvider();
  if (!provider) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const branding = brandingOf(provider);
  return NextResponse.json({
    branding: {
      name: provider.brand_name || "",
      color: provider.brand_color || "",
      logo: provider.brand_logo || "",
      fondo: provider.brand_fondo || "",
      slug: provider.brand_slug || "",
      support: provider.brand_support || "",
      precioPerfil: (provider.extra_profile_price || 0) / 100,
    },
    accessUrl: branding.slug ? `${SITE_URL}/m/${branding.slug}` : "",
  });
}

export async function PUT(req: NextRequest) {
  const provider = await getCurrentProvider();
  if (!provider) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: { name?: string; color?: string; logo?: string; fondo?: string; slug?: string; support?: string; precioPerfil?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const name = (body.name || "").trim().slice(0, 60);

  const color = (body.color || "").trim();
  if (color && !normalizeHexColor(color)) {
    return NextResponse.json({ error: "El color debe ser hexadecimal, por ejemplo #e5192b" }, { status: 400 });
  }

  const logo = (body.logo || "").trim().slice(0, 500);
  /* El mosaico del fondo, con el mismo trato que el logotipo: una dirección
     https y nada más. Vacío es lo normal —entonces se dibuja uno— */
  const fondo = (body.fondo || "").trim().slice(0, 500);
  if (fondo && !/^https:\/\/.+/i.test(fondo)) {
    return NextResponse.json({ error: "El fondo debe ser una URL https" }, { status: 400 });
  }
  if (logo && !/^https:\/\/.+/i.test(logo)) {
    return NextResponse.json({ error: "El logotipo debe ser una URL https" }, { status: 400 });
  }

  let slug = "";
  if (body.slug !== undefined && body.slug.trim()) {
    slug = normalizeSlug(body.slug);
    if (!isValidSlug(slug)) {
      return NextResponse.json(
        { error: "El identificador debe tener entre 3 y 32 caracteres: letras, números y guiones" },
        { status: 400 }
      );
    }
    // Reservados para rutas propias de la plataforma
    if (["player", "acceso", "panel", "proveedores", "api", "admin", "cuenta", "login"].includes(slug)) {
      return NextResponse.json({ error: "Ese identificador está reservado" }, { status: 400 });
    }
    const dup = getDb()
      .prepare("SELECT id FROM providers WHERE brand_slug = ? AND id != ?")
      .get(slug, provider.id) as ProviderRow | undefined;
    if (dup) return NextResponse.json({ error: "Ese identificador ya está en uso" }, { status: 409 });
  }

  // El precio llega en euros y se guarda en céntimos: los redondeos con
  // decimales flotantes acaban cobrando 4,99 donde el proveedor puso 5
  const precio = Math.max(0, Math.round(Number(body.precioPerfil ?? 0) * 100)) || 0;

  getDb()
    .prepare(
      "UPDATE providers SET brand_name = ?, brand_color = ?, brand_logo = ?, brand_fondo = ?, brand_slug = ?, brand_support = ?, extra_profile_price = ? WHERE id = ?"
    )
    .run(name, normalizeHexColor(color), logo, fondo, slug, (body.support || "").trim().slice(0, 200), precio, provider.id);

  return NextResponse.json({
    ok: true,
    accessUrl: slug ? `${SITE_URL}/m/${slug}` : "",
  });
}

/**
 * Vuelta a los valores de fábrica. Probar colores y logotipos es la clase de
 * cosa que se hace a las tantas, y sin un camino de vuelta claro uno se
 * queda con un tono que no le gusta por miedo a empeorarlo. El enlace de
 * acceso (el slug) se conserva: es el que ya han repartido sus clientes.
 */
export async function DELETE() {
  const provider = await getCurrentProvider();
  if (!provider) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  getDb()
    .prepare("UPDATE providers SET brand_name = '', brand_color = '', brand_logo = '', brand_fondo = '', brand_support = '', extra_profile_price = 0 WHERE id = ?")
    .run(provider.id);

  return NextResponse.json({ ok: true, accessUrl: provider.brand_slug ? `${SITE_URL}/m/${provider.brand_slug}` : "" });
}
