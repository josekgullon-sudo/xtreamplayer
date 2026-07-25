"use client";

import { useCallback, useEffect, useState } from "react";
import Icon, { IconName } from "@/components/Icon";
import Loading, { MENSAJES_CLIENTE } from "@/components/Loading";

interface Detail {
  customer: {
    id: number;
    username: string;
    password: string;
    label: string;
    status: string;
    createdAt: number;
    expiresAt: number;
    lastSeen: number;
    maxDevices: number;
  };
  playlist: { type: string; url: string; username: string; password: string };
  devices: { id: number; key: string; platform: string; ip: string; firstSeen: number; lastSeen: number }[];
  logins: { id: number; platform: string; ip: string; ok: boolean; at: number }[];
}

const PLATFORM_LABEL: Record<string, string> = {
  web: "Navegador",
  samsung: "Samsung TV",
  lg: "LG TV",
  firetv: "Fire TV",
  android: "Android",
  ios: "iPhone / iPad",
};

function platformIcon(platform: string): IconName {
  if (platform === "samsung" || platform === "lg" || platform === "firetv") return "tv";
  if (platform === "android" || platform === "ios") return "device";
  return "device";
}

function timeAgo(ts: number): string {
  if (!ts) return "Nunca";
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "Ahora mismo";
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Ayer";
  if (days < 30) return `Hace ${days} días`;
  return new Date(ts).toLocaleDateString("es-ES");
}

function fullDate(ts: number): string {
  return ts ? new Date(ts).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "—";
}

