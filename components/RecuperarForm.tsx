"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Icon from "./Icon";

/**
 * «He olvidado mi contraseña».
 *
 * Contesta siempre lo mismo, exista la cuenta o no: si dijera «ese correo no
 * está registrado», este formulario sería la forma más cómoda de averiguar
 * quién tiene cuenta aquí.
 *
 * El cliente de un proveedor no aparece por ninguna parte a propósito: su
 * contraseña la lleva su proveedor, y quien tiene que devolvérsela es él.
 * Ofrecerle un correo que nunca le va a llegar sería peor que no ofrecer
 * nada.
 */
function RecuperarFormInner() {
  const search = useSearchParams();
  const [tipo, setTipo] = useState<"user" | "provider">(
    search.get("rol") === "proveedor" ? "provider" : "user"
  );
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"escribiendo" | "enviando" | "enviado">("escribiendo");
  const [error, setError] = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setEstado("enviando");
    try {
      const res = await fetch("/api/auth/recuperar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, tipo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No se pudo enviar. Inténtalo dentro de un momento.");
        setEstado("escribiendo");
        return;
      }
      setEstado("enviado");
    } catch {
      setError("No se pudo conectar. Revisa tu conexión.");
      setEstado("escribiendo");
    }
  }

  if (estado === "enviado") {
    return (
      <div className="auth-wrap escena">
        <div className="card auth-card">
          <div className="activar-ok" aria-hidden="true">
            <Icon name="check" size={30} />
          </div>
          <h1>Mira tu correo</h1>
          <p className="auth-sub">
            Si <strong>{email}</strong> tiene cuenta aquí, le acaba de llegar un enlace para elegir una
            contraseña nueva. Caduca dentro de una hora.
          </p>
          <p className="auth-alt">¿No lo ves? Mira en la carpeta de spam antes de volver a pedirlo.</p>
          <p className="auth-alt">
            <Link href="/login">Volver a entrar</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap escena">
      <div className="card auth-card">
        <h1>¿Has olvidado la contraseña?</h1>
        <p className="auth-sub">Escribe tu correo y te mandamos un enlace para elegir otra.</p>

        {error && (
          <div className="error-box" style={{ marginBottom: 16 }} role="alert">
            {error}
          </div>
        )}

        <div className="access-tabs" style={{ marginBottom: 18 }}>
          <button
            type="button"
            className={`access-tab ${tipo === "user" ? "active" : ""}`}
            onClick={() => setTipo("user")}
          >
            <Icon name="users" size={16} /> Mi cuenta
          </button>
          <button
            type="button"
            className={`access-tab ${tipo === "provider" ? "active" : ""}`}
            onClick={() => setTipo("provider")}
          >
            <Icon name="building" size={16} /> Soy proveedor
          </button>
        </div>

        <form onSubmit={enviar}>
          <div className="auth-field">
            <label className="label" htmlFor="rec-email">Correo</label>
            <input
              id="rec-email"
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
            />
          </div>
          <button className="btn btn-primary" style={{ width: "100%" }} disabled={estado === "enviando"}>
            {estado === "enviando" ? "Enviando…" : "Mandarme el enlace"}
          </button>
        </form>

        <p className="auth-alt">
          ¿Ya te acuerdas? <Link href="/login">Inicia sesión</Link>
        </p>
        {/* Al cliente de un proveedor no le sirve nada de esto: su contraseña
            la tiene su proveedor, y es a él a quien hay que mandarlo */}
        <p className="auth-alt" style={{ fontSize: 13 }}>
          Si entras con el usuario que te dio tu proveedor, es él quien puede cambiártela: escríbele.
        </p>
      </div>
    </div>
  );
}

export default function RecuperarForm() {
  return (
    <Suspense>
      <RecuperarFormInner />
    </Suspense>
  );
}
