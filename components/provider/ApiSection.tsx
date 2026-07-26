"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import Loading from "@/components/Loading";

/**
 * API pública del proveedor: su clave y la documentación de los endpoints.
 * La clave completa solo se enseña en el momento de generarla — después,
 * únicamente el prefijo, porque ni siquiera nosotros la guardamos.
 */
export default function ApiSection() {
  const [estado, setEstado] = useState<{ active: boolean; prefix: string | null } | null>(null);
  const [claveNueva, setClaveNueva] = useState<string | null>(null);
  const [copiada, setCopiada] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    fetch("/api/provider/apikey")
      .then((r) => r.json())
      .then(setEstado)
      .catch(() => {});
  }, []);

  async function generar() {
    if (estado?.active && !confirm("Generar una clave nueva invalida la anterior al momento. ¿Seguro?")) return;
    setTrabajando(true);
    const res = await fetch("/api/provider/apikey", { method: "POST" });
    const data = await res.json();
    setTrabajando(false);
    if (res.ok) {
      setClaveNueva(data.key);
      setCopiada(false);
      setEstado({ active: true, prefix: data.prefix });
    }
  }

  async function revocar() {
    if (!confirm("¿Revocar la clave? Cualquier integración que la use dejará de funcionar.")) return;
    setTrabajando(true);
    await fetch("/api/provider/apikey", { method: "DELETE" });
    setTrabajando(false);
    setEstado({ active: false, prefix: null });
    setClaveNueva(null);
  }

  if (!estado) return <Loading messages={["Cargando el estado de tu API…"]} compact />;

  const base = typeof window !== "undefined" ? window.location.origin : "https://totalplayer.app";
  const clave = claveNueva || "tp_TU_CLAVE";

  return (
    <>
      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginBottom: 6 }}>Tu clave de API</h3>
        <p className="panel-sub" style={{ marginBottom: 16 }}>
          Conecta tu propio panel, tu web o tus automatizaciones: altas, bajas y renovaciones de clientes sin entrar aquí.
        </p>

        {claveNueva ? (
          <div className="api-clave-nueva">
            <p className="api-aviso">
              <Icon name="alert" size={15} /> Guárdala ahora: es la única vez que se muestra entera.
            </p>
            <div className="api-clave-caja">
              <code>{claveNueva}</code>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  navigator.clipboard?.writeText(claveNueva);
                  setCopiada(true);
                }}
              >
                <Icon name={copiada ? "check" : "copy"} size={14} /> {copiada ? "Copiada" : "Copiar"}
              </button>
            </div>
          </div>
        ) : estado.active ? (
          <p style={{ marginBottom: 16 }}>
            Clave activa: <code className="api-prefijo">{estado.prefix}…</code>
          </p>
        ) : (
          <p style={{ marginBottom: 16, color: "var(--text-dim)" }}>Aún no tienes clave. Genera una para empezar.</p>
        )}

        <div className="row-actions">
          <button className="btn btn-primary btn-sm" onClick={generar} disabled={trabajando}>
            {estado.active ? "Generar clave nueva" : "Generar clave"}
          </button>
          {estado.active && (
            <button className="btn btn-danger btn-sm" onClick={revocar} disabled={trabajando}>
              Revocar
            </button>
          )}
        </div>
      </div>

      <div className="card api-docs">
        <h3 style={{ marginBottom: 6 }}>Cómo se usa</h3>
        <p className="panel-sub" style={{ marginBottom: 18 }}>
          Todas las peticiones llevan la clave en la cabecera <code>Authorization</code>. Respuestas en JSON.
        </p>

        <h4>Estado de tu cuenta</h4>
        <pre className="api-ejemplo">{`curl ${base}/api/v1/me \\
  -H "Authorization: Bearer ${clave}"`}</pre>

        <h4>Listar clientes</h4>
        <pre className="api-ejemplo">{`curl "${base}/api/v1/customers?q=&status=active&limit=100" \\
  -H "Authorization: Bearer ${clave}"`}</pre>

        <h4>Dar de alta un cliente</h4>
        <p className="api-nota">
          Con <code>domainId</code> de tus dominios (consulta <code>/api/v1/domains</code>) el cliente queda enganchado al
          dominio: si algún día lo cambias, todos migran de golpe.
        </p>
        <pre className="api-ejemplo">{`curl -X POST ${base}/api/v1/customers \\
  -H "Authorization: Bearer ${clave}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "username": "cliente1",
    "password": "secreta123",
    "domainId": 1,
    "playlistUsername": "usuario_iptv",
    "playlistPassword": "clave_iptv",
    "expiresAt": 1790000000000,
    "maxProfiles": 3
  }'`}</pre>

        <h4>Renovar, suspender o cambiar la contraseña</h4>
        <pre className="api-ejemplo">{`curl -X PATCH ${base}/api/v1/customers/42 \\
  -H "Authorization: Bearer ${clave}" \\
  -H "Content-Type: application/json" \\
  -d '{ "expiresAt": 1795000000000, "status": "active" }'`}</pre>

        <h4>Dar de baja</h4>
        <pre className="api-ejemplo">{`curl -X DELETE ${base}/api/v1/customers/42 \\
  -H "Authorization: Bearer ${clave}"`}</pre>

        <p className="api-nota" style={{ marginTop: 16 }}>
          Los errores vuelven como <code>{`{ "error": { "message", "status" } }`}</code>. La API aplica los mismos límites
          que el panel: el cupo de tu plan también cuenta aquí.
        </p>
      </div>
    </>
  );
}
