import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb, CustomerRow, ProviderDomainRow } from "@/lib/db";
import {
  getPanelActor,
  getProviderStatus,
  isValidUsername,
  resolveCustomerPlaylist,
  customerScopeClause,
  resellerCustomerCount,
} from "@/lib/provider";
import { normalizeBase, parseXtreamUrl } from "@/lib/xtream";

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
  const provider = actor.provider;

  const status = getProviderStatus(provider);
  if (!status.active) {
    return NextResponse.json(
      {
        error:
          actor.kind === "reseller"
            ? "El plan de tu proveedor no está activo. Contacta con él."
            : "Tu plan no está activo. Contrata un plan para dar de alta clientes.",
        needsPlan: actor.kind === "provider",
      },
      { status: 403 }
    );
  }
  // Cupo global del plan del proveedor
  if (status.usedCustomers >= status.maxCustomers) {
    return NextResponse.json(
      {
        error:
          actor.kind === "reseller"
            ? "Tu proveedor ha alcanzado el límite de clientes de su plan. Contacta con él."
            : `Has alcanzado el límite de ${status.maxCustomers} clientes de tu plan ${status.planName}. Amplía tu plan para añadir más.`,
        needsUpgrade: actor.kind === "provider",
      },
      { status: 403 }
    );
  }
  // Cupo propio del revendedor, si su proveedor se lo asignó
  if (actor.kind === "reseller" && actor.ownCustomerLimit > 0) {
    const own = resellerCustomerCount(actor.reseller!.id);
    if (own >= actor.ownCustomerLimit) {
      return NextResponse.json(
        { error: `Has alcanzado tu límite de ${actor.ownCustomerLimit} clientes. Pide ampliación a tu proveedor.` },
        { status: 403 }
      );
    }
  }

  let body: {
    username?: string;
    password?: string;
    label?: string;
    domainId?: number;
    playlistType?: string;
    playlistUrl?: string;
    playlistUsername?: string;
    playlistPassword?: string;
    maxDevices?: number;
    expiresAt?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const username = (body.username || "").trim().toLowerCase();
  const password = body.password || "";
  if (!isValidUsername(username)) {
    return NextResponse.json(
      { error: "El usuario debe tener entre 3 y 32 caracteres (letras, números, punto, guion o guion bajo)" },
      { status: 400 }
    );
  }
  if (password.length < 4) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 4 caracteres" }, { status: 400 });
  }

  const db = getDb();
  const dup = db
    .prepare("SELECT id FROM customers WHERE provider_id = ? AND username = ?")
    .get(provider.id, username);
  if (dup) return NextResponse.json({ error: "Ya tienes un cliente con ese usuario" }, { status: 409 });

  let type = body.playlistType === "m3u" ? "m3u" : "xtream";
  let url = (body.playlistUrl || "").trim();
  let plUser = (body.playlistUsername || "").trim();
  let plPass = body.playlistPassword || "";
  let domainId = 0;

  // Vía normal: se elige uno de los dominios ya configurados
  if (body.domainId) {
    if (actor.domainAccess === "none") {
      return NextResponse.json({ error: "No tienes acceso a los dominios de tu proveedor" }, { status: 403 });
    }
    const domain = db
      .prepare("SELECT * FROM provider_domains WHERE id = ? AND provider_id = ?")
      .get(Number(body.domainId), provider.id) as ProviderDomainRow | undefined;
    if (!domain) return NextResponse.json({ error: "Ese dominio no existe en tu cuenta" }, { status: 400 });

    // Si pegan la URL get.php en el usuario, extraemos las credenciales igualmente
    const parsed = parseXtreamUrl(plUser);
    if (parsed) {
      plUser = parsed.username;
      plPass = plPass || parsed.password;
    }
    if (!plUser || !plPass) {
      return NextResponse.json({ error: "Indica el usuario y la contraseña IPTV del cliente" }, { status: 400 });
    }
    domainId = domain.id;
    type = "xtream";
    url = "";
  } else if (type === "xtream") {
    // Vía manual: URL escrita a mano (acepta un get.php completo)
    const parsed = parseXtreamUrl(url);
    if (parsed) {
      url = parsed.base;
      plUser = plUser || parsed.username;
      plPass = plPass || parsed.password;
    } else if (url) {
      url = normalizeBase(url);
    }
    if (!url || !plUser || !plPass) {
      return NextResponse.json(
        { error: "Elige un dominio o indica servidor, usuario y contraseña" },
        { status: 400 }
      );
    }
  } else {
    const parsed = parseXtreamUrl(url);
    if (parsed && /get\.php/i.test(url)) {
      // Un get.php es Xtream: mejor experiencia por la API
      type = "xtream";
      url = parsed.base;
      plUser = parsed.username;
      plPass = parsed.password;
    } else if (!url) {
      return NextResponse.json({ error: "Indica la URL de la lista M3U" }, { status: 400 });
    }
  }

  const hash = await bcrypt.hash(password, 10);
  const maxDevices = Math.min(Math.max(Number(body.maxDevices) || 2, 1), 10);

  const result = db
    .prepare(
      `INSERT INTO customers
       (provider_id, reseller_id, username, password_hash, label, playlist_type, playlist_url,
        playlist_username, playlist_password, domain_id, max_devices, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      provider.id,
      actor.reseller?.id ?? 0,
      username,
      hash,
      (body.label || "").trim().slice(0, 120),
      type,
      url,
      plUser,
      plPass,
      domainId,
      maxDevices,
      Number(body.expiresAt) || 0,
      Date.now()
    );

  const row = db.prepare("SELECT * FROM customers WHERE id = ?").get(result.lastInsertRowid) as CustomerRow;
  return NextResponse.json({ customer: serialize(row, 0) });
}
