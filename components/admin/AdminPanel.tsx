"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Icon, { type IconName } from "@/components/Icon";
import Loading from "@/components/Loading";
import AdminTickets from "./AdminTickets";

/**
 * El panel de la plataforma: lo que mira quien lleva TOTALplayer.
 *
 * El de proveedor enseña un negocio; este enseña todos a la vez. Mismo
 * esqueleto a propósito —menú a la izquierda, cabecera con el dato que
 * importa, tablas— para no tener que aprender dos paneles distintos.
 */

type Seccion =
  | "resumen"
  | "proveedores"
  | "revendedores"
  | "clientes"
  | "dominios"
  | "registro"
  | "facturas"
  | "soporte"
  | "copias"
  | "planes";

const TITULOS: Record<Seccion, string> = {
  resumen: "Resumen",
  proveedores: "Proveedores",
  revendedores: "Revendedores",
  clientes: "Clientes finales",
  dominios: "Dominios",
  registro: "Registro",
  facturas: "Facturación",
  soporte: "Soporte",
  copias: "Copias de seguridad",
  planes: "Planes y cobro",
};

const SUBTITULOS: Record<Seccion, string> = {
  resumen: "El pulso de la plataforma",
  proveedores: "Quién vende, con qué plan y cuánto mueve",
  revendedores: "Sus revendedores y las cuentas vivas de cada uno",
  clientes: "Buscador global de cuentas de cliente",
  dominios: "Por dónde entran los clientes de cada proveedor",
  registro: "Accesos, fallos y lo que hace la administración",
  facturas: "Lo emitido a proveedores",
  soporte: "Tickets de los proveedores. Los abiertos van primero",
  copias: "La red de seguridad: si el disco falla, esto es lo que queda",
  planes: "Los tramos que se venden y con qué precio de Stripe se cobra cada uno",
};

interface Resumen {
  proveedores: { total: number; activos: number; suspendidos: number; enPrueba: number; nuevos30: number };
  clientes: { total: number; activos: number; caducados: number; caducanEn7: number; nuevos30: number };
  revendedores: { total: number; activos: number };
  dominios: number;
  dispositivos: { total: number; activos7: number };
  accesos: { hoy: number; fallidos7: number };
  soporte: { abiertos: number; respondidos: number };
  facturado: { mesCents: number; totalCents: number; pendientesCents: number };
}

interface Proveedor {
  id: number;
  email: string;
  empresa: string;
  marca: string;
  plan: string;
  planNombre: string;
  planCaduca: number;
  pruebaHasta: number;
  estado: string;
  alta: number;
  clientes: number;
  clientesActivos: number;
  revendedores: number;
  dominios: number;
  ultimoAcceso: number;
  facturadoCents: number;
  ticketsAbiertos: number;
}

interface Revendedor {
  id: number;
  email: string;
  nombre: string;
  proveedor: string;
  estado: string;
  alta: number;
  cupo: number;
  clientes: number;
  clientesActivos: number;
  ultimaAlta: number;
}

interface Cliente {
  id: number;
  usuario: string;
  nombre: string;
  proveedor: string;
  revendedor: string;
  estado: string;
  caduca: number;
  alta: number;
  ultimoAcceso: number;
  dispositivos: number;
}

interface Dominio {
  id: number;
  host: string;
  puerto: number;
  protocolo: string;
  etiqueta: string;
  proveedor: string;
  clientes: number;
  alta: number;
}

interface Acceso {
  id: number;
  cuando: number;
  usuario: string;
  proveedor: string;
  ip: string;
  plataforma: string;
  ok: number;
}

interface Auditoria {
  id: number;
  cuando: number;
  admin: string;
  accion: string;
  sobre: string;
  detalle: string;
}

interface Factura {
  id: number;
  numero: string;
  concepto: string;
  proveedor: string;
  importeCents: number;
  moneda: string;
  estado: string;
  emitida: number;
}

