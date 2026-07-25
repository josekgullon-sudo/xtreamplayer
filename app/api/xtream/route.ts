import { NextRequest, NextResponse } from "next/server";
import { assertPublicUrl } from "@/lib/safeFetch";

/**
 * Muchos servidores IPTV filtran por User-Agent y rechazan cualquier cliente
 * que no reconozcan, así que nos identificamos como VLC, que es el que todos
 * admiten. Sin esto, servidores perfectamente accesibles responden 403 o se
 * quedan sin contestar.
 */
const PLAYER_UA = "VLC/3.0.20 LibVLC/3.0.20";

export const dynamic = "force-dynamic";

const ALLOWED_ACTIONS = new Set([
  "get_live_categories",
  "get_live_streams",
  "get_vod_categories",
  "get_vod_streams",
  "get_vod_info",
  "get_series_categories",
  "get_series",
  "get_series_info",
  "get_short_epg",
  "get_simple_data_table",
]);

/**
 * Proxy servidor→servidor para la API JSON de Xtream Codes.
 * Necesario porque los paneles Xtream no envían cabeceras CORS.
 * Solo datos JSON (categorías, canales, EPG) — el vídeo va directo o por /api/proxy.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const base = sp.get("base")?.replace(/\/+$/, "");
  const username = sp.get("username");
  const password = sp.get("password");
  const action = sp.get("action");

  if (!base || !username || !password) {
    return NextResponse.json({ error: "Faltan credenciales" }, { status: 400 });
  }
  if (action && !ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: "Acción no permitida" }, { status: 400 });
  }

  const target = new URL(`${base}/player_api.php`);
  target.searchParams.set("username", username);
  target.searchParams.set("password", password);
  if (action) target.searchParams.set("action", action);
  for (const key of ["category_id", "vod_id", "series_id", "stream_id", "limit"]) {
    const value = sp.get(key);
    if (value) target.searchParams.set(key, value);
  }

  try {
    await assertPublicUrl(target.toString());
    const upstream = await fetch(target.toString(), {
      signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": PLAYER_UA },
      cache: "no-store",
    });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `El servidor IPTV respondió ${upstream.status}` },
        { status: 502 }
      );
    }
    const text = await upstream.text();
    try {
      return NextResponse.json(JSON.parse(text));
    } catch {
      return NextResponse.json(
        { error: "El servidor IPTV no devolvió datos válidos. Revisa la URL y las credenciales." },
        { status: 502 }
      );
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error de conexión";
    const status = message.includes("permitido") || message.includes("inválida") ? 400 : 502;
    return NextResponse.json(
      { error: status === 400 ? message : "No se pudo conectar con el servidor IPTV. Comprueba la URL, el puerto y tu suscripción." },
      { status }
    );
  }
}
