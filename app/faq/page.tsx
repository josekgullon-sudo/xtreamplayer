import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import Aparece from "@/components/Aparece";

export const metadata: Metadata = {
  title: "Preguntas frecuentes sobre el reproductor IPTV web",
  description:
    "Resolvemos las dudas más comunes: cómo reproducir una lista M3U online, cómo conectar Xtream Codes, qué hacer si un canal no carga, privacidad de tus credenciales y más.",
  alternates: { canonical: "/faq" },
};

/*
 * Cada pregunta lleva su respuesta en JSX (la que se lee) y en texto plano
 * (la que se le da a Google). Antes, para las respuestas con enlaces, los
 * datos estructurados decían «Consulta la respuesta completa en
 * TOTALplayer»: una respuesta que no responde nada.
 */
const FAQS: { q: string; a: React.ReactNode; texto: string }[] = [
  {
    q: "¿Cómo reproduzco una lista M3U online?",
    texto:
      "Abre el reproductor, pulsa «Añadir lista», elige la pestaña M3U y pega la URL de tu lista (normalmente termina en .m3u o .m3u8, o es un enlace get.php de tu proveedor). En segundos verás todos tus canales organizados por grupos.",
    a: (
      <p>
        Abre el <Link href="/player">reproductor</Link>, pulsa «Añadir lista», elige la pestaña M3U y pega la URL de
        tu lista (normalmente termina en .m3u o .m3u8, o es un enlace get.php de tu proveedor). En segundos verás
        todos tus canales organizados por grupos.
      </p>
    ),
  },
  {
    q: "¿Cómo conecto mi cuenta Xtream Codes?",
    texto:
      "Necesitas tres datos de tu proveedor: la URL del servidor, tu usuario y tu contraseña. Introdúcelos en «Añadir lista» y elige Xtream Codes. Si tu proveedor te dio una URL get.php completa, pégala tal cual y extraemos los datos automáticamente.",
    a: (
      <p>
        Necesitas tres datos de tu proveedor: la URL del servidor (por ejemplo http://servidor.com:8080), tu usuario
        y tu contraseña. Introdúcelos en «Añadir lista» → «Xtream Codes». Consejo: si tu proveedor te dio una URL
        get.php completa, pégala tal cual y extraemos los datos automáticamente.
      </p>
    ),
  },
  {
    q: "¿Por qué un canal no se reproduce?",
    texto:
      "Lo más habitual: la suscripción ha caducado, el proveedor limita las conexiones simultáneas, el canal está caído o el servidor bloquea la reproducción desde navegadores. TOTALplayer reintenta solo con su motor de compatibilidad; si aun así falla, prueba el canal en VLC para descartar que sea cosa del proveedor.",
    a: (
      <p>
        Las causas más habituales: la suscripción ha caducado, el proveedor limita las conexiones simultáneas, el
        canal está caído o el servidor bloquea la reproducción desde navegadores. TOTALplayer reintenta
        automáticamente con su motor de compatibilidad; si aun así no funciona, prueba el canal en VLC para
        descartar que sea cosa del proveedor.
      </p>
    ),
  },
  {
    q: "¿Guardáis mis credenciales IPTV?",
    texto:
      "En modo invitado no: viven en el almacenamiento local de tu navegador y puedes borrarlas cuando quieras. Si creas una cuenta y guardas listas en la nube, se almacenan cifradas en tránsito y solo se usan para conectar con tu proveedor cuando tú lo pides.",
    a: (
      <p>
        En modo invitado, no: viven en el almacenamiento local de tu navegador y puedes borrarlas cuando quieras. Si
        creas una cuenta y guardas listas en la nube, se almacenan cifradas en tránsito y solo se usan para conectar
        con tu proveedor cuando tú lo pides.
      </p>
    ),
  },
  {
    q: "¿Puedo usarlo en el móvil o en la tele?",
    texto:
      "Sí. Funciona en cualquier navegador moderno, incluidos móviles y muchas Smart TV. En el móvil se puede instalar desde el propio navegador y queda como una aplicación más, con su icono; en Android también hay APK. En la tele hay una aplicación propia en /tv que se maneja con el mando y se activa con un código, con la MAC del aparato o con tu usuario y contraseña. En iPhone y iPad la reproducción usa el reproductor nativo de Safari.",
    a: (
      <p>
        Sí. Funciona en cualquier navegador moderno (Chrome, Safari, Firefox, Edge), incluidos móviles y muchas
        Smart TV. En el móvil se <Link href="/apps/movil">instala desde el propio navegador</Link> y queda con su
        icono como una aplicación más; en Android hay además APK. Para la tele hay una{" "}
        <Link href="/tv">aplicación propia</Link> que se maneja con el mando y se activa con un código, con la MAC
        del aparato o con tu usuario y contraseña. En iPhone y iPad la reproducción HLS usa el reproductor nativo de
        Safari. En <Link href="/apps">Aplicaciones</Link> está la lista completa de aparatos.
      </p>
    ),
  },
  {
    /* La pregunta que llega por soporte en cuanto el servicio lleva un mes
       en pie. Estaba resuelta en el producto y sin contestar aquí, así que
       el cliente escribía a su proveedor y el proveedor a nosotros. */
    q: "He olvidado mi contraseña, ¿cómo la recupero?",
    texto:
      "Si tienes cuenta propia de TOTALplayer, entra en /recuperar y escribe tu correo: te llega un enlace que caduca en una hora y sirve una sola vez. Si eres proveedor, lo mismo con el correo con el que te diste de alta. Y si entras con el usuario y la contraseña que te dio tu proveedor de IPTV, esos son suyos y no los tenemos: tiene que dártelos él.",
    a: (
      <>
        <p>
          Si tienes cuenta propia de TOTALplayer —o eres proveedor—, entra en{" "}
          <Link href="/recuperar">recuperar contraseña</Link> y escribe tu correo. Te llega un enlace que caduca en
          una hora y sirve una sola vez; al usarlo te avisamos por correo de que la contraseña ha cambiado.
        </p>
        <p style={{ marginTop: 10 }}>
          Si entras con el usuario y la contraseña que te dio tu proveedor de IPTV, esos no son nuestros y no los
          tenemos: tiene que dártelos él.
        </p>
      </>
    ),
  },
  {
    q: "¿TOTALplayer vende canales o listas IPTV?",
    texto:
      "No. Somos un reproductor, igual que VLC o Kodi: tú pones tu lista y nosotros la reproducimos lo mejor posible. No proporcionamos contenido ni recomendamos proveedores.",
    a: (
      <p>
        No. Somos un reproductor, igual que VLC o Kodi: tú pones tu lista, nosotros la reproducimos con la mejor
        experiencia posible. No proporcionamos contenido ni recomendamos proveedores.
      </p>
    ),
  },
  {
    q: "¿Qué diferencia hay entre usarlo como invitado y con cuenta?",
    texto:
      "Como invitado tienes el reproductor completo y tus listas se guardan solo en ese navegador. Con una cuenta gratuita se sincronizan en la nube y las tienes en todos tus dispositivos al iniciar sesión.",
    a: (
      <p>
        Como invitado tienes el reproductor completo y tus listas se guardan solo en ese navegador. Con una cuenta
        gratuita, tus listas se sincronizan en la nube y las tienes disponibles en todos tus dispositivos al iniciar
        sesión.
      </p>
    ),
  },
  {
    q: "¿Puedo ver la guía de programación y lo que ya se emitió?",
    texto:
      "Sí. La sección «Guía» enseña qué echan ahora y en las próximas horas, un canal por fila. En los canales cuyo proveedor guarda la emisión, los programas ya pasados se pueden volver a ver: salen marcados y basta con pulsarlos.",
    a: (
      <p>
        Sí. La sección «Guía» del <Link href="/player">reproductor</Link> enseña qué echan ahora y en las próximas
        horas, un canal por fila y media hora por columna. Y en los canales cuyo proveedor guarda lo emitido, los
        programas ya pasados se pueden volver a ver: salen marcados y basta con pulsarlos.
      </p>
    ),
  },
  {
    q: "Mi proveedor me ha dado un usuario y una contraseña, ¿qué hago?",
    texto:
      "Entra en /acceso, elige «Soy cliente» y escríbelos: tu lista aparece cargada, sin URLs ni configuraciones. Los mismos datos sirven en el móvil y en la tele.",
    a: (
      <p>
        Entra en <Link href="/acceso">Entrar</Link>, elige «Soy cliente» y escríbelos. Tu lista aparece ya cargada:
        sin URLs, sin get.php y sin configurar nada. Los mismos datos sirven en el móvil y en la tele.
      </p>
    ),
  },
  {
    q: "¿Puede cada uno de casa tener lo suyo?",
    texto:
      "Sí. Se pueden crear perfiles, cada uno con sus favoritos y su historial, y uno de ellos puede ser infantil. Cuántos perfiles hay disponibles lo decide tu proveedor.",
    a: (
      <p>
        Sí. Se crean perfiles y cada uno tiene sus favoritos y su historial, con la opción de marcar uno como
        infantil. Cuántos puedes tener lo decide tu proveedor, y algunos venden perfiles adicionales.
      </p>
    ),
  },
  {
    q: "Soy proveedor de IPTV, ¿esto me sirve?",
    texto:
      "Sí: das de alta a tus clientes desde un panel, o los importas de golpe desde tu panel XUI, y entran con usuario y contraseña en un reproductor con tu nombre y tus colores. Hay siete días de prueba con diez clientes, sin tarjeta.",
    a: (
      <p>
        Sí. Das de alta a tus clientes desde un panel —o los importas de golpe desde tu panel XUI— y entran con
        usuario y contraseña en un reproductor con tu nombre y tus colores.{" "}
        <Link href="/proveedores">Mira lo que incluye</Link>: hay siete días de prueba con diez clientes, sin
        tarjeta.
      </p>
    ),
  },
];

export default function FaqPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.texto,
      },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />
      <main className="section pagina escena">
        <div className="container">
          <h1 className="section-title">Preguntas frecuentes</h1>
          <p className="section-sub">Si no encuentras tu respuesta, escríbenos.</p>
          {/* Entran escalonadas, y solo las ocho primeras se escalonan: a
              partir de ahí el retraso se nota como que la página va lenta */}
          <div className="faq-list">
            {FAQS.map((f, i) => (
              <Aparece className="faq-envoltorio" retraso={Math.min(i, 8) * 45} key={f.q}>
                <details className="faq-item">
                  <summary>{f.q}</summary>
                  {f.a}
                </details>
              </Aparece>
            ))}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
