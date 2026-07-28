import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import Icon from "@/components/Icon";
import LogoAparato from "@/components/LogoAparato";

export const metadata: Metadata = {
  title: "Aplicaciones — TOTALplayer en la tele, el móvil y el ordenador",
  description:
    "Cómo ver tu lista IPTV en cada aparato: televisores Android TV y Fire TV, Samsung y LG, móvil, tablet y ordenador. Sin instalar nada en la mayoría de ellos.",
  alternates: { canonical: "/apps" },
};

/**
 * Dónde se ve TOTALplayer.
 *
 * La pregunta que hace todo el mundo —«¿y esto en mi tele?»— no tenía
 * respuesta en ninguna página: había que saber que existía /tv. Aquí está
 * cada aparato con lo que hay que hacer en él, incluido «nada».
 */
export default function AppsPage() {
  return (
    <>
      <SiteHeader />
      <main className="section">
        <div className="container">
          <h1 className="section-title">En qué aparatos se ve</h1>
          <p className="section-sub">
            El reproductor es una web, así que en casi todo se abre sin instalar nada. En la tele hay dos
            caminos: el navegador que ya trae, o la aplicación.
          </p>

          {/* Cada tarjeta enseña de quién es cada aparato: se reconoce antes
              un logotipo que un titular, y aquí lo que busca el visitante es
              el suyo */}
          <div className="features-grid">
            <Link href="/apps/androidtv" className="feature-card app-card">
              <div className="marcas">
                <span className="marca">
                  <LogoAparato nombre="android" size={19} /> Android TV
                </span>
                <span className="marca">
                  <LogoAparato nombre="google" size={19} /> Google TV
                </span>
                <span className="marca">
                  <LogoAparato nombre="fuego" size={19} /> Fire TV
                </span>
              </div>
              <h3>Con aplicación propia</h3>
              <p>
                Con su icono en el menú de la tele y manejo con el mando. Es la mejor forma de verlo en un
                televisor.
              </p>
              <span className="app-card-mas">
                Cómo instalarla <Icon name="external" size={14} />
              </span>
            </Link>

            <div className="feature-card">
              <div className="marcas">
                <span className="marca marca-nombre">Samsung</span>
                <span className="marca marca-nombre">LG</span>
                <span className="marca marca-nombre">Philips</span>
                <span className="marca marca-nombre">Sony</span>
              </div>
              <h3>Desde el navegador de la tele</h3>
              <p>
                Ábrelo y escribe la dirección del reproductor añadiéndole <strong>/tv</strong> al final. La
                pantalla es la misma que la de la aplicación: letra grande y todo con el mando. Las de Tizen y
                webOS están en camino.
              </p>
              <span className="app-card-mas app-card-pronto">Aplicación: próximamente</span>
            </div>

            <div className="feature-card">
              <div className="marcas">
                <span className="marca">
                  <LogoAparato nombre="android" size={19} /> Android
                </span>
                <span className="marca">
                  <LogoAparato nombre="apple" size={19} /> iPhone y iPad
                </span>
              </div>
              <h3>Móvil y tablet</h3>
              <p>
                Entra en la web y añádela a la pantalla de inicio: se abre a pantalla completa, como cualquier
                otra aplicación. No hay nada que descargar.
              </p>
              <Link href="/player" className="app-card-mas">
                Abrir el reproductor <Icon name="external" size={14} />
              </Link>
            </div>

            <div className="feature-card">
              <div className="marcas">
                <span className="marca">
                  <LogoAparato nombre="windows" size={19} /> Windows
                </span>
                <span className="marca">
                  <LogoAparato nombre="apple" size={19} /> Mac
                </span>
                <span className="marca">
                  <LogoAparato nombre="linux" size={19} /> Linux
                </span>
              </div>
              <h3>Ordenador</h3>
              <p>
                Cualquier navegador moderno. Es donde va todo más fino: teclado para buscar y la guía de
                programación entera de un vistazo.
              </p>
              <Link href="/player" className="app-card-mas">
                Abrir el reproductor <Icon name="external" size={14} />
              </Link>
            </div>
          </div>

          <p className="section-sub" style={{ marginTop: 62, marginBottom: 0 }}>
            ¿Eres proveedor y quieres estas aplicaciones con tu marca y tu dominio?{" "}
            <Link href="/proveedores">Aquí se explica cómo</Link>
            .
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
