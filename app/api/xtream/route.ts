import { NextRequest, NextResponse } from "next/server";
import { assertPublicUrl } from "@/lib/safeFetch";
import { limpiar, origenPedido } from "@/lib/origen";
import { jsonComprimido } from "@/lib/comprimir";

/**
 * Muchos servidores IPTV filtran por User-Agent y rechazan cualquier cliente
 * que no reconozcan, así que nos identificamos como VLC, que es el que todos
 * admiten. Sin esto, servidores perfectamente accesibles responden 403 o se
 * quedan sin contestar.
 */
const PLAYER_UA = "VLC/3.0.20 LibVLC/3.0.20";

export const dynamic = "force-dynamic";

const ACCIONES = new Set([
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
 * El catálogo del proveedor, sin decir de dónde sale.
 *
 * Antes esta ruta recibía del navegador «base», «username» y «password»:
 * el cliente tenía que saber el servidor de su proveedor y su línea entera
 * para poder pedir la lista de canales, y le quedaban escritos en la pestaña
 * de red. Ahora no se le pregunta nada de eso —se resuelve desde su galleta—
 * y lo que devuelve va limpio de direcciones, porque el JSON de Xtream trae
 * el host metido en cada logotipo y en `server_info`.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const accion = sp.get("action");

  /* «base», «username» y «password» solo los mira si NO hay cliente de
     proveedor: son para la lista que uno se pega en su navegador */
  const origen = await origenPedido(sp.get("lista"), {
    base: sp.get("base"),
    usuario: sp.get("username"),
    clave: sp.get("password"),
  }, sp.get("mac"));
  if (!origen) {
    return NextResponse.json({ error: "Entra en tu cuenta para ver tu lista" }, { status: 401 });
  }
  if (origen.tipo !== "xtream") {
    return NextResponse.json({ error: "Esa lista no es de tipo Xtream" }, { status: 400 });
  }
  if (accion && !ACCIONES.has(accion)) {
    return NextResponse.json({ error: "Acción no permitida" }, { status: 400 });
  }

  const destino = new URL(`${origen.base.replace(/\/+$/, "")}/player_api.php`);
  destino.searchParams.set("username", origen.usuario);
  destino.searchParams.set("password", origen.clave);
  if (accion) destino.searchParams.set("action", accion);
  for (const campo of ["category_id", "vod_id", "series_id", "stream_id", "limit"]) {
    const valor = sp.get(campo);
    if (valor) destino.searchParams.set(campo, valor);
  }

  try {
    await assertPublicUrl(destino.toString());
    const arriba = await fetch(destino.toString(), {
      signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": PLAYER_UA },
      cache: "no-store",
    });
    if (!arriba.ok) {
      return NextResponse.json({ error: `Tu proveedor respondió ${arriba.status}` }, { status: 502 });
    }
    const texto = await arriba.text();
    let datos: unknown;
    try {
      datos = JSON.parse(texto);
    } catch {
      return NextResponse.json(
        { error: "Tu proveedor no ha devuelto datos válidos." },
        { status: 502 }
      );
    }
    return await jsonComprimido(req, limpiar(datos, origen.dueño));
  } catch {
    /*
     * El motivo real no se cuenta. Un «getaddrinfo ENOTFOUND cdn.loquesea.com»
     * dice el servidor del proveedor con todas las letras, y eso es justo lo
     * que no puede salir de aquí.
     */
    return NextResponse.json(
      { error: "No hemos podido conectar con tu proveedor. Inténtalo en un momento." },
      { status: 502 }
    );
  }
}
