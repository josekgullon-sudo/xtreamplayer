import { NextRequest, NextResponse } from "next/server";

/**
 * Descarga directa de los APK, con una dirección que se pueda teclear.
 *
 * Instalar en un Fire TV Stick se hace con Downloader, y ahí la dirección se
 * escribe letra a letra con el mando. La de GitHub —una versión, una
 * etiqueta, un nombre de archivo— son sesenta caracteres y un error de
 * tecleo garantizado. Estas tres son cortas a propósito:
 *
 *   totalplayer.app/apk/tv     el reproductor nativo
 *   totalplayer.app/apk/movil  el mismo, para el teléfono
 *   totalplayer.app/apk/web    el envoltorio de WebView, para comparar
 *
 * «tv» y «movil» llevan al mismo archivo a propósito: es una sola
 * aplicación que cambia de cara según la pantalla donde se instale. Tener
 * dos nombres para lo mismo evita el «descárgate el de la tele en el
 * teléfono», que es una instrucción que nadie se cree.
 *
 * No servimos el archivo nosotros: se redirige a la versión de GitHub, que
 * ya lo aloja y aguanta la descarga sin gastar nuestro ancho de banda.
 */
const APKS: Record<string, string> = {
  tv: "totalplayer-tele-nativo.apk",
  movil: "totalplayer-tele-nativo.apk",
  web: "totalplayer-tele.apk",
};

const VERSION =
  "https://github.com/josekgullon-sudo/xtreamplayer/releases/download/apk-pruebas";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ cual: string }> }) {
  const { cual } = await ctx.params;
  const archivo = APKS[cual?.toLowerCase()];

  if (!archivo) {
    return new NextResponse(
      `No hay ningún APK con ese nombre. Los que hay: ${Object.keys(APKS).join(", ")}.`,
      { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  /* 302 y no 308: el destino cambia cada vez que se publica una tanda
     nueva, y un permanente se queda pegado en la caché del aparato */
  return NextResponse.redirect(`${VERSION}/${archivo}`, 302);
}
