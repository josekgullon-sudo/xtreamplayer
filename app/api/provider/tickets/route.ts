import { NextRequest, NextResponse } from "next/server";
import { getDb, TicketRow } from "@/lib/db";
import { getCurrentProvider } from "@/lib/provider";
import { avisarAdmin } from "@/lib/avisos";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Tickets de soporte del proveedor, el más reciente primero. */
export async function GET() {
  const provider = await getCurrentProvider();
  if (!provider) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const db = getDb();
  const tickets = db
    .prepare("SELECT * FROM tickets WHERE provider_id = ? ORDER BY updated_at DESC LIMIT 200")
    .all(provider.id) as TicketRow[];

  return NextResponse.json({
    tickets: tickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    })),
  });
}

/** Abre un ticket nuevo con su primer mensaje. */
export async function POST(req: NextRequest) {
  const provider = await getCurrentProvider();
  if (!provider) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: { subject?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const subject = (body.subject || "").trim().slice(0, 140);
  const message = (body.message || "").trim().slice(0, 5000);
  if (!subject || !message) {
    return NextResponse.json({ error: "Indica el asunto y describe el problema" }, { status: 400 });
  }

  const db = getDb();
  const now = Date.now();
  const ticketId = db.transaction(() => {
    const info = db
      .prepare("INSERT INTO tickets (provider_id, subject, status, created_at, updated_at) VALUES (?, ?, 'abierto', ?, ?)")
      .run(provider.id, subject, now, now);
    db.prepare("INSERT INTO ticket_messages (ticket_id, author, body, created_at) VALUES (?, 'provider', ?, ?)").run(
      info.lastInsertRowid,
      message,
      now
    );
    return Number(info.lastInsertRowid);
  })();

  avisarAdmin({
    tipo: "ticket-nuevo",
    titulo: `Ticket nuevo de ${provider.company || provider.email}`,
    texto: `${subject}\n\n${message.slice(0, 400)}`,
    enlace: `${SITE_URL}/admin`,
  });

  return NextResponse.json({ ok: true, id: ticketId });
}
