"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Icon, { type IconName } from "./Icon";
import AccountMenu from "./AccountMenu";

export default function SiteHeader() {
  const [email, setEmail] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  /*
   * Dentro del reproductor y del panel de gestión la cabecera se calla.
   * Los enlaces de la web pública solo tienen sentido antes de entrar; una
   * vez dentro son ruido: encima del vídeo quitan sitio a lo que se está
   * viendo, y en el panel ofrecen «Entrar» a quien ya está dentro.
   */
  const ruta = usePathname() || "";
  const enReproductor = ruta.startsWith("/player");
  const enPanel = ruta.startsWith("/panel") || ruta.startsWith("/admin");
  const sinMenu = enReproductor || enPanel;

  /*
   * Hay dos formas de estar dentro: con cuenta propia (email) o con el
   * usuario que te dio tu proveedor. La cabecera tiene que reconocer las dos;
   * mirando solo la primera, un cliente con sesión abierta veía «Entrar»,
   * como si no hubiera entrado ya.
   */
  const [customerUser, setCustomerUser] = useState<string | null>(null);
  const [providerMail, setProviderMail] = useState<string | null>(null);
  /*
   * El menú, en un móvil, detrás de un botón.
   *
   * Por debajo de 900px no caben logotipo, menú y botones en la misma línea,
   * así que el menú se escondía sin más — y con él desaparecían Precios,
   * Aplicaciones, Para proveedores y Ayuda. En un teléfono, que es donde más
   * se entra por primera vez, la web no tenía ni una puerta a «soy
   * proveedor»: solo un enlace pequeño perdido en el texto del héroe.
   */
  const [menuAbierto, setMenuAbierto] = useState(false);

  /*
   * La cabecera adelgaza al bajar.
   *
   * Arriba del todo puede permitirse aire: es lo primero que se ve y el
   * logotipo tiene que respirar. Veinte líneas más abajo, esa misma franja
   * son noventa píxeles de nada pegados al borde superior mientras se lee.
   * Encogiéndola se recuperan para el contenido, y de paso el borde inferior
   * dice que hay algo por encima.
   *
   * `passive: true` porque esto no cancela el desplazamiento: sin marcarlo,
   * el navegador tiene que esperar a ver si lo cancelamos antes de mover la
   * página, y eso se nota como tirones al pasar la rueda.
   */
  const [bajada, setBajada] = useState(false);
  useEffect(() => {
    const mirar = () => setBajada(window.scrollY > 24);
    mirar();
    window.addEventListener("scroll", mirar, { passive: true });
    return () => window.removeEventListener("scroll", mirar);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => r.json()).catch(() => ({})),
      fetch("/api/customer/me").then((r) => r.json()).catch(() => ({})),
      fetch("/api/provider/auth").then((r) => r.json()).catch(() => ({})),
    ])
      .then(([auth, cust, prov]) => {
        setEmail(auth.user?.email ?? null);
        setCustomerUser(cust.customer?.username ?? null);
        setProviderMail(prov.provider?.email ?? null);
      })
      .finally(() => setLoaded(true));
  }, []);

  // Al cambiar de página se cierra: si no, queda abierto sobre lo nuevo
  useEffect(() => {
    setMenuAbierto(false);
  }, [ruta]);

  useEffect(() => {
    if (!menuAbierto) return;
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuAbierto(false); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [menuAbierto]);

  /*
   * Quién es «tú» aquí. Se puede estar dentro de tres formas a la vez —con
   * cuenta propia, con el usuario que te dio tu proveedor y como proveedor—
   * porque cada una tiene su cookie y nadie obliga a cerrar las otras. La
   * cabecera elegía siempre en el mismo orden, así que un proveedor con una
   * sesión de cliente vieja abierta veía su panel con el nombre del cliente
   * arriba y un menú que no era el suyo.
   *
   * Manda dónde estás: en el panel eres el proveedor, en la administración
   * tu cuenta propia y en la cuenta del cliente, el cliente.
   */
  const identidades = {
    propia: email ? { tipo: "propia" as const, nombre: email } : null,
    cliente: customerUser ? { tipo: "cliente" as const, nombre: customerUser } : null,
    proveedor: providerMail ? { tipo: "proveedor" as const, nombre: providerMail } : null,
  };
  const orden = ruta.startsWith("/panel")
    ? ["proveedor", "propia", "cliente"]
    : ruta.startsWith("/admin")
      ? ["propia", "proveedor", "cliente"]
      : ruta.startsWith("/mi-cuenta")
        ? ["cliente", "propia", "proveedor"]
        : ["propia", "cliente", "proveedor"];
  const quien = orden.map((k) => identidades[k as keyof typeof identidades]).find(Boolean) || null;

  async function logout() {
    if (email) await fetch("/api/auth/logout", { method: "POST" });
    if (customerUser) await fetch("/api/customer/me", { method: "DELETE" });
    if (providerMail) await fetch("/api/provider/auth", { method: "DELETE" });
    setEmail(null);
    setCustomerUser(null);
    setProviderMail(null);
    window.location.href = "/";
  }

  return (
    <header className={`site-header ${bajada ? "bajada" : ""}`}>
      <div className="container">
        {/* El logotipo es el nombre. El cuadrado rojo con el triángulo dentro
            que había delante era, literalmente, el de YouTube */}
        <Link href="/" className="logo">
          <span className="logo-nombre">TOTAL<span className="logo-play">player</span></span>
        </Link>
        {/*
          El menú solo lleva a lo que NO está ya en los botones de la
          derecha. Tenerlo repetido —«Reproductor» y «Entrar» dos veces cada
          uno— obligaba a leerlo entero para descubrir que daba igual dónde
          pulsaras.
        */}
        {sinMenu ? (
          <span className="nav-links" aria-hidden="true" />
        ) : (
          <>
            <nav className="nav-links" aria-label="Navegación principal">
              {ENLACES.map((e) =>
                e.sub ? (
                  /*
                   * Se abre al pasar por encima Y al entrar con el tabulador
                   * —eso es `:focus-within` en el CSS—, así que también se
                   * puede usar con el teclado. Un desplegable que solo
                   * responde al ratón deja fuera a quien navega tabulando.
                   */
                  <span className="nav-desplegable" key={e.href}>
                    <Link href={e.href} className="nav-desplegable-t">
                      {e.texto}
                      {/* La misma flecha del resto de la web, tumbada: un icono nuevo para
                          esto sería un dibujo más que mantener */}
                      <Icon name="chevronRight" size={14} />
                    </Link>
                    <span className="nav-panel">
                      {e.sub.map((s2) => (
                        <Link key={s2.href} href={s2.href} className="nav-panel-item">
                          <span className="nav-panel-icono"><Icon name={s2.icono} size={18} /></span>
                          <span>
                            <b>{s2.texto}</b>
                            <small>{s2.pie}</small>
                          </span>
                        </Link>
                      ))}
                    </span>
                  </span>
                ) : (
                  <Link key={e.href} href={e.href}>{e.texto}</Link>
                )
              )}
            </nav>
            {/* El mismo menú, en móvil, detrás de un botón */}
            <button
              className="nav-boton"
              aria-label={menuAbierto ? "Cerrar el menú" : "Abrir el menú"}
              aria-expanded={menuAbierto}
              onClick={() => setMenuAbierto((v) => !v)}
            >
              <Icon name={menuAbierto ? "cerrar" : "list"} size={20} />
            </button>
          </>
        )}
        <div className="header-actions">
          {loaded && quien ? (
            <AccountMenu
              email={quien.nombre}
              esCliente={quien.tipo === "cliente"}
              esProveedor={quien.tipo === "proveedor"}
              onLogout={logout}
            />
          ) : (
            <>
              {/* «Entrar» visible también en móvil: era la única puerta al
                  login y estaba oculta justo donde más se entra por primera vez */}
              <Link href="/acceso" className={`btn btn-sm ${enReproductor ? "btn-primary" : "btn-ghost"}`}>
                Entrar
              </Link>
              {!enReproductor && (
                <Link href="/player" className="btn btn-primary btn-sm">
                  <span className="oculta-movil">Ver mi lista</span>
                  <span className="solo-movil">Ver lista</span>
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      {menuAbierto && !sinMenu && (
        <nav className="nav-movil" aria-label="Navegación principal">
          {ENLACES.map((e) => (
            <Link key={e.href} href={e.href} onClick={() => setMenuAbierto(false)}>
              {e.texto}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

/* Un solo sitio donde están los enlaces: el menú de escritorio y el de móvil
   tienen que llevar a lo mismo, y con dos listas acaban no llevándolo */
const ENLACES: {
  href: string;
  texto: string;
  sub?: { href: string; texto: string; pie: string; icono: IconName }[];
}[] = [
  { href: "/precios", texto: "Precios" },
  {
    href: "/apps",
    texto: "Aplicaciones",
    /*
     * Cada entrada lleva a un sitio distinto y de verdad.
     *
     * Es la diferencia entre un desplegable que sirve y uno de adorno: si
     * las cinco entradas acabaran en la misma página, sería un menú más
     * largo para llegar exactamente igual de lejos.
     */
    sub: [
      { href: "/apps/androidtv", texto: "Android TV y Fire TV", pie: "Aplicación propia, con su icono en la tele", icono: "tv" },
      { href: "/apps/movil", texto: "Android, iPhone y iPad", pie: "En el móvil y en la tableta", icono: "device" },
      { href: "/apps#navegador", texto: "Samsung, LG y otras teles", pie: "Desde el navegador del televisor", icono: "globe" },
      { href: "/apps", texto: "Todos los aparatos", pie: "Cómo se pone en cada uno", icono: "list" },
    ],
  },
  { href: "/proveedores", texto: "Para proveedores" },
  { href: "/faq", texto: "Ayuda" },
];
