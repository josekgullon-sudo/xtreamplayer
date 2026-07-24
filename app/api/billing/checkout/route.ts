import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getStripe, stripeConfigured, STRIPE_PRICE_ID } from "@/lib/stripe";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Crea una sesión de Stripe Checkout para la suscripción Premium. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para suscribirte" }, { status: 401 });
  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: "Los pagos aún no están disponibles. Disfruta de tu prueba gratuita mientras tanto." },
      { status: 503 }
    );
  }

  try {
    const stripe = getStripe();
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: String(user.id) },
      });
      customerId = customer.id;
      getDb().prepare("UPDATE users SET stripe_customer_id = ? WHERE id = ?").run(customerId, user.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: STRIPE_PRICE_ID(), quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${SITE_URL}/cuenta?checkout=success`,
      cancel_url: `${SITE_URL}/cuenta?checkout=cancelled`,
      metadata: { userId: String(user.id) },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("[billing/checkout]", e);
    return NextResponse.json({ error: "No se pudo iniciar el pago. Inténtalo de nuevo." }, { status: 500 });
  }
}
