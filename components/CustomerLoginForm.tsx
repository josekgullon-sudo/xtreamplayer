"use client";

import Link from "next/link";
import { useState } from "react";
import { getDeviceKey, getPlatform } from "@/lib/device";
import Loading, { MENSAJES_ACCESO } from "@/components/Loading";

/** Un aparato del cliente, como lo manda el servidor. Ver lib/provider.ts */
interface Aparato {
  llave: string;
  plataforma: string;
  desde: number;
  visto: number;
}

/**
 * «Hace 3 días», que es como se reconoce un aparato propio.
 *
 * Una fecha exacta no dice nada —nadie recuerda el día que encendió la tele
 * del pueblo—; el tiempo que hace, sí.
 */
function haceCuanto(cuando: number): string {
  const min = Math.round((Date.now() - cuando) / 60000);
  if (min < 2) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} ${h === 1 ? "hora" : "horas"}`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
}

/** Acceso del cliente final con las credenciales que le dio su proveedor. */
export default function CustomerLoginForm({
  brandName,
  support,
  embedded,
}: {
  brandName?: string;
  support?: string;
  /** Dentro del selector de acceso no lleva su propio contenedor de página */
  embedded?: boolean;
} = {}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * Los aparatos que ocupan el cupo, cuando no cabe uno más.
   *
   * Aquí se le soltaba «has alcanzado el límite de 2 dispositivos, pide a
   * tu proveedor que libere uno» y se le dejaba fuera: una llamada de
   * teléfono para algo que casi siempre es su propia tele, la que se dejó
   * encendida en otra casa o la del móvil que cambió. Con la lista delante,
   * cierra uno y entra.
   */
  const [ocupados, setOcupados] = useState<Aparato[] | null>(null);

  async function submit(e: React.FormEvent, liberar?: string) {
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
          liberar,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        // Si parece un email, puede ser una cuenta propia de TOTALplayer
        // (las de sincronizar listas). Un solo formulario para ambos casos.
        if (res.status === 401 && username.includes("@")) {
          const own = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: username, password }),
          });
          if (own.ok) {
            window.location.href = "/player";
            return;
          }
        }
        if (res.status === 403 && Array.isArray(data.dispositivos) && data.dispositivos.length) {
          setOcupados(data.dispositivos as Aparato[]);
        }
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

  const content = (
    <div className="card auth-card" style={embedded ? { maxWidth: "none" } : undefined}>
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
        {/*
          Y cuáles son, para que elija.
          «Android TV · hace 3 días» es lo que le permite reconocer la tele
          de la casa del pueblo sin saber qué es una MAC.
        */}
        {ocupados && (
          <div className="aparatos-cupo">
            <p className="aparatos-t">Aparatos usando esta cuenta</p>
            {ocupados.map((d) => (
              <div className="aparato" key={d.llave}>
                <span className="aparato-que">
                  <b>{d.plataforma}</b>
                  <span>{haceCuanto(d.visto)}</span>
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={(e) => submit(e, d.llave)}
                >
                  Cerrar y entrar aquí
                </button>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={submit}>
          <div className="auth-field">
            <label className="label" htmlFor="cu-user">Usuario o email</label>
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
          {busy && <Loading messages={MENSAJES_ACCESO} compact />}
        </form>
        {support ? (
          <p className="auth-alt" style={{ fontSize: 13 }}>
            ¿Problemas para entrar? Escribe a <strong>{support}</strong>
          </p>
        ) : !embedded ? (
          <p className="auth-alt" style={{ fontSize: 13 }}>
            ¿Tienes tu propia lista M3U o Xtream? <Link href="/player">Úsala aquí sin registro</Link>
          </p>
        ) : null}
    </div>
  );

  return embedded ? content : <div className="auth-wrap escena">{content}</div>;
}
