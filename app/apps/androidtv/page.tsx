import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import Icon from "@/components/Icon";
import LogoAparato from "@/components/LogoAparato";

export const metadata: Metadata = {
  title: "TOTALplayer para Android TV y Fire TV",
  description:
    "Cómo poner TOTALplayer en un televisor con Android TV, Google TV o un Fire TV Stick. Con la aplicación o directamente desde el navegador de la tele.",
  alternates: { canonical: "/apps/androidtv" },
};

/**
 * La descarga del APK sale solo cuando hay APK. Una página con un botón que
 * no lleva a ninguna parte hace más daño que no tener página: el cliente
 * cree que ha hecho algo mal.
 */
const APK = process.env.ANDROID_TV_APK_URL || "";

export default function AndroidTvPage() {
  return (
    <>
      <SiteHeader />
      <main className="section">
        <div className="container">
          <h1 className="section-title">TOTALplayer en tu televisor</h1>
          <p className="section-sub">
            Para teles con Android TV o Google TV, y para el Fire TV Stick de Amazon. Con el mando de siempre:
            flechas para moverte, OK para entrar, ATRÁS para volver.
          </p>

          <div className="marcas marcas-centro">
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

          {APK ? (
            <div className="apk-caja">
              <p className="apk-txt">
                Descarga el archivo en la tele —o en el móvil y pásalo— e instálalo. Android pedirá permiso
                para instalar aplicaciones de fuera de la tienda: es normal, y solo hace falta una vez.
              </p>
              <a href={APK} className="btn btn-primary">
                <Icon name="upload" size={16} /> Descargar la aplicación (APK)
              </a>
            </div>
          ) : (
            <div className="apk-caja">
              <p className="apk-txt">
                Todavía no está publicada en Google Play ni en la tienda de Amazon. Mientras tanto, el
                televisor no se queda sin nada: abre el navegador de la tele y entra aquí. Es exactamente la
                misma pantalla que lleva dentro la aplicación.
              </p>
              <Link href="/tv" className="btn btn-primary">
                <Icon name="tv" size={16} /> Abrir el reproductor de tele
              </Link>
            </div>
          )}

          <h2 className="section-title" style={{ fontSize: 30, marginTop: 76 }}>
            Cómo se activa
          </h2>
          <div className="steps" style={{ marginTop: 40 }}>
            <div className="step">
              <div className="step-num">1</div>
              <h3>Ábrela en la tele</h3>
              <p>
                La primera pantalla enseña la MAC de ese televisor y un código de seis letras. No hay que
                teclear nada todavía.
              </p>
            </div>
            <div className="step">
              <div className="step-num">2</div>
              <h3>Actívala</h3>
              <p>
                Pásale la MAC a tu proveedor y él la activa, o entra tú desde el móvil en <strong>/activar</strong>{" "}
                y escribe el código. Si ya tienes usuario y contraseña, puedes entrar directamente en la tele.
              </p>
            </div>
            <div className="step">
              <div className="step-num">3</div>
              <h3>A ver</h3>
              <p>
                La tele entra sola y ya no vuelve a preguntar. La próxima vez arranca en lo último que
                estabas viendo, aunque el wifi tarde en levantarse.
              </p>
            </div>
          </div>

          <div className="faq-list" style={{ marginTop: 76 }}>
            <details className="faq-item">
              <summary>¿Trae canales?</summary>
              <p>
                No. TOTALplayer es solo el reproductor: pone en pantalla la lista que ya tienes, sea de tu
                proveedor o tuya. Ni incluye, ni aloja, ni vende contenido.
              </p>
            </details>
            <details className="faq-item">
              <summary>¿En un Fire TV Stick también?</summary>
              <p>
                Sí, es la misma aplicación. Y si aún no está en la tienda de Amazon, el navegador Silk que
                trae el aparato abre el reproductor igual de bien.
              </p>
            </details>
            <details className="faq-item">
              <summary>Mi tele es Samsung o LG</summary>
              <p>
                Esas no llevan Android. Abre el navegador de la tele y entra en la dirección del reproductor:
                se ve igual. Las aplicaciones de Tizen y webOS están en camino.
              </p>
            </details>
            <details className="faq-item">
              <summary>Soy proveedor y la quiero con mi marca</summary>
              <p>
                Se publica con tu nombre, tu icono y tu dominio: tus clientes no ven TOTALplayer por ningún
                lado. <Link href="/proveedores">Cómo funciona para proveedores</Link>.
              </p>
            </details>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
