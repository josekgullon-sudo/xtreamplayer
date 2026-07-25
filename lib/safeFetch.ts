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

/**
 * Un directo pasa por el proxy una vez por cada trozo de vídeo, o sea varias
 * veces por minuto y por espectador, siempre contra el mismo host. Resolver el
 * DNS en cada una satura el pool de hilos de Node y se nota en el arranque del
 * canal, así que guardamos el veredicto un rato.
 *
 * El plazo es corto a propósito: cachear indefinidamente reabriría la puerta a
 * un ataque de DNS rebinding, en el que un dominio responde primero con una IP
 * pública y después con una privada.
 */
const CACHE_DNS_MS = 60_000;
const veredictos = new Map<string, { publico: boolean; hasta: number }>();

async function hostEsPublico(host: string): Promise<boolean> {
  const ahora = Date.now();
  const guardado = veredictos.get(host);
  if (guardado && guardado.hasta > ahora) return guardado.publico;

  const addresses = await dns.lookup(host, { all: true });
  const publico = addresses.length > 0 && !addresses.some((a) => isPrivateIp(a.address));

  // Sin dejar que el mapa crezca sin fin en un servidor de larga vida
  if (veredictos.size > 500) veredictos.clear();
  veredictos.set(host, { publico, hasta: ahora + CACHE_DNS_MS });
  return publico;
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
  let publico: boolean;
  try {
    publico = await hostEsPublico(host);
  } catch {
    throw new Error("No se pudo resolver el host del servidor IPTV");
  }
  if (!publico) throw new Error("Destino no permitido");
  return url;
}
