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

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 13.5, color: "var(--text-dim)" }}>
          ¿Solo quieres usar tu propia lista M3U o Xtream?{" "}
          <Link href="/player">Entra sin registro</Link>
        </p>
        {/* Tercera puerta, la de quien se registró aquí mismo. Sin esto no
            había ninguna: solo se entraba como cliente o como proveedor */}
        <p style={{ textAlign: "center", marginTop: 8, fontSize: 13.5, color: "var(--text-dim)" }}>
          ¿Tienes una cuenta de TOTALplayer? <Link href="/login">Inicia sesión</Link>
        </p>
      </div>
    </div>
  );
}
