"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import Loading from "@/components/Loading";

interface Cuenta {
  usuario: string;
  nombre: string;
  alta: number;
  caduca: number;
  estado: string;
  ultimoAcceso: number;
  maxDispositivos: number;
  maxPerfiles: number;
  perfiles: number;
}

interface Datos {
  cuenta: Cuenta;
  proveedor: { nombre: string; soporte: string; logo: string };
  dispositivos: { id: number; nombre: string; plataforma: string; alta: number; visto: number }[];
}

function fecha(ts: number) {
  return ts ? new Date(ts).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "—";
}

function cuandoFue(ts: number) {
  if (!ts) return "nunca";
  const dias = Math.floor((Date.now() - ts) / 86400000);
  if (dias === 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  return fecha(ts);
}

function diasRestantes(ts: number) {
  if (!ts) return null;
  return Math.ceil((ts - Date.now()) / 86400000);
}

/**
 * La cuenta del cliente final. Hasta ahora, quien entraba con el usuario que
 * le dio su proveedor no tenía dónde mirar lo suyo: cuándo se le acaba, en
 * cuántos aparatos puede verlo, a quién escribir si falla. Todo eso vivía
 * solo en el panel del proveedor, que es justo quien no está delante de la
 * tele cuando surge la duda.
 */
export default function CustomerAccount() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cambiando, setCambiando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  useEffect(() => {
    fetch("/api/customer/cuenta")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("sin sesión"))))
      .then(setDatos)
      .catch(() => setError("No hemos podido cargar tu cuenta. Vuelve a entrar."));
  }, []);

  async function cambiarPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAviso(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (String(fd.get("nueva")) !== String(fd.get("repetir"))) {
      setAviso({ tipo: "error", texto: "Las dos contraseñas nuevas no coinciden" });
      return;
    }
    const res = await fetch("/api/customer/cuenta", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actual: fd.get("actual"), nueva: fd.get("nueva") }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAviso({ tipo: "error", texto: data.error || "No se pudo cambiar" });
      return;
    }
    form.reset();
    setCambiando(false);
    setAviso({ tipo: "ok", texto: "Contraseña cambiada. Úsala la próxima vez que entres." });
  }

  async function salir() {
    await fetch("/api/customer/me", { method: "DELETE" });
    window.location.href = "/";
  }

  if (error) {
    return (
      <main className="auth-wrap">
        <div className="card" style={{ textAlign: "center", maxWidth: 420 }}>
          <p style={{ marginBottom: 16 }}>{error}</p>
          <Link href="/acceso" className="btn btn-primary">Entrar</Link>
        </div>
      </main>
    );
  }
  if (!datos) {
    return (
      <main className="auth-wrap">
        <Loading messages={["Consultando tu cuenta…"]} />
      </main>
    );
  }

  const { cuenta, proveedor, dispositivos } = datos;
  const quedan = diasRestantes(cuenta.caduca);
  const soporteEsEmail = proveedor.soporte.includes("@");

  return (
    <main className="container cuenta-cliente">
      <header className="cuenta-head">
        <div>
          <p className="cuenta-marca">{proveedor.nombre}</p>
          <h1>Hola, {cuenta.nombre || cuenta.usuario}</h1>
          <p className="panel-sub">Aquí tienes tu acceso y hasta cuándo lo tienes.</p>
        </div>
        <Link href="/player" className="btn btn-primary">
          <Icon name="play" size={16} /> Ver la tele
        </Link>
      </header>

      {aviso && (
        <div
          className={aviso.tipo === "ok" ? "badge badge-success" : "error-box"}
          style={{ display: "block", padding: "12px 16px", marginBottom: 20 }}
          role="status"
        >
          {aviso.texto}
        </div>
      )}

      <div className="cuenta-grid">
        <section className="card">
          <h3>Tu acceso</h3>
          <dl className="cuenta-datos">
            <div>
              <dt>Usuario</dt>
              <dd><code className="cred">{cuenta.usuario}</code></dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>
                <span className={`badge ${cuenta.estado === "active" ? "badge-success" : ""}`}>
                  {cuenta.estado === "active" ? "Activo" : "Desactivado"}
                </span>
              </dd>
            </div>
            <div>
              <dt>Vence</dt>
              <dd>
                {cuenta.caduca ? (
                  <>
                    {fecha(cuenta.caduca)}
                    {quedan !== null && quedan >= 0 && (
                      <span className={`cuenta-quedan ${quedan <= 7 ? "urgente" : ""}`}>
                        {quedan === 0 ? "hoy" : `quedan ${quedan} días`}
                      </span>
                    )}
                    {quedan !== null && quedan < 0 && <span className="cuenta-quedan urgente">caducado</span>}
                  </>
                ) : (
                  "Sin fecha de fin"
                )}
              </dd>
            </div>
            <div>
              <dt>Cliente desde</dt>
              <dd>{fecha(cuenta.alta)}</dd>
            </div>
          </dl>

          <div className="cuenta-acciones">
            <button className="btn btn-ghost btn-sm" onClick={() => setCambiando((c) => !c)}>
              <Icon name="lock" size={15} /> Cambiar mi contraseña
            </button>
            <button className="btn btn-ghost btn-sm" onClick={salir}>
              <Icon name="power" size={15} /> Cerrar sesión
            </button>
          </div>

          {cambiando && (
            <form onSubmit={cambiarPassword} className="cuenta-form">
              <div className="auth-field">
                <label className="label" htmlFor="cc-actual">Contraseña actual</label>
                <input id="cc-actual" name="actual" type="password" className="input" required autoComplete="current-password" />
              </div>
              <div className="auth-field">
                <label className="label" htmlFor="cc-nueva">Nueva contraseña</label>
                <input id="cc-nueva" name="nueva" type="password" className="input" required minLength={4} autoComplete="new-password" />
              </div>
              <div className="auth-field">
                <label className="label" htmlFor="cc-repetir">Repítela</label>
                <input id="cc-repetir" name="repetir" type="password" className="input" required minLength={4} autoComplete="new-password" />
              </div>
              <button className="btn btn-primary btn-sm" type="submit">Guardar contraseña</button>
            </form>
          )}
        </section>

        <section className="card">
          <h3>Lo que incluye</h3>
          <div className="cuenta-limites">
            <div className="cuenta-limite">
              <span className="cuenta-limite-n">{dispositivos.length}<small>/{cuenta.maxDispositivos}</small></span>
              <span className="cuenta-limite-t">Dispositivos</span>
            </div>
            <div className="cuenta-limite">
              <span className="cuenta-limite-n">{cuenta.perfiles}<small>/{cuenta.maxPerfiles}</small></span>
              <span className="cuenta-limite-t">Perfiles</span>
            </div>
          </div>

          {dispositivos.length > 0 && (
            <ul className="cuenta-dispositivos">
              {dispositivos.map((d) => (
                <li key={d.id}>
                  <Icon name="device" size={16} />
                  <span className="cuenta-disp-nombre">{d.nombre}</span>
                  <span className="cuenta-disp-visto">{cuandoFue(d.visto)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="cuenta-nota">
            ¿Necesitas más dispositivos o perfiles, o liberar uno? Pídeselo a {proveedor.nombre}.
          </p>
        </section>

        <section className="card">
          <h3>Tu proveedor</h3>
          <p className="cuenta-proveedor">{proveedor.nombre}</p>
          {proveedor.soporte ? (
            <>
              <p className="cuenta-nota">Escríbele si algo no va o quieres renovar:</p>
              <a
                className="btn btn-primary btn-sm"
                href={soporteEsEmail ? `mailto:${proveedor.soporte}` : `https://wa.me/${proveedor.soporte.replace(/\D/g, "")}`}
                target={soporteEsEmail ? undefined : "_blank"}
                rel="noreferrer"
              >
                <Icon name="shield" size={15} /> {proveedor.soporte}
              </a>
            </>
          ) : (
            <p className="cuenta-nota">
              Tu proveedor no ha dejado un contacto de soporte. Escríbele por donde contratasteis el servicio.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
