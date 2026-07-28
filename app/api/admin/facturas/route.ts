import { NextRequest, NextResponse } from "next/server";
import { getDb, InvoiceRow, ProviderRow } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/admin";
import { facturas, anotar } from "@/lib/adminData";
import { registrarFactura } from "@/lib/invoices";

export const dynamic = "force-dynamic";

/** Todas las facturas emitidas a proveedores. */
export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Solo para administradores" }, { status: 403 });

  return NextResponse.json({ facturas: facturas(req.nextUrl.searchParams.get("estado") || "") });
}

/**
 * Emitir una factura a mano.
 *
 * Las de Stripe entran solas por su webhook, pero no todo se cobra por ahí:
 * una transferencia, un acuerdo aparte o un mes suelto había que apuntarlos
 * en la base de datos a mano.
 */
export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Solo para administradores" }, { status: 403 });

  let body: { proveedorId?: number; concepto?: string; importe?: number; estado?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const proveedor = getDb()
    .prepare("SELECT * FROM providers WHERE id = ?")
    .get(Number(body.proveedorId || 0)) as ProviderRow | undefined;
  if (!proveedor) return NextResponse.json({ error: "No existe ese proveedor" }, { status: 404 });

  const concepto = (body.concepto || "").trim().slice(0, 200);
  if (!concepto) return NextResponse.json({ error: "Indica el concepto" }, { status: 400 });

  // En euros con dos decimales, a céntimos: en coma flotante, 5 acaba
  // cobrándose como 4,99
  const importe = Math.round(Number(body.importe) * 100);
  if (!Number.isFinite(importe) || importe <= 0) {
    return NextResponse.json({ error: "El importe debe ser mayor que cero" }, { status: 400 });
  }

  const factura = registrarFactura({
    providerId: proveedor.id,
    concept: concepto,
    amountCents: importe,
    status: body.estado === "pendiente" ? "pendiente" : "pagada",
  });

  anotar(admin.email, "factura", proveedor.email, `${factura.number} · ${(importe / 100).toFixed(2)} €`);
  return NextResponse.json({ ok: true, numero: factura.number });
}

/**
 * Cambiar el estado: cobrada, pendiente o anulada.
 *
 * No se borran. Una factura emitida deja rastro aunque se anule: es lo que
 * exige cualquier contabilidad, y lo que permite explicar un número que
 * falta en la serie.
 */
export async function PATCH(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Solo para administradores" }, { status: 403 });

  let body: { id?: number; estado?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const estado = String(body.estado || "");
  if (!["pagada", "pendiente", "anulada"].includes(estado)) {
    return NextResponse.json({ error: "Estado no válido" }, { status: 400 });
  }

  const db = getDb();
  const factura = db.prepare("SELECT * FROM invoices WHERE id = ?").get(Number(body.id || 0)) as
    | InvoiceRow
    | undefined;
  if (!factura) return NextResponse.json({ error: "No existe esa factura" }, { status: 404 });

  db.prepare("UPDATE invoices SET status = ? WHERE id = ?").run(estado, factura.id);
  anotar(admin.email, "factura", factura.number, `estado → ${estado}`);
  return NextResponse.json({ ok: true });
}
