/**
 * Fuente segura para carátulas y logos.
 *
 * Los paneles IPTV entregan las imágenes por http://; en una página HTTPS el
 * navegador las bloquea sin decir nada y el catálogo aparece sin portadas.
 * Cuando hace falta, la imagen se sirve a través de nuestro proxy con caché.
 */
export function imgSrc(url?: string): string | undefined {
  if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) return undefined;
  if (typeof window !== "undefined" && window.location.protocol === "https:" && url.startsWith("http://")) {
    return `/api/img?url=${encodeURIComponent(url)}`;
  }
  return url;
}
