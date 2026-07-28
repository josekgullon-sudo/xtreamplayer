/**
 * Un escritor de PDF mínimo, escrito aquí a mano.
 *
 * Una factura es texto, cuatro rayas y números alineados a la derecha: no
 * necesita un motor de maquetación. Traer una librería de PDF para esto
 * significaba meter varios megas en la imagen de despliegue —y un lote de
 * dependencias que mantener— para dibujar una hoja.
 *
 * Se limita a lo que hace falta: las dos fuentes que todo lector de PDF trae
 * de serie (Helvetica normal y negrita), texto, líneas y rectángulos. Las
 * coordenadas se dan desde arriba, como en una pantalla, y aquí se les da la
 * vuelta, que es como las quiere el formato.
 */

const ANCHO = 595.28; // A4 en puntos
const ALTO = 841.89;

/**
 * WinAnsi: el juego de caracteres que entienden las fuentes de serie. Todo
 * lo que no sea ASCII hay que traducirlo o el lector pinta un símbolo raro
 * justo donde va el importe.
 */
const WINANSI: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87,
  "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91,
  "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98,
  "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

function aWinAnsi(texto: string): number[] {
  const bytes: number[] = [];
  for (const c of texto) {
    const especial = WINANSI[c];
    if (especial !== undefined) {
      bytes.push(especial);
      continue;
    }
    const cp = c.codePointAt(0)!;
    // Latin-1 va tal cual; lo que no quepa, se sustituye antes que ensuciar
    bytes.push(cp <= 0xff ? cp : 0x3f);
  }
  return bytes;
}

/** Anchos de Helvetica, en milésimas de punto: sin ellos no hay alineación */
const ANCHOS: Record<string, number> = {
  " ": 278, "!": 278, '"': 355, "#": 556, $: 556, "%": 889, "&": 667, "'": 191,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  "[": 278, "\\": 278, "]": 278, "^": 469, _: 556, "`": 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  "{": 334, "|": 260, "}": 334, "~": 584, "€": 556,
};

const ANCHOS_NEGRITA: Record<string, number> = {
  ...ANCHOS,
  A: 722, B: 722, D: 722, J: 556, K: 722, L: 611, S: 667,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278,
  k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333,
  u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
  ":": 333, ";": 333, "'": 238, '"': 474,
};

export interface OpcionesTexto {
  /** Cuerpo de letra en puntos */
  tam?: number;
  negrita?: boolean;
  /** Gris de 0 (negro) a 1 (blanco) */
  gris?: number;
  /** Alineación: por defecto a la izquierda de x */
  derecha?: boolean;
}

export function anchoTexto(texto: string, tam: number, negrita = false): number {
  const tabla = negrita ? ANCHOS_NEGRITA : ANCHOS;
  let total = 0;
  for (const c of texto) total += tabla[c] ?? 556;
  return (total * tam) / 1000;
}

export class Pdf {
  private ops: string[] = [];

  /** Escribe una línea de texto. `y` se mide desde arriba, como en pantalla */
  texto(x: number, y: number, texto: string, o: OpcionesTexto = {}) {
    const tam = o.tam ?? 10;
    const fuente = o.negrita ? "/F2" : "/F1";
    const ancho = o.derecha ? anchoTexto(texto, tam, o.negrita) : 0;
    const bytes = aWinAnsi(texto)
      .map((b) => {
        // El paréntesis y la barra tienen significado dentro de una cadena
        if (b === 0x28 || b === 0x29 || b === 0x5c) return "\\" + String.fromCharCode(b);
        return b < 32 || b > 126 ? "\\" + b.toString(8).padStart(3, "0") : String.fromCharCode(b);
      })
      .join("");
    this.ops.push(
      `q ${(o.gris ?? 0).toFixed(2)} g BT ${fuente} ${tam} Tf 1 0 0 1 ${(x - ancho).toFixed(2)} ${(ALTO - y).toFixed(2)} Tm (${bytes}) Tj ET Q`
    );
    return this;
  }

  linea(x1: number, y1: number, x2: number, y2: number, gris = 0.75, grosor = 0.6) {
    this.ops.push(
      `q ${gris.toFixed(2)} G ${grosor} w ${x1.toFixed(2)} ${(ALTO - y1).toFixed(2)} m ${x2.toFixed(2)} ${(ALTO - y2).toFixed(2)} l S Q`
    );
    return this;
  }

  caja(x: number, y: number, ancho: number, alto: number, gris = 0.94) {
    this.ops.push(
      `q ${gris.toFixed(2)} g ${x.toFixed(2)} ${(ALTO - y - alto).toFixed(2)} ${ancho.toFixed(2)} ${alto.toFixed(2)} re f Q`
    );
    return this;
  }

  /** El documento entero, listo para mandar al navegador */
  salida(titulo: string): Buffer {
    const contenido = this.ops.join("\n");
    const objetos = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ANCHO} ${ALTO}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
      `<< /Length ${Buffer.byteLength(contenido, "latin1")} >>\nstream\n${contenido}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
      `<< /Title (${titulo.replace(/[()\\]/g, "")}) /Producer (TOTALplayer) >>`,
    ];

    let pdf = "%PDF-1.4\n";
    const posiciones: number[] = [];
    objetos.forEach((cuerpo, i) => {
      posiciones.push(Buffer.byteLength(pdf, "latin1"));
      pdf += `${i + 1} 0 obj\n${cuerpo}\nendobj\n`;
    });

    const inicioXref = Buffer.byteLength(pdf, "latin1");
    pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
    for (const p of posiciones) pdf += `${String(p).padStart(10, "0")} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R /Info ${objetos.length} 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;

    return Buffer.from(pdf, "latin1");
  }
}

export const PAGINA = { ancho: ANCHO, alto: ALTO };
