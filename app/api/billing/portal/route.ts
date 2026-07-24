import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Portal de cliente de Stripe: cambiar tarjeta, ver facturas, cancelar. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!stripeConfigured() || !user.stripe_customer_id) {
    return NextResponse.json({ error: "No tienes una suscripción activa" }, { status: 400 });
  }

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${SITE_URL}/cuenta`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("[billing/portal]", e);
    return NextResponse.json({ error: "No se pudo abrir el portal de facturación" }, { status: 500 });
  }
}
