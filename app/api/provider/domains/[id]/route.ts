import { NextRequest, NextResponse } from "next/server";
import { getDb, ProviderDomainRow } from "@/lib/db";
import { getCurrentProvider, normalizeHost, isValidHost, domainBaseUrl } from "@/lib/provider";

export const dynamic = "force-dynamic";

async function ownedDomain(id: string) {
  const provider = await getCurrentProvider();
  if (!provider) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  const row = getDb()
    .prepare("SELECT * FROM provider_domains WHERE id = ? AND provider_id = ?")
    .get(Number(id), provider.id) as ProviderDomainRow | undefined;
  if (!row) return { error: NextResponse.json({ error: "Dominio no encontrado" }, { status: 404 }) };
  return { domain: row, providerId: provider.id };
}

/**
 * Editar dominio. Al cambiarlo, todos los clientes que lo usan quedan
 * apuntando al nuevo destino automáticamente: es la vía para migrar cuando
 * bloquean un dominio, sin tocar cliente por cliente.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await ownedDomain(id);
  if (found.error) return found.error;
  const domain = found.domain!;

  let body: { host?: string; port?: number; protocol?: string; label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const host = body.host !== undefined ? normalizeHost(body.host) : domain.host;
  if (!isValidHost(host)) {
    return NextResponse.json({ error: "Introduce un dominio válido, sin http:// ni barras" }, { status: 400 });
  }
  const protocol = body.protocol === "https" ? "https" : body.protocol === "http" ? "http" : domain.protocol;
  const port = body.port !== undefined ? Number(body.port) : domain.port;
  if (!port || port < 1 || port > 65535) {
    return NextResponse.json({ error: "El puerto debe estar entre 1 y 65535" }, { status: 400 });
  }

  const db = getDb();
  const dup = db
    .prepare("SELECT id FROM provider_domains WHERE provider_id = ? AND host = ? AND port = ? AND id != ?")
    .get(found.providerId, host, port, domain.id);
  if (dup) return NextResponse.json({ error: "Ya tienes ese dominio con ese puerto" }, { status: 409 });

  db.prepare("UPDATE provider_domains SET host = ?, port = ?, protocol = ?, label = ? WHERE id = ?").run(
    host,
    port,
    protocol,
    body.label !== undefined ? body.label.trim().slice(0, 80) : domain.label,
    domain.id
  );

  const row = db.prepare("SELECT * FROM provider_domains WHERE id = ?").get(domain.id) as ProviderDomainRow;
  const affected = (
    db.prepare("SELECT COUNT(*) AS c FROM customers WHERE domain_id = ?").get(domain.id) as { c: number }
  ).c;

  return NextResponse.json({
    domain: { id: row.id, host: row.host, port: row.port, protocol: row.protocol, label: row.label, baseUrl: domainBaseUrl(row) },
    updatedCustomers: affected,
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await ownedDomain(id);
  if (found.error) return found.error;

  const db = getDb();
  const inUse = (
    db.prepare("SELECT COUNT(*) AS c FROM customers WHERE domain_id = ?").get(found.domain!.id) as { c: number }
  ).c;
  if (inUse > 0) {
    return NextResponse.json(
      { error: `No puedes borrarlo: lo usan ${inUse} cliente${inUse === 1 ? "" : "s"}. Cámbialos de dominio primero.` },
      { status: 409 }
    );
  }

  db.prepare("DELETE FROM provider_domains WHERE id = ?").run(found.domain!.id);
  return NextResponse.json({ ok: true });
}
