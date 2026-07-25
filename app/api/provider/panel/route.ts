import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentProvider } from "@/lib/provider";
import { normalizeBase, parseXtreamUrl } from "@/lib/xtream";
import { assertPublicUrl } from "@/lib/safeFetch";

/**
 * Muchos servidores IPTV filtran por User-Agent y rechazan cualquier cliente
 * que no reconozcan, así que nos identificamos como VLC, que es el que todos
 * admiten. Sin esto, servidores perfectamente accesibles responden 403 o se
 * quedan sin contestar.
 */
const PLAYER_UA = "VLC/3.0.20 LibVLC/3.0.20";

export const dynamic = "force-dynamic";

/**
 * Conexión con el panel Xtream del proveedor.
 * Guardamos sus credenciales para poder listar e importar sus clientes.
 */
export async function GET() {
  const provider = await getCurrentProvider();
  if (!provider) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  return NextResponse.json({
    panel: {
      url: provider.panel_url || "",
      username: provider.panel_user || "",
      connected: Boolean(provider.panel_url && provider.panel_user),
      checkedAt: provider.panel_checked_at || 0,
    },
  });
}

/** Guarda y comprueba la conexión con el panel. */
export async function PUT(req: NextRequest) {
  const provider = await getCurrentProvider();
  if (!provider) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: { url?: string; username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const db = getDb();

  // Desconectar
  if (!body.url) {
    db.prepare("UPDATE providers SET panel_url = '', panel_user = '', panel_pass = '', panel_checked_at = 0 WHERE id = ?").run(
      provider.id
    );
    return NextResponse.json({ ok: true, connected: false });
  }

  let url = body.url.trim();
  let username = (body.username || "").trim();
  let password = body.password || "";

  // Acepta que peguen una URL get.php con las credenciales dentro
  const parsed = parseXtreamUrl(url);
  if (parsed) {
    url = parsed.base;
    username = username || parsed.username;
    password = password || parsed.password;
  } else {
    url = normalizeBase(url);
  }

  if (!url || !username || !password) {
    return NextResponse.json({ error: "Indica la URL del panel, el usuario y la contraseña" }, { status: 400 });
  }

  // Comprobamos que responde antes de guardarlo
  try {
    const target = new URL(`${url}/player_api.php`);
    target.searchParams.set("username", username);
    target.searchParams.set("password", password);
    await assertPublicUrl(target.toString());

    const res = await fetch(target.toString(), {
      signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": PLAYER_UA },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: `El panel respondió ${res.status}` }, { status: 502 });
    }
    const data = await res.json().catch(() => null);
    if (!data?.user_info || data.user_info.auth === 0) {
      return NextResponse.json({ error: "El panel rechazó esas credenciales" }, { status: 401 });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    const isBlocked = message.includes("permitido") || message.includes("inválida");
    return NextResponse.json(
      { error: isBlocked ? message : "No se pudo conectar con el panel. Revisa la URL y el puerto." },
      { status: isBlocked ? 400 : 502 }
    );
  }

  db.prepare(
    "UPDATE providers SET panel_url = ?, panel_user = ?, panel_pass = ?, panel_checked_at = ? WHERE id = ?"
  ).run(url, username, password, Date.now(), provider.id);

  return NextResponse.json({ ok: true, connected: true, url });
}
