import type { Metadata } from "next";
import TvApp from "@/components/tv/TvApp";

export const metadata: Metadata = {
  title: "TV",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * La aplicación de televisión, en su propia página: sin cabecera de la web
 * ni nada del reproductor de escritorio. Es la que se empaqueta como app de
 * Android TV o de Smart TV — una URL, pantalla completa, mando a distancia.
 */
export default function TvPage() {
  return <TvApp />;
}
