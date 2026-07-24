/**
 * Reescritura de manifiestos HLS para el proxy de compatibilidad:
 * cada URI (segmentos, sub-playlists, claves de cifrado) se redirige a /api/proxy.
 */

export function proxiedUrl(url: string): string {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

export function rewriteManifest(text: string, baseUrl: string): string {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        // Reescribe URI="..." en tags (claves de cifrado, audio alternativo...)
        return line.replace(/URI="([^"]+)"/g, (match, uri) => {
          try {
            return `URI="${proxiedUrl(new URL(uri, baseUrl).toString())}"`;
          } catch {
            return match;
          }
        });
      }
      try {
        return proxiedUrl(new URL(trimmed, baseUrl).toString());
      } catch {
        return line;
      }
    })
    .join("\n");
}
