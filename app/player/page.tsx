import type { Metadata } from "next";
import { headers } from "next/headers";
import SiteHeader from "@/components/SiteHeader";
import PlayerApp from "@/components/player/PlayerApp";
import SoloApps from "@/components/SoloApps";
import { enUnaAplicacion } from "@/lib/envoltorio";
import { getCurrentCustomer } from "@/lib/provider";

/*
 * Siempre fresca: servida estática, Safari (iOS sobre todo) se aferraba al
 * HTML viejo y con él a los bundles viejos — el usuario probaba arreglos
 * que su móvil aún no tenía. La página es una cáscara de componentes de
 * cliente, así que servirla dinámica no cuesta nada.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reproductor IPTV web — reproduce tu lista M3U o Xtream Codes",
  description:
    "Reproduce tu lista IPTV en el navegador: TV en directo, películas y series desde tu cuenta Xtream Codes o URL M3U. Gratis y sin instalar nada.",
  alternates: { canonical: "/player" },
};

export default async function PlayerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const agente = (await headers()).get("user-agent") || "";
  const dentro = enUnaAplicacion(agente, (await searchParams).app);

  /*
   * Un cliente de proveedor, en un navegador de escritorio, no reproduce
   * aquí: ver `lib/envoltorio.ts`. Dentro de la aplicación sí, y esa era la
   * mitad que faltaba — el APK del móvil es un envoltorio de esta misma
   * página, así que el cartel le salía al cliente DENTRO de la aplicación
   * que el propio cartel le pedía instalar.
   */
  const cliente = dentro ? null : await getCurrentCustomer();
  if (cliente) {
    return (
      <>
        {/* Con la cabecera: es la única pantalla que ve quien todavía no ha
            instalado nada, y sin ella se queda sin menú de cuenta y sin por
            dónde cerrar sesión */}
        <SiteHeader />
        <SoloApps
          titulo={`Hola, ${cliente.username}. Tu tele se ve desde la aplicación.`}
          texto="Tu proveedor sirve sus canales a través de nuestras aplicaciones, no del navegador. Se instalan una vez y entras con el mismo usuario y la misma contraseña que acabas de usar."
        />
      </>
    );
  }

  /*
   * Y dentro de la aplicación no va la cabecera de la web.
   *
   * Es la de vender —«Funciones · Precios · Entrar»— y dentro del envoltorio
   * no lleva a ninguna parte: el cliente ya ha entrado, y el botón rojo de
   * «Entrar» le competía con el de reproducir sin significar nada para él.
   */
  return (
    <>
      {!dentro && <SiteHeader />}
      <PlayerApp enUnaApp={dentro} />
    </>
  );
}