/** Campo con valor oculto que se revela y se copia. */
function Secret({ label, value }: { label: string; value: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!value) {
    return (
      <div className="detail-row">
        <span className="detail-key">{label}</span>
        <span className="detail-val" style={{ color: "var(--text-faint)" }}>
          No disponible
        </span>
      </div>
    );
  }

  return (
    <div className="detail-row">
      <span className="detail-key">{label}</span>
      <span className="detail-val">
        <code className="detail-secret">{shown ? value : "•".repeat(Math.min(value.length, 12))}</code>
        <button className="icon-btn" onClick={() => setShown(!shown)} title={shown ? "Ocultar" : "Mostrar"}>
          <Icon name={shown ? "eyeOff" : "eye"} size={15} />
        </button>
        <button
          className="icon-btn"
          onClick={() => {
            navigator.clipboard?.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          title="Copiar"
        >
          <Icon name={copied ? "check" : "copy"} size={15} />
        </button>
      </span>
    </div>
  );
}

export default function CustomerDetail({
  customerId,
  onBack,
  onChanged,
}: {
  customerId: number;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [tab, setTab] = useState<"lista" | "dispositivos" | "actividad">("lista");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/provider/customers/${customerId}`);
    if (!res.ok) {
      setError("No se pudo cargar el cliente");
      return;
    }
    setData(await res.json());
  }, [customerId]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/provider/customers/${customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError((await res.json()).error || "No se pudo actualizar");
      return;
    }
    load();
    onChanged();
  }

  if (error) return <div className="error-box">{error}</div>;
  if (!data) return <Loading messages={MENSAJES_CLIENTE} compact />;

  const { customer, playlist, devices, logins } = data;
  const activo = customer.status === "active";
  const caducado = customer.expiresAt > 0 && customer.expiresAt < Date.now();

  return (
    <div className="detail">
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 18 }}>
        <Icon name="back" size={15} /> Volver a clientes
      </button>

      {/* Cabecera */}
      <div className="detail-hero">
        <div className="detail-avatar">{customer.username.slice(0, 2).toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 22 }}>{customer.username}</h2>
            <span className={`badge ${activo && !caducado ? "badge-success" : "badge-warn"}`}>
              {caducado ? "Caducado" : activo ? "Activo" : "Desactivado"}
            </span>
          </div>
          <p style={{ color: "var(--text-dim)", fontSize: 14 }}>{customer.label || "Sin nombre"}</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const pass = prompt(`Nueva contraseña para ${customer.username}:`);
              if (pass) patch({ password: pass });
            }}
          >
            <Icon name="pencil" size={14} /> Cambiar contraseña
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => patch({ status: activo ? "disabled" : "active" })}>
            <Icon name={activo ? "lock" : "unlock"} size={14} /> {activo ? "Desactivar" : "Activar"}
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div className="detail-stats">
        <div className="detail-stat">
          <Icon name="shield" size={18} className="detail-stat-icon" />
          <div>
            <span className="detail-stat-label">Estado</span>
            <span className="detail-stat-value" style={{ color: activo && !caducado ? "var(--success)" : "var(--warning)" }}>
              {caducado ? "Caducado" : activo ? "Activo" : "Inactivo"}
            </span>
          </div>
        </div>
        <div className="detail-stat">
          <Icon name="device" size={18} className="detail-stat-icon" />
          <div>
            <span className="detail-stat-label">Dispositivos</span>
            <span className="detail-stat-value">
              {devices.length} <small>/ {customer.maxDevices}</small>
            </span>
          </div>
        </div>
        <div className="detail-stat">
          <Icon name="clock" size={18} className="detail-stat-icon" />
          <div>
            <span className="detail-stat-label">Última conexión</span>
            <span className="detail-stat-value" style={{ fontSize: 17 }}>{timeAgo(customer.lastSeen)}</span>
          </div>
        </div>
        <div className="detail-stat">
          <Icon name="card" size={18} className="detail-stat-icon" />
          <div>
            <span className="detail-stat-label">Caduca</span>
            <span className="detail-stat-value" style={{ fontSize: 17 }}>
              {customer.expiresAt ? new Date(customer.expiresAt).toLocaleDateString("es-ES") : "Sin límite"}
            </span>
          </div>
        </div>
      </div>

      {/* Secciones */}
      <div className="detail-tabs">
        {(
          [
            ["lista", "list", "Acceso y lista"],
            ["dispositivos", "device", `Dispositivos (${devices.length})`],
            ["actividad", "clock", "Actividad"],
          ] as [typeof tab, IconName, string][]
        ).map(([key, icon, label]) => (
          <button key={key} className={`detail-tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
            <Icon name={icon} size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === "lista" && (
        <div className="detail-panels">
          <div className="card">
            <h3 className="detail-card-title">
              <Icon name="lock" size={16} /> Acceso al reproductor
            </h3>
            <p className="detail-card-sub">Lo que tu cliente usa para entrar.</p>
            <div className="detail-row">
              <span className="detail-key">Usuario</span>
              <span className="detail-val">
                <code className="detail-secret">{customer.username}</code>
                <button className="icon-btn" onClick={() => navigator.clipboard?.writeText(customer.username)} title="Copiar">
                  <Icon name="copy" size={15} />
                </button>
              </span>
            </div>
            <Secret label="Contraseña" value={customer.password} />
            <div className="detail-row">
              <span className="detail-key">Alta</span>
              <span className="detail-val">{fullDate(customer.createdAt)}</span>
            </div>
          </div>

          <div className="card">
            <h3 className="detail-card-title">
              <Icon name="list" size={16} /> Lista IPTV
            </h3>
            <p className="detail-card-sub">Las credenciales de su proveedor de contenido.</p>
            <div className="detail-row">
              <span className="detail-key">Servidor</span>
              <span className="detail-val">
                <code className="detail-secret">{playlist.url || "—"}</code>
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-key">Tipo</span>
              <span className="detail-val">
                <span className="badge badge-accent">{playlist.type === "xtream" ? "Xtream Codes" : "M3U"}</span>
              </span>
            </div>
            <Secret label="Usuario IPTV" value={playlist.username} />
            <Secret label="Contraseña IPTV" value={playlist.password} />
          </div>
        </div>
      )}

      {tab === "dispositivos" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
            <div>
              <h3 className="detail-card-title">
                <Icon name="device" size={16} /> Dispositivos vinculados
              </h3>
              <p className="detail-card-sub" style={{ marginBottom: 0 }}>
                {devices.length} de {customer.maxDevices} en uso.
              </p>
            </div>
            {devices.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => patch({ resetDevices: true })}>
                Liberar todos
              </button>
            )}
          </div>

          {!devices.length ? (
            <p className="detail-empty">Este cliente aún no ha entrado desde ningún dispositivo.</p>
          ) : (
            <div className="device-grid">
              {devices.map((d) => (
                <div className="device-card" key={d.id}>
                  <div className="device-icon">
                    <Icon name={platformIcon(d.platform)} size={20} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5 }}>
                      {PLATFORM_LABEL[d.platform] || "Dispositivo"}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>
                      {d.ip || "IP desconocida"} · {timeAgo(d.lastSeen)}
                    </div>
                  </div>
                  <button
                    className="icon-btn"
                    onClick={() => {
                      if (confirm("¿Liberar este dispositivo?")) patch({ removeDevice: d.id });
                    }}
                    title="Liberar dispositivo"
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "actividad" && (
        <div className="card">
          <h3 className="detail-card-title">
            <Icon name="clock" size={16} /> Historial de accesos
          </h3>
          <p className="detail-card-sub">Los 25 accesos más recientes.</p>
          {!logins.length ? (
            <p className="detail-empty">Todavía no hay accesos registrados.</p>
          ) : (
            <div className="activity-list">
              {logins.map((l) => (
                <div className="activity-row" key={l.id}>
                  <span className={`activity-dot ${l.ok ? "ok" : "fail"}`} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: 14 }}>{PLATFORM_LABEL[l.platform] || "Dispositivo"}</strong>
                    <span style={{ color: "var(--text-faint)", fontSize: 12.5, display: "block" }}>
                      {l.ip || "IP desconocida"}
                      {!l.ok && " · Rechazado por límite de dispositivos"}
                    </span>
                  </span>
                  <span style={{ color: "var(--text-dim)", fontSize: 13, whiteSpace: "nowrap" }}>{fullDate(l.at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
