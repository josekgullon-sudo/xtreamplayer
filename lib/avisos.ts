import { assertPublicUrl } from "./safeFetch";
import { SITE_URL } from "./site";

/**
 * Avisos a quien lleva la plataforma.
 *
 * Un proveedor abre un ticket y se queda ahí hasta que alguien se asoma a
 * /admin. Esto lo empuja: si hay una dirección configurada en
 * ADMIN_WEBHOOK_URL, se le manda un JSON con lo que ha pasado. Sirve tal
 * cual para un bot de Telegram, un canal de Discord o Slack, o cualquier
 * automatización propia; no hay dependencias ni servidor de correo que
 * mantener, que es lo que suele hacer que estos avisos nunca se lleguen a
 * poner.
 *
 * Nunca hace esperar a quien abrió el ticket: se lanza y se olvida, con su
 * tiempo máximo, y si falla solo deja rastro en el registro del servidor.
 * Que un bot esté caído no puede impedir que se abra un ticket.
 */

export interface Aviso {
  /** Qué ha pasado, en una línea */
  titulo: string;
  /** El detalle, para quien lea el mensaje sin abrir nada */
  texto: string;
  /** A dónde ir para resolverlo */
  enlace?: string;
  /** Para que quien lo reciba pueda filtrar por tipo */
  tipo: string;
}

export function avisarAdmin(aviso: Aviso): void {
  const destino = (process.env.ADMIN_WEBHOOK_URL || "").trim();
  if (!destino) return;

  const cuerpo = {
    tipo: aviso.tipo,
    titulo: aviso.titulo,
    // «text» y «content» son los campos que esperan Slack y Discord: así el
    // mismo aviso vale para los tres sin escribir un adaptador por servicio
    text: `${aviso.titulo}\n${aviso.texto}${aviso.enlace ? `\n${aviso.enlace}` : ""}`,
    content: `${aviso.titulo}\n${aviso.texto}${aviso.enlace ? `\n${aviso.enlace}` : ""}`,
    detalle: aviso.texto,
    enlace: aviso.enlace || `${SITE_URL}/admin`,
    fecha: new Date().toISOString(),
  };

  void (async () => {
    try {
      await assertPublicUrl(destino);
      const res = await fetch(destino, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) console.error("[aviso] respondió", res.status);
    } catch (e) {
      console.error("[aviso] no se pudo enviar:", e instanceof Error ? e.message : e);
    }
  })();
}
