import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import Icon from "@/components/Icon";

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

          <div className="features-grid">
            <Link href="/apps/androidtv" className="feature-card app-card">
              <div className="feature-icon">
                <Icon name="tv" size={22} />
              </div>
              <h3>Android TV y Fire TV</h3>
              <p>
                Aplicación propia, con su icono en el menú de la tele y manejo con el mando. Es la mejor
                forma de verlo en un televisor.
              </p>
              <span className="app-card-mas">
                Cómo instalarla <Icon name="external" size={14} />
              </span>
            </Link>

            <div className="feature-card">
              <div className="feature-icon">
                <Icon name="tv" size={22} />
              </div>
              <h3>Samsung, LG y otras teles</h3>
              <p>
                Abre el navegador que trae la tele y escribe la dirección del reproductor añadiéndole{" "}
                <strong>/tv</strong> al final. La pantalla es la misma que la de la aplicación: letra grande y
                todo con el mando. Las de Tizen y webOS están en camino.
              </p>
              <span className="app-card-mas app-card-pronto">Aplicación: próximamente</span>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <Icon name="device" size={22} />
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
              <div className="feature-icon">
                <Icon name="play" size={22} />
              </div>
              <h3>Ordenador</h3>
              <p>
                Cualquier navegador moderno, en Windows, Mac o Linux. Es donde va todo más fino: teclado para
                buscar y la guía de programación entera de un vistazo.
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
