import { randomInt } from "crypto";
import { getDb } from "@/lib/db";

/**
 * Emparejado de televisores por código.
 *
 * Escribir usuario y contraseña con el mando de una tele —letra a letra, en
 * un teclado en pantalla— es el peor momento de cualquier reproductor de
 * IPTV. Aquí la tele enseña un código de seis caracteres, el cliente lo
 * teclea desde el móvil (donde ya tiene su sesión) y la tele recoge la suya.
 *
 * El código vive diez minutos, se reclama una vez y se entrega una vez: ni
 * sirve para siempre ni vale para dos aparatos.
 */

const VIGENCIA_MS = 10 * 60_000;
/** Sin I, O, 0, 1: en la pantalla de una tele, a tres metros, se confunden */
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export interface CodigoTv {
  code: string;
  expiraEn: number;
}

function generarCodigo(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return s;
}

/** Limpia los caducados: la tabla no debe crecer sin fin. */
function purgar() {
  getDb().prepare("DELETE FROM tv_codes WHERE created_at < ?").run(Date.now() - VIGENCIA_MS);
}

/** Crea un código nuevo para una tele que acaba de arrancar. */
export function crearCodigo(deviceKey: string): CodigoTv {
  purgar();
  const db = getDb();
  const ahora = Date.now();
  // Colisión de código: se reintenta, no se falla
  for (let intento = 0; intento < 10; intento++) {
    const code = generarCodigo();
    try {
      db.prepare("INSERT INTO tv_codes (code, device_key, created_at) VALUES (?, ?, ?)").run(
        code,
        deviceKey.slice(0, 64),
        ahora
      );
      return { code, expiraEn: ahora + VIGENCIA_MS };
    } catch {
      /* ya existía: otro intento */
    }
  }
  throw new Error("No se pudo generar un código");
}

type Estado =
  | { estado: "esperando" }
  | { estado: "caducado" }
  | { estado: "listo"; customerId: number; deviceKey: string };

/**
 * La tele pregunta por su código. Si ya lo reclamaron, devuelve a quién
 * pertenece — y lo marca como entregado para que no valga dos veces.
 */
export function recogerCodigo(code: string): Estado {
  const fila = getDb()
    .prepare("SELECT * FROM tv_codes WHERE code = ?")
    .get((code || "").toUpperCase()) as
    | { id: number; customer_id: number; device_key: string; created_at: number; used_at: number }
    | undefined;

  if (!fila || fila.used_at || Date.now() - fila.created_at > VIGENCIA_MS) return { estado: "caducado" };
  if (!fila.customer_id) return { estado: "esperando" };

  getDb().prepare("UPDATE tv_codes SET used_at = ? WHERE id = ?").run(Date.now(), fila.id);
  return { estado: "listo", customerId: fila.customer_id, deviceKey: fila.device_key };
}

/** El cliente, desde su móvil, reclama el código que ve en la tele. */
export function reclamarCodigo(code: string, customerId: number): { ok: true } | { ok: false; error: string } {
  const limpio = (code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (limpio.length !== 6) return { ok: false, error: "El código tiene seis caracteres" };

  const fila = getDb().prepare("SELECT * FROM tv_codes WHERE code = ?").get(limpio) as
    | { id: number; customer_id: number; created_at: number; used_at: number }
    | undefined;

  if (!fila || Date.now() - fila.created_at > VIGENCIA_MS) {
    return { ok: false, error: "Ese código ya no vale. Pide uno nuevo en la tele." };
  }
  if (fila.customer_id) return { ok: false, error: "Ese código ya se ha usado" };

  getDb().prepare("UPDATE tv_codes SET customer_id = ?, claimed_at = ? WHERE id = ?").run(customerId, Date.now(), fila.id);
  return { ok: true };
}
