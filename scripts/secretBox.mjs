/**
 * Copia del cifrado de lib/secretBox.ts para los scripts sueltos (que no
 * pasan por el compilador de TypeScript). Debe usar el mismo algoritmo y la
 * misma derivación de clave, o el panel no podría descifrar lo que sembramos.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";

function getKey() {
  let secret = process.env.SESSION_SECRET;
  if (!secret) {
    const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
    const file = path.join(dir, ".session-secret");
    try {
      secret = fs.readFileSync(file, "utf8").trim();
    } catch {
      // Aún no existe: lo creamos igual que hace la aplicación
      secret = crypto.randomBytes(32).toString("hex");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, secret, { mode: 0o600 });
    }
  }
  return crypto.createHash("sha256").update(`secretbox:${secret}`).digest();
}

export function encryptSecret(plain) {
  if (!plain) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
}
