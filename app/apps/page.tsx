import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import Icon from "@/components/Icon";
import LogoAparato from "@/components/LogoAparato";
import Aparece from "@/components/Aparece";

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
          <div className="features-grid apps-grid">
            <Aparece className="feature-card app-card" retraso={0} etiqueta="div">
            <Link href="/apps/androidtv" className="app-card-todo">
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
              </Link>
              {/*
                Y el enlace de descarga, aquí y no escondido dentro.
                Instalar en un Fire TV se hace con Downloader, escribiendo la
                dirección letra a letra con el mando: por eso es corta. Que
                haya que entrar en otra página para encontrarla es lo que
                convierte «pásame la app» en tres mensajes.
              */}
              <div className="app-card-bajar">
                <a className="btn btn-primary btn-sm" href="/apk/tv">
                  <Icon name="bajar" size={16} /> Descargar el APK
                </a>
                <Link href="/apps/androidtv" className="app-card-mas">
                  Cómo instalarla <Icon name="external" size={14} />
                </Link>
              </div>
              <p className="app-card-teclear">
                O escríbelo en Downloader: <b>totalplayer.app/apk/tv</b>
              </p>
            </Aparece>

            <Aparece className="feature-card" retraso={70} etiqueta="div">
              <div className="marcas">
                <span className="marca marca-nombre">Samsung</span>
                <span className="marca marca-nombre">LG</span>
                <span className="marca marca-nombre">Philips</span>
                <span className="marca marca-nombre">Sony</span>
              </div>
              <h3>Desde el navegador de la tele</h3>
              <p>
                Ábrelo y escribe la dirección del reproductor añadiéndole <strong>/tv</strong> al final. La
                pantalla es la misma que la de la aplicación: letra grande y todo con el mando, y el ATRÁS del
                mando funciona igual.
              </p>
              <span className="app-card-mas app-card-pronto">Aplicación: pendiente de publicar en sus tiendas</span>
            </Aparece>

            <Aparece className="feature-card app-card" retraso={140} etiqueta="div">
            <Link href="/apps/movil" className="app-card-todo">
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
                En Android, con su APK: se instala y queda con su icono, como cualquier otra. En iPhone y
                iPad se añade a la pantalla de inicio desde Safari y se abre igual, a pantalla completa. En
                los dos casos, sin pasar por ninguna tienda.
              </p>
              </Link>
              <div className="app-card-bajar">
                <a className="btn btn-primary btn-sm" href="/apk/movil">
                  <Icon name="bajar" size={16} /> Descargar el APK
                </a>
                <Link href="/apps/movil" className="app-card-mas">
                  Cómo instalarla <Icon name="external" size={14} />
                </Link>
              </div>
              <p className="app-card-teclear">
                En iPhone no hay APK: se añade a la pantalla de inicio desde Safari.
              </p>
            </Aparece>

            <Aparece className="feature-card" retraso={210} etiqueta="div">
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
                programación entera de un vistazo. Y en Windows, además, el programa de escritorio: la misma
                pantalla de la tele, sin barra de direcciones y con lo descargado en el disco.
              </p>
              <div className="app-card-bajar">
                <a className="btn btn-primary btn-sm" href="/exe">
                  <Icon name="bajar" size={16} /> Descargar para Windows
                </a>
                <Link href="/player" className="app-card-mas">
                  Abrir el reproductor <Icon name="external" size={14} />
                </Link>
              </div>
              <p className="app-card-teclear">
                Mac y Linux, desde el navegador · <a href="/exe?msi">instalador MSI</a> para empresas
              </p>
            </Aparece>
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
