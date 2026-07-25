import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb, CustomerRow } from "@/lib/db";
import { getPanelActor, customerScopeClause } from "@/lib/provider";

export const dynamic = "force-dynamic";

/** Solo deja tocar clientes dentro del alcance del actor (proveedor o revendedor). */
async function ownedCustomer(id: string) {
  const actor = await getPanelActor();
  if (!actor) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  const scope = customerScopeClause(actor);
  const row = getDb()
    .prepare(`SELECT * FROM customers WHERE id = ? AND ${scope.sql}`)
    .get(Number(id), ...scope.params) as CustomerRow | undefined;
  if (!row) return { error: NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 }) };
  return { customer: row };
}

/** Editar cliente: contraseña, estado, dispositivos, lista o caducidad. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await ownedCustomer(id);
  if (found.error) return found.error;

  let body: {
    password?: string;
    status?: string;
    maxDevices?: number;
    label?: string;
    expiresAt?: number;
    resetDevices?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const db = getDb();
  const customer = found.customer!;

  if (body.password) {
    if (body.password.length < 4)
      return NextResponse.json({ error: "La contraseña debe tener al menos 4 caracteres" }, { status: 400 });
    db.prepare("UPDATE customers SET password_hash = ? WHERE id = ?").run(
      await bcrypt.hash(body.password, 10),
      customer.id
    );
  }
  if (body.status === "active" || body.status === "disabled") {
    db.prepare("UPDATE customers SET status = ? WHERE id = ?").run(body.status, customer.id);
  }
  if (typeof body.maxDevices === "number") {
    const max = Math.min(Math.max(body.maxDevices, 1), 10);
    db.prepare("UPDATE customers SET max_devices = ? WHERE id = ?").run(max, customer.id);
  }
  if (typeof body.label === "string") {
    db.prepare("UPDATE customers SET label = ? WHERE id = ?").run(body.label.trim().slice(0, 120), customer.id);
  }
  if (typeof body.expiresAt === "number") {
    db.prepare("UPDATE customers SET expires_at = ? WHERE id = ?").run(body.expiresAt, customer.id);
  }
  // Liberar dispositivos: el cliente cambió de tele o agotó el cupo
  if (body.resetDevices) {
    db.prepare("DELETE FROM devices WHERE customer_id = ?").run(customer.id);
  }

  const row = db.prepare("SELECT * FROM customers WHERE id = ?").get(customer.id) as CustomerRow;
  return NextResponse.json({
    customer: {
      id: row.id,
      username: row.username,
      label: row.label,
      maxDevices: row.max_devices,
      status: row.status,
      expiresAt: row.expires_at,
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await ownedCustomer(id);
  if (found.error) return found.error;

  getDb().prepare("DELETE FROM customers WHERE id = ?").run(found.customer!.id);
  return NextResponse.json({ ok: true });
}
