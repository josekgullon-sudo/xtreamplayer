import { NextRequest, NextResponse } from "next/server";
import { getDb, CustomerRow } from "@/lib/db";
import { getPanelActor, customerScopeClause } from "@/lib/provider";
import { registrarMac, listarMacs, borrarMac } from "@/lib/tvMac";

export const dynamic = "force-dynamic";

async function clientePropio(id: string) {
  const actor = await getPanelActor();
  if (!actor) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  const scope = customerScopeClause(actor);
  const row = getDb()
    .prepare(`SELECT * FROM customers WHERE id = ? AND ${scope.sql}`)
    .get(Number(id), ...scope.params) as CustomerRow | undefined;
  if (!row) return { error: NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 }) };
  return { customer: row };
}

/** Televisores dados de alta por MAC para este cliente. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await clientePropio(id);
  if (found.error) return found.error;

  return NextResponse.json({
    teles: listarMacs(found.customer!.id).map((t) => ({
      id: t.id,
      mac: t.mac,
      label: t.label,
      alta: t.created_at,
      visto: t.last_seen,
    })),
  });
}

/** Da de alta la tele del cliente con la MAC que este le ha pasado. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await clientePropio(id);
  if (found.error) return found.error;
  const c = found.customer!;

  let body: { mac?: string; label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const r = registrarMac(c.provider_id, c.id, body.mac || "", body.label || "");
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, mac: r.mac });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await clientePropio(id);
  if (found.error) return found.error;

  const teleId = Number(req.nextUrl.searchParams.get("teleId") || 0);
  if (!borrarMac(teleId, found.customer!.provider_id)) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
