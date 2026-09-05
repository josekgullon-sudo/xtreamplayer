import type { Metadata } from "next";
import { headers } from "next/headers";
import SoloApps from "@/components/SoloApps";
import TvApp from "@/components/tv/TvApp";
import { enUnTelevisor } from "@/lib/envoltorio";
import { getCurrentCustomer } from "@/lib/provider";

export const metadata: Metadata = {
  title: "TV",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

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
  /* Un cliente de proveedor, en un navegador de escritorio, no entra aquí:
     ver `lib/envoltorio.ts` */
  if (!enUnTelevisor(agente, (await searchParams).app) && (await getCurrentCustomer())) {
    return (
      <SoloApps
        titulo="Esto se ve en la tele, no en el navegador."
        texto="Instala la aplicación en tu televisor, tu móvil o tu Fire TV y entra con el mismo usuario y la misma contraseña. Es la misma pantalla que estás viendo, hecha para el mando."
      />
    );
  }

  return <TvApp />;
}
