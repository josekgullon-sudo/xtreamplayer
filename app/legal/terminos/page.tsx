import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Términos de uso",
  description: "Términos y condiciones de uso del reproductor web XtreamPlayer.",
  alternates: { canonical: "/legal/terminos" },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main className="prose">
        <h1>Términos de uso</h1>
        <p>Última actualización: julio de 2026</p>

        <h2>1. Qué es XtreamPlayer</h2>
        <p>
          XtreamPlayer («el Servicio») es una aplicación web que actúa exclusivamente como reproductor multimedia
          para listas de reproducción proporcionadas por el propio usuario, en formato M3U/M3U8 o mediante
          credenciales de la API Xtream Codes.
        </p>

        <h2>2. El Servicio no proporciona contenido</h2>
        <p>
          XtreamPlayer no aloja, distribuye, vende, enlaza ni recomienda ningún canal, película, serie, lista de
          reproducción ni proveedor IPTV. Todo el contenido reproducido procede de fuentes configuradas por el
          usuario. El usuario declara y garantiza que dispone de los derechos o licencias necesarios sobre el
          contenido al que accede.
        </p>

        <h2>3. Uso aceptable</h2>
        <ul>
          <li>No utilizar el Servicio para acceder a contenido sin autorización de sus titulares de derechos.</li>
          <li>No intentar vulnerar la seguridad del Servicio ni hacer un uso abusivo de la infraestructura.</li>
          <li>No revender el Servicio ni presentarlo como fuente de contenido.</li>
        </ul>
        <p>
          Podremos suspender cuentas o bloquear el acceso ante usos abusivos o requerimientos legales, incluida la
          atención de notificaciones de titulares de derechos.
        </p>

        <h2>4. Cuentas</h2>
        <p>
          La cuenta es opcional. Eres responsable de mantener la confidencialidad de tu contraseña. Puedes solicitar
          la eliminación de tu cuenta y tus datos en cualquier momento.
        </p>

        <h2>5. Publicidad y planes</h2>
        <p>
          El plan gratuito puede mostrar publicidad de terceros (por ejemplo, Google AdSense). Los planes de pago,
          cuando estén disponibles, se regirán por sus condiciones específicas de contratación.
        </p>

        <h2>6. Garantías y responsabilidad</h2>
        <p>
          El Servicio se ofrece «tal cual», sin garantías de disponibilidad o compatibilidad con proveedores
          concretos. En la máxima medida permitida por la ley, no seremos responsables del contenido reproducido por
          los usuarios ni de daños derivados del uso del Servicio.
        </p>

        <h2>7. Contacto</h2>
        <p>Para cualquier cuestión legal o notificación de derechos: legal@xtreamplayer.app</p>
      </main>
      <SiteFooter />
    </>
  );
}
