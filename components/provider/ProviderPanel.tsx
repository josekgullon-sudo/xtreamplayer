"use client";

import Link from "next/link";
import Icon from "@/components/Icon";
import CustomerDetail from "./CustomerDetail";
import TicketsSection from "./TicketsSection";
import ApiSection from "./ApiSection";
import InvoicesSection from "./InvoicesSection";
import PanelSection from "./PanelSection";
import Loading, { MENSAJES_PANEL } from "@/components/Loading";
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

interface Domain {
  id: number;
  host: string;
  port?: number;
  protocol?: "http" | "https";
  label: string;
  baseUrl?: string;
  customers?: number;
}

interface Reseller {
  id: number;
  email: string;
  name: string;
  viewAllCustomers: boolean;
  domainAccess: "full" | "names" | "none";
  maxCustomers: number;
  customers: number;
  status: string;
}

interface Permissions {
  viewAllCustomers: boolean;
  domainAccess: "full" | "names" | "none";
  manageResellers: boolean;
  managePlan: boolean;
}

const DOMAIN_ACCESS_LABEL: Record<string, string> = {
  full: "Gestiona dominios",
  names: "Solo ve el nombre",
  none: "Sin acceso",
};

function formatDate(ts: number) {
  return ts ? new Date(ts).toLocaleDateString("es-ES") : "—";
}

