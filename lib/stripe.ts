import Stripe from "stripe";

/**
 * Stripe se inicializa de forma perezosa. Si no hay claves configuradas,
 * la app funciona igual (prueba gratuita incluida) y los endpoints de
 * facturación responden que los pagos aún no están disponibles.
 */

let _stripe: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY no configurada");
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

export const STRIPE_PRICE_ID = () => process.env.STRIPE_PRICE_ID || "";
export const STRIPE_WEBHOOK_SECRET = () => process.env.STRIPE_WEBHOOK_SECRET || "";
