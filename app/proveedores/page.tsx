import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import Icon from "@/components/Icon";
import Aparece from "@/components/Aparece";
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
              <Aparece className="step" retraso={0} etiqueta="div">
                <div className="step-num">1</div>
                <h3>Creas el acceso</h3>
                <p>Desde tu panel: usuario, contraseña y las credenciales Xtream de ese cliente. Diez segundos.</p>
              </Aparece>
              <Aparece className="step" retraso={90} etiqueta="div">
                <div className="step-num">2</div>
                <h3>Se lo entregas</h3>
                <p>Tu cliente solo necesita dos datos. Nada de URLs largas, ni get.php, ni códigos de activación.</p>
              </Aparece>
              <Aparece className="step" retraso={180} etiqueta="div">
                <div className="step-num">3</div>
                <h3>Entra y ve la tele</h3>
                <p>Abre el reproductor, escribe usuario y contraseña, y ya está viendo su lista. En web y en su tele.</p>
              </Aparece>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <h2 className="section-title">Todo lo que incluye tu cuenta</h2>
            <div className="features-grid">
              <Aparece className="feature-card" retraso={0} etiqueta="div">
                <div className="feature-icon"><Icon name="users" size={22} /></div>
                <h3>Gestión de clientes</h3>
                <p>Alta, baja, cambio de contraseña, activar y desactivar al instante. Búsqueda inmediata entre miles.</p>
              </Aparece>
              <Aparece className="feature-card" retraso={70} etiqueta="div">
                <div className="feature-icon"><Icon name="device" size={22} /></div>
                <h3>Control de dispositivos</h3>
                <p>Decide cuántas pantallas puede usar cada cliente y libéralas cuando cambie de televisor.</p>
              </Aparece>
              <Aparece className="feature-card" retraso={140} etiqueta="div">
                <div className="feature-icon"><Icon name="tv" size={22} /></div>
                <h3>Web y televisores</h3>
                <p>El mismo acceso funciona en navegador, móvil y Smart TV con navegación por mando a distancia.</p>
              </Aparece>
              {/* La pregunta que hace todo proveedor en la primera llamada:
                  «¿y una app con mi nombre?». Estaba contestada en el
                  repositorio y en ninguna parte donde él pudiera leerla */}
              <Aparece className="feature-card" retraso={0} etiqueta="div">
                <div className="feature-icon"><Icon name="device" size={22} /></div>
                <h3>Aplicaciones con tu marca</h3>
                <p>
                  Android TV, Fire TV, Samsung y LG: se publican con tu nombre, tu icono y tu dominio, y tus
                  clientes no ven TOTALplayer por ningún lado. En el móvil se instala desde el navegador, sin
                  tienda. <Link href="/apps">Ver los aparatos</Link>.
                </p>
              </Aparece>
              <Aparece className="feature-card" retraso={70} etiqueta="div">
                <div className="feature-icon"><Icon name="play" size={22} /></div>
                <h3>Directo, cine y series</h3>
                <p>Soporte completo de la API Xtream con carátulas, categorías, temporadas y EPG. También listas M3U.</p>
              </Aparece>
              <Aparece className="feature-card" retraso={140} etiqueta="div">
                <div className="feature-icon"><Icon name="sparkle" size={22} /></div>
                <h3>Menos incidencias</h3>
                <p>Motor de compatibilidad que reintenta solo cuando un canal falla. Menos mensajes de «no me va».</p>
              </Aparece>
              <Aparece className="feature-card" retraso={0} etiqueta="div">
                <div className="feature-icon"><Icon name="check" size={22} /></div>
                <h3>Creces sin fricción</h3>
                <p>Cambias de tramo cuando lo necesitas. Pagas por capacidad, no por activación individual.</p>
              </Aparece>
              {/*
                Lo que estaba hecho y no se contaba en ninguna parte. Un
                proveedor que compara opciones pregunta por las cuatro —«¿mis
                revendedores entran?», «¿tengo que dar de alta a mil clientes
                a mano?», «¿esto me lo puedo facturar?», «¿puedo automatizar
                desde mi panel?»— y aquí no había respuesta a ninguna.
              */}
              <Aparece className="feature-card" retraso={70} etiqueta="div">
                <div className="feature-icon"><Icon name="handshake" size={22} /></div>
                <h3>Tus revendedores, con sus permisos</h3>
                <p>
                  Cada uno entra al mismo panel con su cuenta y tú decides qué ve: solo sus clientes o todos,
                  cuántos puede dar de alta, y si ve tus dominios, solo el nombre o nada.
                </p>
              </Aparece>
              <Aparece className="feature-card" retraso={140} etiqueta="div">
                <div className="feature-icon"><Icon name="upload" size={22} /></div>
                <h3>Tráete tus clientes de golpe</h3>
                <p>
                  Los importas desde tu panel XUI y entran todos con el usuario y la contraseña que ya tienen.
                  Cambiar de reproductor no significa volver a darlos de alta uno a uno.
                </p>
              </Aparece>
              <Aparece className="feature-card" retraso={0} etiqueta="div">
                <div className="feature-icon"><Icon name="card" size={22} /></div>
                <h3>Facturas y API</h3>
                <p>
                  Tus facturas con IVA desglosado y en PDF de un clic, para tu gestor. Y una API con tu clave para
                  crear, cambiar y dar de baja clientes desde tu propio sistema.
                </p>
              </Aparece>
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
            {/* La marca blanca —tu nombre, tu color, tu logotipo y tu enlace—
                va en todos los tramos, incluido el de prueba. Ponerla aquí
                como un «escríbenos» la hacía parecer un extra que se paga
                aparte, y es de lo primero que se mira al comparar. */}
            <p style={{ textAlign: "center", marginTop: 20, color: "var(--text-faint)", fontSize: 13.5 }}>
              Tu nombre, tu color y tu logotipo van incluidos en todos los tramos, también en la prueba.
              ¿Necesitas más de 5.000 clientes, o que el reproductor viva en un dominio tuyo? Escríbenos y lo
              hablamos.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