export default function ProviderPanel() {
  const [loaded, setLoaded] = useState(false);
  const [provider, setProvider] = useState<{ email: string; company: string } | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [perms, setPerms] = useState<Permissions | null>(null);
  const [role, setRole] = useState<"provider" | "reseller">("provider");
  const [tab, setTab] = useState<"clientes" | "dominios" | "revendedores" | "marca" | "plan" | "facturas" | "panel" | "api" | "soporte">("clientes");
  const [branding, setBranding] = useState<{
    name: string;
    color: string;
    logo: string;
    slug: string;
    support: string;
  } | null>(null);
  const [accessUrl, setAccessUrl] = useState("");
  const [showReseller, setShowReseller] = useState<Reseller | "new" | null>(null);
  const [createdReseller, setCreatedReseller] = useState<{ email: string; password: string } | null>(null);
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showDomain, setShowDomain] = useState<Domain | "new" | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    created: number;
    skipped: number;
    slots: number;
    sample: { username: string; password: string; source: string }[];
    errors: { line: number; raw: string; reason: string }[];
  } | null>(null);
  const [importing, setImporting] = useState(false);
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

  const loadDomains = useCallback(async () => {
    const res = await fetch("/api/provider/domains");
    if (!res.ok) return;
    const data = await res.json();
    setDomains(data.domains || []);
  }, []);

  const loadResellers = useCallback(async () => {
    const res = await fetch("/api/provider/resellers");
    if (!res.ok) return;
    const data = await res.json();
    setResellers(data.resellers || []);
  }, []);

  const loadBranding = useCallback(async () => {
    const res = await fetch("/api/provider/branding");
    if (!res.ok) return;
    const data = await res.json();
    setBranding(data.branding);
    setAccessUrl(data.accessUrl || "");
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
        setPerms(d.permissions || null);
        setRole(d.role || "provider");
        await Promise.all([
          loadCustomers(),
          d.permissions?.domainAccess !== "none" ? loadDomains() : Promise.resolve(),
          d.permissions?.manageResellers ? loadResellers() : Promise.resolve(),
          d.permissions?.managePlan ? loadBranding() : Promise.resolve(),
        ]);
        if (d.permissions?.managePlan) {
          const p = await fetch("/api/provider/plans").then((r) => r.json());
          setPlans(p.plans || []);
        }
      })
      .catch(() => setError("No se pudo cargar el panel"))
      .finally(() => setLoaded(true));
  }, [loadCustomers, loadDomains, loadResellers, loadBranding]);

  useEffect(() => {
    const t = setTimeout(() => loadCustomers(search), 300);
    return () => clearTimeout(t);
  }, [search, loadCustomers]);

  // Al volver a una pestaña, refresca sus datos: el panel puede quedarse
  // abierto mientras un revendedor da de alta clientes por su cuenta.
  useEffect(() => {
    if (!loaded) return;
    if (tab !== "clientes") setDetailId(null);
    if (tab === "clientes") loadCustomers(search);
    else if (tab === "dominios") loadDomains();
    else if (tab === "revendedores") loadResellers();
    else if (tab === "marca") loadBranding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function createCustomer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const domainId = Number(form.get("domainId") || 0);
    const payload = {
      username: String(form.get("username") || ""),
      password: String(form.get("password") || ""),
      label: String(form.get("label") || ""),
      domainId: domainId || undefined,
      playlistType: domainId ? "xtream" : String(form.get("playlistType") || "xtream"),
      playlistUrl: String(form.get("playlistUrl") || ""),
      playlistUsername: String(form.get("playlistUsername") || ""),
      playlistPassword: String(form.get("playlistPassword") || ""),
      maxDevices: Number(form.get("maxDevices") || 2),
      maxProfiles: Number(form.get("maxProfiles") || 1),
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

  async function saveDomain(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload = {
      host: String(form.get("host") || ""),
      port: Number(form.get("port") || 80),
      protocol: String(form.get("protocol") || "http"),
      label: String(form.get("label") || ""),
    };
    const editing = showDomain !== "new" && showDomain !== null;
    const res = await fetch(`/api/provider/domains${editing ? `/${(showDomain as Domain).id}` : ""}`, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "No se pudo guardar el dominio");
      return;
    }
    if (editing && data.updatedCustomers > 0) {
      setNotice(
        `Dominio actualizado. ${data.updatedCustomers} cliente${data.updatedCustomers === 1 ? "" : "s"} apuntan ya al nuevo destino.`
      );
    }
    setShowDomain(null);
    loadDomains();
    loadCustomers(search);
  }

  async function removeDomain(d: Domain) {
    if (!confirm(`¿Eliminar el dominio «${d.host}»?`)) return;
    const res = await fetch(`/api/provider/domains/${d.id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json()).error || "No se pudo eliminar");
    loadDomains();
  }

  async function saveReseller(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const editing = showReseller !== "new" && showReseller !== null;
    const payload: Record<string, unknown> = {
      name: String(form.get("name") || ""),
      viewAllCustomers: form.get("viewAllCustomers") === "on",
      domainAccess: String(form.get("domainAccess") || "names"),
      maxCustomers: Number(form.get("maxCustomers") || 0),
    };
    if (!editing) {
      payload.email = String(form.get("email") || "");
      payload.password = String(form.get("password") || "");
    } else if (form.get("password")) {
      payload.password = String(form.get("password"));
    }

    const res = await fetch(`/api/provider/resellers${editing ? `/${(showReseller as Reseller).id}` : ""}`, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "No se pudo guardar el revendedor");
      return;
    }
    if (!editing) {
      setCreatedReseller({ email: String(payload.email), password: String(payload.password) });
    }
    setShowReseller(null);
    loadResellers();
  }

  async function patchReseller(id: number, body: Record<string, unknown>) {
    const res = await fetch(`/api/provider/resellers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) loadResellers();
    else setError((await res.json()).error || "No se pudo actualizar");
  }

  async function removeReseller(r: Reseller) {
    if (
      !confirm(
        `¿Eliminar al revendedor «${r.email}»?\n\nSus ${r.customers} cliente${r.customers === 1 ? "" : "s"} NO se borrarán: pasarán a depender de ti directamente.`
      )
    )
      return;
    const res = await fetch(`/api/provider/resellers/${r.id}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok && data.movedCustomers > 0) {
      setNotice(`Revendedor eliminado. ${data.movedCustomers} cliente(s) han pasado a tu cuenta.`);
    }
    loadResellers();
    loadCustomers(search);
  }

  async function runImport(dryRun: boolean) {
    setError(null);
    setImporting(true);
    try {
      const text = (document.getElementById("imp-text") as HTMLTextAreaElement)?.value || "";
      const domainId = Number((document.getElementById("imp-domain") as HTMLSelectElement)?.value || 0);
      const maxDevices = Number((document.getElementById("imp-devices") as HTMLInputElement)?.value || 2);
      const res = await fetch("/api/provider/customers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, domainId: domainId || undefined, maxDevices, dryRun }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo importar");
        return;
      }
      if (dryRun) {
        setImportPreview(data);
      } else {
        setNotice(
          `Importados ${data.created} cliente${data.created === 1 ? "" : "s"}` +
            (data.skipped ? `. ${data.skipped} línea(s) sin importar.` : ".")
        );
        setShowImport(false);
        setImportPreview(null);
        loadCustomers(search);
      }
    } finally {
      setImporting(false);
    }
  }

  async function saveBranding(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/provider/branding", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("brandName") || ""),
        color: String(form.get("brandColor") || ""),
        logo: String(form.get("brandLogo") || ""),
        slug: String(form.get("brandSlug") || ""),
        support: String(form.get("brandSupport") || ""),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "No se pudo guardar la marca");
      return;
    }
    setNotice("Marca guardada. Tus clientes la verán al entrar.");
    loadBranding();
  }

  async function restablecerMarca() {
    if (!confirm("¿Volver a los colores y el logotipo de fábrica?\n\nTu enlace de acceso no cambia y tus clientes no pierden nada.")) return;
    const res = await fetch("/api/provider/branding", { method: "DELETE" });
    if (!res.ok) {
      setError("No se pudo restablecer la marca");
      return;
    }
    setNotice("Marca restablecida a los valores de fábrica.");
    loadBranding();
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
        <Loading messages={MENSAJES_PANEL} />
      </div>
    );
  }
  if (!provider) return null;

  const pct = status && status.maxCustomers ? Math.min(100, (status.usedCustomers / status.maxCustomers) * 100) : 0;

  const TITULOS: Record<string, string> = {
    clientes: "Clientes",
    revendedores: "Revendedores",
    dominios: "Dominios",
    marca: "Mi marca",
    plan: "Plan y facturación",
    facturas: "Facturas",
    panel: "Conexión del panel",
    api: "API",
    soporte: "Soporte",
  };

  return (
    <div className="panel-layout">
      {/* Menú lateral */}
      <aside className="panel-nav" aria-label="Secciones del panel">
        <div className="panel-nav-head">
          <div className="panel-nav-brand">{provider.company || "Panel"}</div>
          <div className="panel-nav-mail">{provider.email}</div>
        </div>

        <div className="panel-nav-group">Usuarios</div>
        <button
          className={`panel-nav-item ${tab === "clientes" ? "active" : ""}`}
          onClick={() => setTab("clientes")}
        >
          <Icon name="users" size={17} className="panel-nav-icon" /> Clientes
          <span className="panel-nav-count">{customers.length}</span>
        </button>
        {perms?.manageResellers && (
          <button
            className={`panel-nav-item ${tab === "revendedores" ? "active" : ""}`}
            onClick={() => setTab("revendedores")}
          >
            <Icon name="handshake" size={17} className="panel-nav-icon" /> Revendedores
            <span className="panel-nav-count">{resellers.length}</span>
          </button>
        )}

        {(perms?.domainAccess === "full" || perms?.managePlan) && (
          <>
            <div className="panel-nav-group">Configuración</div>
            {perms?.domainAccess === "full" && (
              <button
                className={`panel-nav-item ${tab === "dominios" ? "active" : ""}`}
                onClick={() => setTab("dominios")}
              >
                <Icon name="globe" size={17} className="panel-nav-icon" /> Dominios
                <span className="panel-nav-count">{domains.length}</span>
              </button>
            )}
            {perms?.managePlan && (
              <button
                className={`panel-nav-item ${tab === "marca" ? "active" : ""}`}
                onClick={() => setTab("marca")}
              >
                <Icon name="sparkle" size={17} className="panel-nav-icon" /> Mi marca
              </button>
            )}
          </>
        )}

        {perms?.managePlan && (
          <>
            <div className="panel-nav-group">Facturación</div>
            <button className={`panel-nav-item ${tab === "plan" ? "active" : ""}`} onClick={() => setTab("plan")}>
              <Icon name="card" size={17} className="panel-nav-icon" /> Plan
            </button>
            <button className={`panel-nav-item ${tab === "facturas" ? "active" : ""}`} onClick={() => setTab("facturas")}>
              <Icon name="list" size={17} className="panel-nav-icon" /> Facturas
            </button>

            <div className="panel-nav-group">Herramientas</div>
            <button className={`panel-nav-item ${tab === "panel" ? "active" : ""}`} onClick={() => setTab("panel")}>
              <Icon name="device" size={17} className="panel-nav-icon" /> Mi panel XUI
            </button>
            <button className={`panel-nav-item ${tab === "api" ? "active" : ""}`} onClick={() => setTab("api")}>
              <Icon name="external" size={17} className="panel-nav-icon" /> API
            </button>
            <button className={`panel-nav-item ${tab === "soporte" ? "active" : ""}`} onClick={() => setTab("soporte")}>
              <Icon name="shield" size={17} className="panel-nav-icon" /> Soporte
            </button>
          </>
        )}

        <div className="panel-nav-foot">
          <Link href="/player" className="panel-nav-item">
            <Icon name="play" size={17} className="panel-nav-icon" /> Ver reproductor
          </Link>
          <button className="panel-nav-item" onClick={logout}>
            <Icon name="power" size={17} className="panel-nav-icon" /> Salir
          </button>
        </div>
      </aside>

      <div className="panel-main">
      <div className="panel-head">
        <div>
          <h1>{TITULOS[tab]}</h1>
          <p className="panel-sub">
            {role === "reseller" ? "Revendedor" : "Proveedor"} · {status?.planName}
            {status?.onTrial ? " (prueba)" : ""}
          </p>
        </div>
        <div className="panel-head-stat">
          <span className="panel-card-label">Clientes</span>
          <span className="panel-card-value">
            {status?.usedCustomers} <small>/ {status?.maxCustomers}</small>
          </span>
          <div className="panel-meter">
            <div style={{ width: `${pct}%`, background: pct > 90 ? "var(--danger)" : "var(--accent)" }} />
          </div>
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

      {/* Plan y facturación */}
      {tab === "facturas" && perms?.managePlan && <InvoicesSection />}
      {tab === "panel" && perms?.managePlan && <PanelSection onImported={() => loadCustomers(search)} />}
      {tab === "api" && perms?.managePlan && <ApiSection />}
      {tab === "soporte" && perms?.managePlan && <TicketsSection />}

      {tab === "plan" && perms?.managePlan && (
        <>
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
          </div>

          <h3 style={{ marginBottom: 6 }}>Elige tu plan</h3>
          <p style={{ color: "var(--text-dim)", fontSize: 14, marginBottom: 20 }}>
            Pagas por tramo de clientes. Cambia cuando quieras: cuanto mayor es el tramo, menos pagas por cliente.
          </p>
          <div className="plan-grid">
            {plans.map((p) => (
              <button
                key={p.id}
                className={`plan-tile ${status?.planName === p.name ? "current" : ""}`}
                onClick={() => subscribe(p.id)}
              >
                <span className="plan-tile-name">{p.name}</span>
                <span className="plan-tile-price">
                  {p.priceMonth}€<small>/mes</small>
                </span>
                <span className="plan-tile-users">{p.maxCustomers.toLocaleString("es-ES")} clientes</span>
                <span className="plan-tile-unit">{p.pricePerCustomer.toFixed(2)}€ por cliente</span>
                {status?.planName === p.name && <span className="badge badge-success" style={{ marginTop: 8 }}>Tu plan</span>}
              </button>
            ))}
          </div>
        </>
      )}

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

      {/* Credenciales de revendedor recién creado */}
      {createdReseller && (
        <div className="card" style={{ marginBottom: 20, borderColor: "var(--success)" }}>
          <h3 style={{ marginBottom: 8 }}>Revendedor creado — entrégale estos datos</h3>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <span className="label">Email</span>
              <code className="cred">{createdReseller.email}</code>
            </div>
            <div>
              <span className="label">Contraseña</span>
              <code className="cred">{createdReseller.password}</code>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() =>
                navigator.clipboard?.writeText(`Email: ${createdReseller.email}\nContraseña: ${createdReseller.password}`)
              }
            >
              Copiar
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setCreatedReseller(null)}>
              Cerrar
            </button>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 12 }}>
            Entra en <strong>/proveedores/login</strong> con esos datos y verá este mismo panel con los permisos que
            le has dado.
          </p>
        </div>
      )}

      {/* Revendedores */}
      {tab === "revendedores" && perms?.manageResellers && (
        <>
          <div className="panel-toolbar">
            <p style={{ color: "var(--text-dim)", fontSize: 14, maxWidth: 640 }}>
              Crea accesos para tus revendedores. Entran al mismo panel y tú decides qué pueden ver: solo sus
              clientes o todos, y si acceden a tus dominios, solo al nombre o a nada.
            </p>
            <button className="btn btn-primary" onClick={() => setShowReseller("new")}>
              <Icon name="plus" size={16} /> Nuevo revendedor
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="panel-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Nombre</th>
                  <th>Ve clientes</th>
                  <th>Dominios</th>
                  <th>Clientes</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {!resellers.length && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", color: "var(--text-faint)", padding: 30 }}>
                      Aún no tienes revendedores.
                    </td>
                  </tr>
                )}
                {resellers.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.email}</strong></td>
                    <td>{r.name || "—"}</td>
                    <td>{r.viewAllCustomers ? "Todos" : "Solo los suyos"}</td>
                    <td>
                      <span className="badge badge-accent">{DOMAIN_ACCESS_LABEL[r.domainAccess]}</span>
                    </td>
                    <td>
                      {r.customers}
                      {r.maxCustomers > 0 ? ` / ${r.maxCustomers}` : ""}
                    </td>
                    <td>
                      <span className={`badge ${r.status === "active" ? "badge-success" : ""}`}>
                        {r.status === "active" ? "Activo" : "Desactivado"}
                      </span>
                    </td>
                    <td className="col-actions">
                      <div className="row-actions">
                        <button className="btn btn-ghost btn-sm act-pass" onClick={() => setShowReseller(r)}>
                          Permisos
                        </button>
                        <button
                          className="btn btn-ghost btn-sm act-toggle"
                          onClick={() => patchReseller(r.id, { status: r.status === "active" ? "disabled" : "active" })}
                        >
                          {r.status === "active" ? "Desactivar" : "Activar"}
                        </button>
                        <button className="icon-btn act-del" onClick={() => removeReseller(r)} title="Eliminar revendedor" aria-label="Eliminar revendedor">
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Mi marca */}
      {tab === "marca" && perms?.managePlan && branding && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 520px) 1fr", gap: 28, alignItems: "start" }}>
          {/* La clave fuerza a repintar los campos cuando la marca cambia
              desde fuera del formulario (restablecer): con defaultValue, si
              no, seguirían enseñando lo que había antes */}
          <form className="card" key={`${branding.name}|${branding.color}|${branding.logo}`} onSubmit={saveBranding}>
            <h3 style={{ marginBottom: 6 }}>Marca blanca</h3>
            <p style={{ color: "var(--text-dim)", fontSize: 14, marginBottom: 20 }}>
              Tus clientes verán tu nombre, tu color y tu logotipo, tanto al entrar como dentro del reproductor.
            </p>

            <div className="auth-field">
              <label className="label" htmlFor="b-name">Nombre de tu servicio</label>
              <input id="b-name" name="brandName" className="input" defaultValue={branding.name} placeholder="Mi IPTV" maxLength={60} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="auth-field">
                <label className="label" htmlFor="b-color">Color principal</label>
                <input
                  id="b-color"
                  name="brandColor"
                  className="input"
                  type="color"
                  defaultValue={branding.color || "#e5192b"}
                  style={{ height: 44, padding: 4, cursor: "pointer" }}
                />
              </div>
              <div className="auth-field">
                <label className="label" htmlFor="b-slug">Tu enlace</label>
                <input id="b-slug" name="brandSlug" className="input" defaultValue={branding.slug} placeholder="mi-iptv" />
              </div>
            </div>

            <div className="auth-field">
              <label className="label" htmlFor="b-logo">Logotipo (URL https)</label>
              <input id="b-logo" name="brandLogo" className="input" defaultValue={branding.logo} placeholder="https://…/logo.png" />
            </div>

            <div className="auth-field">
              <label className="label" htmlFor="b-support">Contacto de soporte para tus clientes</label>
              <input id="b-support" name="brandSupport" className="input" defaultValue={branding.support} placeholder="soporte@miiptv.com o un WhatsApp" />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" style={{ flex: 1 }}>Guardar marca</button>
              <button type="button" className="btn btn-ghost" onClick={restablecerMarca}>
                Valores de fábrica
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--text-faint)", marginTop: 10 }}>
              Restablecer deja el nombre, el color y el logotipo como venían. Tu enlace de acceso no cambia.
            </p>
          </form>

          <div>
            {accessUrl && (
              <div className="card" style={{ marginBottom: 20 }}>
                <span className="label">Enlace para tus clientes</span>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <code className="cred" style={{ fontSize: 14 }}>{accessUrl}</code>
                  <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(accessUrl)}>
                    Copiar
                  </button>
                  <a className="btn btn-ghost btn-sm" href={accessUrl} target="_blank" rel="noreferrer">
                    Abrir
                  </a>
                </div>
                <p style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 10 }}>
                  Comparte este enlace en vez de /acceso: tus clientes entrarán viendo tu marca, no la nuestra.
                </p>
              </div>
            )}
            <div className="card">
              <span className="label">Vista previa</span>
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: 24,
                  background: "var(--bg)",
                  textAlign: "center",
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                  {branding.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={branding.logo} alt="" style={{ height: 28, borderRadius: 6 }} />
                  ) : (
                    <span
                      className="logo-mark"
                      style={branding.color ? { background: branding.color, boxShadow: "none" } : undefined}
                    >
                      <Icon name="play" size={16} />
                    </span>
                  )}
                  <strong style={{ fontSize: 18 }}>{branding.name || "Tu marca"}</strong>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={branding.color ? { background: branding.color, boxShadow: "none" } : undefined}
                  disabled
                >
                  Entrar y ver la tele
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dominios */}
      {tab === "dominios" && perms?.domainAccess === "full" && (
        <>
          <div className="panel-toolbar">
            <p style={{ color: "var(--text-dim)", fontSize: 14, maxWidth: 620 }}>
              Configura aquí tus dominios una sola vez. Al dar de alta un cliente solo tendrás que elegirlo y poner
              su usuario y contraseña. <strong>Si un dominio cae o lo bloquean, edítalo aquí y todos sus clientes
              pasarán al nuevo destino automáticamente.</strong>
            </p>
            <button className="btn btn-primary" onClick={() => setShowDomain("new")}>
              <Icon name="plus" size={16} /> Añadir dominio
            </button>
          </div>

          {!domains.length ? (
            <div className="card" style={{ textAlign: "center", padding: 40 }}>
              <p style={{ color: "var(--text-dim)", marginBottom: 16 }}>
                Aún no tienes dominios. Añade el primero y darás de alta clientes en segundos.
              </p>
              <button className="btn btn-primary" onClick={() => setShowDomain("new")}>
                <Icon name="plus" size={16} /> Añadir mi primer dominio
              </button>
            </div>
          ) : (
            <div className="domain-grid">
              {domains.map((d) => (
                <div className="domain-card" key={d.id}>
                  <div className="domain-card-head">
                    <span className={`domain-lock ${d.protocol === "https" ? "secure" : ""}`}>
                      <Icon name={d.protocol === "https" ? "lock" : "unlock"} size={17} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="domain-host">{d.host}</div>
                      <div className="domain-meta">
                        Puerto {d.port} · {(d.protocol ?? "http").toUpperCase()}
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowDomain(d)} title="Editar" aria-label="Editar dominio">
                      <Icon name="pencil" size={15} />
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => removeDomain(d)} title="Eliminar" aria-label="Eliminar dominio">
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                  <div className="domain-card-foot">
                    {d.label && <span className="badge badge-accent">{d.label}</span>}
                    <span style={{ color: "var(--text-faint)", fontSize: 13 }}>
                      {d.customers ?? 0} cliente{d.customers === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Ficha de un cliente */}
      {tab === "clientes" && detailId !== null && (
        <CustomerDetail
          customerId={detailId}
          onBack={() => setDetailId(null)}
          onChanged={() => loadCustomers(search)}
        />
      )}

      {/* Clientes */}
      {tab === "clientes" && detailId === null && (
      <>
      <div className="panel-toolbar">
        <input
          className="input"
          placeholder="Buscar cliente por usuario o nombre…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 340 }}
        />
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => { setImportPreview(null); setShowImport(true); }}>
            <Icon name="upload" size={16} /> Importar
          </button>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            <Icon name="plus" size={16} /> Nuevo cliente
          </button>
        </div>
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
                <td>
                  <button className="link-btn" onClick={() => setDetailId(c.id)}>
                    {c.username}
                  </button>
                </td>
                <td>{c.label || "—"}</td>
                <td><span className="badge badge-accent">{c.playlistType === "xtream" ? "Xtream" : "M3U"}</span></td>
                <td>
                  <span className="devices-cell">
                    <span className={c.devices >= c.maxDevices ? "devices-full" : ""}>
                      {c.devices}/{c.maxDevices}
                    </span>
                    {c.devices > 0 && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => patchCustomer(c.id, { resetDevices: true })}
                        title="Liberar dispositivos"
                      >
                        Liberar
                      </button>
                    )}
                  </span>
                </td>
                <td>
                  <span className={`badge ${c.status === "active" ? "badge-success" : ""}`}>
                    {c.status === "active" ? "Activo" : "Desactivado"}
                  </span>
                </td>
                <td style={{ color: "var(--text-faint)" }}>{formatDate(c.createdAt)}</td>
                <td className="col-actions">
                  <div className="row-actions">
                    <button
                      className="btn btn-ghost btn-sm act-toggle"
                      onClick={() => patchCustomer(c.id, { status: c.status === "active" ? "disabled" : "active" })}
                    >
                      {c.status === "active" ? "Desactivar" : "Activar"}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm act-pass"
                      onClick={() => {
                        const pass = prompt(`Nueva contraseña para ${c.username}:`);
                        if (pass) patchCustomer(c.id, { password: pass });
                      }}
                    >
                      Contraseña
                    </button>
                    <button className="icon-btn act-del" onClick={() => removeCustomer(c)} title="Eliminar cliente" aria-label="Eliminar cliente">
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>
      )}

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

              {domains.length > 0 ? (
                <>
                  <div className="auth-field">
                    <label className="label" htmlFor="c-domain">Dominio</label>
                    <select id="c-domain" name="domainId" className="input" defaultValue={String(domains[0].id)}>
                      {domains.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.host}
                          {d.port ? `:${d.port}` : ""}
                          {d.label ? ` — ${d.label}` : ""}
                        </option>
                      ))}
                      {perms?.domainAccess === "full" && <option value="0">Otro (escribir a mano)</option>}
                    </select>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className="auth-field">
                      <label className="label" htmlFor="c-pluser">Usuario IPTV</label>
                      <input id="c-pluser" name="playlistUsername" className="input" autoComplete="off" required />
                    </div>
                    <div className="auth-field">
                      <label className="label" htmlFor="c-plpass">Contraseña IPTV</label>
                      <input id="c-plpass" name="playlistPassword" className="input" autoComplete="off" required />
                    </div>
                  </div>
                  <details style={{ marginBottom: 14, display: perms?.domainAccess === "full" ? undefined : "none" }}>
                    <summary style={{ cursor: "pointer", fontSize: 13.5, color: "var(--text-dim)" }}>
                      Usar otro servidor o una lista M3U
                    </summary>
                    <div style={{ paddingTop: 12 }}>
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
                          placeholder="Solo si eliges «Otro» arriba"
                        />
                      </div>
                    </div>
                  </details>
                </>
              ) : (
                <>
                  <div
                    className="error-box"
                    style={{ marginBottom: 14, background: "rgba(108,92,231,0.1)", borderColor: "var(--border-strong)", color: "var(--text-dim)" }}
                  >
                    Consejo: añade tus dominios en la pestaña <strong>Dominios</strong> y las altas serán mucho más
                    rápidas.
                  </div>
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
                      <label className="label" htmlFor="c-pluser">Usuario IPTV</label>
                      <input id="c-pluser" name="playlistUsername" className="input" autoComplete="off" />
                    </div>
                    <div className="auth-field">
                      <label className="label" htmlFor="c-plpass">Contraseña IPTV</label>
                      <input id="c-plpass" name="playlistPassword" className="input" autoComplete="off" />
                    </div>
                  </div>
                </>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="auth-field">
                  <label className="label" htmlFor="c-devices">Dispositivos</label>
                  <input id="c-devices" name="maxDevices" className="input" type="number" min={1} max={10} defaultValue={2} />
                </div>
                <div className="auth-field">
                  <label className="label" htmlFor="c-profiles">Perfiles</label>
                  <input id="c-profiles" name="maxProfiles" className="input" type="number" min={1} max={10} defaultValue={1} />
                </div>
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

      {/* Modal: importación masiva */}
      {showImport && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowImport(false)}>
          <div className="modal" style={{ maxWidth: 720 }} role="dialog" aria-modal="true" aria-label="Importar clientes">
            <h2>Importar clientes</h2>
            <p className="modal-sub">
              Pega las credenciales que exportas de tu panel, una por línea. Se crea un acceso por cada una.
            </p>

            <div className="auth-field">
              <label className="label" htmlFor="imp-text">Credenciales</label>
              <textarea
                id="imp-text"
                className="input"
                rows={9}
                style={{ fontFamily: "monospace", fontSize: 13.5, resize: "vertical" }}
                placeholder={"juan21:clave123\nmaria88:otraclave  María López\nhttp://servidor.com:8080/get.php?username=pedro&password=xyz"}
                onChange={() => setImportPreview(null)}
              />
              <p style={{ fontSize: 12.5, color: "var(--text-faint)", marginTop: 6 }}>
                Admite <code>usuario:contraseña</code>, separado por coma, punto y coma o tabulador, y URLs get.php
                completas. Un tercer campo se toma como nombre.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
              <div className="auth-field">
                <label className="label" htmlFor="imp-domain">Dominio</label>
                <select id="imp-domain" className="input" defaultValue={domains[0] ? String(domains[0].id) : "0"}>
                  {domains.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.host}
                      {d.port ? `:${d.port}` : ""}
                    </option>
                  ))}
                  <option value="0">Cada línea trae su URL</option>
                </select>
              </div>
              <div className="auth-field">
                <label className="label" htmlFor="imp-devices">Dispositivos</label>
                <input id="imp-devices" className="input" type="number" min={1} max={10} defaultValue={2} />
              </div>
            </div>

            {importPreview && (
              <div
                className="card"
                style={{ marginBottom: 16, background: "var(--bg)", borderColor: importPreview.created ? "var(--success)" : "var(--border-strong)" }}
              >
                <p style={{ fontSize: 15, marginBottom: 8 }}>
                  Se crearán <strong>{importPreview.created}</strong> cliente{importPreview.created === 1 ? "" : "s"}
                  {importPreview.skipped > 0 && (
                    <> · <span style={{ color: "var(--danger)" }}>{importPreview.skipped} sin importar</span></>
                  )}
                </p>
                {importPreview.sample.length > 0 && (
                  <div style={{ fontSize: 13, color: "var(--text-dim)", fontFamily: "monospace" }}>
                    {importPreview.sample.map((s) => (
                      <div key={s.username}>
                        {s.source} → acceso: <strong>{s.username}</strong>
                      </div>
                    ))}
                    {importPreview.created > importPreview.sample.length && <div>…</div>}
                  </div>
                )}
                {importPreview.errors.length > 0 && (
                  <details style={{ marginTop: 10 }}>
                    <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--danger)" }}>
                      Ver líneas con problemas
                    </summary>
                    <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginTop: 8 }}>
                      {importPreview.errors.map((e) => (
                        <div key={e.line}>
                          Línea {e.line}: {e.reason}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowImport(false)} data-tv-close>
                Cancelar
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => runImport(true)} disabled={importing}>
                Comprobar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => runImport(false)}
                disabled={importing || !importPreview?.created}
                title={!importPreview ? "Pulsa «Comprobar» primero" : ""}
              >
                {importing ? "Importando…" : "Importar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: dominio */}
      {showDomain && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowDomain(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Dominio">
            <h2>{showDomain === "new" ? "Añadir dominio" : "Editar dominio"}</h2>
            <p className="modal-sub">
              {showDomain === "new"
                ? "Lo usarás al dar de alta clientes: solo tendrás que elegirlo y poner usuario y contraseña."
                : `Al guardar, los ${(showDomain as Domain).customers} cliente${(showDomain as Domain).customers === 1 ? "" : "s"} que lo usan pasarán al nuevo destino automáticamente.`}
            </p>
            <form onSubmit={saveDomain}>
              <div className="auth-field">
                <label className="label" htmlFor="d-host">Dominio</label>
                <input
                  id="d-host"
                  name="host"
                  className="input"
                  required
                  placeholder="servidor.com"
                  defaultValue={showDomain === "new" ? "" : (showDomain as Domain).host}
                />
                <p style={{ fontSize: 12.5, color: "var(--text-faint)", marginTop: 6 }}>Sin http:// ni barras</p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="auth-field">
                  <label className="label" htmlFor="d-port">Puerto</label>
                  <input
                    id="d-port"
                    name="port"
                    className="input"
                    type="number"
                    min={1}
                    max={65535}
                    required
                    defaultValue={showDomain === "new" ? 80 : (showDomain as Domain).port}
                  />
                </div>
                <div className="auth-field">
                  <label className="label" htmlFor="d-proto">Protocolo</label>
                  <select
                    id="d-proto"
                    name="protocol"
                    className="input"
                    defaultValue={showDomain === "new" ? "http" : (showDomain as Domain).protocol}
                  >
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                  </select>
                </div>
              </div>
              <div className="auth-field">
                <label className="label" htmlFor="d-label">Etiqueta (opcional)</label>
                <input
                  id="d-label"
                  name="label"
                  className="input"
                  placeholder="DNS principal, Revendedor…"
                  defaultValue={showDomain === "new" ? "" : (showDomain as Domain).label}
                />
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 10 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowDomain(null)} data-tv-close>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  {showDomain === "new" ? "Añadir dominio" : "Guardar cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: revendedor */}
      {showReseller && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowReseller(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Revendedor">
            <h2>{showReseller === "new" ? "Nuevo revendedor" : "Permisos del revendedor"}</h2>
            <p className="modal-sub">
              {showReseller === "new"
                ? "Tendrá acceso a este mismo panel con los permisos que marques aquí."
                : (showReseller as Reseller).email}
            </p>
            <form onSubmit={saveReseller}>
              {showReseller === "new" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="auth-field">
                    <label className="label" htmlFor="r-email">Email de acceso</label>
                    <input id="r-email" name="email" className="input" type="email" required placeholder="revendedor@email.com" />
                  </div>
                  <div className="auth-field">
                    <label className="label" htmlFor="r-pass">Contraseña</label>
                    <input id="r-pass" name="password" className="input" required minLength={8} placeholder="mínimo 8 caracteres" />
                  </div>
                </div>
              )}
              <div className="auth-field">
                <label className="label" htmlFor="r-name">Nombre o referencia</label>
                <input
                  id="r-name"
                  name="name"
                  className="input"
                  placeholder="Revendedor Madrid"
                  defaultValue={showReseller === "new" ? "" : (showReseller as Reseller).name}
                />
              </div>

              <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "18px 0" }} />
              <p className="label" style={{ marginBottom: 12 }}>Qué puede ver y hacer</p>

              <label className="perm-row">
                <input
                  type="checkbox"
                  name="viewAllCustomers"
                  defaultChecked={showReseller !== "new" && (showReseller as Reseller).viewAllCustomers}
                />
                <span>
                  <strong>Ver todos tus clientes</strong>
                  <small>Si lo dejas sin marcar, solo verá y gestionará los clientes que él mismo dé de alta.</small>
                </span>
              </label>

              <div className="auth-field" style={{ marginTop: 16 }}>
                <label className="label" htmlFor="r-domains">Acceso a tus dominios</label>
                <select
                  id="r-domains"
                  name="domainAccess"
                  className="input"
                  defaultValue={showReseller === "new" ? "names" : (showReseller as Reseller).domainAccess}
                >
                  <option value="names">Solo ve el nombre — puede asignarlos, no editarlos</option>
                  <option value="full">Acceso completo — puede crear y editar dominios</option>
                  <option value="none">Sin acceso — tendrá que escribir la URL a mano</option>
                </select>
              </div>

              <div className="auth-field">
                <label className="label" htmlFor="r-max">Límite de clientes (0 = sin límite propio)</label>
                <input
                  id="r-max"
                  name="maxCustomers"
                  className="input"
                  type="number"
                  min={0}
                  defaultValue={showReseller === "new" ? 0 : (showReseller as Reseller).maxCustomers}
                />
                <p style={{ fontSize: 12.5, color: "var(--text-faint)", marginTop: 6 }}>
                  Sus clientes cuentan dentro del cupo de tu plan.
                </p>
              </div>

              {showReseller !== "new" && (
                <div className="auth-field">
                  <label className="label" htmlFor="r-newpass">Nueva contraseña (opcional)</label>
                  <input id="r-newpass" name="password" className="input" minLength={8} placeholder="Dejar vacío para no cambiarla" />
                </div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 10 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowReseller(null)} data-tv-close>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  {showReseller === "new" ? "Crear revendedor" : "Guardar permisos"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: planes (se abre desde los avisos de cupo alcanzado) */}
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
    </div>
  );
}
