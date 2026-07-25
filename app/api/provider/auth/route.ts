import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb, ProviderRow } from "@/lib/db";
import { isValidEmail } from "@/lib/auth";
import {
  setProviderCookie,
  clearProviderCookie,
  getCurrentProvider,
  getProviderStatus,
  providerTrialEnd,
  PROVIDER_TRIAL_CUSTOMERS,
} from "@/lib/provider";
import { stripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/** Estado de la sesión del proveedor. */
export async function GET() {
  const provider = await getCurrentProvider();
  if (!provider) return NextResponse.json({ provider: null });
  const status = getProviderStatus(provider);
  return NextResponse.json({
    provider: { email: provider.email, company: provider.company, brandName: provider.brand_name },
    status,
    billingEnabled: stripeConfigured(),
  });
}

/** Alta e inicio de sesión: { action: "register" | "login" } */
export async function POST(req: NextRequest) {
  let body: { action?: string; email?: string; password?: string; company?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  const db = getDb();

  if (body.action === "register") {
    if (!isValidEmail(email)) return NextResponse.json({ error: "Introduce un email válido" }, { status: 400 });
    if (password.length < 8)
      return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });

    const exists = db.prepare("SELECT id FROM providers WHERE email = ?").get(email);
    if (exists) return NextResponse.json({ error: "Ya existe una cuenta de proveedor con este email" }, { status: 409 });

    const hash = await bcrypt.hash(password, 12);
    const result = db
      .prepare(
        "INSERT INTO providers (email, password_hash, company, trial_ends_at, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(email, hash, (body.company || "").trim().slice(0, 120), providerTrialEnd(), Date.now());

    await setProviderCookie(Number(result.lastInsertRowid));
    return NextResponse.json({ ok: true, trialCustomers: PROVIDER_TRIAL_CUSTOMERS });
  }

  // login
  const provider = db.prepare("SELECT * FROM providers WHERE email = ?").get(email) as ProviderRow | undefined;
  const hash = provider?.password_hash || "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
  const valid = await bcrypt.compare(password, hash);
  if (!provider || !valid) {
    return NextResponse.json({ error: "Email o contraseña incorrectos" }, { status: 401 });
  }
  if (provider.status !== "active") {
    return NextResponse.json({ error: "Esta cuenta está suspendida. Contacta con soporte." }, { status: 403 });
  }

  await setProviderCookie(provider.id);
  return NextResponse.json({ ok: true });
}

/** Cierre de sesión. */
export async function DELETE() {
  await clearProviderCookie();
  return NextResponse.json({ ok: true });
}
