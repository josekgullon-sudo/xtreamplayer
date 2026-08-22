"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "./Icon";

/**
 * Elegir la contraseña nueva desde el enlace del correo.
 *
 * El enlace se comprueba antes de pintar nada: si ya se usó o caducó, no
 * tiene sentido dejar escribir una contraseña para decirle después que no
 * valía.
 */
function RestablecerFormInner() {
  const search = useSearchParams();
  const router = useRouter();
  const token = search.get("token") || "";
  const tipo = search.get("tipo") === "provider" ? "provider" : "user";

  const [estado, setEstado] = useState<"mirando" | "listo" | "caducado" | "guardando" | "hecho">("mirando");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setEstado("caducado");
      return;
    }
    fetch(`/api/auth/recuperar?token=${encodeURIComponent(token)}&tipo=${tipo}`)
      .then((r) => r.json())
      .then((d) => setEstado(d.valido ? "listo" : "caducado"))
      .catch(() => setEstado("caducado"));
  }, [token, tipo]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setEstado("guardando");
    try {
      const res = await fetch("/api/auth/recuperar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, tipo, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No se pudo cambiar la contraseña");
        setEstado("listo");
        return;
      }
      setEstado("hecho");
      // Un par de segundos para leer que ha ido bien, y a entrar
      setTimeout(() => router.push(tipo === "provider" ? "/acceso?rol=proveedor" : "/login"), 2200);
    } catch {
      setError("No se pudo conectar. Revisa tu conexión.");
      setEstado("listo");
    }
  }

  if (estado === "mirando") {
    return (
      <div className="auth-wrap escena">
        <div className="card auth-card">
          <p className="auth-sub">Comprobando el enlace…</p>
        </div>
      </div>
    );
  }

  if (estado === "caducado") {
    return (
      <div className="auth-wrap escena">
        <div className="card auth-card">
          <h1>Este enlace ya no vale</h1>
          <p className="auth-sub">
            Los enlaces caducan a la hora y solo sirven una vez, para que uno reenviado sin querer no abra tu
            cuenta. Pide otro y te llega al momento.
          </p>
          <Link href="/recuperar" className="btn btn-primary" style={{ width: "100%" }}>
            Pedir otro enlace
          </Link>
        </div>
      </div>
    );
  }

  if (estado === "hecho") {
    return (
      <div className="auth-wrap escena">
        <div className="card auth-card">
          <div className="activar-ok" aria-hidden="true">
            <Icon name="check" size={30} />
          </div>
          <h1>Contraseña cambiada</h1>
          <p className="auth-sub">Ya puedes entrar con la nueva. Te llevamos…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap escena">
      <div className="card auth-card">
        <h1>Elige una contraseña nueva</h1>
        <p className="auth-sub">
          {tipo === "provider" ? "Para tu cuenta de proveedor." : "Para tu cuenta de TOTALplayer."}
        </p>

        {error && (
          <div className="error-box" style={{ marginBottom: 16 }} role="alert">
            {error}
          </div>
        )}

        <form onSubmit={guardar}>
          <div className="auth-field">
            <label className="label" htmlFor="res-pass">Contraseña nueva</label>
            <input
              id="res-pass"
              className="input"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <button className="btn btn-primary" style={{ width: "100%" }} disabled={estado === "guardando"}>
            {estado === "guardando" ? "Guardando…" : "Guardar y entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function RestablecerForm() {
  return (
    <Suspense>
      <RestablecerFormInner />
    </Suspense>
  );
}
