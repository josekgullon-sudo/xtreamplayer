import { NextRequest, NextResponse } from "next/server";
import { getDb, ProviderPlanRow } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/admin";
import { anotar } from "@/lib/adminData";
import { stripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Los planes de proveedor y su precio en Stripe.
 *
 * Cada plan necesita el identificador del precio que tiene creado en Stripe
 * («price_...»): sin él, contratar contesta «los pagos aún no están
 * activados» y hay que activar el plan a mano. Hasta ahora eso solo se podía
 * poner editando la base de datos por SSH, que es la clase de tarea que no se
 * hace nunca y deja el cobro sin arrancar.
 */
export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Solo para administradores" }, { status: 403 });

  const planes = getDb()
    .prepare("SELECT * FROM provider_plans ORDER BY sort_order ASC")
    .all() as ProviderPlanRow[];

  return NextResponse.json({
    planes: planes.map((p) => ({
      id: p.id,
      nombre: p.name,
      precioCents: p.price_month,
      maxClientes: p.max_customers,
      stripePriceId: p.stripe_price_id,
      activo: Boolean(p.active),
    })),
    // Con las claves sin poner, los identificadores de precio no sirven de nada
    stripeListo: stripeConfigured(),
  });
}

/** Cambiar el precio de Stripe de un plan, o encenderlo y apagarlo */
export async function PATCH(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Solo para administradores" }, { status: 403 });

  let body: { id?: string; stripePriceId?: string; activo?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const db = getDb();
  const plan = db.prepare("SELECT * FROM provider_plans WHERE id = ?").get(body.id || "") as
    | ProviderPlanRow
    | undefined;
  if (!plan) return NextResponse.json({ error: "No existe ese plan" }, { status: 404 });

  if (typeof body.stripePriceId === "string") {
    const precio = body.stripePriceId.trim();
    /* Un identificador de precio de Stripe empieza por «price_». Dejar pasar
       cualquier cosa aquí significa descubrir el error cuando un cliente
       intenta pagar, que es el peor momento posible */
    if (precio && !/^price_[A-Za-z0-9]+$/.test(precio)) {
      return NextResponse.json(
        { error: "Eso no parece un precio de Stripe: empiezan por «price_»" },
        { status: 400 }
      );
    }
    db.prepare("UPDATE provider_plans SET stripe_price_id = ? WHERE id = ?").run(precio, plan.id);
    anotar(admin.email, "plan.precio", plan.id, precio || "(vaciado)");
  }

  if (typeof body.activo === "boolean") {
    db.prepare("UPDATE provider_plans SET active = ? WHERE id = ?").run(body.activo ? 1 : 0, plan.id);
    anotar(admin.email, body.activo ? "plan.activado" : "plan.desactivado", plan.id, "");
  }

  return NextResponse.json({ ok: true });
}
