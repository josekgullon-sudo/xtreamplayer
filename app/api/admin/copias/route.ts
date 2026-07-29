import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { getCurrentAdmin } from "@/lib/admin";
import { anotar } from "@/lib/adminData";
import { listarCopias, hacerCopia, rutaCopia } from "@/lib/copias";

export const dynamic = "force-dynamic";

/** Las copias que hay, y la de descargar una */
export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Solo para administradores" }, { status: 403 });

  const bajar = req.nextUrl.searchParams.get("bajar");
  if (bajar) {
    const ruta = rutaCopia(bajar);
    /* El nombre viene de fuera: solo valen los que hemos escrito nosotros, y
       nunca se construye una ruta con lo que llegue tal cual */
    if (!ruta) return NextResponse.json({ error: "No existe esa copia" }, { status: 404 });

    anotar(admin.email, "copia.descargada", bajar, "");
    return new NextResponse(new Uint8Array(fs.readFileSync(ruta)), {
      headers: {
        "Content-Type": "application/vnd.sqlite3",
        "Content-Disposition": `attachment; filename="${bajar}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({
    copias: listarCopias(),
    automaticas: process.env.BACKUPS === "1",
  });
}

/**
 * Hacer una copia ahora.
 *
 * Es el botón de antes de tocar algo gordo: importar mil clientes, cambiar
 * planes a mano, o probar una migración. Cuesta un segundo y evita el «no
 * había copia de esta mañana».
 */
export async function POST() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Solo para administradores" }, { status: 403 });

  try {
    const copia = await hacerCopia();
    anotar(admin.email, "copia.creada", copia.nombre, `${copia.bytes} bytes`);
    return NextResponse.json({ ok: true, copia });
  } catch (e) {
    console.error("[admin/copias]", e);
    return NextResponse.json({ error: "No se pudo hacer la copia" }, { status: 500 });
  }
}
