import { NextRequest, NextResponse } from "next/server";
import { getDb, TicketRow, TicketMessageRow } from "@/lib/db";
import { getCurrentProvider } from "@/lib/provider";
import { avisarAdmin } from "@/lib/avisos";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

function ownTicket(providerId: number, id: string): TicketRow | undefined {
  return getDb()
    .prepare("SELECT * FROM tickets WHERE id = ? AND provider_id = ?")
    .get(Number(id), providerId) as TicketRow | undefined;
}

/** Hilo completo del ticket. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const provider = await getCurrentProvider();
  if (!provider) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await ctx.params;
  const ticket = ownTicket(provider.id, id);
  if (!ticket) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });

  const messages = getDb()
    .prepare("SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC")
    .all(ticket.id) as TicketMessageRow[];

  return NextResponse.json({
    ticket: { id: ticket.id, subject: ticket.subject, status: ticket.status, createdAt: ticket.created_at },
    messages: messages.map((m) => ({ id: m.id, author: m.author, body: m.body, createdAt: m.created_at })),
  });
}

/** Añade una respuesta del proveedor al hilo (reabre si estaba respondido). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const provider = await getCurrentProvider();
  if (!provider) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await ctx.params;
  const ticket = ownTicket(provider.id, id);
  if (!ticket) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
  if (ticket.status === "cerrado") {
    return NextResponse.json({ error: "El ticket está cerrado. Abre uno nuevo si el problema vuelve." }, { status: 400 });
  }

  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }
  const message = (body.message || "").trim().slice(0, 5000);
  if (!message) return NextResponse.json({ error: "Escribe el mensaje" }, { status: 400 });

  const db = getDb();
  const now = Date.now();
  db.transaction(() => {
    db.prepare("INSERT INTO ticket_messages (ticket_id, author, body, created_at) VALUES (?, 'provider', ?, ?)").run(
      ticket.id,
      message,
      now
    );
    db.prepare("UPDATE tickets SET status = 'abierto', updated_at = ? WHERE id = ?").run(now, ticket.id);
  })();

  /* Una respuesta reabre el ticket: quien lo atiende tiene que enterarse
     igual que de uno nuevo, o se queda esperando sin saberlo */
  avisarAdmin({
    tipo: "ticket-respuesta",
    titulo: `Respuesta de ${provider.company || provider.email}`,
    texto: `${ticket.subject}\n\n${message.slice(0, 400)}`,
    enlace: `${SITE_URL}/admin`,
  });

  return NextResponse.json({ ok: true });
}

/** Cierra el ticket (solo el propio proveedor da el problema por resuelto). */
export async function PATCH(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const provider = await getCurrentProvider();
  if (!provider) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await ctx.params;
  const ticket = ownTicket(provider.id, id);
  if (!ticket) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });

  getDb().prepare("UPDATE tickets SET status = 'cerrado', updated_at = ? WHERE id = ?").run(Date.now(), ticket.id);
  return NextResponse.json({ ok: true });
}
