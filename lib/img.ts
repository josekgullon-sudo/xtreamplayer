/**
 * Fuente segura para carátulas y logos.
 *
 * Las direcciones ya vienen convertidas en vales desde el servidor: el
 * catálogo y las listas M3U se limpian antes de salir, así que aquí llega
 * «/api/img?v=…» y no la dirección del proveedor. Esto solo decide si hay
 * imagen o no.
 *
 * Sigue admitiendo una dirección absoluta por el caso de las listas que un
 * usuario guarda en su propio navegador y que no pasan por el servidor: esas
 * son suyas, las escribió él, y ahí no hay nada que ocultarle.
 */
export function imgSrc(url?: string): string | undefined {
  if (!url || typeof url !== "string") return undefined;
  const limpio = url.trim();
  if (!limpio) return undefined;
  if (limpio.startsWith("/api/img?")) return limpio;
  if (!/^https?:\/\//i.test(limpio)) return undefined;
  // Una página HTTPS no puede cargar una imagen http://: el navegador la
  // bloquea sin decir nada y el catálogo se queda sin portadas
  if (typeof window !== "undefined" && window.location.protocol === "https:" && limpio.startsWith("http://")) {
    return undefined;
  }
  return limpio;
}
