import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb, ProviderRow, DeviceRow } from "@/lib/db";
import { getCurrentCustomer } from "@/lib/provider";
import { brandingOf } from "@/lib/branding";
import { listProfiles } from "@/lib/profiles";
import { encryptSecret } from "@/lib/secretBox";

export const dynamic = "force-dynamic";

/**
 * La cuenta del cliente final, vista desde su lado: qué usuario es, hasta
 * cuándo tiene servicio, cuántos dispositivos y perfiles le dejan, y a quién
 * escribir si algo falla. Datos que hasta ahora solo veía su proveedor —
 * quien de verdad los necesita a mano es quien está delante de la tele.
 */
export async function GET() {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const db = getDb();
  const provider = db.prepare("SELECT * FROM providers WHERE id = ?").get(customer.provider_id) as
    | ProviderRow
    | undefined;
  const branding = brandingOf(provider);

  const dispositivos = db
    .prepare("SELECT * FROM devices WHERE customer_id = ? ORDER BY last_seen DESC")
    .all(customer.id) as DeviceRow[];

  const perfiles = listProfiles({ kind: "customer", customer });

  return NextResponse.json({
    cuenta: {
      usuario: customer.username,
      nombre: customer.label,
      alta: customer.created_at,
      caduca: customer.expires_at,
      estado: customer.status,
      ultimoAcceso: customer.last_seen,
      maxDispositivos: customer.max_devices,
      maxPerfiles: customer.max_profiles,
      perfiles: perfiles.length,
    },
    proveedor: {
      nombre: branding.name,
      soporte: branding.support,
      logo: branding.logo,
    },
    dispositivos: dispositivos.map((d) => ({
      id: d.id,
      nombre: d.name || d.platform || "Dispositivo",
      plataforma: d.platform,
      alta: d.first_seen,
      visto: d.last_seen,
    })),
  });
}

/** Cambio de contraseña por parte del propio cliente. */
export async function PUT(req: NextRequest) {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: { actual?: string; nueva?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const actual = body.actual || "";
  const nueva = body.nueva || "";
  if (nueva.length < 4) {
    return NextResponse.json({ error: "La contraseña nueva debe tener al menos 4 caracteres" }, { status: 400 });
  }
  if (!(await bcrypt.compare(actual, customer.password_hash))) {
    return NextResponse.json({ error: "Tu contraseña actual no es correcta" }, { status: 401 });
  }

  /*
   * El proveedor puede consultar la contraseña de sus clientes desde el
   * panel (password_box, cifrada). Si aquí solo cambiáramos el hash, le
   * seguiría enseñando la vieja — y llamaría al cliente para dictársela.
   */
  getDb()
    .prepare("UPDATE customers SET password_hash = ?, password_box = ? WHERE id = ?")
    .run(await bcrypt.hash(nueva, 10), encryptSecret(nueva), customer.id);

  return NextResponse.json({ ok: true });
}
