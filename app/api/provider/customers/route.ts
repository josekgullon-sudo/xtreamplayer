import { NextRequest, NextResponse } from "next/server";
import { getDb, CustomerRow } from "@/lib/db";
import { getPanelActor, getProviderStatus, resolveCustomerPlaylist, customerScopeClause, resellerCustomerCount } from "@/lib/provider";
import { crearCliente, AltaClienteInput } from "@/lib/customers";

export const dynamic = "force-dynamic";

function serialize(row: CustomerRow, devices: number) {
  const resolved = resolveCustomerPlaylist(row);
  return {
    id: row.id,
    username: row.username,
    label: row.label,
    playlistType: row.playlist_type,
    playlistUrl: resolved.url,
    playlistUsername: row.playlist_username,
    domainId: row.domain_id,
    maxDevices: row.max_devices,
    devices,
    expiresAt: row.expires_at,
    status: row.status,
    createdAt: row.created_at,
  };
}

/** Clientes visibles para el actor: todos los del proveedor o solo los suyos. */
export async function GET(req: NextRequest) {
  const actor = await getPanelActor();
  if (!actor) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const db = getDb();
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const scope = customerScopeClause(actor);

  const rows = q
    ? (db
        .prepare(
          `SELECT * FROM customers WHERE ${scope.sql} AND (username LIKE ? OR label LIKE ?) ORDER BY created_at DESC LIMIT 500`
        )
        .all(...scope.params, `%${q}%`, `%${q}%`) as CustomerRow[])
    : (db
        .prepare(`SELECT * FROM customers WHERE ${scope.sql} ORDER BY created_at DESC LIMIT 500`)
        .all(...scope.params) as CustomerRow[]);

  const counts = db.prepare("SELECT customer_id, COUNT(*) AS c FROM devices GROUP BY customer_id").all() as {
    customer_id: number;
    c: number;
  }[];
  const deviceMap = new Map(counts.map((c) => [c.customer_id, c.c]));

  const status = getProviderStatus(actor.provider);
  if (actor.kind === "reseller" && actor.ownCustomerLimit > 0) {
    status.maxCustomers = actor.ownCustomerLimit;
    status.usedCustomers = resellerCustomerCount(actor.reseller!.id);
  }

  return NextResponse.json({ customers: rows.map((r) => serialize(r, deviceMap.get(r.id) ?? 0)), status });
}

/** Alta de un cliente final. Se entrega usuario+contraseña al cliente. */
export async function POST(req: NextRequest) {
  const actor = await getPanelActor();
  if (!actor) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: AltaClienteInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  // Las reglas viven en lib/customers para que el panel y la API pública
  // apliquen exactamente las mismas
  const resultado = await crearCliente(actor, body);
  if (!resultado.ok) {
    const { error, status, needsPlan, needsUpgrade } = resultado;
    return NextResponse.json({ error, needsPlan, needsUpgrade }, { status });
  }
  return NextResponse.json({ customer: serialize(resultado.customer, 0) });
}
