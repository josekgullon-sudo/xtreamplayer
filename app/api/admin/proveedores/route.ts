import { NextRequest, NextResponse } from "next/server";
import { getDb, ProviderRow } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/admin";
import { proveedores, anotar } from "@/lib/adminData";
import { listPlans } from "@/lib/provider";

export const dynamic = "force-dynamic";

/** Los proveedores de la plataforma, con sus números y su plan. */
export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Solo para administradores" }, { status: 403 });

  return NextResponse.json({
    proveedores: proveedores(req.nextUrl.searchParams.get("buscar") || ""),
    planes: listPlans().map((p) => ({ id: p.id, nombre: p.name, maxClientes: p.max_customers })),
  });
}

/**
 * Suspender, reactivar, cambiar de plan o mover la fecha de renovación.
 *
 * Suspender a un proveedor deja fuera de golpe a todos sus clientes, así que
 * cada cambio queda anotado con el correo de quien lo hizo.
 */
export async function PATCH(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Solo para administradores" }, { status: 403 });

  let body: { id?: number; estado?: string; plan?: string; caduca?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const id = Number(body.id || 0);
  const db = getDb();
  const proveedor = db.prepare("SELECT * FROM providers WHERE id = ?").get(id) as ProviderRow | undefined;
  if (!proveedor) return NextResponse.json({ error: "No existe ese proveedor" }, { status: 404 });

  const cambios: string[] = [];

  if (body.estado !== undefined) {
    const estado = body.estado === "active" ? "active" : "suspended";
    db.prepare("UPDATE providers SET status = ? WHERE id = ?").run(estado, id);
    cambios.push(estado === "active" ? "reactivado" : "suspendido");
  }

  if (body.plan !== undefined) {
    const plan = String(body.plan);
    // Un plan que no existe dejaría al proveedor sin cupo sin avisar a nadie
    if (plan && !listPlans().some((p) => p.id === plan)) {
      return NextResponse.json({ error: "Ese plan no existe" }, { status: 400 });
    }
    db.prepare("UPDATE providers SET plan_id = ? WHERE id = ?").run(plan, id);
    cambios.push(`plan → ${plan || "sin plan"}`);
  }

  if (body.caduca !== undefined) {
    const caduca = Math.max(0, Number(body.caduca) || 0);
    db.prepare("UPDATE providers SET plan_expires_at = ? WHERE id = ?").run(caduca, id);
    cambios.push(`renovación → ${caduca ? new Date(caduca).toISOString().slice(0, 10) : "sin fecha"}`);
  }

  if (!cambios.length) return NextResponse.json({ error: "Nada que cambiar" }, { status: 400 });

  anotar(admin.email, "proveedor", proveedor.email, cambios.join(", "));
  return NextResponse.json({ ok: true });
}
