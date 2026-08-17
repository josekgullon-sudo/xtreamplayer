import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import AdSlot from "@/components/AdSlot";
import Icon from "@/components/Icon";
import LogoAparato from "@/components/LogoAparato";
import MaquetaProducto from "@/components/MaquetaProducto";
import BarraAviso from "@/components/BarraAviso";
import Aparece from "@/components/Aparece";
import { SITE_URL } from "@/lib/site";

/*
 * Lo que se anuncia arriba del todo.
 *
 * Cuando cambie el texto hay que subirle la versión: quien cerró el aviso
 * anterior tiene que ver el nuevo, y con una bandera suelta cerrar uno sería
 * cerrarlos todos para siempre.
 */
const AVISO = {
  version: "exe-1",
  texto: "Ya está la aplicación para Windows.",
  accion: "Descargar",
  href: "/apps",
};

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
      <BarraAviso aviso={AVISO} />
      <SiteHeader />
      <main>
        {/*
          El primer golpe de vista no espera a que nadie baje: entra solo, y
          escalonado. El orden del retraso es el orden en que conviene leerlo
          —titular, promesa, producto— y medio segundo de diferencia entre
          uno y otro basta para que la mirada los recorra en ese orden.
        */}
        <section className="hero">
          <div className="container">
            <h1 className="entra-ya">
              Tu lista IPTV, en <span className="realce">todas tus pantallas</span>
            </h1>
            <p className="sub entra-ya" style={{ animationDelay: "0.12s" }}>
              Del bolsillo al salón. Pega tu URL M3U o tus credenciales Xtream Codes y empieza a ver
              TV en directo, cine y series. Sin instalar nada y gratis.
            </p>

            {/*
              Y aquí, el producto.
              Una web de un reproductor de vídeo en la que no se ve el
              reproductor por ninguna parte obliga a creerse a base de texto
              que la cosa es bonita. Enseñarla contesta sola a la pregunta
              con la que entra cualquiera: «¿y esto cómo se ve?».
            */}
            <div className="entra-ya" style={{ animationDelay: "0.24s" }}>
              <MaquetaProducto />
            </div>
            <p className="maqueta-nota entra-ya" style={{ animationDelay: "0.34s" }}>
              Las carátulas de la imagen son inventadas y sirven de ejemplo. TOTALplayer es un
              reproductor: no proporciona, aloja ni vende ningún canal, película ni lista.
            </p>

            {/*
              Una sola llamada grande. Dos botones del mismo tamaño obligan a
              decidir antes de saber qué hay dentro; el segundo camino se
              ofrece como enlace, para quien ya sabe que quiere cuenta.
            */}
            <div className="hero-cta entra-ya" style={{ animationDelay: "0.4s" }}>
              <Link href="/player" className="btn btn-primary btn-lg">
                <><Icon name="play" size={18} /> Ver mi lista ahora</>
              </Link>
            </div>
            <p className="hero-note entra-ya" style={{ animationDelay: "0.46s" }}>
              Gratis y sin instalar nada · <Link href="/registro">Crear cuenta</Link> para guardar tus listas ·{" "}
              <Link href="/proveedores">¿Eres proveedor?</Link>
            </p>
          </div>
        </section>

        {/*
          Lo primero que se mira después del titular es si esto va en «lo mío».
          Una tira de logotipos lo contesta sin hacer leer nada y sin robarle
          sitio a la llamada principal: va debajo del héroe, en fino.
        */}
        <section className="compat">
          <div className="container">
            <p className="compat-t">Se ve en</p>
            {/* Dos filas escritas a mano —teles arriba, lo demás abajo— en vez
                de una sola que el navegador parte por donde le cabe: así las
                dos quedan centradas y de paso se lee agrupado */}
            <div className="compat-marcas">
              <div className="compat-fila">
                <span className="marca">
                  <LogoAparato nombre="android" size={18} /> Android TV
                </span>
                <span className="marca">
                  <LogoAparato nombre="google" size={18} /> Google TV
                </span>
                <span className="marca">
                  <LogoAparato nombre="fuego" size={18} /> Fire TV
                </span>
                <span className="marca marca-nombre">Samsung</span>
                <span className="marca marca-nombre">LG</span>
              </div>
              <div className="compat-fila">
                <span className="marca">
                  <LogoAparato nombre="android" size={18} /> Android
                </span>
                <span className="marca">
                  <LogoAparato nombre="apple" size={18} /> iPhone y iPad
                </span>
                <span className="marca">
                  <LogoAparato nombre="windows" size={18} /> Windows
                </span>
                <span className="marca">
                  <LogoAparato nombre="apple" size={18} /> Mac
                </span>
                <span className="marca">
                  <LogoAparato nombre="linux" size={18} /> Linux
                </span>
              </div>
            </div>
            <p className="compat-pie">
              <Link href="/apps">Cómo se pone en cada aparato</Link>
            </p>
          </div>
        </section>

        <section className="section" id="como-funciona">
          <div className="container">
            <h2 className="section-title">Empieza a ver en 30 segundos</h2>
            <p className="section-sub">Tres pasos y estás dentro. Sin apps, sin configuraciones raras.</p>
            <div className="steps">
              <Aparece className="step" retraso={0}>
                <div className="step-num">1</div>
                <h3>Abre el reproductor</h3>
                <p>Entra en el reproductor web desde cualquier dispositivo con navegador. No hay nada que instalar.</p>
              </Aparece>
              <Aparece className="step" retraso={90}>
                <div className="step-num">2</div>
                <h3>Añade tu lista</h3>
                <p>Pega la URL de tu lista M3U o introduce host, usuario y contraseña de tu cuenta Xtream Codes.</p>
              </Aparece>
              <Aparece className="step" retraso={180}>
                <div className="step-num">3</div>
                <h3>Dale al play</h3>
                <p>Navega por categorías, busca canales, marca favoritos y reproduce TV en directo, cine y series.</p>
              </Aparece>
            </div>
          </div>
        </section>

        <AdSlot slot="home-mid" />

        <section className="section" id="caracteristicas">
          <div className="container">
            {/* Una línea corta antes del titular, para decir lo que el
                titular no puede sin alargarse */}
            <p className="etiqueta-fila">
              <span className="etiqueta-seccion">Sin buffering y sin sorpresas</span>
            </p>
            <h2 className="section-title">Lo que hace falta, y funcionando</h2>
            <p className="section-sub">Sin listas de la compra: esto es lo que se usa todos los días.</p>
            <div className="features-grid">
              <Aparece className="feature-card" retraso={0}>
                <div className="feature-icon"><Icon name="tv" size={22} /></div>
                <h3>Xtream Codes completo</h3>
                <p>TV en directo, películas y series con carátulas, categorías y ficha de cada título. También puedes pegar tu URL get.php y detectamos las credenciales solos.</p>
              </Aparece>
              <Aparece className="feature-card" retraso={70}>
                <div className="feature-icon"><Icon name="list" size={22} /></div>
                <h3>Listas M3U y M3U8</h3>
                <p>Parser tolerante que entiende listas gigantes y mal formadas, con grupos, logos y EPG-ID. Si tu lista funciona en VLC, funciona aquí.</p>
              </Aparece>
              <Aparece className="feature-card" retraso={140}>
                <div className="feature-icon"><Icon name="sparkle" size={22} /></div>
                <h3>Zapping instantáneo</h3>
                <p>Cambia de canal con las flechas del teclado, busca en milisegundos entre miles de canales y vuelve a lo último que viste con un clic.</p>
              </Aparece>
              <Aparece className="feature-card" retraso={210}>
                <div className="feature-icon"><Icon name="clock" size={22} /></div>
                <h3>EPG integrada</h3>
                <p>Consulta qué están echando ahora y qué viene después en cada canal, directamente desde tu proveedor Xtream.</p>
              </Aparece>
              {/* La destacada. Seis tarjetas iguales se leen en diagonal y no
                  se queda ninguna; conviene que el ojo pare justo en la que
                  dice por qué esto no es un reproductor cualquiera */}
              <Aparece className="feature-card destacada" retraso={280}>
                <div className="feature-card-cab">
                  <div className="feature-icon"><Icon name="lock" size={22} /></div>
                  <span className="feature-sello">Privacidad</span>
                </div>
                <h3>Tus claves no salen de aquí</h3>
                <p>Sin cuenta, tu lista se queda en tu navegador y no sale de ahí. Con proveedor, sus credenciales viven cifradas en el servidor y no llegan nunca a tu aparato: es lo que impide que se las lleve nadie.</p>
                <Link href="/faq" className="feature-mas">Más información →</Link>
              </Aparece>
              <Aparece className="feature-card" retraso={350}>
                <div className="feature-icon"><Icon name="shield" size={22} /></div>
                <h3>Compatibilidad automática</h3>
                <p>Si un stream falla por CORS o formato, lo reintentamos automáticamente con nuestro motor de compatibilidad. Menos pantallas negras, más tele.</p>
              </Aparece>
            </div>
          </div>
        </section>

        <section className="section" id="faq">
          <div className="container">
            <h2 className="section-title">Preguntas frecuentes</h2>
            <p className="section-sub">Lo que más se pregunta antes de empezar.</p>
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
              <><Icon name="play" size={18} /> Ver mi lista ahora</>
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
