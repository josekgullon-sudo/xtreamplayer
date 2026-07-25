"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTvMode } from "./TvModeProvider";
import Icon from "./Icon";
import AccountMenu from "./AccountMenu";

export default function SiteHeader() {
  const [email, setEmail] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const { tvMode, setTvMode } = useTvMode();
  /*
   * Dentro del reproductor la cabecera se calla. Los enlaces de la web y el
   * botón «Abrir reproductor» solo tienen sentido antes de entrar; una vez
   * dentro son ruido encima del vídeo, y en una pantalla de portátil le
   * quitan sitio a lo único que importa, que es lo que se está viendo.
   */
  const enReproductor = (usePathname() || "").startsWith("/player");

  /*
   * Hay dos formas de estar dentro: con cuenta propia (email) o con el
   * usuario que te dio tu proveedor. La cabecera tiene que reconocer las dos;
   * mirando solo la primera, un cliente con sesión abierta veía «Entrar»,
   * como si no hubiera entrado ya.
   */
  const [customerUser, setCustomerUser] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => r.json()).catch(() => ({})),
      fetch("/api/customer/me").then((r) => r.json()).catch(() => ({})),
    ])
      .then(([auth, cust]) => {
        setEmail(auth.user?.email ?? null);
        setCustomerUser(cust.customer?.username ?? null);
      })
      .finally(() => setLoaded(true));
  }, []);

  async function logout() {
    if (email) await fetch("/api/auth/logout", { method: "POST" });
    if (customerUser) await fetch("/api/customer/me", { method: "DELETE" });
    setEmail(null);
    setCustomerUser(null);
    window.location.href = "/";
  }

  return (
    <header className="site-header">
      <div className="container">
        <Link href="/" className="logo">
          <span className="logo-mark"><Icon name="play" size={15} /></span>
          TOTALplayer
        </Link>
        {enReproductor ? (
          <span className="nav-links" aria-hidden="true" />
        ) : (
          <nav className="nav-links" aria-label="Navegación principal">
            <Link href="/player">Reproductor</Link>
            <Link href="/acceso">Entrar</Link>
            <Link href="/proveedores">Proveedores</Link>
            <Link href="/faq">FAQ</Link>
          </nav>
        )}
        <div className="header-actions">
          {/* Con sesión abierta, el modo TV vive dentro del menú de cuenta */}
          {!tvMode && !(loaded && (email || customerUser)) && (
            <button
              className="btn btn-ghost btn-sm hide-sm"
              onClick={() => setTvMode(true)}
              title="Interfaz grande con navegación por mando"
            >
              <><Icon name="tv" size={15} /> Modo TV</>
            </button>
          )}
          {loaded && (email || customerUser) ? (
            <AccountMenu
              email={email || customerUser || ""}
              esCliente={!email}
              onLogout={logout}
              tvMode={tvMode}
              onTvMode={() => setTvMode(true)}
            />
          ) : (
            <>
              <Link href="/acceso" className={`btn btn-sm ${enReproductor ? "btn-primary" : "btn-ghost hide-sm"}`}>
                Entrar
              </Link>
              {!enReproductor && (
                <Link href="/player" className="btn btn-primary btn-sm">
                  Abrir reproductor
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
