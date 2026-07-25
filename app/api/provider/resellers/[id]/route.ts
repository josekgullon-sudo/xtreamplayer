import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb, ResellerRow } from "@/lib/db";
import { getCurrentProvider, resellerCustomerCount } from "@/lib/provider";

export const dynamic = "force-dynamic";

async function ownedReseller(id: string) {
  const provider = await getCurrentProvider();
  if (!provider) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  const row = getDb()
    .prepare("SELECT * FROM resellers WHERE id = ? AND provider_id = ?")
    .get(Number(id), provider.id) as ResellerRow | undefined;
  if (!row) return { error: NextResponse.json({ error: "Revendedor no encontrado" }, { status: 404 }) };
  return { reseller: row };
}

/** Cambiar permisos, contraseña, cupo o estado del revendedor. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await ownedReseller(id);
  if (found.error) return found.error;
  const reseller = found.reseller!;

  let body: {
    password?: string;
    name?: string;
    status?: string;
    viewAllCustomers?: boolean;
    domainAccess?: string;
    maxCustomers?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const db = getDb();

  if (body.password) {
    if (body.password.length < 8) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
    }
    db.prepare("UPDATE resellers SET password_hash = ? WHERE id = ?").run(
      await bcrypt.hash(body.password, 12),
      reseller.id
    );
  }
  if (typeof body.name === "string") {
    db.prepare("UPDATE resellers SET name = ? WHERE id = ?").run(body.name.trim().slice(0, 120), reseller.id);
  }
  if (body.status === "active" || body.status === "disabled") {
    db.prepare("UPDATE resellers SET status = ? WHERE id = ?").run(body.status, reseller.id);
  }
  if (typeof body.viewAllCustomers === "boolean") {
    db.prepare("UPDATE resellers SET view_all_customers = ? WHERE id = ?").run(
      body.viewAllCustomers ? 1 : 0,
      reseller.id
    );
  }
  if (body.domainAccess && ["full", "names", "none"].includes(body.domainAccess)) {
    db.prepare("UPDATE resellers SET domain_access = ? WHERE id = ?").run(body.domainAccess, reseller.id);
  }
  if (typeof body.maxCustomers === "number") {
    db.prepare("UPDATE resellers SET max_customers = ? WHERE id = ?").run(
      Math.max(0, body.maxCustomers),
      reseller.id
    );
  }

  const row = db.prepare("SELECT * FROM resellers WHERE id = ?").get(reseller.id) as ResellerRow;
  return NextResponse.json({
    reseller: {
      id: row.id,
      email: row.email,
      name: row.name,
      viewAllCustomers: row.view_all_customers === 1,
      domainAccess: row.domain_access,
      maxCustomers: row.max_customers,
      customers: resellerCustomerCount(row.id),
      status: row.status,
    },
  });
}

/**
 * Baja del revendedor. Sus clientes NO se borran: pasan a depender
 * directamente del proveedor para no dejar a nadie sin servicio.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await ownedReseller(id);
  if (found.error) return found.error;

  const db = getDb();
  const moved = db.prepare("UPDATE customers SET reseller_id = 0 WHERE reseller_id = ?").run(found.reseller!.id);
  db.prepare("DELETE FROM resellers WHERE id = ?").run(found.reseller!.id);

  return NextResponse.json({ ok: true, movedCustomers: moved.changes });
}
