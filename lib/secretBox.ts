import crypto from "crypto";
import fs from "fs";
import path from "path";

/**
 * Cifrado reversible para las contraseñas de acceso que el proveedor entrega
 * a sus clientes.
 *
 * Por qué no basta con el hash: esa contraseña la reparte el proveedor, y
 * necesita poder consultarla cuando un cliente la pierde. El hash bcrypt se
 * mantiene para verificar el acceso; esto solo permite mostrarla en el panel.
 *
 * Va cifrado con AES-256-GCM y una clave derivada del secreto del servidor,
 * que vive fuera de la base de datos: si alguien se lleva el fichero .db, no
 * puede descifrarlas.
 */

let _key: Buffer | null = null;

function getKey(): Buffer {
  if (_key) return _key;
  let secret = process.env.SESSION_SECRET;
  if (!secret) {
    const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
    const file = path.join(dir, ".session-secret");
    try {
      secret = fs.readFileSync(file, "utf8").trim();
    } catch {
      secret = "";
    }
  }
  if (!secret) throw new Error("No hay secreto de servidor para cifrar");
  _key = crypto.createHash("sha256").update(`secretbox:${secret}`).digest();
  return _key;
}

export function encryptSecret(plain: string): string {
  if (!plain) return "";
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
    const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
  } catch {
    return "";
  }
}

export function decryptSecret(payload: string): string {
  if (!payload || !payload.startsWith("v1.")) return "";
  try {
    const [, iv, tag, data] = payload.split(".");
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}
