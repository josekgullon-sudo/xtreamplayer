import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin";
import { revendedores } from "@/lib/adminData";

export const dynamic = "force-dynamic";

/** Todos los revendedores, con las cuentas vivas que maneja cada uno. */
export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Solo para administradores" }, { status: 403 });

  return NextResponse.json({ revendedores: revendedores(req.nextUrl.searchParams.get("buscar") || "") });
}
