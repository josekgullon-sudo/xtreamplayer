import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, ProviderRow } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/admin";
import { setProviderCookie, clearProviderCookie } from "@/lib/provider";
import { anotar } from "@/lib/adminData";

export const dynamic = "force-dynamic";

/** Marca visible (no es credencial) para que el panel avise de que no eres tú */
const MARCA = "xp_suplantando";

/**
 * Entrar en el panel de un proveedor como administrador.
 *
 * Cuando alguien escribe «no me deja crear clientes», mirar su panel con sus
 * propios ojos ahorra media hora de ida y vuelta. Hasta ahora la única forma
 * era pedirle la contraseña, que es exactamente lo que no hay que hacer.
 *
 * Queda anotado en el registro con el correo de quien entró: mirar la casa
 * de un cliente no puede ser algo que no deje rastro. Y mientras dura, su
 * panel lleva un aviso arriba con la salida a un clic.
 */
export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Solo para administradores" }, { status: 403 });

  let body: { id?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const proveedor = getDb()
    .prepare("SELECT * FROM providers WHERE id = ?")
    .get(Number(body.id || 0)) as ProviderRow | undefined;
  if (!proveedor) return NextResponse.json({ error: "No existe ese proveedor" }, { status: 404 });

  /*
   * Un proveedor suspendido no tiene sesión válida —su panel lo rechaza—,
   * así que entrar «como él» daría una pantalla vacía sin explicar por qué.
   */
  if (proveedor.status !== "active") {
    return NextResponse.json(
      { error: "Ese proveedor está suspendido: reactívalo antes de entrar en su panel" },
      { status: 409 }
    );
  }

  await setProviderCookie(proveedor.id);
  const store = await cookies();
  store.set(MARCA, proveedor.company || proveedor.email, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 4 * 3600,
    path: "/",
  });

  anotar(admin.email, "suplantación", proveedor.email, "entró en su panel");
  return NextResponse.json({ ok: true, panel: "/panel" });
}

/** Salir del panel del proveedor y volver a ser uno mismo. */
export async function DELETE() {
  const store = await cookies();
  const quien = store.get(MARCA)?.value;
  await clearProviderCookie();
  store.delete(MARCA);

  // Sin admin en sesión también se permite salir: quedarse dentro de la
  // cuenta de otro por no poder cerrarla sería peor que cualquier error
  const admin = await getCurrentAdmin();
  if (admin && quien) anotar(admin.email, "suplantación", quien, "salió de su panel");

  return NextResponse.json({ ok: true });
}
