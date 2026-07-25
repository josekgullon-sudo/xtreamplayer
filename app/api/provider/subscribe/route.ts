import { NextRequest, NextResponse } from "next/server";
import { getDb, ProviderPlanRow } from "@/lib/db";
import { getCurrentProvider } from "@/lib/provider";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Checkout de Stripe para contratar o cambiar de plan de proveedor. */
export async function POST(req: NextRequest) {
  const provider = await getCurrentProvider();
  if (!provider) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: { planId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const db = getDb();
  const plan = db.prepare("SELECT * FROM provider_plans WHERE id = ? AND active = 1").get(body.planId || "") as
    | ProviderPlanRow
    | undefined;
  if (!plan) return NextResponse.json({ error: "Plan no válido" }, { status: 400 });

  if (!stripeConfigured() || !plan.stripe_price_id) {
    return NextResponse.json(
      {
        error:
          "Los pagos aún no están activados. Escríbenos y activamos tu plan manualmente mientras tanto.",
        contact: true,
      },
      { status: 503 }
    );
  }

  try {
    const stripe = getStripe();
    let customerId = provider.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: provider.email,
        name: provider.company || undefined,
        metadata: { providerId: String(provider.id) },
      });
      customerId = customer.id;
      db.prepare("UPDATE providers SET stripe_customer_id = ? WHERE id = ?").run(customerId, provider.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${SITE_URL}/panel?checkout=success`,
      cancel_url: `${SITE_URL}/panel/plan?checkout=cancelled`,
      metadata: { providerId: String(provider.id), planId: plan.id },
      subscription_data: { metadata: { providerId: String(provider.id), planId: plan.id } },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("[provider/subscribe]", e);
    return NextResponse.json({ error: "No se pudo iniciar el pago" }, { status: 500 });
  }
}
