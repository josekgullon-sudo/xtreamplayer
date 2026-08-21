"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";

type Via = "codigo" | "mac" | "usuario";

/**
 * El otro extremo de la activación: aquí se teclea, que es lo que en una
 * tele no se puede hacer. Tres caminos, y cada cual usa el suyo:
 *
 *  - Usuario: entra con lo que le dio su proveedor, aquí mismo.
 *  - Código: escribe en el móvil el código que ve en la tele y listo.
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
  /** MAC en el campo: con ella se listan y gestionan las listas del aparato */
  const [mac, setMac] = useState("");
  const [listas, setListas] = useState<{ id: number; nombre: string; tipo: string; url: string; activa: boolean }[]>([]);
  const [aviso, setAviso] = useState("");

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

  /** Entrar con el usuario del proveedor sin salir de esta página */
  async function entrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/customer/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: fd.get("usuario"), password: fd.get("password"), deviceKey: "web-activar", platform: "web" }),
    });
    const data = await res.json();
    setEnviando(false);
    if (!res.ok) {
      setError(data.error || "No hemos podido entrar con esos datos");
      return;
    }
    // Con la sesión ya abierta, lo que toca es el código de la tele
    setSesion("si");
    setVia("codigo");
  }

  /** Las listas que ya tiene ese aparato, para poder gestionarlas */
  const cargarListas = useCallback(async (m: string) => {
    if (m.replace(/[^0-9A-Fa-f]/g, "").length !== 12) {
      setListas([]);
      return;
    }
    const d = await fetch(`/api/tv/lista?mac=${encodeURIComponent(m)}`).then((r) => r.json()).catch(() => ({}));
    setListas(d.listas || []);
  }, []);

  async function cargarLista(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
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
    // Se queda en la página: acaba de añadir una y probablemente quiera ver
    // las que tiene, o añadir otra
    form.querySelectorAll("input").forEach((i) => { if (i.name !== "mac") i.value = ""; });
    await cargarListas(mac);
    setAviso("Lista cargada. La tele entrará con ella.");
  }

  async function activar(id: number) {
    await fetch("/api/tv/lista", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mac, id }),
    });
    await cargarListas(mac);
    setAviso("Hecho. La tele entrará con esa lista.");
  }

  async function borrar(id: number) {
    if (!confirm("¿Quitar esta lista de la tele?")) return;
    await fetch(`/api/tv/lista?mac=${encodeURIComponent(mac)}&id=${id}`, { method: "DELETE" });
    await cargarListas(mac);
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
        <p className="auth-sub">Elige cómo prefieres hacerlo. Con una de las tres basta.</p>

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
          {sesion === "no" && (
            <button
              role="tab"
              aria-selected={via === "usuario"}
              className={`pa-tab ${via === "usuario" ? "active" : ""}`}
              onClick={() => { setVia("usuario"); setError(""); }}
            >
              Con mi usuario
            </button>
          )}
        </div>

        {error && (
          <div className="error-box" style={{ marginBottom: 16 }} role="alert">
            {error}
          </div>
        )}

        {via === "usuario" ? (
          <form onSubmit={entrar}>
            <p className="auth-sub">
              El usuario y la contraseña que te dio tu proveedor. Al entrar podrás activar la tele con su código.
            </p>
            <div className="auth-field">
              <label className="label" htmlFor="ac-user">Usuario</label>
              <input id="ac-user" name="usuario" className="input" required autoFocus autoComplete="username" />
            </div>
            <div className="auth-field">
              <label className="label" htmlFor="ac-pass">Contraseña</label>
              <input id="ac-pass" name="password" type="password" className="input" required autoComplete="current-password" />
            </div>
            <button className="btn btn-primary" style={{ width: "100%" }} disabled={enviando}>
              {enviando ? "Entrando…" : "Entrar"}
            </button>
          </form>
        ) : via === "codigo" ? (
          sesion === "no" ? (
            <>
              <p className="auth-sub">
                Para activar con código hace falta tu usuario. Entra en la pestaña «Con mi usuario», o usa la MAC si
                lo que tienes es tu propia lista.
              </p>
              <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => setVia("usuario")}>
                Entrar con mi usuario
              </button>
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
            {aviso && (
              <div className="badge badge-success" style={{ display: "block", padding: "10px 14px", marginBottom: 14 }} role="status">
                {aviso}
              </div>
            )}
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
                value={mac}
                onChange={(e) => { setMac(e.target.value); cargarListas(e.target.value); }}
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
              <p className="pista">
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
              {enviando ? "Cargando…" : listas.length ? "Añadir esta lista" : "Cargar la lista en mi tele"}
            </button>

            {listas.length > 0 && (
              <div className="listas-tele">
                <p className="label" style={{ marginBottom: 10 }}>Listas de esta tele</p>
                {listas.map((l) => (
                  <div className={`lista-tele ${l.activa ? "activa" : ""}`} key={l.id}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong>{l.nombre || "Sin nombre"}</strong>
                      <span>{l.tipo === "xtream" ? "Xtream" : "M3U"} · {l.url}</span>
                    </div>
                    {l.activa ? (
                      <span className="badge badge-success">En uso</span>
                    ) : (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => activar(l.id)}>
                        Usar esta
                      </button>
                    )}
                    <button type="button" className="icon-btn" onClick={() => borrar(l.id)} aria-label="Quitar">
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
