import { NextResponse } from "next/server";
import { getDb, InvoiceRow } from "@/lib/db";
import { getCurrentProvider } from "@/lib/provider";

export const dynamic = "force-dynamic";

/** Facturas del proveedor, la más reciente primero. */
export async function GET() {
  const provider = await getCurrentProvider();
  if (!provider) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const rows = getDb()
    .prepare("SELECT * FROM invoices WHERE provider_id = ? ORDER BY created_at DESC LIMIT 200")
    .all(provider.id) as InvoiceRow[];

  return NextResponse.json({
    invoices: rows.map((f) => ({
      id: f.id,
      number: f.number,
      concept: f.concept,
      amountCents: f.amount_cents,
      currency: f.currency,
      periodStart: f.period_start,
      periodEnd: f.period_end,
      status: f.status,
      createdAt: f.created_at,
    })),
    // Datos del receptor, para la vista imprimible
    billing: { company: provider.company || provider.email, email: provider.email },
  });
}
