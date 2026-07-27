import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin";
import { accesos, auditoria } from "@/lib/adminData";

export const dynamic = "force-dynamic";

/**
 * El registro: los accesos de los clientes finales (con su IP y si
 * entraron o fallaron) y lo que ha hecho la propia administración.
 */
export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Solo para administradores" }, { status: 403 });

  const p = req.nextUrl.searchParams;
  return NextResponse.json({
    accesos: accesos(p.get("fallidos") === "1", p.get("buscar") || ""),
    auditoria: auditoria(),
  });
}
