"use client";

import Link from "next/link";
import { useState } from "react";
import { getDeviceKey, getPlatform } from "@/lib/device";

/** Acceso del cliente final con las credenciales que le dio su proveedor. */
export default function CustomerLoginForm({
  brandName,
  support,
}: {
  brandName?: string;
  support?: string;
} = {}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/customer/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          deviceKey: getDeviceKey(),
          platform: getPlatform(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo iniciar sesión");
        return;
      }
      window.location.href = "/player";
    } catch {
      setError("No se pudo conectar. Revisa tu conexión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1>Entra con tu acceso</h1>
        <p className="auth-sub">
          Introduce el usuario y la contraseña que te dio {brandName || "tu proveedor"}. Tu lista se cargará sola:
          no tienes que configurar nada.
        </p>
        {error && (
          <div className="error-box" style={{ marginBottom: 16 }} role="alert">
            {error}
          </div>
        )}
        <form onSubmit={submit}>
          <div className="auth-field">
            <label className="label" htmlFor="cu-user">Usuario</label>
            <input
              id="cu-user"
              className="input"
              required
              autoCapitalize="none"
              autoCorrect="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="El usuario que te dieron"
            />
          </div>
          <div className="auth-field">
            <label className="label" htmlFor="cu-pass">Contraseña</label>
            <input
              id="cu-pass"
              className="input"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
            {busy ? "Entrando…" : "Entrar y ver la tele"}
          </button>
        </form>
        {support ? (
          <p className="auth-alt" style={{ fontSize: 13 }}>
            ¿Problemas para entrar? Escribe a <strong>{support}</strong>
          </p>
        ) : (
          <p className="auth-alt" style={{ fontSize: 13 }}>
            ¿Tienes tu propia lista M3U o Xtream? <Link href="/player">Úsala aquí sin registro</Link>
          </p>
        )}
      </div>
    </div>
  );
}
