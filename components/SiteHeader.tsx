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

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setEmail(d.user?.email ?? null))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setEmail(null);
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
          {!tvMode && !(loaded && email) && (
            <button
              className="btn btn-ghost btn-sm hide-sm"
              onClick={() => setTvMode(true)}
              title="Interfaz grande con navegación por mando"
            >
              <><Icon name="tv" size={15} /> Modo TV</>
            </button>
          )}
          {loaded && email ? (
            <AccountMenu email={email} onLogout={logout} tvMode={tvMode} onTvMode={() => setTvMode(true)} />
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
