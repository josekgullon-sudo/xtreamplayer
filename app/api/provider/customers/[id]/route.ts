import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb, CustomerRow, DeviceRow, CustomerLoginRow } from "@/lib/db";
import { getPanelActor, customerScopeClause, resolveCustomerPlaylist } from "@/lib/provider";
import { encryptSecret, decryptSecret } from "@/lib/secretBox";

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

/** Ficha completa del cliente: credenciales, dispositivos e historial de accesos. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await ownedCustomer(id);
  if (found.error) return found.error;
  const c = found.customer!;
  const db = getDb();

  const devices = db
    .prepare("SELECT * FROM devices WHERE customer_id = ? ORDER BY last_seen DESC")
    .all(c.id) as DeviceRow[];
  const logins = db
    .prepare("SELECT * FROM customer_logins WHERE customer_id = ? ORDER BY created_at DESC LIMIT 25")
    .all(c.id) as CustomerLoginRow[];
  const playlist = resolveCustomerPlaylist(c);

  return NextResponse.json({
    customer: {
      id: c.id,
      username: c.username,
      // Se guarda cifrada aparte del hash para poder mostrarla al proveedor
      password: decryptSecret(c.password_box),
      label: c.label,
      status: c.status,
      createdAt: c.created_at,
      expiresAt: c.expires_at,
      lastSeen: c.last_seen,
      maxDevices: c.max_devices,
      maxProfiles: c.max_profiles,
      resellerId: c.reseller_id,
    },
    playlist: {
      type: playlist.type,
      url: playlist.url,
      username: playlist.username,
      password: playlist.password,
      domainId: c.domain_id,
    },
    devices: devices.map((d) => ({
      id: d.id,
      key: d.device_key,
      platform: d.platform,
      ip: d.ip,
      name: d.name,
      firstSeen: d.first_seen,
      lastSeen: d.last_seen,
    })),
    logins: logins.map((l) => ({
      id: l.id,
      platform: l.platform,
      ip: l.ip,
      ok: l.ok === 1,
      at: l.created_at,
    })),
  });
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
    maxProfiles?: number;
    label?: string;
    expiresAt?: number;
    resetDevices?: boolean;
    removeDevice?: number;
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
    db.prepare("UPDATE customers SET password_hash = ?, password_box = ? WHERE id = ?").run(
      await bcrypt.hash(body.password, 10),
      encryptSecret(body.password),
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
  if (typeof body.maxProfiles === "number") {
    const max = Math.min(Math.max(body.maxProfiles, 1), 10);
    db.prepare("UPDATE customers SET max_profiles = ? WHERE id = ?").run(max, customer.id);
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
  if (typeof body.removeDevice === "number") {
    db.prepare("DELETE FROM devices WHERE id = ? AND customer_id = ?").run(body.removeDevice, customer.id);
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
