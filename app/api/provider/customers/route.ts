import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb, CustomerRow } from "@/lib/db";
import { getCurrentProvider, getProviderStatus, isValidUsername } from "@/lib/provider";
import { normalizeBase, parseXtreamUrl } from "@/lib/xtream";

export const dynamic = "force-dynamic";

function serialize(row: CustomerRow, devices: number) {
  return {
    id: row.id,
    username: row.username,
    label: row.label,
    playlistType: row.playlist_type,
    playlistUrl: row.playlist_url,
    playlistUsername: row.playlist_username,
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

  // Acepta pegar una URL get.php completa y extrae las credenciales
  let type = body.playlistType === "m3u" ? "m3u" : "xtream";
  let url = (body.playlistUrl || "").trim();
  let plUser = (body.playlistUsername || "").trim();
  let plPass = body.playlistPassword || "";

  if (type === "xtream") {
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
        { error: "Para Xtream necesitas servidor, usuario y contraseña del cliente" },
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
        playlist_username, playlist_password, max_devices, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      maxDevices,
      Number(body.expiresAt) || 0,
      Date.now()
    );

  const row = db.prepare("SELECT * FROM customers WHERE id = ?").get(result.lastInsertRowid) as CustomerRow;
  return NextResponse.json({ customer: serialize(row, 0) });
}
