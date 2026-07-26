import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Qué versión corre el servidor. Railway inyecta el commit en el build;
 * junto con la versión de la web que lleva el navegador (inyectada en el
 * bundle), permite ver en cualquier captura si el móvil va con código viejo.
 */
export async function GET() {
  return NextResponse.json({
    commit: (process.env.RAILWAY_GIT_COMMIT_SHA || "dev").slice(0, 7),
  });
}
