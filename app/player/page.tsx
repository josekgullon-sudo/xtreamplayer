import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import PlayerApp from "@/components/player/PlayerApp";

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

export default function PlayerPage() {
  return (
    <>
      <SiteHeader />
      <PlayerApp />
    </>
  );
}