function fecha(ts: number) {
  return ts ? new Date(ts).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "2-digit" }) : "—";
}
function fechaHora(ts: number) {
  return ts ? new Date(ts).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
}
function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}
/** «1 suspendido» y no «1 suspendidos»: el panel se lee entero cada mañana. */
function plural(n: number, singular: string, plural: string) {
  return `${n} ${n === 1 ? singular : plural}`;
}
function haceCuanto(ts: number) {
  if (!ts) return "nunca";
  const dias = Math.floor((Date.now() - ts) / 86400000);
  if (dias === 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} d`;
  return fecha(ts);
}

export default function AdminPanel() {
  const [tab, setTab] = useState<Seccion>("resumen");
  const [denegado, setDenegado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [altas, setAltas] = useState<{ fecha: number; altas: number }[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [planes, setPlanes] = useState<{ id: string; nombre: string; maxClientes: number }[]>([]);
  const [revendedores, setRevendedores] = useState<Revendedor[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [dominios, setDominios] = useState<Dominio[]>([]);
  const [accesos, setAccesos] = useState<Acceso[]>([]);
  const [auditoria, setAuditoria] = useState<Auditoria[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [copias, setCopias] = useState<{ nombre: string; bytes: number; cuando: number }[]>([]);
  const [copiasAuto, setCopiasAuto] = useState(false);
  const [copiando, setCopiando] = useState(false);
  const [planesCobro, setPlanesCobro] = useState<
    { id: string; nombre: string; precioCents: number; maxClientes: number; stripePriceId: string; activo: boolean }[]
  >([]);
  const [stripeListo, setStripeListo] = useState(false);

  const [buscar, setBuscar] = useState("");
  const [estadoCliente, setEstadoCliente] = useState("");
  const [estadoFactura, setEstadoFactura] = useState("");
  const [soloFallidos, setSoloFallidos] = useState(false);
  const [verAuditoria, setVerAuditoria] = useState(false);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [nuevaFactura, setNuevaFactura] = useState(false);

  /** Una sola puerta para todas las llamadas: si no eres admin, se acabó. */
  const pedir = useCallback(async (url: string) => {
    const res = await fetch(url);
    if (res.status === 401 || res.status === 403) {
      setDenegado(true);
      return null;
    }
    if (!res.ok) {
      setError("No se pudo cargar. Vuelve a intentarlo.");
      return null;
    }
    return res.json();
  }, []);

  // Cada sección pide lo suyo, y solo cuando se abre: el resumen no tiene
  // por qué esperar a que se cuenten trescientos accesos
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);
    const q = encodeURIComponent(buscar);

    (async () => {
      if (tab === "resumen") {
        const d = await pedir("/api/admin/resumen");
        if (vivo && d) {
          setResumen(d.resumen);
          setAltas(d.altas || []);
        }
      } else if (tab === "proveedores") {
        const d = await pedir(`/api/admin/proveedores?buscar=${q}`);
        if (vivo && d) {
          setProveedores(d.proveedores);
          setPlanes(d.planes || []);
        }
      } else if (tab === "revendedores") {
        const d = await pedir(`/api/admin/revendedores?buscar=${q}`);
        if (vivo && d) setRevendedores(d.revendedores);
      } else if (tab === "clientes") {
        const d = await pedir(`/api/admin/clientes?buscar=${q}&estado=${estadoCliente}`);
        if (vivo && d) setClientes(d.clientes);
      } else if (tab === "dominios") {
        const d = await pedir(`/api/admin/dominios?buscar=${q}`);
        if (vivo && d) setDominios(d.dominios);
      } else if (tab === "registro") {
        const d = await pedir(`/api/admin/registro?fallidos=${soloFallidos ? 1 : 0}&buscar=${q}`);
        if (vivo && d) {
          setAccesos(d.accesos);
          setAuditoria(d.auditoria);
        }
      } else if (tab === "facturas") {
        const d = await pedir(`/api/admin/facturas?estado=${estadoFactura}`);
        if (vivo && d) setFacturas(d.facturas);
      } else if (tab === "planes") {
        const d = await pedir("/api/admin/planes");
        if (vivo && d) {
          setPlanesCobro(d.planes);
          setStripeListo(d.stripeListo);
        }
      } else if (tab === "copias") {
        const d = await pedir("/api/admin/copias");
        if (vivo && d) {
          setCopias(d.copias);
          setCopiasAuto(d.automaticas);
        }
      }
      if (vivo) setCargando(false);
    })();

    return () => {
      vivo = false;
    };
  }, [tab, buscar, estadoCliente, estadoFactura, soloFallidos, pedir]);

  /*
   * Los tickets sin atender, en el título de la pestaña. Quien lleva esto
   * tiene el panel abierto en una pestaña del fondo; sin esto había que
   * acordarse de venir a mirar. Se refresca solo cada minuto para que una
   * pestaña olvidada no se quede con el número de ayer.
   */
  useEffect(() => {
    const pendientes = resumen?.soporte.abiertos || 0;
    document.title = pendientes ? `(${pendientes}) Administración — TOTALplayer` : "Administración — TOTALplayer";
  }, [resumen]);

  useEffect(() => {
    const t = setInterval(async () => {
      // Solo con la pestaña a la vista: en segundo plano no hay nadie
      // leyendo y el navegador acaba estrangulando el temporizador igual
      if (document.hidden) return;
      const d = await fetch("/api/admin/resumen").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (d?.resumen) setResumen(d.resumen);
    }, 60000);
    return () => clearInterval(t);
  }, []);

  // Al cambiar de sección, el buscador empieza limpio: buscar «madrid» en
  // proveedores y encontrarte cero clientes desconcierta más que ayuda
  useEffect(() => {
    setBuscar("");
    setAbierto(null);
  }, [tab]);

  async function cambiarProveedor(id: number, cambio: Record<string, unknown>) {
    setAviso(null);
    setError(null);
    const res = await fetch("/api/admin/proveedores", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...cambio }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "No se pudo aplicar el cambio");
      return;
    }
    setAviso("Cambio guardado y anotado en el registro.");
    const d = await pedir(`/api/admin/proveedores?buscar=${encodeURIComponent(buscar)}`);
    if (d) setProveedores(d.proveedores);
  }

  /** Abrir el panel de un proveedor con sus mismos ojos */
  async function entrarComo(p: Proveedor) {
    setError(null);
    const res = await fetch("/api/admin/suplantar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "No se pudo abrir su panel");
      return;
    }
    window.location.href = data.panel || "/panel";
  }

  async function emitirFactura(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAviso(null);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/admin/facturas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proveedorId: Number(fd.get("proveedorId")),
        concepto: String(fd.get("concepto") || ""),
        importe: Number(fd.get("importe")),
        estado: String(fd.get("estado") || "pagada"),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "No se pudo emitir");
      return;
    }
    setNuevaFactura(false);
    setAviso(`Factura ${data.numero} emitida.`);
    const d = await pedir(`/api/admin/facturas?estado=${estadoFactura}`);
    if (d) setFacturas(d.facturas);
  }

  async function cambiarFactura(id: number, estado: string) {
    setAviso(null);
    setError(null);
    const res = await fetch("/api/admin/facturas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, estado }),
    });
    if (!res.ok) {
      setError("No se pudo cambiar el estado");
      return;
    }
    setAviso("Estado guardado y anotado en el registro.");
    const d = await pedir(`/api/admin/facturas?estado=${estadoFactura}`);
    if (d) setFacturas(d.facturas);
  }

  if (denegado) {
    return (
      <div className="auth-wrap">
        <div className="card auth-card" style={{ textAlign: "center" }}>
          <h1>Solo administración</h1>
          <p className="auth-sub">Entra con una cuenta de administrador para atender la plataforma.</p>
          <Link href="/login?next=/admin" className="btn btn-primary" style={{ width: "100%" }}>
            Iniciar sesión
          </Link>
        </div>
      </div>
    );
  }

  const maxAltas = Math.max(1, ...altas.map((a) => a.altas));

  return (
    <div className="panel-layout">
      <aside className="panel-nav" aria-label="Secciones de administración">
        <div className="panel-nav-head">
          <div className="panel-nav-brand">TOTALplayer</div>
          <div className="panel-nav-mail">Administración</div>
        </div>

        <div className="panel-nav-group">La plataforma</div>
        {(
          [
            ["resumen", "chart", null],
            ["proveedores", "building", resumen?.proveedores.total],
            ["revendedores", "handshake", resumen?.revendedores.total],
            ["clientes", "users", resumen?.clientes.total],
            ["dominios", "globe", resumen?.dominios],
          ] as [Seccion, IconName, number | null | undefined][]
        ).map(([s, icono, n]) => (
          <button key={s} className={`panel-nav-item ${tab === s ? "active" : ""}`} onClick={() => setTab(s)}>
            <Icon name={icono} size={17} className="panel-nav-icon" /> {TITULOS[s]}
            {typeof n === "number" && <span className="panel-nav-count">{n}</span>}
          </button>
        ))}

        <div className="panel-nav-group">Control</div>
        <button className={`panel-nav-item ${tab === "registro" ? "active" : ""}`} onClick={() => setTab("registro")}>
          <Icon name="list" size={17} className="panel-nav-icon" /> Registro
        </button>
        <button className={`panel-nav-item ${tab === "facturas" ? "active" : ""}`} onClick={() => setTab("facturas")}>
          <Icon name="card" size={17} className="panel-nav-icon" /> Facturación
        </button>
        <button className={`panel-nav-item ${tab === "planes" ? "active" : ""}`} onClick={() => setTab("planes")}>
          <Icon name="card" size={17} className="panel-nav-icon" /> Planes y cobro
        </button>
        <button className={`panel-nav-item ${tab === "copias" ? "active" : ""}`} onClick={() => setTab("copias")}>
          <Icon name="lock" size={17} className="panel-nav-icon" /> Copias
        </button>
        <button className={`panel-nav-item ${tab === "soporte" ? "active" : ""}`} onClick={() => setTab("soporte")}>
          <Icon name="shield" size={17} className="panel-nav-icon" /> Soporte
          {Boolean(resumen?.soporte.abiertos) && <span className="panel-nav-count">{resumen?.soporte.abiertos}</span>}
        </button>

        <div className="panel-nav-foot">
          <Link href="/player" className="panel-nav-item">
            <Icon name="play" size={17} className="panel-nav-icon" /> Ver reproductor
          </Link>
          <button
            className="panel-nav-item"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/";
            }}
          >
            <Icon name="power" size={17} className="panel-nav-icon" /> Salir
          </button>
        </div>
      </aside>

      <div className="panel-main">
        <div className="panel-head">
          <div>
            <h1>{TITULOS[tab]}</h1>
            <p className="panel-sub">{SUBTITULOS[tab]}</p>
          </div>
          {/* En «Resumen» no: esa pantalla ya trae la misma cifra en su
              propia tarjeta, y salían las dos a la vez */}
          {resumen && tab !== "resumen" && (
            <div className="panel-head-stat">
              <span className="panel-card-label">Clientes activos</span>
              <span className="panel-card-value">
                {resumen.clientes.activos} <small>/ {resumen.clientes.total}</small>
              </span>
              <div className="panel-meter">
                <div style={{ width: `${Math.min(100, (resumen.clientes.activos / Math.max(1, resumen.clientes.total)) * 100)}%` }} />
              </div>
            </div>
          )}
        </div>

        {aviso && (
          <div className="badge badge-success" style={{ display: "block", padding: "12px 16px", marginBottom: 18 }} role="status">
            {aviso}
          </div>
        )}
        {error && (
          <div className="error-box" style={{ marginBottom: 18 }} role="alert">
            {error}
          </div>
        )}

        {cargando && tab !== "soporte" ? (
          <Loading messages={["Contando…"]} compact />
        ) : (
          <>
            {/* ---------------- Resumen ---------------- */}
            {tab === "resumen" && resumen && (
              <>
                <div className="panel-cards">
                  {/*
                    «Activos de total», y no solo los activos.

                    El número que va al lado de «Proveedores» en el menú es el
                    total, y aquí salían los activos: dos cifras distintas
                    bajo la misma palabra y a dos dedos una de otra —27 en la
                    tarjeta, 28 en el menú—, que es de las cosas que hacen
                    dudar de todos los demás números de la pantalla.
                  */}
                  <div className="panel-card">
                    <span className="panel-card-label">Proveedores</span>
                    <span className="panel-card-value">
                      {resumen.proveedores.activos} <small>/ {resumen.proveedores.total}</small>
                    </span>
                    <span className="admin-card-pie">
                      {resumen.proveedores.enPrueba} en prueba · {plural(resumen.proveedores.suspendidos, "suspendido", "suspendidos")}
                    </span>
                  </div>
                  <div className="panel-card">
                    <span className="panel-card-label">Clientes finales</span>
                    <span className="panel-card-value">
                      {resumen.clientes.activos} <small>/ {resumen.clientes.total}</small>
                    </span>
                    <span className="admin-card-pie">
                      {plural(resumen.clientes.caducados, "caducado", "caducados")} ·{" "}
                      <b className={resumen.clientes.caducanEn7 ? "admin-ojo" : ""}>{resumen.clientes.caducanEn7}</b>{" "}
                      {resumen.clientes.caducanEn7 === 1 ? "caduca" : "caducan"} en 7 días
                    </span>
                  </div>
                  <div className="panel-card">
                    <span className="panel-card-label">Facturado este mes</span>
                    <span className="panel-card-value">{euros(resumen.facturado.mesCents)}</span>
                    <span className="admin-card-pie">
                      {euros(resumen.facturado.totalCents)} en total ·{" "}
                      {euros(resumen.facturado.pendientesCents)} pendiente
                    </span>
                  </div>
                  <div className="panel-card">
                    <span className="panel-card-label">Soporte</span>
                    <span className="panel-card-value">{resumen.soporte.abiertos}</span>
                    <span className="admin-card-pie">
                      {resumen.soporte.abiertos === 1 ? "abierto" : "abiertos"} · {resumen.soporte.respondidos} esperando al proveedor
                    </span>
                  </div>
                  <div className="panel-card">
                    <span className="panel-card-label">Dispositivos</span>
                    <span className="panel-card-value">{resumen.dispositivos.activos7}</span>
                    <span className="admin-card-pie">activos esta semana · {resumen.dispositivos.total} en total</span>
                  </div>
                  <div className="panel-card">
                    <span className="panel-card-label">Accesos hoy</span>
                    <span className="panel-card-value">{resumen.accesos.hoy}</span>
                    <span className="admin-card-pie">
                      <b className={resumen.accesos.fallidos7 ? "admin-ojo" : ""}>{resumen.accesos.fallidos7}</b>{" "}
                      {resumen.accesos.fallidos7 === 1 ? "fallido" : "fallidos"} en 7 días
                    </span>
                  </div>
                </div>

                {/* Altas del último mes: una barra por día, sin librerías */}
                <section className="card admin-grafica">
                  <div className="section-toolbar" style={{ marginBottom: 14 }}>
                    <h3>Altas de clientes, últimos 30 días</h3>
                    <span className="panel-sub">{resumen.clientes.nuevos30} en total</span>
                  </div>
                  <div className="admin-barras" role="img" aria-label={`${resumen.clientes.nuevos30} altas en los últimos 30 días`}>
                    {altas.map((a) => (
                      <span
                        key={a.fecha}
                        className="admin-barra"
                        style={{ height: `${Math.max(3, (a.altas / maxAltas) * 100)}%` }}
                        title={`${fecha(a.fecha)}: ${a.altas} altas`}
                      />
                    ))}
                  </div>
                </section>

                {(resumen.soporte.abiertos > 0 || resumen.clientes.caducanEn7 > 0) && (
                  <div className="admin-atajos">
                    {resumen.soporte.abiertos > 0 && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setTab("soporte")}>
                        <Icon name="shield" size={15} /> Atender {plural(resumen.soporte.abiertos, "ticket", "tickets")}
                      </button>
                    )}
                    {resumen.clientes.caducanEn7 > 0 && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setTab("clientes");
                          setEstadoCliente("activos");
                        }}
                      >
                        <Icon name="users" size={15} /> Ver los que caducan
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ---------------- Proveedores ---------------- */}
            {tab === "proveedores" && (
              <>
                <div className="panel-toolbar">
                  <input
                    className="input"
                    placeholder="Buscar por correo, empresa o marca…"
                    value={buscar}
                    onChange={(e) => setBuscar(e.target.value)}
                    aria-label="Buscar proveedores"
                  />
                </div>
                {proveedores.length === 0 ? (
                  <div className="pa-empty">No hay proveedores{buscar ? " que coincidan" : " todavía"}.</div>
                ) : (
                  <div className="tabla-scroll"><table className="panel-table">
                    <thead>
                      <tr>
                        <th>Proveedor</th>
                        <th>Plan</th>
                        <th>Clientes</th>
                        <th>Rev.</th>
                        <th>Dom.</th>
                        <th>Facturado</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proveedores.map((p) => (
                        <>
                          <tr key={p.id} className="row-click" onClick={() => setAbierto(abierto === p.id ? null : p.id)}>
                            <td>
                              <b>{p.empresa || p.marca || p.email}</b>
                              <div className="admin-sub">{p.email}</div>
                            </td>
                            <td>
                              {p.planNombre || (p.pruebaHasta > Date.now() ? "Prueba" : "—")}
                              <div className="admin-sub">{p.planCaduca ? `hasta ${fecha(p.planCaduca)}` : ""}</div>
                            </td>
                            <td>
                              <b>{p.clientesActivos}</b>
                              <span className="admin-sub"> / {p.clientes}</span>
                            </td>
                            <td>{p.revendedores}</td>
                            <td>{p.dominios}</td>
                            <td>{euros(p.facturadoCents)}</td>
                            <td>
                              <span className={`badge ${p.estado === "active" ? "badge-success" : "badge-danger"}`}>
                                {p.estado === "active" ? "activo" : "suspendido"}
                              </span>
                              {p.ticketsAbiertos > 0 && <span className="badge badge-accent" style={{ marginLeft: 6 }}>{p.ticketsAbiertos} ticket</span>}
                            </td>
                          </tr>
                          {abierto === p.id && (
                            <tr key={`${p.id}-detalle`} className="admin-detalle-fila">
                              <td colSpan={7}>
                                <div className="admin-detalle">
                                  <div className="admin-detalle-datos">
                                    <span>Alta <b>{fecha(p.alta)}</b></span>
                                    <span>Último acceso de un cliente <b>{haceCuanto(p.ultimoAcceso)}</b></span>
                                    <span>Marca <b>{p.marca || "sin marca propia"}</b></span>
                                  </div>
                                  <div className="admin-detalle-acciones">
                                    <label className="label" htmlFor={`plan-${p.id}`}>Plan</label>
                                    <select
                                      id={`plan-${p.id}`}
                                      className="input"
                                      value={p.plan}
                                      onChange={(e) => cambiarProveedor(p.id, { plan: e.target.value })}
                                    >
                                      <option value="">Sin plan</option>
                                      {planes.map((pl) => (
                                        <option key={pl.id} value={pl.id}>
                                          {pl.nombre} ({pl.maxClientes})
                                        </option>
                                      ))}
                                    </select>

                                    <label className="label" htmlFor={`caduca-${p.id}`}>Renueva el</label>
                                    <input
                                      id={`caduca-${p.id}`}
                                      type="date"
                                      className="input"
                                      /* Con defaultValue, la fecha que pone el servidor al elegir plan
                                         no se vería hasta recargar: la clave fuerza el repintado */
                                      key={p.planCaduca}
                                      defaultValue={p.planCaduca ? new Date(p.planCaduca).toISOString().slice(0, 10) : ""}
                                      onChange={(e) =>
                                        cambiarProveedor(p.id, {
                                          caduca: e.target.value ? new Date(e.target.value).getTime() : 0,
                                        })
                                      }
                                    />

                                    <div className="admin-detalle-botones">
                                      <button
                                        className={`btn btn-sm ${p.estado === "active" ? "btn-ghost" : "btn-primary"}`}
                                        onClick={() =>
                                          cambiarProveedor(p.id, { estado: p.estado === "active" ? "suspended" : "active" })
                                        }
                                      >
                                        {p.estado === "active" ? "Suspender" : "Reactivar"}
                                      </button>
                                      {/* Ver su panel con sus mismos ojos ahorra media hora de
                                          ida y vuelta cuando dice «no me deja» */}
                                      <button className="btn btn-ghost btn-sm" onClick={() => entrarComo(p)}>
                                        <Icon name="eye" size={15} /> Abrir su panel
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table></div>
                )}
              </>
            )}

            {/* ---------------- Revendedores ---------------- */}
            {tab === "revendedores" && (
              <>
                <div className="panel-toolbar">
                  <input
                    className="input"
                    placeholder="Buscar por correo o nombre…"
                    value={buscar}
                    onChange={(e) => setBuscar(e.target.value)}
                    aria-label="Buscar revendedores"
                  />
                </div>
                {revendedores.length === 0 ? (
                  <div className="pa-empty">Ningún revendedor{buscar ? " coincide" : " todavía"}.</div>
                ) : (
                  <div className="tabla-scroll"><table className="panel-table">
                    <thead>
                      <tr>
                        <th>Revendedor</th>
                        <th>De</th>
                        <th>Cuentas activas</th>
                        <th>Cupo</th>
                        <th>Última alta</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revendedores.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <b>{r.nombre || r.email}</b>
                            <div className="admin-sub">{r.email}</div>
                          </td>
                          <td>{r.proveedor}</td>
                          <td>
                            <b>{r.clientesActivos}</b>
                            <span className="admin-sub"> / {r.clientes} dadas de alta</span>
                          </td>
                          <td>{r.cupo || "—"}</td>
                          <td>{haceCuanto(r.ultimaAlta)}</td>
                          <td>
                            <span className={`badge ${r.estado === "active" ? "badge-success" : ""}`}>
                              {r.estado === "active" ? "activo" : r.estado}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )}
              </>
            )}

            {/* ---------------- Clientes ---------------- */}
            {tab === "clientes" && (
              <>
                <div className="panel-toolbar">
                  <input
                    className="input"
                    placeholder="Buscar por usuario, nombre o proveedor…"
                    value={buscar}
                    onChange={(e) => setBuscar(e.target.value)}
                    aria-label="Buscar clientes"
                  />
                  <select
                    className="input"
                    style={{ maxWidth: 200 }}
                    value={estadoCliente}
                    onChange={(e) => setEstadoCliente(e.target.value)}
                    aria-label="Filtrar por estado"
                  >
                    <option value="">Todos</option>
                    <option value="activos">Activos</option>
                    <option value="caducados">Caducados</option>
                    <option value="desactivados">Desactivados</option>
                  </select>
                </div>
                {clientes.length === 0 ? (
                  <div className="pa-empty">Ningún cliente{buscar || estadoCliente ? " con ese criterio" : " todavía"}.</div>
                ) : (
                  <div className="tabla-scroll"><table className="panel-table">
                    <thead>
                      <tr>
                        <th>Usuario</th>
                        <th>Proveedor</th>
                        <th>Revendedor</th>
                        <th>Caduca</th>
                        <th>Disp.</th>
                        <th>Último acceso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientes.map((c) => {
                        const caducado = c.caduca !== 0 && c.caduca <= Date.now();
                        return (
                          <tr key={c.id}>
                            <td>
                              <b>{c.usuario}</b>
                              {c.nombre && <div className="admin-sub">{c.nombre}</div>}
                            </td>
                            <td>{c.proveedor}</td>
                            <td>{c.revendedor || <span className="admin-sub">directo</span>}</td>
                            <td className={caducado ? "admin-ojo" : ""}>
                              {c.caduca ? fecha(c.caduca) : "sin fecha"}
                              {c.estado !== "active" && <div className="admin-sub">desactivado</div>}
                            </td>
                            <td>{c.dispositivos}</td>
                            <td>{haceCuanto(c.ultimoAcceso)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table></div>
                )}
              </>
            )}

            {/* ---------------- Dominios ---------------- */}
            {tab === "dominios" && (
              <>
                <div className="panel-toolbar">
                  <input
                    className="input"
                    placeholder="Buscar por host o etiqueta…"
                    value={buscar}
                    onChange={(e) => setBuscar(e.target.value)}
                    aria-label="Buscar dominios"
                  />
                </div>
                {dominios.length === 0 ? (
                  <div className="pa-empty">Ningún dominio dado de alta{buscar ? " que coincida" : ""}.</div>
                ) : (
                  <div className="tabla-scroll"><table className="panel-table">
                    <thead>
                      <tr>
                        <th>Dominio</th>
                        <th>Proveedor</th>
                        <th>Clientes que lo usan</th>
                        <th>Alta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dominios.map((d) => (
                        <tr key={d.id}>
                          <td>
                            <b>{d.host}:{d.puerto}</b>
                            <div className="admin-sub">{d.protocolo}{d.etiqueta ? ` · ${d.etiqueta}` : ""}</div>
                          </td>
                          <td>{d.proveedor}</td>
                          <td>{d.clientes}</td>
                          <td>{fecha(d.alta)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )}
              </>
            )}

            {/* ---------------- Registro ---------------- */}
            {tab === "registro" && (
              <>
                <div className="panel-tabs">
                  <button className={`panel-tab ${!verAuditoria ? "active" : ""}`} onClick={() => setVerAuditoria(false)}>
                    Accesos de clientes
                    <span className="panel-tab-count">{accesos.length}</span>
                  </button>
                  <button className={`panel-tab ${verAuditoria ? "active" : ""}`} onClick={() => setVerAuditoria(true)}>
                    Administración
                    <span className="panel-tab-count">{auditoria.length}</span>
                  </button>
                </div>

                {!verAuditoria ? (
                  <>
                    <div className="panel-toolbar">
                      <input
                        className="input"
                        placeholder="Buscar por usuario o IP…"
                        value={buscar}
                        onChange={(e) => setBuscar(e.target.value)}
                        aria-label="Buscar accesos"
                      />
                      <label className="admin-check">
                        <input type="checkbox" checked={soloFallidos} onChange={(e) => setSoloFallidos(e.target.checked)} />
                        Solo los fallidos
                      </label>
                    </div>
                    {accesos.length === 0 ? (
                      <div className="pa-empty">Sin accesos registrados{soloFallidos ? " fallidos" : ""}.</div>
                    ) : (
                      <div className="tabla-scroll"><table className="panel-table">
                        <thead>
                          <tr>
                            <th>Cuándo</th>
                            <th>Usuario</th>
                            <th>Proveedor</th>
                            <th>IP</th>
                            <th>Desde</th>
                            <th>Resultado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {accesos.map((a) => (
                            <tr key={a.id}>
                              <td>{fechaHora(a.cuando)}</td>
                              <td><b>{a.usuario}</b></td>
                              <td>{a.proveedor}</td>
                              <td><code className="cred">{a.ip || "—"}</code></td>
                              <td>{a.plataforma || "—"}</td>
                              <td>
                                <span className={`badge ${a.ok ? "badge-success" : "badge-danger"}`}>
                                  {a.ok ? "entró" : "falló"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table></div>
                    )}
                  </>
                ) : auditoria.length === 0 ? (
                  <div className="pa-empty">
                    Todavía no se ha tocado nada desde aquí. Suspender a un proveedor o cambiarle el plan quedará anotado.
                  </div>
                ) : (
                  <div className="tabla-scroll"><table className="panel-table">
                    <thead>
                      <tr>
                        <th>Cuándo</th>
                        <th>Quién</th>
                        <th>Qué</th>
                        <th>Sobre</th>
                        <th>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditoria.map((a) => (
                        <tr key={a.id}>
                          <td>{fechaHora(a.cuando)}</td>
                          <td>{a.admin}</td>
                          <td>{a.accion}</td>
                          <td><b>{a.sobre}</b></td>
                          <td>{a.detalle}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )}
              </>
            )}

            {/* ---------------- Facturación ---------------- */}
            {tab === "facturas" && (
              <>
                <div className="panel-toolbar">
                  <select
                    className="input"
                    style={{ maxWidth: 200 }}
                    value={estadoFactura}
                    onChange={(e) => setEstadoFactura(e.target.value)}
                    aria-label="Filtrar por estado"
                  >
                    <option value="">Todas</option>
                    <option value="pagada">Pagadas</option>
                    <option value="pendiente">Pendientes</option>
                    <option value="anulada">Anuladas</option>
                  </select>
                  <span className="panel-sub" style={{ marginLeft: "auto" }}>
                    {euros(facturas.reduce((s, f) => s + (f.estado === "anulada" ? 0 : f.importeCents), 0))} en pantalla
                  </span>
                  {/* Lo de Stripe entra solo por su webhook; una transferencia
                      o un acuerdo aparte había que apuntarlo en la base a mano */}
                  <button className="btn btn-primary btn-sm" onClick={() => setNuevaFactura((v) => !v)}>
                    <Icon name="plus" size={15} /> Emitir factura
                  </button>
                </div>

                {nuevaFactura && (
                  <form className="card admin-factura-form" onSubmit={emitirFactura}>
                    <div className="auth-field">
                      <label className="label" htmlFor="fa-prov">Proveedor</label>
                      <select id="fa-prov" name="proveedorId" className="input" required defaultValue="">
                        <option value="" disabled>Elige uno</option>
                        {proveedores.map((p) => (
                          <option key={p.id} value={p.id}>{p.empresa || p.marca || p.email}</option>
                        ))}
                      </select>
                      {proveedores.length === 0 && (
                        <p className="admin-sub">Abre antes «Proveedores» para poder elegir.</p>
                      )}
                    </div>
                    <div className="auth-field">
                      <label className="label" htmlFor="fa-concepto">Concepto</label>
                      <input id="fa-concepto" name="concepto" className="input" required placeholder="Plan Basic — julio" />
                    </div>
                    <div className="auth-field">
                      <label className="label" htmlFor="fa-importe">Importe (€)</label>
                      <input id="fa-importe" name="importe" className="input" type="number" min="0.01" step="0.01" required placeholder="45" />
                    </div>
                    <div className="auth-field">
                      <label className="label" htmlFor="fa-estado">Estado</label>
                      <select id="fa-estado" name="estado" className="input" defaultValue="pagada">
                        <option value="pagada">Cobrada</option>
                        <option value="pendiente">Pendiente de cobro</option>
                      </select>
                    </div>
                    <div className="admin-detalle-botones">
                      <button className="btn btn-primary btn-sm" type="submit">Emitir</button>
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => setNuevaFactura(false)}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                )}
                {facturas.length === 0 ? (
                  <div className="pa-empty">Todavía no hay facturas{estadoFactura ? " con ese estado" : ""}.</div>
                ) : (
                  <div className="tabla-scroll"><table className="panel-table">
                    <thead>
                      <tr>
                        <th>Número</th>
                        <th>Proveedor</th>
                        <th>Concepto</th>
                        <th>Importe</th>
                        <th>Emitida</th>
                        <th>Estado</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {facturas.map((f) => (
                        <tr key={f.id}>
                          <td><code className="cred">{f.numero}</code></td>
                          <td>{f.proveedor}</td>
                          <td>{f.concepto}</td>
                          <td><b>{euros(f.importeCents)}</b></td>
                          <td>{fecha(f.emitida)}</td>
                          <td>
                            <span className={`badge ${f.estado === "pagada" ? "badge-success" : f.estado === "pendiente" ? "badge-accent" : ""}`}>
                              {f.estado}
                            </span>
                          </td>
                          <td>
                            {/* No se borran: una factura emitida deja rastro
                                aunque se anule, que es lo que exige cualquier
                                contabilidad y lo que explica un número que falta */}
                            <div className="admin-detalle-botones">
                              {/* El mismo PDF que se baja el proveedor: dos
                                  documentos distintos con el mismo número es
                                  justo lo que no puede pasar */}
                              <a className="btn btn-ghost btn-sm" href={`/api/facturas/${f.id}/pdf`} download>
                                PDF
                              </a>
                              {f.estado !== "pagada" && f.estado !== "anulada" && (
                                <button className="btn btn-ghost btn-sm" onClick={() => cambiarFactura(f.id, "pagada")}>
                                  Marcar cobrada
                                </button>
                              )}
                              {f.estado !== "anulada" && (
                                <button className="btn btn-danger btn-sm" onClick={() => cambiarFactura(f.id, "anulada")}>
                                  Anular
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )}
              </>
            )}

            {/* ---------------- Planes y cobro ---------------- */}
            {tab === "planes" && (
              <>
                <div className={`card factura-fiscales ${stripeListo ? "" : "incompleto"}`}>
                  <div>
                    <h3>{stripeListo ? "Stripe conectado" : "Stripe sin conectar"}</h3>
                    <p className="panel-sub">
                      {stripeListo
                        ? "Cada plan cobra con el precio que tenga puesto aquí abajo."
                        : "Faltan STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET en las variables. Sin ellas, contratar un plan contesta que los pagos no están activados y hay que activarlo a mano."}
                    </p>
                  </div>
                </div>

                {/* Sin el precio de Stripe, un plan no se puede contratar: el
                    proveedor ve «los pagos no están activados» y hay que
                    activárselo a mano, que es cómo se queda el cobro sin arrancar */}
                <p className="panel-sub" style={{ margin: "16px 0" }}>
                  El identificador de precio se copia de Stripe → Productos → el precio recurrente del plan.
                  Empieza por <code className="cred">price_</code>. Un plan sin él no se puede contratar.
                </p>

                <div className="tabla-scroll"><table className="panel-table">
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th>Precio</th>
                      <th>Clientes</th>
                      <th>Precio en Stripe</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planesCobro.map((pl) => (
                      <tr key={pl.id}>
                        <td><b>{pl.nombre}</b><div className="admin-sub">{pl.id}</div></td>
                        <td>{euros(pl.precioCents)}/mes</td>
                        <td>{pl.maxClientes}</td>
                        <td>
                          <input
                            className="input"
                            style={{ minWidth: 240 }}
                            defaultValue={pl.stripePriceId}
                            placeholder="price_1AbCdEf…"
                            aria-label={`Precio de Stripe de ${pl.nombre}`}
                            onBlur={async (e) => {
                              const valor = e.target.value.trim();
                              if (valor === pl.stripePriceId) return;
                              const res = await fetch("/api/admin/planes", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ id: pl.id, stripePriceId: valor }),
                              });
                              const d = await res.json().catch(() => ({}));
                              if (!res.ok) {
                                setError(d.error || "No se pudo guardar");
                                e.target.value = pl.stripePriceId;
                                return;
                              }
                              setAviso(valor ? `${pl.nombre} ya se puede contratar.` : `${pl.nombre} se queda sin cobro.`);
                              const nuevo = await pedir("/api/admin/planes");
                              if (nuevo) setPlanesCobro(nuevo.planes);
                            }}
                          />
                        </td>
                        <td>
                          <span className={`badge ${pl.stripePriceId ? "badge-success" : ""}`}>
                            {pl.stripePriceId ? "cobra" : "sin cobro"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </>
            )}

            {/* ---------------- Copias de seguridad ---------------- */}
            {tab === "copias" && (
              <>
                <div className={`card factura-fiscales ${copiasAuto ? "" : "incompleto"}`}>
                  <div>
                    <h3>{copiasAuto ? "Copias automáticas encendidas" : "Copias automáticas apagadas"}</h3>
                    <p className="panel-sub">
                      {copiasAuto
                        ? "Se hace una al arrancar y otra cada día. Se guardan las catorce últimas."
                        : "Pon BACKUPS=1 en las variables del despliegue. Sin eso, solo hay las que hagas a mano aquí."}
                    </p>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={copiando}
                    onClick={async () => {
                      setCopiando(true);
                      const res = await fetch("/api/admin/copias", { method: "POST" });
                      setCopiando(false);
                      if (!res.ok) {
                        setError("No se pudo hacer la copia");
                        return;
                      }
                      const d = await pedir("/api/admin/copias");
                      if (d) setCopias(d.copias);
                      setAviso("Copia hecha. Bájatela y guárdala fuera de aquí.");
                    }}
                  >
                    {copiando ? "Copiando…" : "Copiar ahora"}
                  </button>
                </div>

                {/* Una copia que vive en el mismo disco que la base de datos no
                    es una copia: el mismo fallo se lleva las dos */}
                <p className="panel-sub" style={{ margin: "16px 0" }}>
                  Bájate una de vez en cuando y guárdala en otro sitio. Estas viven en el mismo volumen que la
                  base de datos, así que sirven para un borrado por error, no para un disco que se rompe.
                </p>

                {copias.length === 0 ? (
                  <div className="pa-empty">Todavía no hay ninguna copia.</div>
                ) : (
                  <div className="tabla-scroll"><table className="panel-table">
                    <thead>
                      <tr>
                        <th>Copia</th>
                        <th>Cuándo</th>
                        <th>Tamaño</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {copias.map((c) => (
                        <tr key={c.nombre}>
                          <td><code className="cred">{c.nombre}</code></td>
                          <td>{fechaHora(c.cuando)}</td>
                          <td>{(c.bytes / 1024 / 1024).toFixed(2)} MB</td>
                          <td className="col-actions">
                            <a className="btn btn-ghost btn-sm" href={`/api/admin/copias?bajar=${encodeURIComponent(c.nombre)}`} download>
                              Descargar
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )}
              </>
            )}

            {tab === "soporte" && <AdminTickets embedded />}
          </>
        )}
      </div>
    </div>
  );
}
