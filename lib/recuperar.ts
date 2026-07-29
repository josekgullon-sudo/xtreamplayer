import crypto from "crypto";
import bcrypt from "bcryptjs";
import { getDb, UserRow, ProviderRow } from "./db";
import { enviarCorreo, correoConfigurado } from "./correo";
import { SITE_URL } from "./site";

/**
 * Recuperar la contraseña.
 *
 * Hasta ahora, quien la olvidaba perdía la cuenta: no había forma de volver
 * a entrar. Y en un proveedor eso son sus clientes, sus dominios y sus
 * facturas dentro.
 *
 * Cómo funciona, y por qué así:
 *
 * - El enlace lleva un token de 32 bytes al azar. En la base de datos se
 *   guarda solo su huella, así que quien consiga leer la tabla no puede
 *   entrar en ninguna cuenta con lo que hay dentro.
 * - Caduca en una hora y sirve una sola vez. Un enlace reenviado sin querer,
 *   o el que queda en el historial del correo, no vale al día siguiente.
 * - Al usarlo se anulan los demás pendientes de esa cuenta: si alguien pidió
 *   tres correos, el que vale es el último.
 * - Nunca se dice si el correo existe o no. Contestar «esa cuenta no existe»
 *   convierte el formulario en una forma cómoda de averiguar quién está
 *   registrado.
 */

export type Ambito = "user" | "provider";

const VALE_UNA_HORA = 60 * 60 * 1000;
/** Tres peticiones por cuenta y hora: suficiente para quien no recibe el correo */
const MAX_POR_HORA = 3;

interface Cuenta {
  id: number;
  email: string;
}

function buscarCuenta(ambito: Ambito, email: string): Cuenta | null {
  const db = getDb();
  const limpio = email.trim().toLowerCase();
  if (!limpio) return null;
  if (ambito === "provider") {
    const p = db.prepare("SELECT id, email FROM providers WHERE email = ?").get(limpio) as ProviderRow | undefined;
    return p ? { id: p.id, email: p.email } : null;
  }
  const u = db.prepare("SELECT id, email FROM users WHERE email = ?").get(limpio) as UserRow | undefined;
  return u ? { id: u.id, email: u.email } : null;
}

const huella = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/**
 * Pide el correo de recuperación. Devuelve siempre lo mismo pase lo que pase
 * —salvo el aviso de que el correo no está configurado, que le interesa a
 * quien administra la plataforma, no a un desconocido—.
 */
export async function pedirRecuperacion(
  ambito: Ambito,
  email: string,
  ip = ""
): Promise<{ enviado: boolean; sinCorreo: boolean }> {
  if (!correoConfigurado()) return { enviado: false, sinCorreo: true };

  const cuenta = buscarCuenta(ambito, email);
  if (!cuenta) return { enviado: false, sinCorreo: false };

  const db = getDb();
  const ahora = Date.now();

  // Un formulario abierto al mundo es un formulario que alguien va a repetir
  const recientes = db
    .prepare("SELECT COUNT(*) AS n FROM password_resets WHERE scope = ? AND account_id = ? AND created_at > ?")
    .get(ambito, cuenta.id, ahora - VALE_UNA_HORA) as { n: number };
  if (recientes.n >= MAX_POR_HORA) return { enviado: false, sinCorreo: false };

  const token = crypto.randomBytes(32).toString("base64url");
  db.prepare(
    `INSERT INTO password_resets (scope, account_id, token_hash, created_at, expires_at, requested_ip)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(ambito, cuenta.id, huella(token), ahora, ahora + VALE_UNA_HORA, ip.slice(0, 60));

  const enlace = `${SITE_URL}/restablecer?token=${token}&tipo=${ambito}`;
  const quien = ambito === "provider" ? "tu cuenta de proveedor" : "tu cuenta";

  const enviado = await enviarCorreo({
    para: cuenta.email,
    asunto: "Cambia tu contraseña",
    titulo: "Vuelve a entrar en un minuto",
    parrafos: [
      `Alguien —esperamos que tú— ha pedido cambiar la contraseña de ${quien}.`,
      "Pulsa el botón y elige una nueva. El enlace caduca dentro de una hora y solo funciona una vez.",
    ],
    boton: { texto: "Elegir contraseña nueva", url: enlace },
    nota: "Si no has sido tú, no hace falta que hagas nada: tu contraseña sigue siendo la de siempre y este enlace caducará solo.",
  });

  return { enviado, sinCorreo: false };
}

/** Comprueba un token sin gastarlo, para saber si merece la pena pintar el formulario */
export function tokenValido(token: string, ambito: Ambito): boolean {
  const fila = getDb()
    .prepare("SELECT * FROM password_resets WHERE token_hash = ? AND scope = ?")
    .get(huella(token), ambito) as { expires_at: number; used_at: number } | undefined;
  return Boolean(fila && !fila.used_at && fila.expires_at > Date.now());
}

/** Cambia la contraseña de verdad. Devuelve el correo de la cuenta si salió bien */
export async function restablecer(
  token: string,
  ambito: Ambito,
  nueva: string
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  if (nueva.length < 8) return { ok: false, error: "La contraseña necesita al menos 8 caracteres" };

  const db = getDb();
  const fila = db
    .prepare("SELECT * FROM password_resets WHERE token_hash = ? AND scope = ?")
    .get(huella(token), ambito) as
    | { id: number; account_id: number; expires_at: number; used_at: number }
    | undefined;

  if (!fila || fila.used_at || fila.expires_at < Date.now()) {
    return { ok: false, error: "Este enlace ya no vale. Pide otro y te llegará uno nuevo." };
  }

  const tabla = ambito === "provider" ? "providers" : "users";
  const cuenta = db.prepare(`SELECT id, email FROM ${tabla} WHERE id = ?`).get(fila.account_id) as Cuenta | undefined;
  if (!cuenta) return { ok: false, error: "Esa cuenta ya no existe" };

  const hash = await bcrypt.hash(nueva, 10);
  db.prepare(`UPDATE ${tabla} SET password_hash = ? WHERE id = ?`).run(hash, cuenta.id);

  const ahora = Date.now();
  db.prepare("UPDATE password_resets SET used_at = ? WHERE id = ?").run(ahora, fila.id);
  /* Los demás pendientes de esa cuenta se anulan: si alguien pidió tres
     correos, valía el último, y los otros dos ya no abren nada */
  db.prepare("UPDATE password_resets SET used_at = ? WHERE scope = ? AND account_id = ? AND used_at = 0")
    .run(ahora, ambito, cuenta.id);

  /* Avisar de que se ha cambiado no es cortesía: es como se entera alguien de
     que le han entrado en la cuenta, y a tiempo de reaccionar */
  void enviarCorreo({
    para: cuenta.email,
    asunto: "Tu contraseña ha cambiado",
    titulo: "Contraseña cambiada",
    parrafos: [
      "Acabamos de cambiar la contraseña de tu cuenta. Si has sido tú, ya está: puedes entrar con la nueva.",
    ],
    boton: { texto: "Entrar", url: `${SITE_URL}${ambito === "provider" ? "/acceso?rol=proveedor" : "/login"}` },
    nota: "Si no has sido tú, escríbenos ahora mismo: alguien tiene acceso a tu correo.",
  }).catch(() => {});

  return { ok: true, email: cuenta.email };
}

/** Limpieza: los caducados no hacen falta para nada */
export function limpiarCaducados(): void {
  getDb().prepare("DELETE FROM password_resets WHERE expires_at < ?").run(Date.now() - 7 * 24 * 60 * 60 * 1000);
}
