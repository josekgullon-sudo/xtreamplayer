import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb, CustomerRow, ProviderDomainRow } from "@/lib/db";
import { getCurrentProvider, getProviderStatus, isValidUsername, resolveCustomerPlaylist } from "@/lib/provider";
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

/** Lista de clientes del proveedor, con búsqueda opcional. */
export async function GET(req: NextRequest) {
  const provider = await getCurrentProvider();
  if (!provider) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const db = getDb();
  const q = (req.nextUrl.searchParams.get("q") || "").trim();

  const rows = q
    ? (db
        .prepare(
          "SELECT * FROM customers WHERE provider_id = ? AND (username LIKE ? OR label LIKE ?) ORDER BY created_at DESC LIMIT 500"
        )
        .all(provider.id, `%${q}%`, `%${q}%`) as CustomerRow[])
    : (db
        .prepare("SELECT * FROM customers WHERE provider_id = ? ORDER BY created_at DESC LIMIT 500")
        .all(provider.id) as CustomerRow[]);

  const counts = db.prepare("SELECT customer_id, COUNT(*) AS c FROM devices GROUP BY customer_id").all() as {
    customer_id: number;
    c: number;
  }[];
  const deviceMap = new Map(counts.map((c) => [c.customer_id, c.c]));

  return NextResponse.json({
    customers: rows.map((r) => serialize(r, deviceMap.get(r.id) ?? 0)),
    status: getProviderStatus(provider),
  });
}

/** Alta de un cliente final. El proveedor entrega usuario+contraseña a su cliente. */
export async function POST(req: NextRequest) {
  const provider = await getCurrentProvider();
  if (!provider) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const status = getProviderStatus(provider);
  if (!status.active) {
    return NextResponse.json(
      { error: "Tu plan no está activo. Contrata un plan para dar de alta clientes.", needsPlan: true },
      { status: 403 }
    );
  }
  if (status.usedCustomers >= status.maxCustomers) {
    return NextResponse.json(
      {
        error: `Has alcanzado el límite de ${status.maxCustomers} clientes de tu plan ${status.planName}. Amplía tu plan para añadir más.`,
        needsUpgrade: true,
      },
      { status: 403 }
    );
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

  // Vía normal: el proveedor elige uno de sus dominios ya configurados
  if (body.domainId) {
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
       (provider_id, username, password_hash, label, playlist_type, playlist_url,
        playlist_username, playlist_password, domain_id, max_devices, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      provider.id,
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
