import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb, ResellerRow } from "@/lib/db";
import { isValidEmail } from "@/lib/auth";
import { getCurrentProvider, listResellers, resellerCustomerCount } from "@/lib/provider";

export const dynamic = "force-dynamic";

function serialize(row: ResellerRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    viewAllCustomers: row.view_all_customers === 1,
    domainAccess: row.domain_access,
    maxCustomers: row.max_customers,
    customers: resellerCustomerCount(row.id),
    status: row.status,
    createdAt: row.created_at,
  };
}

/** Revendedores del proveedor. Solo el proveedor puede gestionarlos. */
export async function GET() {
  const provider = await getCurrentProvider();
  if (!provider) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  return NextResponse.json({ resellers: listResellers(provider.id).map(serialize) });
}

/** Alta de revendedor con sus permisos. */
export async function POST(req: NextRequest) {
  const provider = await getCurrentProvider();
  if (!provider) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: {
    email?: string;
    password?: string;
    name?: string;
    viewAllCustomers?: boolean;
    domainAccess?: string;
    maxCustomers?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  if (!isValidEmail(email)) return NextResponse.json({ error: "Introduce un email válido" }, { status: 400 });
  if (password.length < 8) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
  }

  const db = getDb();
  // El email debe ser único en todo el sistema para que el acceso no sea ambiguo
  const dupReseller = db.prepare("SELECT id FROM resellers WHERE email = ?").get(email);
  const dupProvider = db.prepare("SELECT id FROM providers WHERE email = ?").get(email);
  if (dupReseller || dupProvider) {
    return NextResponse.json({ error: "Ese email ya está en uso" }, { status: 409 });
  }

  const domainAccess = ["full", "names", "none"].includes(body.domainAccess || "")
    ? (body.domainAccess as string)
    : "names";

  const result = db
    .prepare(
      `INSERT INTO resellers (provider_id, email, password_hash, name, view_all_customers, domain_access, max_customers, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      provider.id,
      email,
      await bcrypt.hash(password, 12),
      (body.name || "").trim().slice(0, 120),
      body.viewAllCustomers ? 1 : 0,
      domainAccess,
      Math.max(0, Number(body.maxCustomers) || 0),
      Date.now()
    );

  const row = db.prepare("SELECT * FROM resellers WHERE id = ?").get(result.lastInsertRowid) as ResellerRow;
  return NextResponse.json({ reseller: serialize(row) });
}
