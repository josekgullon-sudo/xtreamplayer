import { SITE_NAME, SITE_URL } from "./site";

/**
 * El correo que sale de aquí.
 *
 * Se manda por Resend, con una llamada HTTP y sin librería: su API es un
 * POST con JSON, y meter una dependencia entera —con sus actualizaciones y
 * sus vulnerabilidades— para construir ese POST no compensa.
 *
 * Si no hay clave configurada, no se rompe nada: se deja constancia en el
 * registro del servidor y la aplicación sigue. Un correo que no sale no
 * puede impedir que alguien se registre ni que abra un ticket.
 *
 * Variables de entorno:
 *   RESEND_API_KEY   la clave de la cuenta
 *   RESEND_API_URL   solo para pruebas: a dónde se mandan (por defecto Resend)
 *   MAIL_FROM        remitente, con dominio verificado en Resend
 *                    («TOTALplayer <hola@tudominio.com>»)
 *   MAIL_REPLY_TO    a dónde contesta el cliente si le da a Responder
 */

export function correoConfigurado(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export interface Correo {
  para: string;
  asunto: string;
  /** Primera línea del cuerpo, en grande */
  titulo: string;
  /** Párrafos del mensaje */
  parrafos: string[];
  /** Botón principal, si lo hay */
  boton?: { texto: string; url: string };
  /** Aviso pequeño al final, del tipo «si no has sido tú, ignora esto» */
  nota?: string;
}

/**
 * Envía y espera la respuesta. Devuelve si salió, para poder decírselo a
 * quien lo pidió —en un «te hemos mandado un correo» conviene no mentir—.
 */
export async function enviarCorreo(c: Correo): Promise<boolean> {
  if (!correoConfigurado()) {
    console.warn(`[correo] sin configurar; no se envía «${c.asunto}» a ${c.para}`);
    return false;
  }
  try {
    /* La dirección se puede cambiar para las pruebas: así la suite recibe
       los correos en un servidor local y puede abrir el enlace que llega, sin
       mandarle nada a nadie ni necesitar una cuenta de verdad */
    const api = (process.env.RESEND_API_URL || "https://api.resend.com").replace(/\/$/, "");
    const res = await fetch(`${api}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [c.para],
        subject: c.asunto,
        html: plantilla(c),
        text: enTexto(c),
        ...(process.env.MAIL_REPLY_TO ? { reply_to: process.env.MAIL_REPLY_TO } : {}),
      }),
      // Un correo no puede tener a nadie esperando medio minuto
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("[correo]", res.status, (await res.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[correo]", String(e).slice(0, 200));
    return false;
  }
}

/** Se manda y no se espera: para avisos que no deben frenar una respuesta */
export function enviarCorreoSinEsperar(c: Correo): void {
  void enviarCorreo(c).catch(() => {});
}

function escapar(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * La plantilla, en tablas y con estilos en línea.
 *
 * No es que se escriba así por gusto: Gmail borra las hojas de estilo y
 * Outlook no entiende flexbox. Con tablas y estilos en línea se ve igual en
 * los tres sitios donde se lee el correo, que son Gmail, Outlook y el móvil.
 */
function plantilla(c: Correo): string {
  const cuerpo = c.parrafos
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3c3c43">${escapar(p)}</p>`
    )
    .join("");

  const boton = c.boton
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0">
         <tr><td style="border-radius:999px;background:#e5192b">
           <a href="${escapar(c.boton.url)}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none">${escapar(c.boton.texto)}</a>
         </td></tr>
       </table>
       <p style="margin:0 0 16px;font-size:12.5px;line-height:1.6;color:#8a8a93">O copia esta dirección en tu navegador:<br><span style="color:#5a5a63">${escapar(c.boton.url)}</span></p>`
    : "";

  const nota = c.nota
    ? `<p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #e6e6ea;font-size:12.5px;line-height:1.6;color:#8a8a93">${escapar(c.nota)}</p>`
    : "";

  return `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;border:1px solid #e6e6ea">
    <tr><td style="padding:28px 32px 0">
      <span style="font-size:14px;font-weight:800;letter-spacing:.14em;color:#e5192b">${escapar(SITE_NAME.toUpperCase())}</span>
    </td></tr>
    <tr><td style="padding:18px 32px 32px">
      <h1 style="margin:0 0 18px;font-size:21px;line-height:1.3;color:#14131a">${escapar(c.titulo)}</h1>
      ${cuerpo}${boton}${nota}
    </td></tr>
  </table>
  <p style="max-width:560px;margin:16px auto 0;font-size:12px;color:#9a9aa2;text-align:center">
    ${escapar(SITE_NAME)} · <a href="${SITE_URL}" style="color:#9a9aa2">${escapar(SITE_URL.replace(/^https?:\/\//, ""))}</a>
  </p>
</body></html>`;
}

/** La versión en texto: hay quien lee el correo sin imágenes ni HTML */
function enTexto(c: Correo): string {
  return [
    c.titulo,
    "",
    ...c.parrafos,
    ...(c.boton ? ["", c.boton.texto + ":", c.boton.url] : []),
    ...(c.nota ? ["", c.nota] : []),
    "",
    `${SITE_NAME} · ${SITE_URL}`,
  ].join("\n");
}
