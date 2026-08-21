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
  baseCents: number | null;
  ivaCents: number | null;
  ivaPorcentaje: number;
}

interface Facturacion {
  company: string;
  email: string;
  taxName: string;
  taxId: string;
  taxAddress: string;
}

interface Emisor {
  nombre: string;
  nif: string;
  direccion: string;
  email: string;
  web: string;
}

function euros(cents: number, currency: string) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: currency || "EUR" }).format(cents / 100);
}

function fecha(ms: number) {
  return ms ? new Date(ms).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

/**
 * Facturas del proveedor.
 *
 * «Descargar PDF» baja el archivo hecho en el servidor, que es lo que se le
 * reenvía al gestor. «Ver» sigue abriendo la vista de la propia página, que
 * es más rápida para comprobar un dato de un vistazo y para imprimirla en
 * papel si a alguien le hace falta.
 */
export default function InvoicesSection() {
  const [datos, setDatos] = useState<{ invoices: Factura[]; billing: Facturacion; emisor: Emisor } | null>(null);
  const [imprimiendo, setImprimiendo] = useState<Factura | null>(null);
  const [editando, setEditando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

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

  async function guardarFiscales(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const cuerpo = {
      taxName: String(fd.get("taxName") || ""),
      taxId: String(fd.get("taxId") || ""),
      taxAddress: String(fd.get("taxAddress") || ""),
    };
    const res = await fetch("/api/provider/invoices", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    if (!res.ok) return;
    setDatos((d) => (d ? { ...d, billing: { ...d.billing, ...cuerpo } } : d));
    setEditando(false);
    setAviso("Datos guardados. Las facturas que descargues los llevarán.");
  }

  if (!datos) return <Loading messages={["Cargando tus facturas…"]} compact />;

  const { billing, emisor } = datos;
  const faltanDatos = !billing.taxName || !billing.taxId;

  return (
    <>
      {aviso && (
        <div className="badge badge-success" style={{ display: "block", padding: "12px 16px", marginBottom: 16 }} role="status">
          {aviso}
        </div>
      )}

      {/* Sin NIF ni razón social la factura no le vale a su gestor, y acaba
          pidiéndola rehecha por correo */}
      <div className={`card factura-fiscales ${faltanDatos ? "incompleto" : ""}`}>
        <div>
          <h3>Tus datos de facturación</h3>
          {faltanDatos ? (
            <p className="panel-sub">
              Añade tu razón social y tu NIF: sin ellos, tus facturas no le sirven a tu gestor.
            </p>
          ) : (
            <p className="panel-sub">
              {billing.taxName} · {billing.taxId}
              {billing.taxAddress ? ` · ${billing.taxAddress}` : ""}
            </p>
          )}
        </div>
        <button className={`btn btn-sm ${faltanDatos ? "btn-primary" : "btn-ghost"}`} onClick={() => setEditando((v) => !v)}>
          {faltanDatos ? "Añadir" : "Editar"}
        </button>
      </div>

      {editando && (
        <form className="card factura-form" onSubmit={guardarFiscales}>
          <div className="auth-field">
            <label className="label" htmlFor="fi-nombre">Razón social o nombre</label>
            <input id="fi-nombre" name="taxName" className="input" defaultValue={billing.taxName} placeholder="Mi Empresa S.L." />
          </div>
          <div className="auth-field">
            <label className="label" htmlFor="fi-nif">NIF / CIF</label>
            <input id="fi-nif" name="taxId" className="input" defaultValue={billing.taxId} placeholder="B12345678" />
          </div>
          <div className="auth-field" style={{ gridColumn: "1 / -1" }}>
            <label className="label" htmlFor="fi-dir">Dirección fiscal</label>
            <input id="fi-dir" name="taxAddress" className="input" defaultValue={billing.taxAddress} placeholder="Calle Mayor 1, 28013 Madrid" />
          </div>
          <div className="row-actions" style={{ gridColumn: "1 / -1" }}>
            <button className="btn btn-primary btn-sm" type="submit">Guardar</button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditando(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {datos.invoices.length === 0 ? (
        /* Dentro de una caja, como el resto de listas vacías del panel */
        <div className="card">
          <div className="pa-empty">
            Aún no hay facturas. Aparecerán aquí con cada cobro de tu plan.
          </div>
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
                  {/* Un enlace de verdad, no un botón que abre el diálogo de
                      imprimir: se puede pulsar, guardar o abrir en otra pestaña,
                      y en un móvil funciona igual que en un ordenador */}
                  <a className="btn btn-ghost btn-sm" href={`/api/facturas/${f.id}/pdf`} download>
                    <Icon name="upload" size={14} /> Descargar PDF
                  </a>
                  <button className="btn btn-ghost btn-sm" onClick={() => setImprimiendo(f)}>
                    <Icon name="external" size={14} /> Ver
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
                <div className="factura-marca">{emisor.nombre}</div>
                <div className="factura-emisor">
                  {emisor.nif && <>NIF {emisor.nif}<br /></>}
                  {emisor.direccion && <>{emisor.direccion}<br /></>}
                  {emisor.web} · {emisor.email}
                </div>
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
                <p>{billing.taxName || billing.company}</p>
                {billing.taxId && <p>NIF {billing.taxId}</p>}
                {billing.taxAddress && <p>{billing.taxAddress}</p>}
                <p>{billing.email}</p>
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
                  <td>{euros(imprimiendo.baseCents ?? imprimiendo.amountCents, imprimiendo.currency)}</td>
                </tr>
              </tbody>
              <tfoot>
                {/* El desglose, solo si sabemos el tipo: mejor callarlo que
                    poner un IVA que no es el que se repercute */}
                {imprimiendo.ivaCents !== null && (
                  <>
                    <tr>
                      <td colSpan={2}>Base imponible</td>
                      <td>{euros(imprimiendo.baseCents!, imprimiendo.currency)}</td>
                    </tr>
                    <tr>
                      <td colSpan={2}>IVA ({imprimiendo.ivaPorcentaje}%)</td>
                      <td>{euros(imprimiendo.ivaCents, imprimiendo.currency)}</td>
                    </tr>
                  </>
                )}
                <tr>
                  <td colSpan={2}>Total ({imprimiendo.status})</td>
                  <td>{euros(imprimiendo.amountCents, imprimiendo.currency)}</td>
                </tr>
              </tfoot>
            </table>

            <p className="factura-pie">
              {imprimiendo.ivaCents === null && "IVA incluido cuando aplique. "}
              Gracias por confiar en {emisor.nombre}.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
