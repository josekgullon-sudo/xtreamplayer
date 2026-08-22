"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import Loading from "@/components/Loading";

interface Ticket {
  id: number;
  subject: string;
  status: "abierto" | "respondido" | "cerrado";
  provider: string;
  providerEmail: string;
  createdAt: number;
  updatedAt: number;
}

interface Mensaje {
  id: number;
  author: "provider" | "admin";
  body: string;
  createdAt: number;
}

function fecha(ms: number) {
  return new Date(ms).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const BADGE: Record<Ticket["status"], string> = { abierto: "badge-accent", respondido: "badge-success", cerrado: "" };

/**
 * Bandeja de soporte de la plataforma. Solo administradores (users.is_admin
 * o ADMIN_EMAILS); a cualquier otro se le enseña el acceso, no la bandeja.
 */
export default function AdminTickets({ embedded = false }: { embedded?: boolean }) {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [denegado, setDenegado] = useState(false);
  const [abierto, setAbierto] = useState<Ticket | null>(null);
  const [hilo, setHilo] = useState<Mensaje[] | null>(null);
  const [filtro, setFiltro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async (estado = "") => {
    const res = await fetch(`/api/admin/tickets${estado ? `?estado=${estado}` : ""}`);
    if (res.status === 403 || res.status === 401) {
      setDenegado(true);
      return;
    }
    const data = await res.json();
    setTickets(data.tickets);
  }, []);

  useEffect(() => {
    cargar(filtro);
  }, [cargar, filtro]);

  async function abrir(t: Ticket) {
    setAbierto(t);
    setHilo(null);
    const res = await fetch(`/api/admin/tickets/${t.id}`);
    const data = await res.json();
    if (res.ok) setHilo(data.messages);
  }

  async function responder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!abierto) return;
    setEnviando(true);
    const form = e.currentTarget;
    const message = String(new FormData(form).get("message") || "");
    const res = await fetch(`/api/admin/tickets/${abierto.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    setEnviando(false);
    if (res.ok) {
      form.reset();
      abrir(abierto);
      cargar(filtro);
    }
  }

  if (denegado) {
    return (
      <div className="auth-wrap escena">
        <div className="card auth-card" style={{ textAlign: "center" }}>
          <h1>Solo administración</h1>
          <p className="auth-sub">Entra con una cuenta de administrador para atender el soporte.</p>
          <Link href="/login?next=/admin" className="btn btn-primary" style={{ width: "100%" }}>
            Iniciar sesión
          </Link>
        </div>
      </div>
    );
  }

  if (tickets === null) return <div className="auth-wrap escena"><Loading messages={["Cargando la bandeja de soporte…"]} /></div>;

  return (
    <div className={embedded ? "" : "container"} style={embedded ? undefined : { padding: "34px 24px 60px" }}>
      <div className="section-toolbar">
        <div>
          {/* Dentro del panel la cabecera ya la pone el panel: repetirla aquí
              dejaba dos títulos «Soporte» seguidos */}
          {!embedded && <h1 style={{ fontSize: 26 }}>Soporte</h1>}
          <p className="panel-sub">Tickets de los proveedores. Los abiertos van primero.</p>
        </div>
        <select className="input" style={{ width: 180 }} value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar por estado">
          <option value="">Todos</option>
          <option value="abierto">Abiertos</option>
          <option value="respondido">Respondidos</option>
          <option value="cerrado">Cerrados</option>
        </select>
      </div>

      {abierto ? (
        <div className="detail">
          <button className="btn btn-ghost btn-sm" onClick={() => setAbierto(null)} style={{ marginBottom: 18 }}>
            <Icon name="back" size={15} /> Volver a la bandeja
          </button>
          <div className="ticket-head">
            <h2>{abierto.subject}</h2>
            <span className={`badge ${BADGE[abierto.status]}`}>{abierto.status}</span>
          </div>
          <p className="panel-sub" style={{ marginBottom: 18 }}>
            De <strong>{abierto.provider}</strong> ({abierto.providerEmail})
          </p>

          {!hilo && <Loading messages={["Abriendo el hilo…"]} compact />}
          {hilo && (
            <>
              <div className="ticket-hilo">
                {hilo.map((m) => (
                  <div key={m.id} className={`ticket-msg ${m.author === "admin" ? "propio" : "soporte"}`}>
                    <div className="ticket-msg-meta">
                      {m.author === "admin" ? "Soporte (tú)" : abierto.provider} · {fecha(m.createdAt)}
                    </div>
                    <p>{m.body}</p>
                  </div>
                ))}
              </div>
              <form onSubmit={responder} className="ticket-respuesta">
                <textarea name="message" className="input" rows={3} required placeholder="Escribe la respuesta…" maxLength={5000} />
                <div className="row-actions" style={{ marginTop: 10 }}>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={enviando}>
                    {enviando ? "Enviando…" : "Responder"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={async () => {
                      await fetch(`/api/admin/tickets/${abierto.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: "cerrado" }),
                      });
                      setAbierto(null);
                      cargar(filtro);
                    }}
                  >
                    Cerrar ticket
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      ) : tickets.length === 0 ? (
        <div className="pa-empty">No hay tickets{filtro ? " con ese estado" : ""}.</div>
      ) : (
        <table className="panel-table">
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>Asunto</th>
              <th>Estado</th>
              <th>Última actividad</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id} className="row-click" onClick={() => abrir(t)}>
                <td>{t.provider}</td>
                <td>{t.subject}</td>
                <td><span className={`badge ${BADGE[t.status]}`}>{t.status}</span></td>
                <td>{fecha(t.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
