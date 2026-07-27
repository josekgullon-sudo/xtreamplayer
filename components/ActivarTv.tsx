"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

type Via = "codigo" | "mac";

/**
 * El otro extremo de la activación: aquí se teclea, que es lo que en una
 * tele no se puede hacer. Hay dos caminos, y cada cual usa el suyo:
 *
 *  - Código: quien tiene su usuario de proveedor. Escribe en el móvil el
 *    código que ve en la tele y listo.
 *  - MAC: quien trae su propia lista. Copia la MAC de la tele, pega su URL
 *    M3U o su servidor Xtream, y la tele la carga sola. Sin cuenta, sin
 *    proveedor y sin escribir nada en el televisor.
 */
export default function ActivarTv() {
  const [via, setVia] = useState<Via>("codigo");
  const [sesion, setSesion] = useState<"cargando" | "no" | "si">("cargando");
  const [hecho, setHecho] = useState<"" | "codigo" | "mac">("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    fetch("/api/customer/me")
      .then((r) => r.json())
      .then((d) => setSesion(d.customer ? "si" : "no"))
      .catch(() => setSesion("no"));
  }, []);

  async function activarConCodigo(e: React.FormEvent<HTMLFormElement>) {
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
    setHecho("codigo");
  }

  async function cargarLista(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/tv/lista", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mac: fd.get("mac"),
        url: fd.get("url"),
        usuario: fd.get("usuario"),
        password: fd.get("password"),
        nombre: fd.get("nombre"),
      }),
    });
    const data = await res.json();
    setEnviando(false);
    if (!res.ok) {
      setError(data.error || "No se pudo cargar la lista");
      return;
    }
    setHecho("mac");
  }

  if (sesion === "cargando") return <main className="auth-wrap" />;

  if (hecho) {
    return (
      <main className="auth-wrap">
        <div className="auth-card" style={{ textAlign: "center" }}>
          <span className="activar-ok"><Icon name="tv" size={34} /></span>
          <h1>{hecho === "codigo" ? "Tele activada" : "Lista cargada"}</h1>
          <p className="auth-sub">
            Ya puedes soltar el móvil: la tele entrará sola en unos segundos y se quedará activada.
          </p>
          <button className="btn btn-ghost" style={{ width: "100%" }} onClick={() => { setHecho(""); setError(""); }}>
            Activar otra tele
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <h1>Activar mi tele</h1>
        <p className="auth-sub">Elige cómo prefieres hacerlo. Solo hace falta una de las dos.</p>

        <div className="pa-tabs" role="tablist" style={{ marginBottom: 20 }}>
          <button
            role="tab"
            aria-selected={via === "codigo"}
            className={`pa-tab ${via === "codigo" ? "active" : ""}`}
            onClick={() => { setVia("codigo"); setError(""); }}
          >
            Con el código
          </button>
          <button
            role="tab"
            aria-selected={via === "mac"}
            className={`pa-tab ${via === "mac" ? "active" : ""}`}
            onClick={() => { setVia("mac"); setError(""); }}
          >
            Con la MAC y mi lista
          </button>
        </div>

        {error && (
          <div className="error-box" style={{ marginBottom: 16 }} role="alert">
            {error}
          </div>
        )}

        {via === "codigo" ? (
          sesion === "no" ? (
            <>
              <p className="auth-sub">
                Para activar con código necesitas tu usuario. Si lo que tienes es una lista M3U, usa la otra pestaña.
              </p>
              <Link href="/acceso" className="btn btn-primary" style={{ width: "100%" }}>
                Entrar con mi usuario
              </Link>
            </>
          ) : (
            <form onSubmit={activarConCodigo}>
              <div className="auth-field">
                <label className="label" htmlFor="tv-code">Código que ves en la tele</label>
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
          )
        ) : (
          <form onSubmit={cargarLista}>
            <div className="auth-field">
              <label className="label" htmlFor="tv-mac">MAC que aparece en la tele</label>
              <input
                id="tv-mac"
                name="mac"
                className="input activar-code"
                required
                autoFocus
                autoComplete="off"
                spellCheck={false}
                placeholder="1A:2B:3C:4D:5E:6F"
              />
            </div>
            <div className="auth-field">
              <label className="label" htmlFor="tv-url">Tu lista</label>
              <input
                id="tv-url"
                name="url"
                className="input"
                required
                autoComplete="off"
                placeholder="http://servidor.com:8080  o  la URL get.php completa"
              />
              <p style={{ fontSize: 12.5, color: "var(--text-faint)", marginTop: 6 }}>
                Vale una URL M3U o un servidor Xtream. Si es Xtream, rellena también usuario y contraseña.
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="auth-field">
                <label className="label" htmlFor="tv-user">Usuario</label>
                <input id="tv-user" name="usuario" className="input" autoComplete="off" placeholder="Solo Xtream" />
              </div>
              <div className="auth-field">
                <label className="label" htmlFor="tv-pass">Contraseña</label>
                <input id="tv-pass" name="password" className="input" autoComplete="off" placeholder="Solo Xtream" />
              </div>
            </div>
            <div className="auth-field">
              <label className="label" htmlFor="tv-nombre">Nombre de la lista (opcional)</label>
              <input id="tv-nombre" name="nombre" className="input" maxLength={60} placeholder="Mi lista" />
            </div>
            <button className="btn btn-primary" style={{ width: "100%" }} disabled={enviando}>
              {enviando ? "Cargando…" : "Cargar la lista en mi tele"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
