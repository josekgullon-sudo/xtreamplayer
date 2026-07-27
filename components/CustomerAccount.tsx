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
  proveedor: { nombre: string; soporte: string; logo: string; precioPerfil: number };
  dispositivos: { id: number; nombre: string; plataforma: string; alta: number; visto: number }[];
}

const PLATAFORMA: Record<string, string> = {
  web: "Navegador",
  tv: "Televisor",
  ios: "iPhone o iPad",
  android: "Android",
};

function fecha(ts: number) {
  return ts ? new Date(ts).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "—";
}

function cuandoFue(ts: number) {
  if (!ts) return "sin usar";
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

/** Enlace de contacto con el proveedor, con el mensaje ya escrito. */
function enlaceSoporte(soporte: string, mensaje: string) {
  if (!soporte) return "";
  if (soporte.includes("@")) return `mailto:${soporte}?subject=${encodeURIComponent(mensaje)}`;
  return `https://wa.me/${soporte.replace(/\D/g, "")}?text=${encodeURIComponent(mensaje)}`;
}

/**
 * La cuenta del cliente final: qué tiene, hasta cuándo, en cuántos aparatos
 * y a quién escribir. Lo primero y en grande es lo que de verdad se viene a
 * mirar —cuánto queda—, y desde ahí todo lo demás.
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
  const caducado = quedan !== null && quedan < 0;
  const urgente = quedan !== null && quedan >= 0 && quedan <= 7;
  const puedeComprarPerfiles = proveedor.precioPerfil > 0 && Boolean(proveedor.soporte);

  return (
    <main className="container cuenta">
      {/* Lo que de verdad se viene a mirar: cuánto queda */}
      <section className={`cuenta-hero ${caducado ? "caducado" : urgente ? "urgente" : ""}`}>
        <div className="cuenta-hero-txt">
          <p className="cuenta-marca">{proveedor.nombre}</p>
          <h1>{cuenta.nombre || cuenta.usuario}</h1>
          {cuenta.caduca ? (
            <p className="cuenta-hero-estado">
              {caducado ? (
                <>Tu acceso caducó el {fecha(cuenta.caduca)}</>
              ) : (
                <>
                  Te {quedan === 1 ? "queda" : "quedan"} <strong>{quedan === 0 ? "menos de un día" : `${quedan} días`}</strong>
                  {" · hasta el "}
                  {fecha(cuenta.caduca)}
                </>
              )}
            </p>
          ) : (
            <p className="cuenta-hero-estado">Acceso sin fecha de fin</p>
          )}
        </div>
        <div className="cuenta-hero-acciones">
          {(caducado || urgente) && proveedor.soporte && (
            <a
              className="btn btn-primary"
              href={enlaceSoporte(proveedor.soporte, `Hola, quiero renovar mi acceso (usuario ${cuenta.usuario})`)}
              target={proveedor.soporte.includes("@") ? undefined : "_blank"}
              rel="noreferrer"
            >
              Renovar con {proveedor.nombre}
            </a>
          )}
          <Link href="/player" className={`btn ${caducado || urgente ? "btn-ghost" : "btn-primary"}`}>
            <Icon name="play" size={16} /> Ver la tele
          </Link>
        </div>
      </section>

      {aviso && (
        <div
          className={aviso.tipo === "ok" ? "badge badge-success" : "error-box"}
          style={{ display: "block", padding: "12px 16px", marginBottom: 20 }}
          role="status"
        >
          {aviso.texto}
        </div>
      )}

      <div className="cuenta-cols">
        <section className="card cuenta-bloque">
          <h3>Tu acceso</h3>
          <div className="cuenta-fila">
            <span>Usuario</span>
            <code className="cred">{cuenta.usuario}</code>
          </div>
          <div className="cuenta-fila">
            <span>Estado</span>
            <span className={`badge ${cuenta.estado === "active" ? "badge-success" : ""}`}>
              {cuenta.estado === "active" ? "Activo" : "Desactivado"}
            </span>
          </div>
          <div className="cuenta-fila">
            <span>Cliente desde</span>
            <b>{fecha(cuenta.alta)}</b>
          </div>

          <div className="cuenta-acciones">
            <button className="btn btn-ghost btn-sm" onClick={() => setCambiando((c) => !c)}>
              <Icon name="lock" size={15} /> Cambiar contraseña
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
                <label className="label" htmlFor="cc-nueva">Nueva</label>
                <input id="cc-nueva" name="nueva" type="password" className="input" required minLength={4} autoComplete="new-password" />
              </div>
              <div className="auth-field">
                <label className="label" htmlFor="cc-repetir">Repítela</label>
                <input id="cc-repetir" name="repetir" type="password" className="input" required minLength={4} autoComplete="new-password" />
              </div>
              <button className="btn btn-primary btn-sm" type="submit">Guardar</button>
            </form>
          )}
        </section>

        <section className="card cuenta-bloque">
          <h3>Dispositivos y perfiles</h3>

          <div className="cuenta-medidor">
            <div className="cuenta-medidor-txt">
              <span>Dispositivos</span>
              <b>{dispositivos.length} de {cuenta.maxDispositivos}</b>
            </div>
            <div className="panel-meter">
              <div style={{ width: `${Math.min(100, (dispositivos.length / Math.max(1, cuenta.maxDispositivos)) * 100)}%` }} />
            </div>
          </div>

          {dispositivos.length > 0 && (
            <ul className="cuenta-dispositivos">
              {dispositivos.map((d) => (
                <li key={d.id}>
                  <Icon name="device" size={16} />
                  <span className="cuenta-disp-nombre">{PLATAFORMA[d.plataforma] || d.nombre}</span>
                  <span className="cuenta-disp-visto">{cuandoFue(d.visto)}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="cuenta-medidor" style={{ marginTop: 18 }}>
            <div className="cuenta-medidor-txt">
              <span>Perfiles</span>
              <b>{cuenta.perfiles} de {cuenta.maxPerfiles}</b>
            </div>
            <div className="panel-meter">
              <div style={{ width: `${Math.min(100, (cuenta.perfiles / Math.max(1, cuenta.maxPerfiles)) * 100)}%` }} />
            </div>
          </div>

          {/* Vender un perfil más es la ampliación que más se pide: el precio
              lo pone el proveedor y el mensaje va escrito */}
          {puedeComprarPerfiles ? (
            <div className="cuenta-oferta">
              <div>
                <strong>¿Necesitas más perfiles?</strong>
                <p>
                  {proveedor.precioPerfil.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  {" €/mes cada uno, con "}{proveedor.nombre}.
                </p>
              </div>
              <a
                className="btn btn-primary btn-sm"
                href={enlaceSoporte(
                  proveedor.soporte,
                  `Hola, quiero añadir un perfil más a mi cuenta (usuario ${cuenta.usuario})`
                )}
                target={proveedor.soporte.includes("@") ? undefined : "_blank"}
                rel="noreferrer"
              >
                Pedir uno más
              </a>
            </div>
          ) : (
            <p className="cuenta-nota">
              ¿Necesitas más dispositivos o perfiles, o liberar uno? Pídeselo a {proveedor.nombre}.
            </p>
          )}
        </section>

        <section className="card cuenta-bloque">
          <h3>Tu proveedor</h3>
          <p className="cuenta-proveedor">{proveedor.nombre}</p>
          {proveedor.soporte ? (
            <>
              <p className="cuenta-nota" style={{ marginTop: 4 }}>Escríbele si algo no va o quieres renovar.</p>
              <a
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 12 }}
                href={enlaceSoporte(proveedor.soporte, `Hola, soy ${cuenta.usuario}`)}
                target={proveedor.soporte.includes("@") ? undefined : "_blank"}
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
