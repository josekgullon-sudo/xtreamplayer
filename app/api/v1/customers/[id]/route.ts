import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { getDb, CustomerRow } from "@/lib/db";
import { providerFromBearer, apiError } from "@/lib/apiKey";
import { serializarCliente } from "@/lib/customers";
import { encryptSecret } from "@/lib/secretBox";

export const dynamic = "force-dynamic";

/**
 * API pública v1 — un cliente concreto.
 *   GET    /api/v1/customers/:id
 *   PATCH  /api/v1/customers/:id  { password?, status?, expiresAt?, label?, maxDevices?, maxProfiles? }
 *   DELETE /api/v1/customers/:id
 * Espejo del panel: mismos campos y mismos topes.
 */

function clienteDe(providerId: number, id: string): CustomerRow | undefined {
  return getDb()
    .prepare("SELECT * FROM customers WHERE id = ? AND provider_id = ?")
    .get(Number(id), providerId) as CustomerRow | undefined;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const provider = providerFromBearer(req.headers.get("authorization"));
  if (!provider) return apiError("Clave de API inválida o revocada", 401);

  const { id } = await ctx.params;
  const c = clienteDe(provider.id, id);
  if (!c) return apiError("Cliente no encontrado", 404);

  const devices = (getDb().prepare("SELECT COUNT(*) AS n FROM devices WHERE customer_id = ?").get(c.id) as { n: number }).n;
  return Response.json({ data: { ...serializarCliente(c, devices), lastSeen: c.last_seen, maxProfiles: c.max_profiles } });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const provider = providerFromBearer(req.headers.get("authorization"));
  if (!provider) return apiError("Clave de API inválida o revocada", 401);

  const { id } = await ctx.params;
  const c = clienteDe(provider.id, id);
  if (!c) return apiError("Cliente no encontrado", 404);

  let body: {
    password?: string;
    status?: string;
    expiresAt?: number;
    label?: string;
    maxDevices?: number;
    maxProfiles?: number;
    resetDevices?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return apiError("El cuerpo debe ser JSON", 400);
  }

  const db = getDb();
  if (body.password) {
    if (body.password.length < 4) return apiError("La contraseña debe tener al menos 4 caracteres", 400);
    db.prepare("UPDATE customers SET password_hash = ?, password_box = ? WHERE id = ?").run(
      await bcrypt.hash(body.password, 10),
      encryptSecret(body.password),
      c.id
    );
  }
  if (body.status !== undefined) {
    if (body.status !== "active" && body.status !== "disabled") return apiError("status debe ser active o disabled", 400);
    db.prepare("UPDATE customers SET status = ? WHERE id = ?").run(body.status, c.id);
  }
  if (typeof body.expiresAt === "number") {
    db.prepare("UPDATE customers SET expires_at = ? WHERE id = ?").run(body.expiresAt, c.id);
  }
  if (typeof body.label === "string") {
    db.prepare("UPDATE customers SET label = ? WHERE id = ?").run(body.label.trim().slice(0, 120), c.id);
  }
  if (typeof body.maxDevices === "number") {
    db.prepare("UPDATE customers SET max_devices = ? WHERE id = ?").run(Math.min(Math.max(body.maxDevices, 1), 10), c.id);
  }
  if (typeof body.maxProfiles === "number") {
    db.prepare("UPDATE customers SET max_profiles = ? WHERE id = ?").run(Math.min(Math.max(body.maxProfiles, 1), 10), c.id);
  }
  if (body.resetDevices) {
    db.prepare("DELETE FROM devices WHERE customer_id = ?").run(c.id);
  }

  const row = db.prepare("SELECT * FROM customers WHERE id = ?").get(c.id) as CustomerRow;
  return Response.json({ data: serializarCliente(row, 0) });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const provider = providerFromBearer(req.headers.get("authorization"));
  if (!provider) return apiError("Clave de API inválida o revocada", 401);

  const { id } = await ctx.params;
  const c = clienteDe(provider.id, id);
  if (!c) return apiError("Cliente no encontrado", 404);

  getDb().prepare("DELETE FROM customers WHERE id = ?").run(c.id);
  return Response.json({ ok: true });
}
