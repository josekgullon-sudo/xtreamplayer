import { NextRequest, NextResponse } from "next/server";
import { getDb, InvoiceRow } from "@/lib/db";
import { getCurrentProvider } from "@/lib/provider";
import { emisor, desglose } from "@/lib/facturacion";

export const dynamic = "force-dynamic";

/** Facturas del proveedor, la más reciente primero. */
export async function GET() {
  const provider = await getCurrentProvider();
  if (!provider) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const rows = getDb()
    .prepare("SELECT * FROM invoices WHERE provider_id = ? ORDER BY created_at DESC LIMIT 200")
    .all(provider.id) as InvoiceRow[];

  return NextResponse.json({
    invoices: rows.map((f) => {
      const iva = desglose(f.amount_cents);
      return {
        id: f.id,
        number: f.number,
        concept: f.concept,
        amountCents: f.amount_cents,
        currency: f.currency,
        periodStart: f.period_start,
        periodEnd: f.period_end,
        status: f.status,
        createdAt: f.created_at,
        // El desglose lo calcula el servidor: el tipo de IVA es cosa suya, no del navegador
        baseCents: iva?.baseCents ?? null,
        ivaCents: iva?.ivaCents ?? null,
        ivaPorcentaje: iva?.porcentaje ?? 0,
      };
    }),
    // Datos del receptor, para la vista imprimible
    billing: {
      company: provider.company || provider.email,
      email: provider.email,
      taxName: provider.tax_name || "",
      taxId: provider.tax_id || "",
      taxAddress: provider.tax_address || "",
    },
    emisor: emisor(),
  });
}

/**
 * Sus datos fiscales. Los pone él: nadie más sabe con qué razón social ni
 * con qué NIF está dado de alta, y una factura equivocada hay que rehacerla.
 */
export async function PUT(req: NextRequest) {
  const provider = await getCurrentProvider();
  if (!provider) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: { taxName?: string; taxId?: string; taxAddress?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  getDb()
    .prepare("UPDATE providers SET tax_name = ?, tax_id = ?, tax_address = ? WHERE id = ?")
    .run(
      (body.taxName || "").trim().slice(0, 120),
      (body.taxId || "").trim().slice(0, 40),
      (body.taxAddress || "").trim().slice(0, 300),
      provider.id
    );

  return NextResponse.json({ ok: true });
}
