import { getDb, InvoiceRow } from "@/lib/db";

/**
 * Registro de facturas del proveedor: una fila por cobro.
 *
 * La numeración es correlativa y con año (TP-2026-00042), que es lo que pide
 * una factura formal, y se calcula dentro de la misma transacción que la
 * inserta para que dos cobros simultáneos no puedan repetir número.
 */
export function registrarFactura(datos: {
  providerId: number;
  concept: string;
  amountCents: number;
  currency?: string;
  periodStart?: number;
  periodEnd?: number;
  stripeInvoiceId?: string;
  createdAt?: number;
  /** «pagada» por defecto: lo que llega de Stripe ya está cobrado. Una
   *  factura emitida a mano desde administración puede nacer pendiente. */
  status?: "pagada" | "pendiente";
}): InvoiceRow {
  const db = getDb();

  // Idempotente sobre el id de Stripe: los webhooks pueden llegar repetidos
  if (datos.stripeInvoiceId) {
    const previa = db
      .prepare("SELECT * FROM invoices WHERE stripe_invoice_id = ?")
      .get(datos.stripeInvoiceId) as InvoiceRow | undefined;
    if (previa) return previa;
  }

  const creada = datos.createdAt ?? Date.now();
  const year = new Date(creada).getFullYear();

  return db.transaction(() => {
    const n = (db
      .prepare("SELECT COUNT(*) AS c FROM invoices WHERE number LIKE ?")
      .get(`TP-${year}-%`) as { c: number }).c;
    const number = `TP-${year}-${String(n + 1).padStart(5, "0")}`;
    const info = db
      .prepare(
        `INSERT INTO invoices (provider_id, number, concept, amount_cents, currency, period_start, period_end, status, stripe_invoice_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        datos.providerId,
        number,
        datos.concept,
        datos.amountCents,
        datos.currency || "EUR",
        datos.periodStart || 0,
        datos.periodEnd || 0,
        datos.status === "pendiente" ? "pendiente" : "pagada",
        datos.stripeInvoiceId || "",
        creada
      );
    return db.prepare("SELECT * FROM invoices WHERE id = ?").get(info.lastInsertRowid) as InvoiceRow;
  })();
}
