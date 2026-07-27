import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin";
import { resumen, altasPorDia } from "@/lib/adminData";

export const dynamic = "force-dynamic";

/** El pulso de la plataforma en una pantalla. */
export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Solo para administradores" }, { status: 403 });

  return NextResponse.json({ resumen: resumen(), altas: altasPorDia(30) });
}
