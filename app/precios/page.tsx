import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import Icon from "@/components/Icon";
import Aparece from "@/components/Aparece";
import { listPlans } from "@/lib/provider";
import { euros } from "@/lib/dinero";

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
      <main className="section pagina">
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
            <Aparece className="price-card" retraso={0} etiqueta="div">
              <div className="plan-name">Gratis</div>
              <div className="price">
                {/* Con espacio antes del €, como lo escribe el resto de la
                    página —la tabla de tramos lo saca de `Intl`— y como se
                    escribe en castellano */}
                0&nbsp;€<span>/siempre</span>
              </div>
              <ul>
                <li>Reproductor completo: directo, películas y series</li>
                <li>Listas ilimitadas guardadas en tu navegador</li>
                <li>1 lista sincronizada en la nube</li>
                <li>Guía de programación, favoritos e historial</li>
                {/* Estaba hecho y sin vender: en los canales que lo guardan,
                    lo ya emitido se vuelve a ver pulsándolo en la guía */}
                <li>Volver a ver lo ya emitido, en los canales que lo guardan</li>
                <li>Buscador que encuentra en canales, cine y series a la vez</li>
                <li>Perfiles para cada miembro de la casa, uno de ellos infantil</li>
                <li>En el móvil y en la tele, con mando</li>
              </ul>
              <Link href="/player" className="btn btn-ghost" style={{ width: "100%" }}>
                Usar gratis
              </Link>
            </Aparece>
            <Aparece className="price-card featured" retraso={90} etiqueta="div">
              <span className="badge badge-accent" style={{ position: "absolute", top: 18, right: 18 }}>
                15 días gratis
              </span>
              <div className="plan-name">Premium</div>
              <div className="price">
                2,99&nbsp;€<span>/mes</span>
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
            </Aparece>
          </div>

          {/* ---------- Para proveedores ---------- */}
          <h2 className="precios-titulo" style={{ marginTop: 56 }} id="proveedores">
            <Icon name="building" size={18} /> Para proveedores IPTV
          </h2>
          <p className="section-sub" style={{ marginBottom: 24 }}>
            Tu reproductor, con tu nombre y tus colores, para todos tus clientes. Cuota mensual fija por tramo: cuanto
            mayor es, menos pagas por cliente.
          </p>
          <Aparece className="tabla-scroll" etiqueta="div">
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
                    <td>{euros(p.price_month / 100, 0)}</td>
                    <td style={{ color: "var(--text-faint)" }}>
                      {euros(p.price_month / 100 / p.max_customers)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Aparece>
          <div style={{ textAlign: "center", marginTop: 28 }}>
            <Link href="/proveedores/registro" className="btn btn-primary btn-lg">
              Probar gratis 7 días
            </Link>
            {/* La prueba trae el panel entero, no una versión recortada: es
                lo que decide si alguien se molesta en montarlo un martes */}
            <p className="precios-nota" style={{ marginTop: 12 }}>
              7 días con 10 clientes, sin tarjeta. Con tu marca, tus revendedores, la importación desde tu panel
              XUI y la API, desde el primer día ·{" "}
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
