import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import Icon from "@/components/Icon";
import { listPlans } from "@/lib/provider";

export const metadata: Metadata = {
  title: "Precios — para ver tu lista y para proveedores IPTV",
  description:
    "Gratis para ver tu lista M3U o Xtream, con 15 días de Premium sin tarjeta. Y planes desde 20 €/mes para proveedores que quieran dar el reproductor a sus clientes con su marca.",
  alternates: { canonical: "/precios" },
};

/**
 * Precios de las dos cosas que se venden aquí, que son distintas: ver tu
 * propia lista, y darles el reproductor a tus clientes.
 *
 * La página solo enseñaba lo primero. Quien llegaba desde el menú buscando
 * cuánto cuesta montar esto para su negocio —que es de lo que se vive— se
 * iba con la idea de que costaba 2,99 €.
 *
 * Los tramos de proveedor se leen de la base de datos, no se escriben aquí:
 * un precio en dos sitios acaba siendo dos precios distintos.
 */
export default function PricingPage() {
  const planes = listPlans();

  return (
    <>
      <SiteHeader />
      <main className="section">
        <div className="container">
          <h1 className="section-title">Precios</h1>
          <p className="section-sub">
            Dos cosas distintas: ver tu lista en el navegador, o darle el reproductor a tus clientes con tu marca.
          </p>

          {/* ---------- Para ver tu lista ---------- */}
          <h2 className="precios-titulo">
            <Icon name="play" size={18} /> Para ver tu lista
          </h2>
          <div className="pricing-grid">
            <div className="price-card">
              <div className="plan-name">Gratis</div>
              <div className="price">
                0€<span>/siempre</span>
              </div>
              <ul>
                <li>Reproductor completo: directo, películas y series</li>
                <li>Listas ilimitadas guardadas en tu navegador</li>
                <li>1 lista sincronizada en la nube</li>
                <li>Guía de programación, favoritos e historial</li>
                <li>Buscador que encuentra en canales, cine y series a la vez</li>
                <li>Perfiles para cada miembro de la casa</li>
                <li>En el móvil y en la tele, con mando</li>
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
                <li>Soporte prioritario</li>
                <li>Cancela cuando quieras desde tu cuenta</li>
              </ul>
              <Link href="/registro" className="btn btn-primary" style={{ width: "100%" }}>
                Probar Premium gratis 15 días
              </Link>
              <p className="precios-nota">
                Sin tarjeta para la prueba. Al acabar pasas al plan Gratis automáticamente.
              </p>
            </div>
          </div>

          {/* ---------- Para proveedores ---------- */}
          <h2 className="precios-titulo" style={{ marginTop: 56 }} id="proveedores">
            <Icon name="building" size={18} /> Para proveedores IPTV
          </h2>
          <p className="section-sub" style={{ marginBottom: 24 }}>
            Tu reproductor, con tu nombre y tus colores, para todos tus clientes. Cuota mensual fija por tramo: cuanto
            mayor es, menos pagas por cliente.
          </p>
          <div className="tabla-scroll">
            <table className="compare-table">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Clientes incluidos</th>
                  <th>Precio al mes</th>
                  <th>Por cliente</th>
                </tr>
              </thead>
              <tbody>
                {planes.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong></td>
                    <td>{p.max_customers.toLocaleString("es-ES")}</td>
                    <td>{(p.price_month / 100).toFixed(0)} €</td>
                    <td style={{ color: "var(--text-faint)" }}>
                      {(p.price_month / 100 / p.max_customers).toFixed(2)} €
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ textAlign: "center", marginTop: 28 }}>
            <Link href="/proveedores/registro" className="btn btn-primary btn-lg">
              Probar gratis 7 días
            </Link>
            <p className="precios-nota" style={{ marginTop: 12 }}>
              7 días con 10 clientes, sin tarjeta ·{" "}
              <Link href="/proveedores">Ver qué incluye</Link>
            </p>
          </div>

          <p style={{ textAlign: "center", marginTop: 48, color: "var(--text-faint)", fontSize: 13.5 }}>
            TOTALplayer no vende ni incluye contenido: necesitas tu propia lista o suscripción IPTV.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
