import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin";
import { clientes } from "@/lib/adminData";

export const dynamic = "force-dynamic";

/** Buscador global de clientes finales, de todos los proveedores. */
export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Solo para administradores" }, { status: 403 });

  const p = req.nextUrl.searchParams;
  return NextResponse.json({ clientes: clientes(p.get("buscar") || "", p.get("estado") || "") });
}
