import { NextRequest, NextResponse } from "next/server";
import { getDb, ProviderDomainRow } from "@/lib/db";
import { getCurrentProvider, listDomains, normalizeHost, isValidHost, domainBaseUrl } from "@/lib/provider";

export const dynamic = "force-dynamic";

function serialize(row: ProviderDomainRow, customers: number) {
  return {
    id: row.id,
    host: row.host,
    port: row.port,
    protocol: row.protocol,
    label: row.label,
    baseUrl: domainBaseUrl(row),
    customers,
    createdAt: row.created_at,
  };
}

/** Dominios del proveedor con el número de clientes que usa cada uno. */
export async function GET() {
  const provider = await getCurrentProvider();
  if (!provider) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const rows = listDomains(provider.id);
  const counts = getDb()
    .prepare("SELECT domain_id, COUNT(*) AS c FROM customers WHERE provider_id = ? GROUP BY domain_id")
    .all(provider.id) as { domain_id: number; c: number }[];
  const map = new Map(counts.map((c) => [c.domain_id, c.c]));

  return NextResponse.json({ domains: rows.map((r) => serialize(r, map.get(r.id) ?? 0)) });
}

/** Alta de dominio. Se configura una vez y se reutiliza en cada cliente. */
export async function POST(req: NextRequest) {
  const provider = await getCurrentProvider();
  if (!provider) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: { host?: string; port?: number; protocol?: string; label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const host = normalizeHost(body.host || "");
  if (!isValidHost(host)) {
    return NextResponse.json({ error: "Introduce un dominio válido, sin http:// ni barras" }, { status: 400 });
  }

  const protocol = body.protocol === "https" ? "https" : "http";
  const port = Number(body.port) || (protocol === "https" ? 443 : 80);
  if (port < 1 || port > 65535) {
    return NextResponse.json({ error: "El puerto debe estar entre 1 y 65535" }, { status: 400 });
  }

  const db = getDb();
  const dup = db
    .prepare("SELECT id FROM provider_domains WHERE provider_id = ? AND host = ? AND port = ?")
    .get(provider.id, host, port);
  if (dup) return NextResponse.json({ error: "Ya tienes ese dominio con ese puerto" }, { status: 409 });

  const result = db
    .prepare(
      "INSERT INTO provider_domains (provider_id, host, port, protocol, label, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(provider.id, host, port, protocol, (body.label || "").trim().slice(0, 80), Date.now());

  const row = db.prepare("SELECT * FROM provider_domains WHERE id = ?").get(result.lastInsertRowid) as ProviderDomainRow;
  return NextResponse.json({ domain: serialize(row, 0) });
}
