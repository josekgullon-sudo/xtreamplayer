import dns from "dns/promises";
import net from "net";

/**
 * Protección SSRF básica para las rutas proxy: rechaza destinos privados/locales.
 * Resuelve el hostname y comprueba que ninguna IP sea de rango privado.
 */

function isPrivateIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return (
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80") ||
      lower.startsWith("::ffff:127.") ||
      lower.startsWith("::ffff:10.") ||
      lower.startsWith("::ffff:192.168.")
    );
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("URL inválida");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Solo se permiten URLs http/https");
  }
  // Para instalaciones self-hosted cuyo servidor IPTV vive en la LAN
  if (process.env.ALLOW_PRIVATE_NETWORKS === "1") return url;
  const host = url.hostname;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Destino no permitido");
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("Destino no permitido");
    return url;
  }
  try {
    const addresses = await dns.lookup(host, { all: true });
    if (addresses.some((a) => isPrivateIp(a.address))) {
      throw new Error("Destino no permitido");
    }
  } catch (e) {
    if (e instanceof Error && e.message === "Destino no permitido") throw e;
    throw new Error("No se pudo resolver el host del servidor IPTV");
  }
  return url;
}
