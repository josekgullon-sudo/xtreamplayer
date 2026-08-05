import crypto from "crypto";
import fs from "fs";
import path from "path";

/**
 * Vales: la única forma en que una dirección del proveedor sale de aquí.
 *
 * El problema que resuelven. Hasta ahora el navegador pedía las cosas así:
 *
 *     /api/proxy?url=http://servidor-del-proveedor:8080/live/pepe/1234/9.ts
 *
 * O sea que el cliente —cualquier cliente, con solo abrir F12 y mirar la
 * pestaña de red— tenía delante el servidor de su proveedor, su usuario y su
 * contraseña. En Xtream la URL del vídeo ES la credencial: con esa línea se
 * va a otro reproductor y deja de pagar. Y las mismas rutas aceptaban
 * cualquier URL de cualquiera, así que además servían de proxy anónimo.
 *
 * Un vale es esa dirección cifrada con AES-256-GCM y la clave del servidor.
 * Por fuera es un galimatías; por dentro lleva a dónde va, de quién es y
 * hasta cuándo vale. Quien lo recibe no puede leerlo, no puede fabricarlo, y
 * si se lo pasa a otro no le sirve porque va atado a su sesión.
 */

let _clave: Buffer | null = null;

function clave(): Buffer {
  if (_clave) return _clave;
  let secreto = process.env.SESSION_SECRET;
  if (!secreto) {
    const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
    try {
      secreto = fs.readFileSync(path.join(dir, ".session-secret"), "utf8").trim();
    } catch {
      secreto = "";
    }
  }
  if (!secreto) throw new Error("No hay secreto de servidor para emitir vales");
  _clave = crypto.createHash("sha256").update(`vale:${secreto}`).digest();
  return _clave;
}

/** Doce horas: lo que dura una película larga y una noche de tele. */
const VIGENCIA = 12 * 60 * 60 * 1000;
/** Las carátulas se guardan en la caché del navegador, y ahí duran más. */
const VIGENCIA_IMAGEN = 7 * 24 * 60 * 60 * 1000;

interface Contenido {
  /** A dónde va de verdad. */
  u: string;
  /** De quién es la sesión que lo pidió. */
  d: string;
  /** Hasta cuándo. */
  h: number;
}

export function emitirVale(url: string, dueño: string, imagen = false): string {
  const cuerpo: Contenido = { u: url, d: dueño, h: Date.now() + (imagen ? VIGENCIA_IMAGEN : VIGENCIA) };
  const iv = crypto.randomBytes(12);
  const cifra = crypto.createCipheriv("aes-256-gcm", clave(), iv);
  const datos = Buffer.concat([cifra.update(JSON.stringify(cuerpo), "utf8"), cifra.final()]);
  return [
    iv.toString("base64url"),
    cifra.getAuthTag().toString("base64url"),
    datos.toString("base64url"),
  ].join(".");
}

/**
 * Devuelve la dirección de un vale, o null.
 *
 * Null cuando está caducado, cuando no es de quien lo presenta, y cuando
 * viene tocado: el sello de GCM hace que cambiar un solo byte lo invalide,
 * así que nadie puede coger un vale suyo y torcerlo hacia otro sitio.
 */
export function abrirVale(vale: string, dueño: string): string | null {
  if (!vale) return null;
  const trozos = vale.split(".");
  if (trozos.length !== 3) return null;
  try {
    const descifra = crypto.createDecipheriv("aes-256-gcm", clave(), Buffer.from(trozos[0], "base64url"));
    descifra.setAuthTag(Buffer.from(trozos[1], "base64url"));
    const claro = Buffer.concat([
      descifra.update(Buffer.from(trozos[2], "base64url")),
      descifra.final(),
    ]).toString("utf8");
    const cuerpo = JSON.parse(claro) as Contenido;
    if (!cuerpo || typeof cuerpo.u !== "string") return null;
    if (cuerpo.h < Date.now()) return null;
    if (cuerpo.d !== dueño) return null;
    return cuerpo.u;
  } catch {
    return null;
  }
}

/**
 * La dirección del vídeo tal y como la va a ver el cliente.
 *
 * Por defecto, la del proveedor: el vídeo va de su servidor al aparato sin
 * pasar por aquí, que es lo que hace que esto no cueste una fortuna. Un canal
 * son 1,8 GB por hora y espectador, y pasarlo por nuestro servidor lo cuenta
 * dos veces, a la entrada y a la salida.
 *
 * Con VIDEO_OCULTO=1 pasa por aquí y el cliente no ve más que totalplayer.app
 * ni siquiera en el tráfico de red. Es el interruptor de «lo pago yo».
 *
 * En los dos casos, lo que no sale nunca es el servidor real del mayorista:
 * para eso está el dominio neutro del proveedor.
 */
export function enlaceDeVideo(url: string, dueño: string): string {
  if (process.env.VIDEO_OCULTO !== "1") return url;
  return `/api/proxy?v=${encodeURIComponent(emitirVale(url, dueño))}`;
}

export function videoOculto(): boolean {
  return process.env.VIDEO_OCULTO === "1";
}

export function enlaceDeImagen(url: string, dueño: string): string {
  return `/api/img?v=${encodeURIComponent(emitirVale(url, dueño, true))}`;
}
