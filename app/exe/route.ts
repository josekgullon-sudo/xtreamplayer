import { NextRequest, NextResponse } from "next/server";

/**
 * Descarga directa del programa de Windows, con una dirección corta.
 *
 * El mismo motivo que en `/apk`: la dirección de GitHub —una versión, una
 * etiqueta, un nombre de archivo— son sesenta caracteres, y lo que se le pasa
 * a un cliente por WhatsApp tiene que caber en una línea y poder dictarse por
 * teléfono.
 *
 *   totalplayer.app/exe      el instalador de siempre
 *   totalplayer.app/exe?msi  el mismo, en el formato que reparten las empresas
 *
 * No servimos el archivo nosotros: se redirige a la versión de GitHub, que ya
 * lo aloja y aguanta la descarga sin gastar nuestro ancho de banda.
 */
const VERSION =
  "https://github.com/josekgullon-sudo/xtreamplayer/releases/download/exe-pruebas";

export function GET(req: NextRequest) {
  /* El MSI es la excepción y por eso va por parámetro: quien lo necesita
     —una empresa que reparte software por directiva— sabe lo que busca */
  const empresa = req.nextUrl.searchParams.has("msi");
  const archivo = empresa ? "TOTALplayer.msi" : "TOTALplayer-instalador.exe";
  /* 302 y no 308: el destino cambia cada vez que se publica una tanda nueva,
     y un permanente se queda pegado en la caché del navegador */
  return NextResponse.redirect(`${VERSION}/${archivo}`, 302);
}
