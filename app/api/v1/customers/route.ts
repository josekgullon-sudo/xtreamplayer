import { NextRequest } from "next/server";
import { getDb, CustomerRow } from "@/lib/db";
import { providerFromBearer, apiError } from "@/lib/apiKey";
import { crearCliente, actorDeProveedor, serializarCliente, AltaClienteInput } from "@/lib/customers";

export const dynamic = "force-dynamic";

/**
 * API pública v1 — clientes.
 *   GET  /api/v1/customers?q=&status=&limit=&offset=
 *   POST /api/v1/customers
 * Misma lógica de alta que el panel: cupos del plan y validaciones idénticas.
 */
export async function GET(req: NextRequest) {
  const provider = providerFromBearer(req.headers.get("authorization"));
  if (!provider) return apiError("Clave de API inválida o revocada", 401);

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") || "").trim();
  const status = sp.get("status") || "";
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 100, 1), 500);
  const offset = Math.max(Number(sp.get("offset")) || 0, 0);

  const where = ["provider_id = ?"];
  const params: (string | number)[] = [provider.id];
  if (q) {
    where.push("(username LIKE ? OR label LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (status === "active" || status === "disabled") {
    where.push("status = ?");
    params.push(status);
  }

  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM customers WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as CustomerRow[];
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM customers WHERE ${where.join(" AND ")}`).get(...params) as { c: number }).c;

  return Response.json({
    data: rows.map((r) => serializarCliente(r, 0)),
    total,
    limit,
    offset,
  });
}

export async function POST(req: NextRequest) {
  const provider = providerFromBearer(req.headers.get("authorization"));
  if (!provider) return apiError("Clave de API inválida o revocada", 401);

  let body: AltaClienteInput;
  try {
    body = await req.json();
  } catch {
    return apiError("El cuerpo debe ser JSON", 400);
  }

  const resultado = await crearCliente(actorDeProveedor(provider), body);
  if (!resultado.ok) return apiError(resultado.error, resultado.status);
  return Response.json({ data: serializarCliente(resultado.customer, 0) }, { status: 201 });
}
