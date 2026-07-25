"use client";

import Link from "next/link";
import { useState } from "react";

export default function ProviderAuthForm({
  mode,
  embedded,
}: {
  mode: "login" | "register";
  /** Dentro del selector de acceso no lleva su propio contenedor de página */
  embedded?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/provider/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: mode, email, password, company }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Algo salió mal");
        return;
      }
      window.location.href = "/panel";
    } catch {
      setError("No se pudo conectar. Revisa tu conexión.");
    } finally {
      setBusy(false);
    }
  }

  const content = (
    <div className="card auth-card" style={embedded ? { maxWidth: "none" } : undefined}>
        <h1>{mode === "login" ? "Acceso proveedores" : "Crea tu cuenta de proveedor"}</h1>
        <p className="auth-sub">
          {mode === "login"
            ? "Entra a tu panel para gestionar clientes y tu plan."
            : "7 días de prueba con 10 clientes incluidos. Sin tarjeta."}
        </p>
        {error && (
          <div className="error-box" style={{ marginBottom: 16 }} role="alert">
            {error}
          </div>
        )}
        <form onSubmit={submit}>
          {mode === "register" && (
            <div className="auth-field">
              <label className="label" htmlFor="p-company">Nombre del servicio</label>
              <input
                id="p-company"
                className="input"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Mi IPTV"
              />
            </div>
          )}
          <div className="auth-field">
            <label className="label" htmlFor="p-email">Email</label>
            <input
              id="p-email"
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@empresa.com"
            />
          </div>
          <div className="auth-field">
            <label className="label" htmlFor="p-pass">Contraseña</label>
            <input
              id="p-pass"
              className="input"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "register" ? "Mínimo 8 caracteres" : "Tu contraseña"}
            />
          </div>
          <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
            {busy ? "Un momento…" : mode === "login" ? "Entrar al panel" : "Empezar prueba gratis"}
          </button>
        </form>
        <p className="auth-alt">
          {mode === "login" ? (
            <>¿Aún no eres proveedor? <Link href="/proveedores/registro">Crea tu cuenta</Link></>
          ) : (
            <>¿Ya tienes cuenta? <Link href="/proveedores/login">Inicia sesión</Link></>
          )}
        </p>
        {!embedded && (
          <p className="auth-alt" style={{ fontSize: 13 }}>
            ¿Eres usuario final? <Link href="/acceso">Entra con tus datos aquí</Link>
          </p>
        )}
    </div>
  );

  return embedded ? content : <div className="auth-wrap">{content}</div>;
}
