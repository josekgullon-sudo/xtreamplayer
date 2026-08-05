import { NextRequest, NextResponse } from "next/server";
import { origenPedido, urlDeTimeshift, urlDeXtream } from "@/lib/origen";
import { emitirVale, enlaceDeVideo, videoOculto } from "@/lib/vale";

export const dynamic = "force-dynamic";

/**
 * «Quiero ver este canal» → un enlace para reproducirlo.
 *
 * Las direcciones de Xtream se construían en el navegador, con la línea del
 * proveedor delante: `${base}/live/${usuario}/${clave}/${id}.m3u8`. Para eso
 * el navegador tiene que tener los tres datos, y en cuanto los tiene ya no
 * hay nada que proteger. Ahora se piden por su número y se contesta con un
 * enlace opaco; a dónde va de verdad se queda aquí.
 *
 * Se pide una por reproducción, no una por canal: mandar de golpe los enlaces
 * de ocho mil canales es tanto trabajo de cifrado como poca falta hace.
 */
export async function POST(req: NextRequest) {
  let cuerpo: {
    lista?: string;
    base?: string;
    username?: string;
    password?: string;
    clase?: string;
    id?: string | number;
    ext?: string;
    inicio?: string;
    minutos?: number;
  };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const origen = await origenPedido(cuerpo.lista, {
    base: cuerpo.base,
    usuario: cuerpo.username,
    clave: cuerpo.password,
  });
  if (!origen) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  if (origen.tipo !== "xtream") {
    return NextResponse.json({ error: "Esa lista no es de tipo Xtream" }, { status: 400 });
  }

  const id = String(cuerpo.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Falta el canal" }, { status: 400 });

  if (cuerpo.clase === "timeshift") {
    // El formato de fecha lo fija el panel; se comprueba antes de pasarlo
    const inicio = String(cuerpo.inicio || "");
    if (!/^\d{4}-\d{2}-\d{2}:\d{2}-\d{2}$/.test(inicio)) {
      return NextResponse.json({ error: "Momento inválido" }, { status: 400 });
    }
    const url = urlDeTimeshift(origen, id, inicio, Number(cuerpo.minutos) || 60);
    return NextResponse.json({
      url: enlaceDeVideo(url, origen.dueño),
      vale: emitirVale(url, origen.dueño),
      directo: !videoOculto(),
    });
  }

  const clase = cuerpo.clase === "movie" ? "movie" : cuerpo.clase === "series" ? "series" : "live";
  const ext = (cuerpo.ext || (clase === "live" ? "m3u8" : "mp4")).replace(/[^a-z0-9]/gi, "").slice(0, 5);
  if (!ext) return NextResponse.json({ error: "Formato inválido" }, { status: 400 });

  const url = urlDeXtream(origen, clase, id, ext);
  /*
   * El mismo canal en TS. Hay paneles que anuncian .m3u8 y solo sirven TS, y
   * el reproductor lo prueba como alternativa; antes lo componía él cambiando
   * la extensión, que con un enlace opaco ya no puede hacer.
   */
  const enTs = clase === "live" ? urlDeXtream(origen, clase, id, "ts") : "";

  return NextResponse.json({
    url: enlaceDeVideo(url, origen.dueño),
    vale: emitirVale(url, origen.dueño),
    urlTs: enTs ? enlaceDeVideo(enTs, origen.dueño) : undefined,
    valeTs: enTs ? emitirVale(enTs, origen.dueño) : undefined,
    directo: !videoOculto(),
  });
}
