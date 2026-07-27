import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin";
import { facturas } from "@/lib/adminData";

export const dynamic = "force-dynamic";

/** Todas las facturas emitidas a proveedores. */
export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Solo para administradores" }, { status: 403 });

  return NextResponse.json({ facturas: facturas(req.nextUrl.searchParams.get("estado") || "") });
}
