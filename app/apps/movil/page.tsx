import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import Icon from "@/components/Icon";
import LogoAparato from "@/components/LogoAparato";

export const metadata: Metadata = {
  title: "TOTALplayer en el móvil y la tablet",
  description:
    "Cómo dejar TOTALplayer instalado en un iPhone, un iPad o un Android: se añade a la pantalla de inicio y se abre a pantalla completa, como cualquier aplicación. Sin tienda y sin descargar nada.",
  alternates: { canonical: "/apps/movil" },
};

/**
 * Instalarlo en el móvil.
 *
 * En Apple no hay otra vía: su tienda no admite reproductores IPTV
 * genéricos. Y en Android tampoco hace falta ninguna, porque instalada desde
 * el navegador queda exactamente igual: su icono, su nombre y a pantalla
 * completa. Lo que faltaba era contarlo, que nadie lo adivina.
 */
export default function MovilPage() {
  return (
    <>
      <SiteHeader />
      <main className="section">
        <div className="container">
          <h1 className="section-title">En el móvil y en la tablet</h1>
          <p className="section-sub">
            No hay que descargar nada de ninguna tienda: se añade a la pantalla de inicio y a partir de ahí se
            abre como cualquier otra aplicación, con su icono y a pantalla completa.
          </p>

          <div className="marcas marcas-centro marcas-sub">
            <span className="marca">
              <LogoAparato nombre="apple" size={19} /> iPhone y iPad
            </span>
            <span className="marca">
              <LogoAparato nombre="android" size={19} /> Android
            </span>
          </div>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <LogoAparato nombre="apple" size={22} />
              </div>
              <h3>iPhone y iPad</h3>
              <ol className="pasos-lista">
                <li>Abre el reproductor en <strong>Safari</strong> (en otro navegador, iOS no deja instalar).</li>
                <li>Pulsa el botón de <strong>Compartir</strong>, el cuadrado con la flecha hacia arriba.</li>
                <li>Baja hasta <strong>Añadir a pantalla de inicio</strong> y confirma.</li>
              </ol>
              <p className="pasos-nota">
                Queda con su icono junto al resto de tus aplicaciones y se abre sin la barra del navegador.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <LogoAparato nombre="android" size={22} />
              </div>
              <h3>Android</h3>
              <ol className="pasos-lista">
                <li>Abre el reproductor en <strong>Chrome</strong>.</li>
                <li>Menú de los tres puntos → <strong>Instalar aplicación</strong> (o «Añadir a pantalla de inicio»).</li>
                <li>Confirma, y ya está en tu cajón de aplicaciones.</li>
              </ol>
              <p className="pasos-nota">
                Muchos móviles lo ofrecen solos con un aviso abajo la segunda vez que entras.
              </p>
            </div>
          </div>

          <div className="apk-caja" style={{ marginTop: 56 }}>
            <p className="apk-txt">
              ¿Por qué no está en la App Store? Apple no admite reproductores IPTV genéricos, así que en su
              tienda no puede estar. Instalada desde Safari funciona igual: mismo reproductor, misma cuenta y
              las mismas listas.
            </p>
            <Link href="/player" className="btn btn-primary">
              <Icon name="play" size={16} /> Abrir el reproductor
            </Link>
          </div>

          <p className="section-sub" style={{ marginTop: 56, marginBottom: 0 }}>
            ¿Buscabas la tele? <Link href="/apps">Aquí están todos los aparatos</Link>.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
