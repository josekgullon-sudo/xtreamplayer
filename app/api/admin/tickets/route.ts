import { NextRequest, NextResponse } from "next/server";
import { getDb, TicketRow } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

/** Todos los tickets de la plataforma, los pendientes de respuesta primero. */
export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Solo para administradores" }, { status: 403 });

  const estado = req.nextUrl.searchParams.get("estado") || "";
  const db = getDb();
  const where = ["abierto", "respondido", "cerrado"].includes(estado) ? "WHERE t.status = ?" : "";
  const params = where ? [estado] : [];

  const rows = db
    .prepare(
      `SELECT t.*, p.email AS provider_email, p.company AS provider_company
       FROM tickets t JOIN providers p ON p.id = t.provider_id
       ${where}
       ORDER BY CASE t.status WHEN 'abierto' THEN 0 WHEN 'respondido' THEN 1 ELSE 2 END, t.updated_at DESC
       LIMIT 500`
    )
    .all(...params) as (TicketRow & { provider_email: string; provider_company: string })[];

  return NextResponse.json({
    tickets: rows.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      provider: t.provider_company || t.provider_email,
      providerEmail: t.provider_email,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    })),
  });
}
