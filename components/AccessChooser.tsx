"use client";

import Link from "next/link";
import { useState } from "react";
import Icon from "./Icon";
import CustomerLoginForm from "./CustomerLoginForm";
import ProviderAuthForm from "./provider/ProviderAuthForm";

/**
 * Punto de acceso único. La mayoría de quienes entran son clientes finales,
 * así que esa pestaña va primera y activa; el acceso de proveedor está a un
 * clic, sin que nadie tenga que buscar una URL distinta.
 */
export default function AccessChooser({ initial = "cliente" }: { initial?: "cliente" | "proveedor" }) {
  const [tab, setTab] = useState<"cliente" | "proveedor">(initial);

  return (
    <div className="auth-wrap">
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div className="access-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "cliente"}
            className={`access-tab ${tab === "cliente" ? "active" : ""}`}
            onClick={() => setTab("cliente")}
          >
            <Icon name="tv" size={20} className="access-tab-icon" />
            <span>
              <strong>Soy cliente</strong>
              <small>Tengo un usuario de mi proveedor</small>
            </span>
          </button>
          <button
            role="tab"
            aria-selected={tab === "proveedor"}
            className={`access-tab ${tab === "proveedor" ? "active" : ""}`}
            onClick={() => setTab("proveedor")}
          >
            <Icon name="building" size={20} className="access-tab-icon" />
            <span>
              <strong>Soy proveedor</strong>
              <small>Gestiono clientes y revendedores</small>
            </span>
          </button>
        </div>

        {tab === "cliente" ? (
          <CustomerLoginForm embedded />
        ) : (
          <ProviderAuthForm mode="login" embedded />
        )}

        {/* Al proveedor se le ofrece recuperar la contraseña; al cliente no,
            porque la suya la tiene su proveedor y es él quien se la cambia:
            mandarle un correo que nunca le va a llegar es peor que nada */}
        <p style={{ textAlign: "center", marginTop: 14, fontSize: 13.5 }}>
          {tab === "proveedor" ? (
            <Link href="/recuperar?rol=proveedor">He olvidado mi contraseña</Link>
          ) : (
            <span style={{ color: "var(--text-faint)" }}>
              ¿No recuerdas tu usuario o tu contraseña? Te los da tu proveedor.
            </span>
          )}
        </p>

        {/*
          Las otras dos puertas, en una línea y no en dos párrafos.
          Alrededor de dos campos había cuatro salidas —crear cuenta, recuperar
          contraseña, entrar sin registro e iniciar sesión—, cada una en su
          renglón y del mismo tamaño que las demás. Leídas en fila parecen
          cuatro decisiones; puestas así se ven por lo que son: por si no eres
          ninguno de los dos de arriba.
        */}
        <p style={{ textAlign: "center", marginTop: 22, fontSize: 13, color: "var(--text-faint)" }}>
          Otra forma de entrar: <Link href="/player">con mi propia lista</Link>
          {" · "}
          <Link href="/login">con mi cuenta de TOTALplayer</Link>
        </p>
      </div>
    </div>
  );
}
