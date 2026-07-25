"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

/**
 * Menú de cuenta: un avatar que despliega las opciones.
 *
 * Antes la cabecera mostraba a la vez el correo, «Mi cuenta» y «Salir». Tres
 * elementos compitiendo por la mirada para algo que se usa una vez al mes, y
 * que además dejaba el correo del usuario a la vista de cualquiera que pasara
 * por delante de la pantalla. Un avatar ocupa lo que ocupa una inicial y
 * guarda lo demás hasta que hace falta.
 */
export default function AccountMenu({
  email,
  onLogout,
  tvMode,
  onTvMode,
}: {
  email: string;
  onLogout: () => void;
  tvMode: boolean;
  onTvMode: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const cajaRef = useRef<HTMLDivElement>(null);

  // Se cierra al pulsar fuera o con Escape, como cualquier menú del sistema
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  const inicial = email.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <div className="account-menu" ref={cajaRef}>
      <button
        className="account-avatar"
        onClick={() => setAbierto((a) => !a)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label="Menú de tu cuenta"
      >
        {inicial}
      </button>

      {abierto && (
        <div className="account-pop" role="menu">
          <div className="account-pop-head">
            <span className="account-avatar account-avatar-lg" aria-hidden="true">
              {inicial}
            </span>
            <span className="account-pop-mail" title={email}>
              {email}
            </span>
          </div>

          <Link href="/cuenta" className="account-pop-item" role="menuitem" onClick={() => setAbierto(false)}>
            <Icon name="users" size={16} /> Mi cuenta
          </Link>
          <Link href="/player" className="account-pop-item" role="menuitem" onClick={() => setAbierto(false)}>
            <Icon name="play" size={16} /> Reproductor
          </Link>
          {!tvMode && (
            <button
              className="account-pop-item"
              role="menuitem"
              onClick={() => {
                onTvMode();
                setAbierto(false);
              }}
            >
              <Icon name="tv" size={16} /> Modo TV
            </button>
          )}

          <div className="account-pop-sep" />

          <button className="account-pop-item account-pop-out" role="menuitem" onClick={onLogout}>
            <Icon name="power" size={16} /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
