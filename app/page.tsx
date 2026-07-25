import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import AdSlot from "@/components/AdSlot";
import Icon from "@/components/Icon";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Reproductor IPTV online gratis — Xtream Codes y listas M3U en tu navegador",
  description:
    "Reproduce tu lista IPTV al instante: pega tu URL M3U o tus credenciales Xtream Codes y mira TV en directo, películas y series desde el navegador. Gratis, sin instalar apps y sin registro obligatorio.",
  alternates: { canonical: "/" },
};

const FAQS = [
  {
    q: "¿Qué es TOTALplayer y cómo funciona?",
    a: "TOTALplayer es un reproductor IPTV que funciona directamente en tu navegador. Introduce la URL de tu lista M3U o las credenciales Xtream Codes que te dio tu proveedor y podrás ver tus canales de TV en directo, películas y series al momento, sin instalar ninguna aplicación.",
  },
  {
    q: "¿TOTALplayer es gratis?",
    a: "Sí. El plan gratuito incluye el reproductor completo: listas M3U y Xtream Codes ilimitadas en modo invitado, favoritos, búsqueda, EPG y reproducción de TV en directo, VOD y series. Si creas una cuenta gratuita, además guardas tus listas en la nube y las tienes en cualquier dispositivo.",
  },
  {
    q: "¿Necesito registrarme para usar el reproductor?",
    a: "No. Puedes usarlo como invitado: tus listas se guardan únicamente en tu navegador y nunca salen de tu dispositivo. El registro es opcional y sirve para sincronizar tus listas entre dispositivos.",
  },
  {
    q: "¿TOTALplayer incluye canales o contenido?",
    a: "No. TOTALplayer es solo un reproductor, como VLC: no proporciona, aloja ni vende ningún canal, película ni lista. Necesitas una suscripción con un proveedor IPTV o una lista M3U propia y legal.",
  },
  {
    q: "¿Qué formatos y protocolos soporta?",
    a: "Soporta listas M3U y M3U8, la API completa de Xtream Codes (TV en directo, VOD y series), streams HLS (.m3u8), MPEG-TS y vídeo directo MP4/MKV compatible con el navegador.",
  },
  {
    q: "¿Funciona en el móvil y en Smart TV?",
    a: "Funciona en cualquier dispositivo con un navegador moderno: Windows, Mac, Linux, Android, iPhone/iPad y muchas Smart TV con navegador. Al ser una web, siempre tienes la última versión sin actualizar nada.",
  },
  {
    q: "¿Es seguro introducir mis credenciales IPTV?",
    a: "En modo invitado tus credenciales se guardan solo en tu navegador (localStorage) y las peticiones de datos pasan cifradas por nuestro servidor únicamente para evitar bloqueos CORS. No vendemos ni compartimos tus datos.",
  },
  {
    q: "Mi lista no se reproduce, ¿qué hago?",
    a: "Comprueba que la URL y las credenciales sean correctas y que tu suscripción esté activa. Si el canal no carga, TOTALplayer reintenta automáticamente a través de su proxy de compatibilidad. Algunos proveedores bloquean la reproducción web; en ese caso contacta con tu proveedor.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <SiteHeader />
      <main>
        <section className="hero">
          <div className="container">
            <h1>
              Tu lista IPTV, reproducida <span className="grad">al instante</span> en el navegador
            </h1>
            <p className="sub">
              Pega tu URL M3U o tus credenciales Xtream Codes y empieza a ver TV en directo, películas y series.
              Sin instalar nada, sin registro obligatorio y gratis.
            </p>
            <div className="hero-cta">
              <Link href="/player" className="btn btn-primary btn-lg">
                <><Icon name="play" size={18} /> Reproducir mi lista ahora</>
              </Link>
              <Link href="/registro" className="btn btn-ghost btn-lg">
                Crear cuenta gratis
              </Link>
            </div>
            <p className="hero-note">
              Sin tarjeta · Sin descargas · Tus credenciales no salen de tu dispositivo en modo invitado
            </p>
          </div>
        </section>

        <section className="section" id="como-funciona">
          <div className="container">
            <h2 className="section-title">Empieza a ver en 30 segundos</h2>
            <p className="section-sub">Tres pasos y estás dentro. Sin apps, sin configuraciones raras.</p>
            <div className="steps">
              <div className="step">
                <div className="step-num">1</div>
                <h3>Abre el reproductor</h3>
                <p>Entra en el reproductor web desde cualquier dispositivo con navegador. No hay nada que instalar.</p>
              </div>
              <div className="step">
                <div className="step-num">2</div>
                <h3>Añade tu lista</h3>
                <p>Pega la URL de tu lista M3U o introduce host, usuario y contraseña de tu cuenta Xtream Codes.</p>
              </div>
              <div className="step">
                <div className="step-num">3</div>
                <h3>Dale al play</h3>
                <p>Navega por categorías, busca canales, marca favoritos y reproduce TV en directo, cine y series.</p>
              </div>
            </div>
          </div>
        </section>

        <AdSlot slot="home-mid" />

        <section className="section" id="caracteristicas">
          <div className="container">
            <h2 className="section-title">Todo lo que esperas de un gran reproductor IPTV</h2>
            <p className="section-sub">
              Diseñado estudiando lo mejor (y lo peor) de los reproductores actuales para que no eches nada de menos.
            </p>
            <div className="features-grid">
              <div className="feature-card">
                <div className="feature-icon"><Icon name="tv" size={22} /></div>
                <h3>Xtream Codes completo</h3>
                <p>TV en directo, películas y series con carátulas, categorías y ficha de cada título. También puedes pegar tu URL get.php y detectamos las credenciales solos.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon"><Icon name="list" size={22} /></div>
                <h3>Listas M3U y M3U8</h3>
                <p>Parser tolerante que entiende listas gigantes y mal formadas, con grupos, logos y EPG-ID. Si tu lista funciona en VLC, funciona aquí.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon"><Icon name="sparkle" size={22} /></div>
                <h3>Zapping instantáneo</h3>
                <p>Cambia de canal con las flechas del teclado, busca en milisegundos entre miles de canales y vuelve a lo último que viste con un clic.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon"><Icon name="clock" size={22} /></div>
                <h3>EPG integrada</h3>
                <p>Consulta qué están echando ahora y qué viene después en cada canal, directamente desde tu proveedor Xtream.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon"><Icon name="lock" size={22} /></div>
                <h3>Privacidad primero</h3>
                <p>Modo invitado real: tus listas y credenciales se guardan en tu navegador, no en nuestros servidores. Tú decides si quieres cuenta.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon"><Icon name="shield" size={22} /></div>
                <h3>Compatibilidad automática</h3>
                <p>Si un stream falla por CORS o formato, lo reintentamos automáticamente con nuestro motor de compatibilidad. Menos pantallas negras, más tele.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon"><Icon name="upload" size={22} /></div>
                <h3>Tus listas en la nube</h3>
                <p>Con una cuenta gratuita, tus listas te siguen a cualquier dispositivo: portátil, móvil, tablet o la tele del salón.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon"><Icon name="star" size={22} /></div>
                <h3>Favoritos e historial</h3>
                <p>Marca tus canales de siempre y retoma lo último que estabas viendo. Todo sincronizado y sin esfuerzo.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon"><Icon name="device" size={22} /></div>
                <h3>Multiplataforma real</h3>
                <p>Un navegador es todo lo que necesitas: PC, Mac, Linux, Android, iPhone o Smart TV. Siempre actualizado.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="comparativa">
          <div className="container">
            <h2 className="section-title">¿Por qué TOTALplayer y no otro?</h2>
            <p className="section-sub">Comparado con los reproductores IPTV web más usados.</p>
            <div style={{ overflowX: "auto" }}>
              <table className="compare-table">
                <thead>
                  <tr>
                    <th>Característica</th>
                    <th>TOTALplayer</th>
                    <th>Players web típicos</th>
                    <th>Apps de escritorio</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>Sin instalación</td><td className="check">✓</td><td className="check">✓</td><td className="cross">✗</td></tr>
                  <tr><td>Xtream: directo + VOD + series</td><td className="check">✓</td><td className="cross">Parcial</td><td className="check">✓</td></tr>
                  <tr><td>Reintento automático anti-CORS</td><td className="check">✓</td><td className="cross">✗</td><td className="cross">N/A</td></tr>
                  <tr><td>Modo invitado 100% privado</td><td className="check">✓</td><td className="cross">Varía</td><td className="check">✓</td></tr>
                  <tr><td>Listas sincronizadas en la nube</td><td className="check">✓ Gratis</td><td className="cross">✗ o de pago</td><td className="cross">✗</td></tr>
                  <tr><td>Atajos de teclado</td><td className="check">✓</td><td className="cross">Pocos</td><td className="check">✓</td></tr>
                  <tr><td>Mensajes de error útiles</td><td className="check">✓</td><td className="cross">✗</td><td className="cross">Varía</td></tr>
                  <tr><td>En español</td><td className="check">✓</td><td className="cross">Casi nunca</td><td className="cross">Varía</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="section" id="faq">
          <div className="container">
            <h2 className="section-title">Preguntas frecuentes</h2>
            <p className="section-sub">Todo lo que necesitas saber antes de darle al play.</p>
            <div className="faq-list">
              {FAQS.map((f) => (
                <details className="faq-item" key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="section" style={{ textAlign: "center", paddingBottom: 90 }}>
          <div className="container">
            <h2 className="section-title">¿Listo para ver tu lista?</h2>
            <p className="section-sub">Gratis, al momento y desde cualquier dispositivo.</p>
            <Link href="/player" className="btn btn-primary btn-lg">
              <><Icon name="play" size={18} /> Abrir el reproductor</>
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
