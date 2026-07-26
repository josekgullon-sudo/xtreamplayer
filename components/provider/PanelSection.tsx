"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import Loading from "@/components/Loading";

interface EstadoPanel {
  url: string;
  username: string;
  hasApiKey: boolean;
  connected: boolean;
  checkedAt: number;
}

interface Dominio {
  id: number;
  host: string;
  label: string;
}

interface ResultadoImport {
  via: string;
  total: number;
  creados: number;
  omitidos: { username: string; motivo: string }[];
  omitidosTotal: number;
}

/**
 * Conexión con el panel del proveedor (XUI y compatibles): se conecta una
 * vez con el código de API del panel y desde aquí se importan sus clientes
 * de golpe — sin exportar ni pegar listas, que XUI no facilita.
 */
export default function PanelSection({ onImported }: { onImported: () => void }) {
  const [estado, setEstado] = useState<EstadoPanel | null>(null);
  const [dominios, setDominios] = useState<Dominio[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);

  useEffect(() => {
    fetch("/api/provider/panel").then((r) => r.json()).then((d) => setEstado(d.panel)).catch(() => {});
    fetch("/api/provider/domains").then((r) => r.json()).then((d) => setDominios(d.domains || [])).catch(() => {});
  }, []);

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGuardando(true);
    setAviso(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/provider/panel", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: form.get("url"),
        apiKey: form.get("apiKey"),
        username: form.get("username"),
        password: form.get("password"),
      }),
    });
    const data = await res.json();
    setGuardando(false);
    if (!res.ok) {
      setAviso({ tipo: "error", texto: data.error || "No se pudo guardar" });
      return;
    }
    if (data.verificado) {
      setAviso({ tipo: "ok", texto: `Panel conectado y verificado${data.usuarios ? ` — ${data.usuarios} usuarios a la vista` : ""}.` });
    } else {
      setAviso({
        tipo: "error",
        texto: `Guardado, pero el panel no respondió a la API: ${data.aviso || ""}${data.detalle ? ` — ${data.detalle}` : ""}`,
      });
    }
    const d = await fetch("/api/provider/panel").then((r) => r.json());
    setEstado(d.panel);
  }

  async function desconectar() {
    if (!confirm("¿Desconectar el panel? No borra ningún cliente ya importado.")) return;
    await fetch("/api/provider/panel", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const d = await fetch("/api/provider/panel").then((r) => r.json());
    setEstado(d.panel);
    setAviso(null);
    setResultado(null);
  }

  async function importar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setImportando(true);
    setResultado(null);
    setAviso(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/provider/panel/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domainId: Number(form.get("domainId")), maxProfiles: Number(form.get("maxProfiles") || 1) }),
    });
    const data = await res.json();
    setImportando(false);
    if (!res.ok) {
      setAviso({ tipo: "error", texto: `${data.error || "No se pudo importar"}${data.detalle ? ` — ${data.detalle}` : ""}` });
      return;
    }
    setResultado(data);
    onImported();
  }

  if (!estado) return <Loading messages={["Consultando la conexión con tu panel…"]} compact />;

  return (
    <>
      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginBottom: 6 }}>Conexión con tu panel</h3>
        <p className="panel-sub" style={{ marginBottom: 16 }}>
          Conecta tu panel XUI una vez y trae a tus clientes desde ahí, sin exportar ni pegar listas. El código de API
          se genera en tu panel (sección API / Access codes).
        </p>

        {estado.connected && (
          <p style={{ marginBottom: 16 }}>
            <span className="badge badge-success">Conectado</span>{" "}
            <code className="api-prefijo">{estado.url}</code>
          </p>
        )}

        {aviso && (
          <div className={aviso.tipo === "ok" ? "badge badge-success" : "error-box"} style={{ display: "block", padding: "10px 14px", marginBottom: 16, whiteSpace: "normal" }} role="status">
            {aviso.texto}
          </div>
        )}

        <form onSubmit={guardar}>
          <div className="auth-field">
            <label className="label" htmlFor="pn-url">URL del panel</label>
            <input id="pn-url" name="url" className="input" placeholder="http://mi-panel.com:8080" defaultValue={estado.url} required />
          </div>
          <div className="auth-field">
            <label className="label" htmlFor="pn-key">Código de API del panel (recomendado)</label>
            <input id="pn-key" name="apiKey" className="input" placeholder="El código de acceso de la API de tu XUI" />
          </div>
          <details style={{ marginBottom: 16 }}>
            <summary style={{ cursor: "pointer", fontSize: 13.5, color: "var(--text-dim)" }}>
              Mi panel usa usuario y contraseña de API
            </summary>
            <div className="auth-field" style={{ marginTop: 12 }}>
              <label className="label" htmlFor="pn-user">Usuario</label>
              <input id="pn-user" name="username" className="input" defaultValue={estado.username} />
            </div>
            <div className="auth-field">
              <label className="label" htmlFor="pn-pass">Contraseña</label>
              <input id="pn-pass" name="password" type="password" className="input" />
            </div>
          </details>
          <div className="row-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={guardando}>
              {guardando ? "Comprobando…" : estado.connected ? "Guardar y volver a comprobar" : "Conectar panel"}
            </button>
            {estado.connected && (
              <button type="button" className="btn btn-danger btn-sm" onClick={desconectar}>
                Desconectar
              </button>
            )}
          </div>
        </form>
      </div>

      {estado.connected && (
        <div className="card">
          <h3 style={{ marginBottom: 6 }}>Importar clientes desde el panel</h3>
          <p className="panel-sub" style={{ marginBottom: 16 }}>
            Cada usuario del panel entra como cliente con su mismo usuario y contraseña, conectado al dominio que
            elijas. Los que ya existan se omiten: puedes repetir la importación cuando des altas nuevas.
          </p>

          <form onSubmit={importar}>
            <div className="auth-field">
              <label className="label" htmlFor="pn-dominio">Dominio al que quedarán conectados</label>
              <select id="pn-dominio" name="domainId" className="input" required>
                {!dominios.length && <option value="">Primero añade un dominio en la sección Dominios</option>}
                {dominios.map((d) => (
                  <option key={d.id} value={d.id}>{d.label || d.host}</option>
                ))}
              </select>
            </div>
            <div className="auth-field" style={{ maxWidth: 220 }}>
              <label className="label" htmlFor="pn-perfiles">Perfiles por cliente</label>
              <input id="pn-perfiles" name="maxProfiles" type="number" min={1} max={10} defaultValue={1} className="input" />
            </div>
            <button type="submit" className="btn btn-primary" disabled={importando || !dominios.length}>
              {importando ? "Importando…" : "Importar del panel"}
            </button>
          </form>

          {importando && <Loading messages={["Leyendo los usuarios de tu panel…", "Dando de alta a tus clientes…", "Casi listo…"]} compact />}

          {resultado && (
            <div style={{ marginTop: 18 }}>
              <p>
                <strong>{resultado.creados}</strong> clientes importados de {resultado.total} encontrados
                {resultado.omitidosTotal > 0 ? ` · ${resultado.omitidosTotal} omitidos` : ""} <span className="panel-sub">(vía {resultado.via})</span>
              </p>
              {resultado.omitidos.length > 0 && (
                <table className="panel-table" style={{ marginTop: 12 }}>
                  <thead>
                    <tr><th>Usuario</th><th>Motivo</th></tr>
                  </thead>
                  <tbody>
                    {resultado.omitidos.map((o) => (
                      <tr key={o.username}><td>{o.username}</td><td>{o.motivo}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
