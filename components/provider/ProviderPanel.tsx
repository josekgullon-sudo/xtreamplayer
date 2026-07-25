"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface Customer {
  id: number;
  username: string;
  label: string;
  playlistType: "xtream" | "m3u";
  playlistUrl: string;
  playlistUsername: string;
  maxDevices: number;
  devices: number;
  expiresAt: number;
  status: string;
  createdAt: number;
}

interface Status {
  planName: string;
  onTrial: boolean;
  active: boolean;
  maxCustomers: number;
  usedCustomers: number;
  expiresAt: number;
}

interface Plan {
  id: string;
  name: string;
  priceMonth: number;
  maxCustomers: number;
  pricePerCustomer: number;
}

function formatDate(ts: number) {
  return ts ? new Date(ts).toLocaleDateString("es-ES") : "—";
}

export default function ProviderPanel() {
  const [loaded, setLoaded] = useState(false);
  const [provider, setProvider] = useState<{ email: string; company: string } | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);

  const loadCustomers = useCallback(async (q = "") => {
    const res = await fetch(`/api/provider/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    if (!res.ok) return;
    const data = await res.json();
    setCustomers(data.customers || []);
    setStatus(data.status || null);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") setNotice("¡Plan contratado! Se activará en unos segundos.");

    fetch("/api/provider/auth")
      .then((r) => r.json())
      .then(async (d) => {
        if (!d.provider) {
          window.location.href = "/proveedores/login";
          return;
        }
        setProvider(d.provider);
        setStatus(d.status);
        await loadCustomers();
        const p = await fetch("/api/provider/plans").then((r) => r.json());
        setPlans(p.plans || []);
      })
      .catch(() => setError("No se pudo cargar el panel"))
      .finally(() => setLoaded(true));
  }, [loadCustomers]);

  useEffect(() => {
    const t = setTimeout(() => loadCustomers(search), 300);
    return () => clearTimeout(t);
  }, [search, loadCustomers]);

  async function createCustomer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload = {
      username: String(form.get("username") || ""),
      password: String(form.get("password") || ""),
      label: String(form.get("label") || ""),
      playlistType: String(form.get("playlistType") || "xtream"),
      playlistUrl: String(form.get("playlistUrl") || ""),
      playlistUsername: String(form.get("playlistUsername") || ""),
      playlistPassword: String(form.get("playlistPassword") || ""),
      maxDevices: Number(form.get("maxDevices") || 2),
    };
    const res = await fetch("/api/provider/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "No se pudo crear el cliente");
      if (data.needsUpgrade || data.needsPlan) setShowPlans(true);
      return;
    }
    setCreated({ username: payload.username, password: payload.password });
    setShowNew(false);
    loadCustomers(search);
  }

  async function patchCustomer(id: number, body: Record<string, unknown>) {
    const res = await fetch(`/api/provider/customers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) loadCustomers(search);
    else setError((await res.json()).error || "No se pudo actualizar");
  }

  async function removeCustomer(c: Customer) {
    if (!confirm(`¿Eliminar al cliente «${c.username}»? Perderá el acceso inmediatamente.`)) return;
    await fetch(`/api/provider/customers/${c.id}`, { method: "DELETE" });
    loadCustomers(search);
  }

  async function subscribe(planId: string) {
    const res = await fetch("/api/provider/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "No se pudo iniciar el pago");
      return;
    }
    window.location.href = data.url;
  }

  async function logout() {
    await fetch("/api/provider/auth", { method: "DELETE" });
    window.location.href = "/";
  }

  if (!loaded) {
    return (
      <div className="auth-wrap">
        <div className="pa-spinner" />
      </div>
    );
  }
  if (!provider) return null;

  const pct = status && status.maxCustomers ? Math.min(100, (status.usedCustomers / status.maxCustomers) * 100) : 0;

  return (
    <div className="panel-wrap">
      <div className="panel-head">
        <div>
          <h1>Panel de proveedor</h1>
          <p className="panel-sub">{provider.company || provider.email}</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/player" className="btn btn-ghost btn-sm">
            Ver reproductor
          </Link>
          <button className="btn btn-ghost btn-sm" onClick={logout}>
            Salir
          </button>
        </div>
      </div>

      {notice && (
        <div className="badge badge-success" style={{ display: "block", padding: "12px 16px", marginBottom: 18 }}>
          {notice}
        </div>
      )}
      {error && (
        <div className="error-box" style={{ marginBottom: 18 }} role="alert">
          {error}
        </div>
      )}

      {/* Resumen del plan */}
      <div className="panel-cards">
        <div className="panel-card">
          <span className="panel-card-label">Plan actual</span>
          <span className="panel-card-value">{status?.planName}</span>
          {status?.onTrial && <span className="badge badge-accent">Prueba gratuita</span>}
        </div>
        <div className="panel-card">
          <span className="panel-card-label">Clientes</span>
          <span className="panel-card-value">
            {status?.usedCustomers} <small>/ {status?.maxCustomers}</small>
          </span>
          <div className="panel-meter">
            <div style={{ width: `${pct}%`, background: pct > 90 ? "var(--danger)" : "var(--accent)" }} />
          </div>
        </div>
        <div className="panel-card">
          <span className="panel-card-label">Renovación</span>
          <span className="panel-card-value">{formatDate(status?.expiresAt || 0)}</span>
        </div>
        <div className="panel-card" style={{ justifyContent: "center" }}>
          <button className="btn btn-primary" onClick={() => setShowPlans(true)}>
            {status?.onTrial ? "Contratar plan" : "Cambiar de plan"}
          </button>
        </div>
      </div>

      {/* Credenciales recién creadas */}
      {created && (
        <div className="card" style={{ marginBottom: 20, borderColor: "var(--success)" }}>
          <h3 style={{ marginBottom: 8 }}>Cliente creado — entrega estos datos</h3>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <span className="label">Usuario</span>
              <code className="cred">{created.username}</code>
            </div>
            <div>
              <span className="label">Contraseña</span>
              <code className="cred">{created.password}</code>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() =>
                navigator.clipboard?.writeText(`Usuario: ${created.username}\nContraseña: ${created.password}`)
              }
            >
              Copiar
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setCreated(null)}>
              Cerrar
            </button>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 12 }}>
            Tu cliente entra en <strong>/acceso</strong> con estos datos y verá su lista cargada automáticamente.
          </p>
        </div>
      )}

      {/* Clientes */}
      <div className="panel-toolbar">
        <input
          className="input"
          placeholder="Buscar cliente por usuario o nombre…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 340 }}
        />
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          + Nuevo cliente
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="panel-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Nombre</th>
              <th>Lista</th>
              <th>Dispositivos</th>
              <th>Estado</th>
              <th>Alta</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!customers.length && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--text-faint)", padding: 30 }}>
                  {search ? "Sin resultados" : "Aún no tienes clientes. Crea el primero."}
                </td>
              </tr>
            )}
            {customers.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.username}</strong></td>
                <td>{c.label || "—"}</td>
                <td><span className="badge badge-accent">{c.playlistType === "xtream" ? "Xtream" : "M3U"}</span></td>
                <td>
                  {c.devices}/{c.maxDevices}
                  {c.devices > 0 && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ marginLeft: 8 }}
                      onClick={() => patchCustomer(c.id, { resetDevices: true })}
                      title="Liberar dispositivos"
                    >
                      Liberar
                    </button>
                  )}
                </td>
                <td>
                  <span className={`badge ${c.status === "active" ? "badge-success" : ""}`}>
                    {c.status === "active" ? "Activo" : "Desactivado"}
                  </span>
                </td>
                <td style={{ color: "var(--text-faint)" }}>{formatDate(c.createdAt)}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => patchCustomer(c.id, { status: c.status === "active" ? "disabled" : "active" })}
                  >
                    {c.status === "active" ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const pass = prompt(`Nueva contraseña para ${c.username}:`);
                      if (pass) patchCustomer(c.id, { password: pass });
                    }}
                  >
                    Contraseña
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => removeCustomer(c)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal: nuevo cliente */}
      {showNew && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowNew(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Nuevo cliente">
            <h2>Nuevo cliente</h2>
            <p className="modal-sub">
              Crea el acceso y entrégaselo a tu cliente. Al entrar tendrá su lista ya cargada.
            </p>
            <form onSubmit={createCustomer}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="auth-field">
                  <label className="label" htmlFor="c-user">Usuario de acceso</label>
                  <input id="c-user" name="username" className="input" required placeholder="cliente01" />
                </div>
                <div className="auth-field">
                  <label className="label" htmlFor="c-pass">Contraseña</label>
                  <input id="c-pass" name="password" className="input" required placeholder="mínimo 4 caracteres" />
                </div>
              </div>
              <div className="auth-field">
                <label className="label" htmlFor="c-label">Nombre o referencia (opcional)</label>
                <input id="c-label" name="label" className="input" placeholder="Juan Pérez — pack anual" />
              </div>

              <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "18px 0" }} />
              <p className="label" style={{ marginBottom: 12 }}>Lista que verá este cliente</p>

              <div className="auth-field">
                <label className="label" htmlFor="c-type">Tipo</label>
                <select id="c-type" name="playlistType" className="input" defaultValue="xtream">
                  <option value="xtream">Xtream Codes</option>
                  <option value="m3u">URL M3U</option>
                </select>
              </div>
              <div className="auth-field">
                <label className="label" htmlFor="c-url">Servidor o URL</label>
                <input
                  id="c-url"
                  name="playlistUrl"
                  className="input"
                  required
                  placeholder="http://servidor.com:8080 — o pega la URL get.php del cliente"
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="auth-field">
                  <label className="label" htmlFor="c-pluser">Usuario Xtream del cliente</label>
                  <input id="c-pluser" name="playlistUsername" className="input" autoComplete="off" />
                </div>
                <div className="auth-field">
                  <label className="label" htmlFor="c-plpass">Contraseña Xtream</label>
                  <input id="c-plpass" name="playlistPassword" className="input" autoComplete="off" />
                </div>
              </div>
              <div className="auth-field">
                <label className="label" htmlFor="c-devices">Dispositivos permitidos</label>
                <input id="c-devices" name="maxDevices" className="input" type="number" min={1} max={10} defaultValue={2} />
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 10 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowNew(false)} data-tv-close>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">Crear cliente</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: planes */}
      {showPlans && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowPlans(false)}>
          <div className="modal" style={{ maxWidth: 900 }} role="dialog" aria-modal="true" aria-label="Planes">
            <h2>Planes para proveedores</h2>
            <p className="modal-sub">Paga por tramo de clientes. Cambia de plan cuando quieras.</p>
            <div className="plan-grid">
              {plans.map((p) => (
                <button key={p.id} className="plan-tile" onClick={() => subscribe(p.id)}>
                  <span className="plan-tile-name">{p.name}</span>
                  <span className="plan-tile-price">{p.priceMonth}€<small>/mes</small></span>
                  <span className="plan-tile-users">{p.maxCustomers.toLocaleString("es-ES")} clientes</span>
                  <span className="plan-tile-unit">{p.pricePerCustomer.toFixed(2)}€ por cliente</span>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
              <button className="btn btn-ghost" onClick={() => setShowPlans(false)} data-tv-close>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
