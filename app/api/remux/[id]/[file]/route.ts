import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { ficheroDeSesion, esperarSesionLista } from "@/lib/remux";

export const dynamic = "force-dynamic";

/** Sirve el playlist y los segmentos de una conversión en curso o terminada. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await ctx.params;

  /*
   * El playlist es quien espera a que la conversión tenga su primer
   * segmento: quien lo pide es un reproductor de vídeo, que aguanta un
   * manifiesto lento sin inmutarse. (La ruta de arranque, en cambio,
   * responde al instante: colgada 20 s sin cabeceras la cortaba cualquier
   * intermediario, y el iPhone se quedaba sin saber por qué.)
   */
  if (file === "index.m3u8") {
    const listo = await esperarSesionLista(id, 25000);
    if (!listo.ok) {
      console.error("[remux] playlist sin conversión lista:", id, "→", listo.detalle);
      return NextResponse.json({ error: "La conversión falló.", detalle: listo.detalle }, { status: 502 });
    }
  }

  const f = ficheroDeSesion(id, file);
  if (!f) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  if (f.tipo === "application/vnd.apple.mpegurl") {
    // El playlist cambia mientras la conversión avanza: nunca cachear
    return new NextResponse(fs.readFileSync(f.ruta, "utf8"), {
      headers: { "Content-Type": f.tipo, "Cache-Control": "no-store" },
    });
  }

  const stat = fs.statSync(f.ruta);
  const stream = fs.createReadStream(f.ruta);
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": f.tipo,
      "Content-Length": String(stat.size),
      // Un segmento ya escrito no cambia jamás: cache corta sin riesgo
      "Cache-Control": "private, max-age=300",
    },
  });
}
