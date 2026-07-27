"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

/**
 * El otro extremo del emparejado: aquí el cliente teclea, desde su móvil, el
 * código que ve en la tele. Escribir es cómodo en el móvil y un suplicio con
 * un mando, así que cada aparato hace lo que se le da bien.
 */
export default function ActivarTv() {
  const [sesion, setSesion] = useState<"cargando" | "no" | "si">("cargando");
  const [estado, setEstado] = useState<"pidiendo" | "hecho">("pidiendo");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    fetch("/api/customer/me")
      .then((r) => r.json())
      .then((d) => setSesion(d.customer ? "si" : "no"))
      .catch(() => setSesion("no"));
  }, []);

  async function activar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    const code = String(new FormData(e.currentTarget).get("code") || "");
    const res = await fetch("/api/tv/reclamar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    setEnviando(false);
    if (!res.ok) {
      setError(data.error || "No se pudo activar");
      return;
    }
    setEstado("hecho");
  }

  if (sesion === "cargando") return <main className="auth-wrap" />;

  if (sesion === "no") {
    return (
      <main className="auth-wrap">
        <div className="auth-card">
          <h1>Activar mi tele</h1>
          <p className="auth-sub">Entra primero con tu usuario y vuelve aquí con el código de la tele.</p>
          <Link href="/acceso" className="btn btn-primary" style={{ width: "100%" }}>
            Entrar con mi usuario
          </Link>
        </div>
      </main>
    );
  }

  if (estado === "hecho") {
    return (
      <main className="auth-wrap">
        <div className="auth-card" style={{ textAlign: "center" }}>
          <span className="activar-ok"><Icon name="tv" size={34} /></span>
          <h1>Tele activada</h1>
          <p className="auth-sub">
            Ya puedes soltar el móvil: la tele entrará sola en unos segundos y se quedará activada.
          </p>
          <Link href="/player" className="btn btn-ghost" style={{ width: "100%" }}>
            Volver al reproductor
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-wrap">
      <form className="auth-card" onSubmit={activar}>
        <h1>Activar mi tele</h1>
        <p className="auth-sub">Escribe el código de seis caracteres que aparece en la pantalla del televisor.</p>

        {error && (
          <div className="error-box" style={{ marginBottom: 16 }} role="alert">
            {error}
          </div>
        )}

        <div className="auth-field">
          <label className="label" htmlFor="tv-code">Código de la tele</label>
          <input
            id="tv-code"
            name="code"
            className="input activar-code"
            required
            maxLength={7}
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="A1B2C3"
          />
        </div>

        <button className="btn btn-primary" style={{ width: "100%" }} disabled={enviando}>
          {enviando ? "Activando…" : "Activar la tele"}
        </button>
      </form>
    </main>
  );
}
