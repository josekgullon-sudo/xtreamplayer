import { NextRequest, NextResponse } from "next/server";
import { getDb, ProviderDomainRow } from "@/lib/db";
import { getCurrentProvider, getProviderStatus } from "@/lib/provider";
import { crearCliente, actorDeProveedor } from "@/lib/customers";
import { listarUsuariosPanel } from "@/lib/xuiPanel";

export const dynamic = "force-dynamic";

/**
 * Importación directa desde el panel del proveedor (XUI y compatibles):
 * lee su lista de usuarios por la API de administración y da de alta a cada
 * uno como cliente, con las mismas credenciales que ya usan en su panel.
 * Es el flujo de MaxPlayer: conectar el panel una vez e importar de golpe.
 */
export async function POST(req: NextRequest) {
  const provider = await getCurrentProvider();
  if (!provider) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: { domainId?: number; maxProfiles?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const db = getDb();
  const domain = db
    .prepare("SELECT * FROM provider_domains WHERE id = ? AND provider_id = ?")
    .get(Number(body.domainId), provider.id) as ProviderDomainRow | undefined;
  if (!domain) {
    return NextResponse.json({ error: "Elige a qué dominio quedarán conectados los clientes importados" }, { status: 400 });
  }

  const listado = await listarUsuariosPanel(provider);
  if (!listado.ok) {
    return NextResponse.json({ error: listado.error, detalle: listado.detalle }, { status: 502 });
  }

  const actor = actorDeProveedor(provider);
  const status = getProviderStatus(provider);
  const huecos = Math.max(0, status.maxCustomers - status.usedCustomers);

  let creados = 0;
  const omitidos: { username: string; motivo: string }[] = [];

  for (const u of listado.users) {
    if (creados >= huecos) {
      omitidos.push({ username: u.username, motivo: "sin hueco en tu plan" });
      continue;
    }
    if (!u.enabled) {
      omitidos.push({ username: u.username, motivo: "desactivado en el panel" });
      continue;
    }
    if (!u.password || u.password.length < 4) {
      omitidos.push({ username: u.username, motivo: "el panel no entrega su contraseña" });
      continue;
    }
    const resultado = await crearCliente(actor, {
      username: u.username,
      password: u.password,
      domainId: domain.id,
      playlistUsername: u.username,
      playlistPassword: u.password,
      expiresAt: u.expiresAt,
      maxProfiles: Math.min(Math.max(Number(body.maxProfiles) || 1, 1), 10),
    });
    if (resultado.ok) creados += 1;
    else omitidos.push({ username: u.username, motivo: resultado.error });
  }

  return NextResponse.json({
    ok: true,
    via: listado.via,
    total: listado.users.length,
    creados,
    omitidos: omitidos.slice(0, 50),
    omitidosTotal: omitidos.length,
  });
}
