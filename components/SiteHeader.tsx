"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Icon from "./Icon";
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
    <header className="site-header">
      <div className="container">
        <Link href="/" className="logo">
          <span className="logo-mark"><Icon name="play" size={15} /></span>
          TOTALplayer
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
          <nav className="nav-links" aria-label="Navegación principal">
            <Link href="/precios">Precios</Link>
            <Link href="/apps">En tu tele</Link>
            <Link href="/proveedores">Para proveedores</Link>
            <Link href="/faq">Ayuda</Link>
          </nav>
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
    </header>
  );
}
