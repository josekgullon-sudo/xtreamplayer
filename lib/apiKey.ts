import { createHash, randomBytes } from "crypto";
import { getDb, ProviderRow } from "@/lib/db";

/**
 * Claves de la API pública de proveedores.
 *
 * La clave completa (tp_ + 48 hex) solo existe en el momento de generarla:
 * en la base de datos queda su hash, así que ni nosotros podemos volver a
 * enseñarla. Es la misma disciplina que Stripe o GitHub, y es lo que permite
 * decirle al proveedor con la conciencia tranquila que su clave es suya.
 */

export function generarApiKey(): { key: string; hash: string; prefix: string } {
  const key = `tp_${randomBytes(24).toString("hex")}`;
  return { key, hash: hashApiKey(key), prefix: key.slice(0, 11) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Resuelve el proveedor a partir de la cabecera Authorization: Bearer tp_… */
export function providerFromBearer(authorization: string | null): ProviderRow | null {
  const match = (authorization || "").match(/^Bearer\s+(tp_[a-f0-9]{48})$/);
  if (!match) return null;
  const provider = getDb()
    .prepare("SELECT * FROM providers WHERE api_key_hash = ? AND status = 'active'")
    .get(hashApiKey(match[1])) as ProviderRow | undefined;
  return provider || null;
}

/** Respuesta uniforme de error para la API pública. */
export function apiError(message: string, status: number) {
  return Response.json({ error: { message, status } }, { status });
}
