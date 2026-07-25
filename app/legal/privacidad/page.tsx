import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Cómo trata TOTALplayer tus datos: modo invitado local, cuentas opcionales y cookies.",
  alternates: { canonical: "/legal/privacidad" },
};

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="prose">
        <h1>Política de privacidad</h1>
        <p>Última actualización: julio de 2026</p>

        <h2>1. Modo invitado</h2>
        <p>
          Si usas TOTALplayer sin cuenta, tus listas, credenciales IPTV, favoritos e historial se guardan
          únicamente en el almacenamiento local de tu navegador. No se almacenan en nuestros servidores. Las
          peticiones de datos (categorías, canales, EPG) transitan por nuestro servidor solo para evitar
          restricciones CORS del navegador y no se registran de forma asociada a tu identidad.
        </p>

        <h2>2. Cuentas</h2>
        <p>
          Si creas una cuenta, guardamos tu email, un hash seguro de tu contraseña (bcrypt) y las listas que decidas
          sincronizar (nombre, URL y credenciales del proveedor que tú introduces). Usamos estos datos únicamente
          para prestarte el servicio. Puedes solicitar la eliminación completa en cualquier momento.
        </p>

        <h2>3. Cookies</h2>
        <p>
          Usamos una cookie técnica de sesión (imprescindible para mantenerte conectado). Si activamos publicidad de
          Google AdSense, Google puede instalar cookies propias conforme a sus políticas; te lo indicaremos mediante
          el aviso de consentimiento correspondiente.
        </p>

        <h2>4. Terceros</h2>
        <p>
          No vendemos tus datos. Los únicos terceros implicados son: tu proveedor IPTV (al que se conecta el
          reproductor por orden tuya) y, en su caso, los servicios de publicidad y analítica que se anuncien en esta
          política.
        </p>

        <h2>5. Tus derechos</h2>
        <p>
          Puedes ejercer tus derechos de acceso, rectificación y supresión escribiendo a privacy@totalplayer.app.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
