import { emitirVale } from "@/lib/vale";

/**
 * Reescritura de manifiestos HLS.
 *
 * Un manifiesto es una lista de direcciones del proveedor. Devolverlo tal
 * cual —o reescrito con «?url=…» como antes— enseña el servidor entero en la
 * primera petición del canal, con su usuario y su contraseña en la ruta.
 * Cada línea sale con su propio vale: cifrada, atada a la sesión de quien
 * pidió el canal y caducable. Por fuera, todas iguales y ninguna legible.
 */

export function enlaceProxy(url: string, dueño: string): string {
  return `/api/proxy?v=${encodeURIComponent(emitirVale(url, dueño))}`;
}

export function rewriteManifest(text: string, baseUrl: string, dueño: string): string {
  return text
    .split("\n")
    .map((linea) => {
      const limpio = linea.trim();
      if (!limpio) return linea;
      if (limpio.startsWith("#")) {
        // Reescribe URI="..." en tags (claves de cifrado, audio alternativo...)
        return linea.replace(/URI="([^"]+)"/g, (todo, uri) => {
          try {
            return `URI="${enlaceProxy(new URL(uri, baseUrl).toString(), dueño)}"`;
          } catch {
            return todo;
          }
        });
      }
      try {
        return enlaceProxy(new URL(limpio, baseUrl).toString(), dueño);
      } catch {
        return linea;
      }
    })
    .join("\n");
}
