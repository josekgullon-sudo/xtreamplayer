"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import Loading from "@/components/Loading";

interface Factura {
  id: number;
  number: string;
  concept: string;
  amountCents: number;
  currency: string;
  periodStart: number;
  periodEnd: number;
  status: "pagada" | "pendiente" | "anulada";
  createdAt: number;
}

function euros(cents: number, currency: string) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: currency || "EUR" }).format(cents / 100);
}

function fecha(ms: number) {
  return ms ? new Date(ms).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

/** Facturas del proveedor, con vista imprimible (imprimir → guardar como PDF). */
export default function InvoicesSection() {
  const [datos, setDatos] = useState<{ invoices: Factura[]; billing: { company: string; email: string } } | null>(null);
  const [imprimiendo, setImprimiendo] = useState<Factura | null>(null);

  useEffect(() => {
    fetch("/api/provider/invoices")
      .then((r) => r.json())
      .then(setDatos)
      .catch(() => {});
  }, []);

  // La vista imprimible se pinta y al momento se lanza el diálogo del sistema
  useEffect(() => {
    if (!imprimiendo) return;
    const t = setTimeout(() => window.print(), 150);
    const after = () => setImprimiendo(null);
    window.addEventListener("afterprint", after);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", after);
    };
  }, [imprimiendo]);

  if (!datos) return <Loading messages={["Cargando tus facturas…"]} compact />;

  return (
    <>
      {datos.invoices.length === 0 ? (
        <div className="pa-empty">
          Aún no hay facturas. Aparecerán aquí con cada cobro de tu plan.
        </div>
      ) : (
        <table className="panel-table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Concepto</th>
              <th>Periodo</th>
              <th>Importe</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {datos.invoices.map((f) => (
              <tr key={f.id}>
                <td><strong>{f.number}</strong></td>
                <td>{f.concept}</td>
                <td>
                  {f.periodStart ? `${fecha(f.periodStart)} — ${fecha(f.periodEnd)}` : fecha(f.createdAt)}
                </td>
                <td>{euros(f.amountCents, f.currency)}</td>
                <td>
                  <span className={`badge ${f.status === "pagada" ? "badge-success" : f.status === "pendiente" ? "badge-accent" : ""}`}>
                    {f.status.charAt(0).toUpperCase() + f.status.slice(1)}
                  </span>
                </td>
                <td className="col-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => setImprimiendo(f)}>
                    <Icon name="external" size={14} /> Descargar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {imprimiendo && (
        <div className="factura-print">
          <div className="factura-hoja">
            <div className="factura-cab">
              <div>
                <div className="factura-marca">TOTALplayer</div>
                <div className="factura-emisor">totalplayer.app · soporte@totalplayer.app</div>
              </div>
              <div className="factura-num">
                <h1>Factura</h1>
                <p>{imprimiendo.number}</p>
                <p>{fecha(imprimiendo.createdAt)}</p>
              </div>
            </div>

            <div className="factura-partes">
              <div>
                <h3>Facturar a</h3>
                <p>{datos.billing.company}</p>
                <p>{datos.billing.email}</p>
              </div>
            </div>

            <table className="factura-lineas">
              <thead>
                <tr><th>Concepto</th><th>Periodo</th><th>Importe</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>{imprimiendo.concept}</td>
                  <td>{imprimiendo.periodStart ? `${fecha(imprimiendo.periodStart)} — ${fecha(imprimiendo.periodEnd)}` : "—"}</td>
                  <td>{euros(imprimiendo.amountCents, imprimiendo.currency)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total ({imprimiendo.status})</td>
                  <td>{euros(imprimiendo.amountCents, imprimiendo.currency)}</td>
                </tr>
              </tfoot>
            </table>

            <p className="factura-pie">IVA incluido cuando aplique. Gracias por confiar en TOTALplayer.</p>
          </div>
        </div>
      )}
    </>
  );
}
