"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTvMode } from "./TvModeProvider";

export default function SiteHeader() {
  const [email, setEmail] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const { tvMode, setTvMode } = useTvMode();

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
          <span className="logo-mark">▶</span>
          XtreamPlayer
        </Link>
        <nav className="nav-links" aria-label="Navegación principal">
          <Link href="/player">Reproductor</Link>
          <Link href="/precios">Precios</Link>
          <Link href="/faq">FAQ</Link>
        </nav>
        <div className="header-actions">
          {!tvMode && (
            <button
              className="btn btn-ghost btn-sm hide-sm"
              onClick={() => setTvMode(true)}
              title="Interfaz grande con navegación por mando"
            >
              📺 Modo TV
            </button>
          )}
          {loaded && email ? (
            <>
              <Link href="/cuenta" className="hide-sm" style={{ fontSize: 13.5, color: "var(--text-dim)" }}>
                {email}
              </Link>
              <Link href="/cuenta" className="btn btn-ghost btn-sm">
                Mi cuenta
              </Link>
              <button className="btn btn-ghost btn-sm" onClick={logout}>
                Salir
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost btn-sm hide-sm">
                Entrar
              </Link>
              <Link href="/player" className="btn btn-primary btn-sm">
                Abrir reproductor
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
