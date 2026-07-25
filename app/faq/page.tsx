import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Preguntas frecuentes sobre el reproductor IPTV web",
  description:
    "Resolvemos las dudas más comunes: cómo reproducir una lista M3U online, cómo conectar Xtream Codes, qué hacer si un canal no carga, privacidad de tus credenciales y más.",
  alternates: { canonical: "/faq" },
};

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "¿Cómo reproduzco una lista M3U online?",
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
    a: (
      <p>
        Sí. Funciona en cualquier navegador moderno (Chrome, Safari, Firefox, Edge), incluidos móviles y muchas
        Smart TV. En iPhone/iPad la reproducción HLS usa el reproductor nativo de Safari.
      </p>
    ),
  },
  {
    q: "¿TOTALplayer vende canales o listas IPTV?",
    a: (
      <p>
        No. Somos un reproductor, igual que VLC o Kodi: tú pones tu lista, nosotros la reproducimos con la mejor
        experiencia posible. No proporcionamos contenido ni recomendamos proveedores.
      </p>
    ),
  },
  {
    q: "¿Qué diferencia hay entre usarlo como invitado y con cuenta?",
    a: (
      <p>
        Como invitado tienes el reproductor completo y tus listas se guardan solo en ese navegador. Con una cuenta
        gratuita, tus listas se sincronizan en la nube y las tienes disponibles en todos tus dispositivos al iniciar
        sesión.
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
        text: typeof f.a === "string" ? f.a : "Consulta la respuesta completa en TOTALplayer.",
      },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />
      <main className="section">
        <div className="container">
          <h1 className="section-title">Preguntas frecuentes</h1>
          <p className="section-sub">Si no encuentras tu respuesta, escríbenos.</p>
          <div className="faq-list">
            {FAQS.map((f) => (
              <details className="faq-item" key={f.q}>
                <summary>{f.q}</summary>
                {f.a}
              </details>
            ))}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
