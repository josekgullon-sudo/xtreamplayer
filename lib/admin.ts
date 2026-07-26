import { getCurrentUser } from "@/lib/auth";
import { UserRow } from "@/lib/db";

/**
 * Quién atiende el soporte de la plataforma. Dos vías, que se suman:
 *  - la columna is_admin (la activa el seed o un UPDATE a mano), y
 *  - la variable ADMIN_EMAILS (lista separada por comas), pensada para
 *    producción: da acceso sin tocar la base de datos.
 */
export async function getCurrentAdmin(): Promise<UserRow | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.is_admin) return user;

  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(user.email.toLowerCase()) ? user : null;
}
