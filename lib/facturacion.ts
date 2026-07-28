/**
 * Quién emite las facturas y con qué IVA.
 *
 * Va en variables de entorno y no en el código porque cambia con quien monte
 * la plataforma: el nombre fiscal, el NIF y la dirección son de cada uno, y
 * el tipo de IVA depende del país. Sin esto, la factura salía a nombre de
 * «TOTALplayer» y sin NIF, que a un gestor no le sirve.
 */

export interface Emisor {
  nombre: string;
  nif: string;
  direccion: string;
  email: string;
  web: string;
}

export function emisor(): Emisor {
  return {
    nombre: process.env.BILLING_NAME || "TOTALplayer",
    nif: process.env.BILLING_TAX_ID || "",
    direccion: process.env.BILLING_ADDRESS || "",
    email: process.env.BILLING_EMAIL || "soporte@totalplayer.app",
    web: process.env.BILLING_WEB || "totalplayer.app",
  };
}

/**
 * Tipo de IVA aplicado, en porcentaje. 0 desactiva el desglose: mejor no
 * decir nada que decir un IVA que no es el que se repercute.
 */
export function ivaPorcentaje(): number {
  const n = Number(process.env.BILLING_VAT_PERCENT ?? 21);
  return Number.isFinite(n) && n > 0 && n < 100 ? n : 0;
}

/**
 * Desglose de un importe que ya lleva el IVA dentro, en céntimos.
 * Se redondea la base y el impuesto sale de la resta: así los dos números
 * suman siempre exactamente el total que se cobró.
 */
export function desglose(totalCents: number, porcentaje = ivaPorcentaje()) {
  if (!porcentaje) return null;
  const base = Math.round(totalCents / (1 + porcentaje / 100));
  return { baseCents: base, ivaCents: totalCents - base, porcentaje };
}
