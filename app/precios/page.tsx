import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Planes y precios — Reproductor IPTV web gratis",
  description:
    "XtreamPlayer es gratis: reproductor IPTV completo para Xtream Codes y M3U sin pagar nada. Descubre el plan gratuito y lo que traerá Premium: sin anuncios, EPG avanzada, multipantalla y más.",
  alternates: { canonical: "/precios" },
};

export default function PricingPage() {
  return (
    <>
      <SiteHeader />
      <main className="section">
        <div className="container">
          <h1 className="section-title">Planes simples, empezar es gratis</h1>
          <p className="section-sub">
            Todo lo importante es gratuito. Premium llegará pronto para quien quiera aún más.
          </p>
          <div className="pricing-grid">
            <div className="price-card featured">
              <span className="badge badge-success" style={{ position: "absolute", top: 18, right: 18 }}>
                Disponible
              </span>
              <div className="plan-name">Gratis</div>
              <div className="price">
                0€<span>/siempre</span>
              </div>
              <ul>
                <li>Reproductor completo: directo, VOD y series</li>
                <li>Listas M3U y Xtream Codes ilimitadas como invitado</li>
                <li>Hasta 5 listas sincronizadas en la nube con cuenta</li>
                <li>Favoritos, historial y búsqueda instantánea</li>
                <li>EPG (ahora y a continuación)</li>
                <li>Motor de compatibilidad anti-CORS</li>
                <li className="no">Con anuncios discretos</li>
              </ul>
              <Link href="/player" className="btn btn-primary" style={{ width: "100%" }}>
                Empezar gratis
              </Link>
            </div>
            <div className="price-card">
              <span className="badge badge-accent" style={{ position: "absolute", top: 18, right: 18 }}>
                Próximamente
              </span>
              <div className="plan-name">Premium</div>
              <div className="price">
                2,99€<span>/mes</span>
              </div>
              <ul>
                <li>Todo lo del plan gratuito</li>
                <li>Sin anuncios</li>
                <li>Listas ilimitadas en la nube</li>
                <li>EPG completa con parrilla de 7 días (XMLTV)</li>
                <li>Multipantalla: hasta 4 canales a la vez</li>
                <li>Perfiles y control parental</li>
                <li>Soporte prioritario</li>
              </ul>
              <button className="btn btn-ghost" style={{ width: "100%" }} disabled>
                Disponible muy pronto
              </button>
            </div>
          </div>
          <p style={{ textAlign: "center", marginTop: 36, color: "var(--text-faint)", fontSize: 13.5 }}>
            XtreamPlayer no vende ni incluye contenido: necesitas tu propia lista o suscripción IPTV.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
