import { NextRequest, NextResponse } from "next/server";
import { getDb, TicketRow, TicketMessageRow } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

/** Hilo completo, con los datos del proveedor que lo abrió. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Solo para administradores" }, { status: 403 });

  const { id } = await ctx.params;
  const db = getDb();
  const ticket = db
    .prepare(
      `SELECT t.*, p.email AS provider_email, p.company AS provider_company
       FROM tickets t JOIN providers p ON p.id = t.provider_id WHERE t.id = ?`
    )
    .get(Number(id)) as (TicketRow & { provider_email: string; provider_company: string }) | undefined;
  if (!ticket) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });

  const messages = db
    .prepare("SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC")
    .all(ticket.id) as TicketMessageRow[];

  return NextResponse.json({
    ticket: {
      id: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      provider: ticket.provider_company || ticket.provider_email,
      providerEmail: ticket.provider_email,
      createdAt: ticket.created_at,
    },
    messages: messages.map((m) => ({ id: m.id, author: m.author, body: m.body, createdAt: m.created_at })),
  });
}

/** Respuesta del soporte: el ticket pasa a «respondido». */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Solo para administradores" }, { status: 403 });

  const { id } = await ctx.params;
  const db = getDb();
  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(Number(id)) as TicketRow | undefined;
  if (!ticket) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });

  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }
  const message = (body.message || "").trim().slice(0, 5000);
  if (!message) return NextResponse.json({ error: "Escribe la respuesta" }, { status: 400 });

  const now = Date.now();
  db.transaction(() => {
    db.prepare("INSERT INTO ticket_messages (ticket_id, author, body, created_at) VALUES (?, 'admin', ?, ?)").run(
      ticket.id,
      message,
      now
    );
    db.prepare("UPDATE tickets SET status = 'respondido', updated_at = ? WHERE id = ?").run(now, ticket.id);
  })();

  return NextResponse.json({ ok: true });
}

/** Cambia el estado (p. ej. cerrar un hilo abandonado). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Solo para administradores" }, { status: 403 });

  const { id } = await ctx.params;
  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }
  if (!["abierto", "respondido", "cerrado"].includes(body.status || "")) {
    return NextResponse.json({ error: "Estado no válido" }, { status: 400 });
  }

  const info = getDb()
    .prepare("UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?")
    .run(body.status, Date.now(), Number(id));
  if (!info.changes) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
