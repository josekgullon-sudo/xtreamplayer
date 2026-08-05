import type { Metadata } from "next";
import { headers } from "next/headers";
import TvApp from "@/components/tv/TvApp";
import { getCurrentCustomer } from "@/lib/provider";

export const metadata: Metadata = {
  title: "TV",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * Los televisores que se identifican como tales.
 *
 * Esto no es una comprobación de seguridad y no pretende serlo: una cadena de
 * agente se copia en diez segundos. Es una puerta de conveniencia, para que
 * abrir la aplicación de televisión en el portátil y darle a F12 no sea el
 * camino corto. Lo que de verdad protege es que ni el catálogo ni las
 * carátulas ni la M3U llevan ya dirección alguna dentro; lo único que queda a
 * la vista es la del vídeo, y en un televisor no hay inspector que abrir.
 */
const TELEVISORES = /tizen|web0s|webos|smart-?tv|smarttv|hbbtv|netcast|viera|bravia|aft[a-z]|android tv|googletv|crkey/i;

/**
 * La aplicación de televisión, en su propia página: sin cabecera de la web
 * ni nada del reproductor de escritorio. Es la que se empaqueta como app de
 * Android TV, de Tizen (Samsung) o de webOS (LG) — una URL, pantalla
 * completa, mando a distancia.
 */
export default async function TvPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const agente = (await headers()).get("user-agent") || "";
  /*
   * Dos señales, y ninguna es una cerradura.
   *
   * `?app=1` lo pone el index.html de los paquetes de Samsung y de LG al
   * abrir; la cadena de agente cubre los televisores que entran por su propio
   * navegador. Las dos se falsifican en diez segundos y no pasa nada: lo que
   * de verdad protege es que ni el catálogo, ni las carátulas, ni la M3U
   * llevan ya dirección alguna dentro. Esto solo evita que el camino corto
   * sea abrir la app de tele en el portátil.
   */
  const dentroDelPaquete = (await searchParams).app === "1";
  const enUnaTele = dentroDelPaquete || TELEVISORES.test(agente);

  /*
   * Un cliente de proveedor, en un navegador de escritorio, no entra aquí.
   *
   * Su línea es lo que hay que proteger y en una página web no hay forma de
   * reproducir un vídeo sin que su dirección quede al alcance del inspector.
   * Dentro del paquete de la tele sí, y por eso allí se abre.
   */
  if (!enUnaTele && (await getCurrentCustomer())) {
    return (
      <div className="solo-apps">
        <div className="solo-apps-caja">
          <span className="logo-nombre">TOTAL<span className="logo-play">player</span></span>
          <h1>Esto se ve en la tele, no en el navegador.</h1>
          <p>
            Instala la aplicación en tu televisor, tu móvil o tu Fire TV y entra con el mismo usuario y la
            misma contraseña. Es la misma pantalla que estás viendo, hecha para el mando.
          </p>
          <div className="solo-apps-botones">
            <a className="btn btn-primary" href="/apps">Ver las aplicaciones</a>
            <a className="btn btn-ghost" href="/mi-cuenta">Mi cuenta</a>
          </div>
        </div>
      </div>
    );
  }

  return <TvApp />;
}
