import { NextRequest, NextResponse } from "next/server";
import { getDb, InvoiceRow, ProviderRow } from "@/lib/db";
import { getCurrentProvider } from "@/lib/provider";
import { getCurrentAdmin } from "@/lib/admin";
import { emisor } from "@/lib/facturacion";
import { facturaPdf, nombreArchivo } from "@/lib/facturaPdf";

export const dynamic = "force-dynamic";

/**
 * La factura en PDF, de un clic.
 *
 * La misma dirección sirve al proveedor —solo las suyas— y al administrador
 * —todas—, porque el documento es exactamente el mismo: cambiar una coma
 * entre la copia del cliente y la de la plataforma es como acaban existiendo
 * dos facturas distintas con el mismo número.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const factura = getDb().prepare("SELECT * FROM invoices WHERE id = ?").get(Number(id)) as InvoiceRow | undefined;
  if (!factura) return NextResponse.json({ error: "No existe esa factura" }, { status: 404 });

  const provider = await getCurrentProvider();
  const admin = provider ? null : await getCurrentAdmin();
  const suya = provider && provider.id === factura.provider_id;
  if (!suya && !admin) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // El receptor es el proveedor al que se le emitió, mire quien mire
  const destinatario = (suya
    ? provider
    : (getDb().prepare("SELECT * FROM providers WHERE id = ?").get(factura.provider_id) as ProviderRow | undefined)) as
    | ProviderRow
    | undefined;
  if (!destinatario) return NextResponse.json({ error: "No existe ese proveedor" }, { status: 404 });

  const pdf = facturaPdf(
    {
      number: factura.number,
      concept: factura.concept,
      amountCents: factura.amount_cents,
      currency: factura.currency,
      periodStart: factura.period_start,
      periodEnd: factura.period_end,
      status: factura.status,
      createdAt: factura.created_at,
    },
    emisor(),
    {
      nombre: destinatario.tax_name || destinatario.company || destinatario.email,
      nif: destinatario.tax_id || "",
      direccion: destinatario.tax_address || "",
      email: destinatario.email,
    }
  );

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // «attachment» para que baje el archivo en vez de abrirse en una pestaña:
      // lo que quiere quien pulsa Descargar es tenerlo para reenviarlo
      "Content-Disposition": `attachment; filename="${nombreArchivo(factura.number)}"`,
      "Cache-Control": "no-store",
    },
  });
}
