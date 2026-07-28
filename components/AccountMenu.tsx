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
  esCliente = false,
  esProveedor = false,
  onLogout,
}: {
  /** Correo de la cuenta propia, o nombre de usuario si viene del proveedor */
  email: string;
  /** Sesión de cliente de proveedor: sin página «Mi cuenta» que ofrecer */
  esCliente?: boolean;
  /** Sesión de proveedor: su casa es el panel, no «Mi cuenta» */
  esProveedor?: boolean;
  onLogout: () => void;
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

          {esProveedor && (
            <Link href="/panel" className="account-pop-item" role="menuitem" onClick={() => setAbierto(false)}>
              <Icon name="users" size={16} /> Mi panel
            </Link>
          )}
          {/* El cliente de un proveedor tiene su propia cuenta: su acceso,
              sus dispositivos y a quién escribir — no el plan de TOTALplayer */}
          {esCliente && (
            <Link href="/mi-cuenta" className="account-pop-item" role="menuitem" onClick={() => setAbierto(false)}>
              <Icon name="users" size={16} /> Mi cuenta
            </Link>
          )}
          {!esCliente && !esProveedor && (
            <Link href="/cuenta" className="account-pop-item" role="menuitem" onClick={() => setAbierto(false)}>
              <Icon name="users" size={16} /> Mi cuenta
            </Link>
          )}
          <Link href="/player" className="account-pop-item" role="menuitem" onClick={() => setAbierto(false)}>
            <Icon name="play" size={16} /> Reproductor
          </Link>
          {/*
            Perfiles y tele son cosas de quien ve la tele. En el menú de un
            proveedor sobraban: él entra a gestionar clientes, y «cambiar de
            perfil» no significa nada en su panel.
          */}
          {!esProveedor && (
            <>
              {/* Salida para quien fijó su perfil en este aparato: sin esto, la
                  casilla «entrar siempre con este perfil» no tendría vuelta atrás */}
              <button
                className="account-pop-item"
                role="menuitem"
                onClick={() => {
                  try {
                    localStorage.removeItem("xp.perfilFijo.v1");
                  } catch {
                    /* almacenamiento bloqueado */
                  }
                  window.location.href = "/player";
                }}
              >
                <Icon name="users" size={16} /> Cambiar de perfil
              </button>
              {/* La tele tiene su propia aplicación: mantener además la web con
                  la letra grande era ofrecer dos cosas para lo mismo */}
              <Link href="/tv" className="account-pop-item" role="menuitem" onClick={() => setAbierto(false)}>
                <Icon name="tv" size={16} /> Ver en la tele
              </Link>
            </>
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
