import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb, ProviderRow, ResellerRow } from "@/lib/db";
import { isValidEmail } from "@/lib/auth";
import {
  setProviderCookie,
  clearProviderCookie,
  setResellerCookie,
  clearResellerCookie,
  getPanelActor,
  getProviderStatus,
  providerTrialEnd,
  resellerCustomerCount,
  PROVIDER_TRIAL_CUSTOMERS,
} from "@/lib/provider";
import { stripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/** Estado de la sesión del panel: sirve para proveedor y para revendedor. */
export async function GET() {
  const actor = await getPanelActor();
  if (!actor) return NextResponse.json({ provider: null });

  const status = getProviderStatus(actor.provider);

  // El revendedor ve su propio cupo, no el del proveedor
  if (actor.kind === "reseller" && actor.ownCustomerLimit > 0) {
    status.maxCustomers = actor.ownCustomerLimit;
    status.usedCustomers = resellerCustomerCount(actor.reseller!.id);
  }

  return NextResponse.json({
    provider: {
      email: actor.kind === "reseller" ? actor.reseller!.email : actor.provider.email,
      company: actor.kind === "reseller" ? actor.reseller!.name || actor.provider.company : actor.provider.company,
      brandName: actor.provider.brand_name,
    },
    role: actor.kind,
    permissions: {
      viewAllCustomers: actor.canViewAllCustomers,
      domainAccess: actor.domainAccess,
      manageResellers: actor.canManageResellers,
      managePlan: actor.kind === "provider",
    },
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

  // Login: el mismo formulario sirve para proveedores y para sus revendedores
  const provider = db.prepare("SELECT * FROM providers WHERE email = ?").get(email) as ProviderRow | undefined;
  if (provider) {
    if (!(await bcrypt.compare(password, provider.password_hash))) {
      return NextResponse.json({ error: "Email o contraseña incorrectos" }, { status: 401 });
    }
    if (provider.status !== "active") {
      return NextResponse.json({ error: "Esta cuenta está suspendida. Contacta con soporte." }, { status: 403 });
    }
    await setProviderCookie(provider.id);
    return NextResponse.json({ ok: true, role: "provider" });
  }

  const reseller = db.prepare("SELECT * FROM resellers WHERE email = ?").get(email) as ResellerRow | undefined;
  const hash = reseller?.password_hash || "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
  if (!reseller || !(await bcrypt.compare(password, hash))) {
    return NextResponse.json({ error: "Email o contraseña incorrectos" }, { status: 401 });
  }
  if (reseller.status !== "active") {
    return NextResponse.json({ error: "Tu acceso está desactivado. Contacta con tu proveedor." }, { status: 403 });
  }
  const parent = db.prepare("SELECT * FROM providers WHERE id = ?").get(reseller.provider_id) as
    | ProviderRow
    | undefined;
  if (!parent || parent.status !== "active") {
    return NextResponse.json({ error: "El servicio de tu proveedor no está activo." }, { status: 403 });
  }

  await setResellerCookie(reseller.id);
  return NextResponse.json({ ok: true, role: "reseller" });
}

/** Cierre de sesión (cualquiera de los dos roles). */
export async function DELETE() {
  await clearProviderCookie();
  await clearResellerCookie();
  return NextResponse.json({ ok: true });
}
