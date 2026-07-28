import type { MetadataRoute } from "next";
import { SITE_NAME, SITE_DESCRIPTION } from "@/lib/site";

/**
 * El manifiesto que convierte la web en aplicación instalable.
 *
 * En un iPhone es la única vía que hay —Apple no admite reproductores IPTV
 * genéricos en su tienda—, y en Android evita tener que publicar una app
 * para algo que ya funciona en el navegador. Instalada, se abre a pantalla
 * completa y sin barra de direcciones, que es lo que diferencia «una web que
 * me abre» de «mi aplicación».
 *
 * Arranca en el reproductor, no en la portada: quien se la instala en el
 * móvil ya sabe lo que es y viene a ver, no a leer los precios.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — TV en directo, cine y series`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/player",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#08080a",
    theme_color: "#08080a",
    lang: "es",
    categories: ["entertainment", "video"],
    icons: [
      { src: "/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // «maskable» es lo que evita que Android le pinte un marco blanco
      { src: "/icono-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Ver la tele", short_name: "Tele", url: "/tv" },
      { name: "Mi cuenta", short_name: "Cuenta", url: "/mi-cuenta" },
    ],
  };
}
