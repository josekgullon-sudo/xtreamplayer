import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Planes y precios — 15 días de Premium gratis",
  description:
    "Empieza gratis y prueba Premium 15 días sin tarjeta: reproductor IPTV completo para Xtream Codes y M3U, listas en la nube, sin anuncios. Después, sigue gratis o Premium por 2,99 €/mes.",
  alternates: { canonical: "/precios" },
};

export default function PricingPage() {
  return (
    <>
      <SiteHeader />
      <main className="section">
        <div className="container">
          <h1 className="section-title">Empieza gratis, prueba Premium 15 días</h1>
          <p className="section-sub">
            Al registrarte tienes 15 días de Premium completo, sin tarjeta. Al acabar, decides: sigues gratis para
            siempre o Premium por menos que un café.
          </p>
          <div className="pricing-grid">
            <div className="price-card">
              <div className="plan-name">Gratis</div>
              <div className="price">
                0€<span>/siempre</span>
              </div>
              <ul>
                <li>Reproductor completo: directo, VOD y series</li>
                <li>Listas ilimitadas en modo invitado (en tu navegador)</li>
                <li>1 lista sincronizada en la nube</li>
                <li>Favoritos, historial y búsqueda instantánea</li>
                <li>EPG (ahora y a continuación)</li>
                <li>Motor de compatibilidad anti-CORS</li>
                <li className="no">Con anuncios discretos</li>
              </ul>
              <Link href="/player" className="btn btn-ghost" style={{ width: "100%" }}>
                Usar gratis
              </Link>
            </div>
            <div className="price-card featured">
              <span className="badge badge-accent" style={{ position: "absolute", top: 18, right: 18 }}>
                15 días gratis
              </span>
              <div className="plan-name">Premium</div>
              <div className="price">
                2,99€<span>/mes</span>
              </div>
              <ul>
                <li>Todo lo del plan Gratis</li>
                <li>Sin anuncios</li>
                <li>Hasta 20 listas sincronizadas en la nube</li>
                <li>Acceso prioritario a lo nuevo: EPG de 7 días, multipantalla, perfiles</li>
                <li>Soporte prioritario</li>
                <li>Cancela cuando quieras desde tu cuenta</li>
              </ul>
              <Link href="/registro" className="btn btn-primary" style={{ width: "100%" }}>
                Probar Premium gratis 15 días
              </Link>
              <p style={{ fontSize: 12.5, color: "var(--text-faint)", marginTop: 10, textAlign: "center" }}>
                Sin tarjeta para la prueba. Al acabar pasas al plan Gratis automáticamente.
              </p>
            </div>
          </div>
          <p style={{ textAlign: "center", marginTop: 36, color: "var(--text-faint)", fontSize: 13.5 }}>
            TOTALplayer no vende ni incluye contenido: necesitas tu propia lista o suscripción IPTV.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
