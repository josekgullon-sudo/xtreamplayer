"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function AuthFormInner({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Algo salió mal, inténtalo de nuevo");
        return;
      }
      router.push(search.get("next") || "/player");
      router.refresh();
    } catch {
      setError("No se pudo conectar. Revisa tu conexión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1>{mode === "login" ? "Inicia sesión" : "Crea tu cuenta gratis"}</h1>
        <p className="auth-sub">
          {mode === "login"
            ? "Accede a tus listas sincronizadas en todos tus dispositivos."
            : "Guarda tus listas en la nube y tenlas en cualquier dispositivo. Sin tarjeta."}
        </p>
        {error && (
          <div className="error-box" style={{ marginBottom: 16 }} role="alert">
            {error}
          </div>
        )}
        <form onSubmit={submit}>
          <div className="auth-field">
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
            />
          </div>
          <div className="auth-field">
            <label className="label" htmlFor="password">Contraseña</label>
            <input
              id="password"
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
            {busy ? "Un momento…" : mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>
        <p className="auth-alt">
          {mode === "login" ? (
            <>¿No tienes cuenta? <Link href="/registro">Regístrate gratis</Link></>
          ) : (
            <>¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link></>
          )}
        </p>
        <p className="auth-alt" style={{ fontSize: 13 }}>
          O <Link href="/player">continúa como invitado</Link> — sin registro.
        </p>
      </div>
    </div>
  );
}

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  return (
    <Suspense>
      <AuthFormInner mode={mode} />
    </Suspense>
  );
}
