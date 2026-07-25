import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb, ProviderDomainRow } from "@/lib/db";
import { getPanelActor, getProviderStatus, resellerCustomerCount, isValidUsername } from "@/lib/provider";
import { parseImportLines, suggestAccessName } from "@/lib/importLines";
import { normalizeBase } from "@/lib/xtream";
import { encryptSecret } from "@/lib/secretBox";

export const dynamic = "force-dynamic";

const MAX_LINES = 2000;

/**
 * Alta masiva de clientes a partir de las credenciales que el proveedor exporta
 * de su panel. Cada línea genera un acceso; si no se indica usuario de acceso,
 * se deriva del usuario IPTV evitando duplicados.
 */
export async function POST(req: NextRequest) {
  const actor = await getPanelActor();
  if (!actor) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: {
    text?: string;
    domainId?: number;
    maxDevices?: number;
    /** Si es true solo analiza y devuelve el resultado, sin crear nada */
    dryRun?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const parsed = parseImportLines(body.text || "");
  if (!parsed.length) {
    return NextResponse.json({ error: "No hay ninguna línea que importar" }, { status: 400 });
  }
  if (parsed.length > MAX_LINES) {
    return NextResponse.json(
      { error: `Máximo ${MAX_LINES} líneas por importación. Divídelo en varias tandas.` },
      { status: 413 }
    );
  }

  const db = getDb();
  const provider = actor.provider;

  // Dominio de destino (obligatorio salvo que cada línea traiga su propia URL)
  let domain: ProviderDomainRow | undefined;
  if (body.domainId) {
    if (actor.domainAccess === "none") {
      return NextResponse.json({ error: "No tienes acceso a los dominios de tu proveedor" }, { status: 403 });
    }
    domain = db
      .prepare("SELECT * FROM provider_domains WHERE id = ? AND provider_id = ?")
      .get(Number(body.domainId), provider.id) as ProviderDomainRow | undefined;
    if (!domain) return NextResponse.json({ error: "Ese dominio no existe en tu cuenta" }, { status: 400 });
  }

  // Cupos disponibles
  const status = getProviderStatus(provider);
  if (!status.active) {
    return NextResponse.json({ error: "Tu plan no está activo", needsPlan: true }, { status: 403 });
  }
  let slots = status.maxCustomers - status.usedCustomers;
  if (actor.kind === "reseller" && actor.ownCustomerLimit > 0) {
    slots = Math.min(slots, actor.ownCustomerLimit - resellerCustomerCount(actor.reseller!.id));
  }

  // Usuarios ya ocupados para no chocar
  const taken = new Set(
    (db.prepare("SELECT username FROM customers WHERE provider_id = ?").all(provider.id) as { username: string }[]).map(
      (r) => r.username
    )
  );

  const maxDevices = Math.min(Math.max(Number(body.maxDevices) || 2, 1), 10);
  const created: { username: string; password: string; source: string }[] = [];
  const skipped: { line: number; raw: string; reason: string }[] = [];

  const insert = db.prepare(
    `INSERT INTO customers
     (provider_id, reseller_id, username, password_hash, password_box, label, playlist_type, playlist_url,
      playlist_username, playlist_password, domain_id, max_devices, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'xtream', ?, ?, ?, ?, ?, 0, ?)`
  );

  for (const entry of parsed) {
    if (entry.error || !entry.username || !entry.password) {
      skipped.push({ line: entry.line, raw: entry.raw, reason: entry.error || "Línea incompleta" });
      continue;
    }
    if (created.length >= slots) {
      skipped.push({ line: entry.line, raw: entry.raw, reason: "Sin cupo en tu plan" });
      continue;
    }

    const base = entry.base ? normalizeBase(entry.base) : "";
    if (!base && !domain) {
      skipped.push({ line: entry.line, raw: entry.raw, reason: "Elige un dominio o usa URLs completas" });
      continue;
    }

    const accessName = suggestAccessName(entry.username, taken);
    if (!isValidUsername(accessName)) {
      skipped.push({ line: entry.line, raw: entry.raw, reason: "No se pudo generar un usuario válido" });
      continue;
    }
    taken.add(accessName);

    // El acceso al reproductor reutiliza la contraseña IPTV: el proveedor
    // solo tiene que decirle a su cliente "entra con los mismos datos".
    created.push({ username: accessName, password: entry.password, source: entry.username });

    if (!body.dryRun) {
      insert.run(
        provider.id,
        actor.reseller?.id ?? 0,
        accessName,
        await bcrypt.hash(entry.password, 10),
        encryptSecret(entry.password),
        entry.label || "",
        base,
        entry.username,
        entry.password,
        base ? 0 : domain!.id,
        maxDevices,
        Date.now()
      );
    }
  }

  return NextResponse.json({
    dryRun: Boolean(body.dryRun),
    created: created.length,
    skipped: skipped.length,
    slots,
    sample: created.slice(0, 5),
    errors: skipped.slice(0, 20),
  });
}
