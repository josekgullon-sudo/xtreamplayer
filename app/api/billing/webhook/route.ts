import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getDb, UserRow, ProviderRow } from "@/lib/db";
import { getStripe, stripeConfigured, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { registrarFactura } from "@/lib/invoices";

export const dynamic = "force-dynamic";

/**
 * Webhook de Stripe: mantiene premium_until sincronizado con la suscripción.
 * Eventos relevantes: checkout completado, suscripción actualizada/cancelada,
 * pago de renovación correcto o fallido.
 */
export async function POST(req: NextRequest) {
  if (!stripeConfigured() || !STRIPE_WEBHOOK_SECRET()) {
    return NextResponse.json({ error: "Stripe no configurado" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Falta firma" }, { status: 400 });

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = getStripe().webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET());
  } catch {
    return NextResponse.json({ error: "Firma inválida" }, { status: 400 });
  }

  const db = getDb();

  function applySubscription(sub: Stripe.Subscription) {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

    const active = sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";
    // current_period_end viene en cada item de la suscripción
    const periodEnd = Math.max(0, ...sub.items.data.map((i) => i.current_period_end || 0)) * 1000;
    // past_due mantiene el acceso hasta el fin del periodo ya pagado
    const activeUntil = active ? periodEnd : Math.min(periodEnd, Date.now());

    // ¿Es una suscripción de proveedor (B2B)?
    const provider = db.prepare("SELECT * FROM providers WHERE stripe_customer_id = ?").get(customerId) as
      | ProviderRow
      | undefined;
    if (provider) {
      const planId = sub.metadata?.planId || provider.plan_id;
      db.prepare(
        "UPDATE providers SET plan_id = ?, plan_expires_at = ?, stripe_subscription_id = ? WHERE id = ?"
      ).run(planId, activeUntil, sub.id, provider.id);
      return;
    }

    // Si no, es un usuario final con Premium
    const user = db.prepare("SELECT * FROM users WHERE stripe_customer_id = ?").get(customerId) as UserRow | undefined;
    if (!user) return;

    db.prepare("UPDATE users SET premium_until = ?, stripe_subscription_id = ? WHERE id = ?").run(
      activeUntil,
      sub.id,
      user.id
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const sub = await getStripe().subscriptions.retrieve(subId);
          applySubscription(sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        applySubscription(event.data.object);
        break;
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subRef = invoice.parent?.subscription_details?.subscription;
        const subId = typeof subRef === "string" ? subRef : subRef?.id;
        if (subId) {
          const sub = await getStripe().subscriptions.retrieve(subId);
          applySubscription(sub);
        }
        // Cada cobro de proveedor queda como factura consultable en su panel
        if (event.type === "invoice.paid" && invoice.amount_paid > 0) {
          const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
          const provider = db.prepare("SELECT * FROM providers WHERE stripe_customer_id = ?").get(customerId || "") as
            | ProviderRow
            | undefined;
          if (provider) {
            const linea = invoice.lines?.data?.[0];
            registrarFactura({
              providerId: provider.id,
              concept: linea?.description || "Suscripción TOTALplayer",
              amountCents: invoice.amount_paid,
              currency: (invoice.currency || "eur").toUpperCase(),
              periodStart: (linea?.period?.start || 0) * 1000,
              periodEnd: (linea?.period?.end || 0) * 1000,
              stripeInvoiceId: invoice.id,
            });
          }
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("[billing/webhook]", event.type, e);
    return NextResponse.json({ error: "Error procesando evento" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
