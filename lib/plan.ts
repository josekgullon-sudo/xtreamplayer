import { UserRow } from "./db";

/**
 * Modelo híbrido:
 * - Registro → 15 días de Premium de prueba, sin tarjeta.
 * - Al expirar → plan Gratis para siempre (limitado), nunca se bloquea el servicio.
 * - Premium de pago (Stripe) → 2,99 €/mes.
 */

export const TRIAL_DAYS = 15;
export const PREMIUM_PRICE_EUR = "2,99";
export const FREE_CLOUD_PLAYLISTS = 1;
export const PREMIUM_CLOUD_PLAYLISTS = 20;

export type PlanName = "free" | "premium";
export type PlanSource = "trial" | "subscription" | "free";

export interface PlanInfo {
  plan: PlanName;
  source: PlanSource;
  trialEndsAt: number;
  trialDaysLeft: number;
  premiumUntil: number;
  maxCloudPlaylists: number;
}

export function getPlanInfo(user: UserRow, now = Date.now()): PlanInfo {
  const onSubscription = user.premium_until > now;
  const onTrial = !onSubscription && user.trial_ends_at > now;
  const premium = onSubscription || onTrial;
  const trialDaysLeft = onTrial ? Math.max(0, Math.ceil((user.trial_ends_at - now) / 86_400_000)) : 0;
  return {
    plan: premium ? "premium" : "free",
    source: onSubscription ? "subscription" : onTrial ? "trial" : "free",
    trialEndsAt: user.trial_ends_at,
    trialDaysLeft,
    premiumUntil: user.premium_until,
    maxCloudPlaylists: premium ? PREMIUM_CLOUD_PLAYLISTS : FREE_CLOUD_PLAYLISTS,
  };
}

export function trialEndTimestamp(from = Date.now()): number {
  return from + TRIAL_DAYS * 86_400_000;
}
