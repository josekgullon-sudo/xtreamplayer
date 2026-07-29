import { NextRequest, NextResponse } from "next/server";

/**
 * Que la web viva en una sola dirección.
 *
 * Al poner dominio propio, el de Railway sigue contestando: dos direcciones
 * sirviendo lo mismo. Eso trae tres problemas de verdad —Google reparte el
 * posicionamiento entre las dos y acaba enseñando la fea; las sesiones no se
 * comparten, así que quien entra por una aparece sin sesión en la otra; y los
 * enlaces que reparten los proveedores a sus clientes se quedan apuntando a
 * una dirección que algún día se apagará—.
 *
 * Se activa a mano con REDIRECT_TO_CANONICAL=1, y esto no es pereza: si se
 * activara solo al configurar el dominio, un despliegue hecho antes de que el
 * DNS propague dejaría la web entera redirigiendo a una dirección que todavía
 * no contesta. Primero se comprueba que el dominio responde; después se
 * enciende esto.
 *
 * Lo que nunca se redirige:
 *   /api      Stripe no sigue redirecciones en sus avisos, y un webhook
 *             redirigido es un cobro que no se entera de nada.
 *   local     127.0.0.1, localhost y los dominios internos: por ahí entran
 *             las comprobaciones de salud del propio Railway.
 *   POST y compañía  Solo se redirige lo que se puede repetir sin efectos.
 */
export function middleware(req: NextRequest) {
  if (process.env.REDIRECT_TO_CANONICAL !== "1") return NextResponse.next();

  const canonico = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (!canonico) return NextResponse.next();

  let destino: URL;
  try {
    destino = new URL(canonico);
  } catch {
    return NextResponse.next();
  }

  const host = req.headers.get("host") || "";
  if (!host || host === destino.host) return NextResponse.next();
  // Por aquí entra Railway a comprobar que la aplicación está viva
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) || host.endsWith(".internal")) {
    return NextResponse.next();
  }
  if (req.method !== "GET" && req.method !== "HEAD") return NextResponse.next();

  const url = new URL(req.url);
  url.protocol = destino.protocol;
  url.host = destino.host;
  url.port = destino.port;
  // 308: el navegador se lo queda, y el método y el cuerpo no cambian
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
