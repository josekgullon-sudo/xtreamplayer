import { Pdf, PAGINA, anchoTexto } from "@/lib/pdf";
import { Emisor, desglose } from "@/lib/facturacion";

/**
 * La factura, en un PDF que se puede mandar al gestor tal cual.
 *
 * Antes se resolvía abriendo el diálogo de imprimir del navegador y pidiendo
 * «guardar como PDF». Funcionaba, pero dependía de que el cliente supiera
 * hacerlo, salía con la cabecera y el pie que le diera la gana al navegador,
 * y en un móvil directamente no había forma. Un botón, un archivo.
 */

export interface DatosFactura {
  number: string;
  concept: string;
  amountCents: number;
  currency: string;
  periodStart: number;
  periodEnd: number;
  status: string;
  createdAt: number;
}

export interface Receptor {
  nombre: string;
  nif: string;
  direccion: string;
  email: string;
}

function euros(cents: number, moneda: string) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: moneda || "EUR" }).format(cents / 100);
}

function fecha(ms: number) {
  return ms ? new Date(ms).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" }) : "—";
}

/** Nombre de archivo que no dé problemas en ningún sistema */
export function nombreArchivo(numero: string) {
  return `factura-${numero.replace(/[^\w.-]+/g, "-")}.pdf`;
}

export function facturaPdf(f: DatosFactura, emisor: Emisor, receptor: Receptor): Buffer {
  const pdf = new Pdf();
  const izq = 56;
  const der = PAGINA.ancho - 56;
  const iva = desglose(f.amountCents);

  // --- Cabecera: quién cobra, y qué documento es este ---
  pdf.texto(izq, 70, emisor.nombre, { tam: 17, negrita: true });
  let y = 92;
  for (const linea of [
    emisor.nif ? `NIF ${emisor.nif}` : "",
    emisor.direccion,
    [emisor.web, emisor.email].filter(Boolean).join(" · "),
  ].filter(Boolean)) {
    pdf.texto(izq, y, linea, { tam: 9, gris: 0.35 });
    y += 13;
  }

  pdf.texto(der, 70, "FACTURA", { tam: 17, negrita: true, derecha: true });
  pdf.texto(der, 92, f.number, { tam: 11, derecha: true });
  pdf.texto(der, 108, fecha(f.createdAt), { tam: 9, gris: 0.35, derecha: true });

  pdf.linea(izq, 138, der, 138);

  // --- Receptor: es lo que mira el gestor antes que nada ---
  pdf.texto(izq, 166, "FACTURAR A", { tam: 8, negrita: true, gris: 0.45 });
  y = 186;
  for (const linea of [
    receptor.nombre,
    receptor.nif ? `NIF ${receptor.nif}` : "",
    receptor.direccion,
    receptor.email,
  ].filter(Boolean)) {
    pdf.texto(izq, y, linea, { tam: 10 });
    y += 14;
  }

  // --- Las líneas ---
  const yTabla = Math.max(y + 26, 250);
  const colPeriodo = izq + 250;
  pdf.caja(izq, yTabla - 14, der - izq, 24, 0.94);
  pdf.texto(izq + 8, yTabla, "CONCEPTO", { tam: 8, negrita: true, gris: 0.35 });
  pdf.texto(colPeriodo, yTabla, "PERIODO", { tam: 8, negrita: true, gris: 0.35 });
  pdf.texto(der - 8, yTabla, "IMPORTE", { tam: 8, negrita: true, gris: 0.35, derecha: true });

  const yLinea = yTabla + 30;
  pdf.texto(izq + 8, yLinea, f.concept, { tam: 10 });
  pdf.texto(colPeriodo, yLinea, f.periodStart ? `${fecha(f.periodStart)} — ${fecha(f.periodEnd)}` : "—", {
    tam: 9,
    gris: 0.35,
  });
  pdf.texto(der - 8, yLinea, euros(iva ? iva.baseCents : f.amountCents, f.currency), { tam: 10, derecha: true });
  pdf.linea(izq, yLinea + 14, der, yLinea + 14, 0.85);

  // --- Totales ---
  /* El desglose solo si sabemos el tipo: mejor callarlo que poner un IVA
     que no es el que se repercute */
  let yTotal = yLinea + 40;
  if (iva) {
    pdf.texto(der - 110, yTotal, "Base imponible", { tam: 10, gris: 0.35, derecha: true });
    pdf.texto(der - 8, yTotal, euros(iva.baseCents, f.currency), { tam: 10, derecha: true });
    yTotal += 18;
    pdf.texto(der - 110, yTotal, `IVA (${iva.porcentaje}%)`, { tam: 10, gris: 0.35, derecha: true });
    pdf.texto(der - 8, yTotal, euros(iva.ivaCents, f.currency), { tam: 10, derecha: true });
    yTotal += 22;
  }
  pdf.linea(der - 220, yTotal - 14, der, yTotal - 14, 0.85);
  pdf.texto(der - 110, yTotal + 2, "TOTAL", { tam: 12, negrita: true, derecha: true });
  pdf.texto(der - 8, yTotal + 2, euros(f.amountCents, f.currency), { tam: 12, negrita: true, derecha: true });

  // Estado, al lado del total: una factura pendiente no es una pagada
  const estado = f.status.charAt(0).toUpperCase() + f.status.slice(1);
  pdf.texto(izq, yTotal + 2, estado, { tam: 10, gris: f.status === "anulada" ? 0.55 : 0.3 });

  // --- Pie ---
  const pie = iva
    ? `IVA del ${iva.porcentaje}% incluido en el total.`
    : "IVA incluido cuando corresponda.";
  pdf.texto(izq, PAGINA.alto - 92, pie, { tam: 8, gris: 0.45 });
  pdf.texto(izq, PAGINA.alto - 78, `Gracias por confiar en ${emisor.nombre}.`, { tam: 8, gris: 0.45 });
  /* Una anulada tiene que cantar: si se cuela en la contabilidad, el
     descuadre aparece meses después */
  if (f.status === "anulada") {
    const aviso = "FACTURA ANULADA";
    pdf.texto((PAGINA.ancho - anchoTexto(aviso, 22, true)) / 2, 150, aviso, { tam: 22, negrita: true, gris: 0.72 });
  }

  return pdf.salida(`Factura ${f.number}`);
}
