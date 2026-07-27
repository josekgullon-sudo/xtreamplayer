import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin";
import { dominios } from "@/lib/adminData";

export const dynamic = "force-dynamic";

/** Los dominios de streaming en uso y a cuántos clientes sirve cada uno. */
export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Solo para administradores" }, { status: 403 });

  return NextResponse.json({ dominios: dominios(req.nextUrl.searchParams.get("buscar") || "") });
}
