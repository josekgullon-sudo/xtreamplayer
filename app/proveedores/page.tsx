import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { listPlans } from "@/lib/provider";

export const metadata: Metadata = {
  title: "Reproductor para proveedores IPTV — tu app lista para tus clientes",
  description:
    "Ofrece a tus clientes un reproductor profesional sin desarrollar nada. Das de alta al cliente, le entregas usuario y contraseña, y entra con su lista ya cargada. Planes desde 20 €/mes.",
  alternates: { canonical: "/proveedores" },
};

export default function ProvidersPage() {
  const plans = listPlans();

  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero">
          <div className="container">
            <span className="badge badge-accent" style={{ marginBottom: 16, display: "inline-block" }}>
              Para proveedores y revendedores IPTV
            </span>
            <h1>
              Tu propio reproductor, <span className="grad">sin desarrollar nada</span>
            </h1>
            <p className="sub">
              Das de alta a tu cliente, le entregas un usuario y una contraseña, y entra con su lista ya cargada.
              Sin tutoriales, sin configuraciones, sin soporte técnico por listas mal puestas.
            </p>
            <div className="hero-cta">
              <Link href="/proveedores/registro" className="btn btn-primary btn-lg">
                Empezar prueba gratis
              </Link>
              <Link href="/proveedores/login" className="btn btn-ghost btn-lg">
                Acceder a mi panel
              </Link>
            </div>
            <p className="hero-note">7 días de prueba con 10 clientes · Sin tarjeta · Cancela cuando quieras</p>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <h2 className="section-title">El problema que te quitamos de encima</h2>
            <p className="section-sub">
              Cada cliente nuevo son mensajes explicando cómo pegar una URL. Con nosotros, se acabó.
            </p>
            <div className="steps">
              <div className="step">
                <div className="step-num">1</div>
                <h3>Creas el acceso</h3>
                <p>Desde tu panel: usuario, contraseña y las credenciales Xtream de ese cliente. Diez segundos.</p>
              </div>
              <div className="step">
                <div className="step-num">2</div>
                <h3>Se lo entregas</h3>
                <p>Tu cliente solo necesita dos datos. Nada de URLs largas, ni get.php, ni códigos de activación.</p>
              </div>
              <div className="step">
                <div className="step-num">3</div>
                <h3>Entra y ve la tele</h3>
                <p>Abre el reproductor, escribe usuario y contraseña, y ya está viendo su lista. En web y en su tele.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <h2 className="section-title">Todo lo que incluye tu cuenta</h2>
            <div className="features-grid">
              <div className="feature-card">
                <div className="feature-icon">👥</div>
                <h3>Gestión de clientes</h3>
                <p>Alta, baja, cambio de contraseña, activar y desactivar al instante. Búsqueda inmediata entre miles.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">📱</div>
                <h3>Control de dispositivos</h3>
                <p>Decide cuántas pantallas puede usar cada cliente y libéralas cuando cambie de televisor.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">📺</div>
                <h3>Web y televisores</h3>
                <p>El mismo acceso funciona en navegador, móvil y Smart TV con navegación por mando a distancia.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">🎬</div>
                <h3>Directo, cine y series</h3>
                <p>Soporte completo de la API Xtream con carátulas, categorías, temporadas y EPG. También listas M3U.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">⚡</div>
                <h3>Menos incidencias</h3>
                <p>Motor de compatibilidad que reintenta solo cuando un canal falla. Menos mensajes de «no me va».</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">📈</div>
                <h3>Creces sin fricción</h3>
                <p>Cambias de tramo cuando lo necesitas. Pagas por capacidad, no por activación individual.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="planes">
          <div className="container">
            <h2 className="section-title">Planes por número de clientes</h2>
            <p className="section-sub">Cuota mensual fija. Cuanto mayor es el tramo, menos pagas por cliente.</p>
            <div style={{ overflowX: "auto" }}>
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
                  {plans.map((p) => (
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
            <div style={{ textAlign: "center", marginTop: 32 }}>
              <Link href="/proveedores/registro" className="btn btn-primary btn-lg">
                Probar gratis 7 días
              </Link>
            </div>
            <p style={{ textAlign: "center", marginTop: 20, color: "var(--text-faint)", fontSize: 13.5 }}>
              ¿Necesitas más de 5.000 clientes o marca blanca con tu dominio? Escríbenos y lo hablamos.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
