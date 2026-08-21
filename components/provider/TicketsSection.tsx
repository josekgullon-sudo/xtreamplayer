"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import Loading from "@/components/Loading";

interface Ticket {
  id: number;
  subject: string;
  status: "abierto" | "respondido" | "cerrado";
  createdAt: number;
  updatedAt: number;
}

interface Mensaje {
  id: number;
  author: "provider" | "admin";
  body: string;
  createdAt: number;
}

const ESTADOS: Record<Ticket["status"], { texto: string; clase: string }> = {
  abierto: { texto: "Abierto", clase: "badge-accent" },
  respondido: { texto: "Respondido", clase: "badge-success" },
  cerrado: { texto: "Cerrado", clase: "" },
};

function fecha(ms: number) {
  return new Date(ms).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Soporte del proveedor: abre tickets a la plataforma y sigue el hilo. */
export default function TicketsSection() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [hilo, setHilo] = useState<{ ticket: Ticket; messages: Mensaje[] } | null>(null);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/provider/tickets");
    const data = await res.json();
    if (res.ok) setTickets(data.tickets);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abrirHilo = useCallback(async (id: number) => {
    setAbierto(id);
    setHilo(null);
    const res = await fetch(`/api/provider/tickets/${id}`);
    const data = await res.json();
    if (res.ok) setHilo(data);
  }, []);

  async function crear(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/provider/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: form.get("subject"), message: form.get("message") }),
    });
    const data = await res.json();
    setEnviando(false);
    if (!res.ok) {
      setError(data.error || "No se pudo abrir el ticket");
      return;
    }
    setCreando(false);
    await cargar();
    abrirHilo(data.id);
  }

  async function responder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!abierto) return;
    setError(null);
    setEnviando(true);
    const form = e.currentTarget;
    const message = String(new FormData(form).get("message") || "");
    const res = await fetch(`/api/provider/tickets/${abierto}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    setEnviando(false);
    if (!res.ok) {
      setError((await res.json()).error || "No se pudo enviar");
      return;
    }
    form.reset();
    abrirHilo(abierto);
    cargar();
  }

  async function cerrar() {
    if (!abierto) return;
    await fetch(`/api/provider/tickets/${abierto}`, { method: "PATCH" });
    abrirHilo(abierto);
    cargar();
  }

  if (tickets === null) return <Loading messages={["Cargando tus tickets…"]} compact />;

  // Hilo abierto
  if (abierto !== null) {
    return (
      <div className="detail">
        <button className="btn btn-ghost btn-sm" onClick={() => { setAbierto(null); setHilo(null); }} style={{ marginBottom: 18 }}>
          <Icon name="back" size={15} /> Volver a soporte
        </button>

        {!hilo && <Loading messages={["Abriendo el hilo…"]} compact />}
        {hilo && (
          <>
            <div className="ticket-head">
              <h2>{hilo.ticket.subject}</h2>
              <span className={`badge ${ESTADOS[hilo.ticket.status].clase}`}>{ESTADOS[hilo.ticket.status].texto}</span>
            </div>

            <div className="ticket-hilo">
              {hilo.messages.map((m) => (
                <div key={m.id} className={`ticket-msg ${m.author === "provider" ? "propio" : "soporte"}`}>
                  <div className="ticket-msg-meta">
                    {m.author === "provider" ? "Tú" : "Soporte TOTALplayer"} · {fecha(m.createdAt)}
                  </div>
                  <p>{m.body}</p>
                </div>
              ))}
            </div>

            {error && <div className="error-box" role="alert" style={{ marginBottom: 14 }}>{error}</div>}

            {hilo.ticket.status !== "cerrado" ? (
              <form onSubmit={responder} className="ticket-respuesta">
                <textarea name="message" className="input" rows={3} required placeholder="Escribe tu respuesta…" maxLength={5000} />
                <div className="row-actions" style={{ marginTop: 10 }}>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={enviando}>
                    {enviando ? "Enviando…" : "Responder"}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={cerrar}>
                    Dar por resuelto
                  </button>
                </div>
              </form>
            ) : (
              <p className="panel-sub">Este ticket está cerrado. Si el problema vuelve, abre uno nuevo.</p>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="section-toolbar">
        <p className="panel-sub" style={{ margin: 0 }}>
          ¿Algo no funciona o tienes una duda? Te respondemos aquí mismo.
        </p>
        <button className="btn btn-primary btn-sm" onClick={() => setCreando(true)}>
          <Icon name="plus" size={15} /> Nuevo ticket
        </button>
      </div>

      {tickets.length === 0 ? (
        /* Dentro de una caja, como el resto de listas vacías del panel: sola
           en medio de la pantalla, la frase parecía un resto de carga */
        <div className="card">
          <div className="pa-empty">No has abierto ningún ticket todavía.</div>
        </div>
      ) : (
        <table className="panel-table">
          <thead>
            <tr>
              <th>Asunto</th>
              <th>Estado</th>
              <th>Última actividad</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id} className="row-click" onClick={() => abrirHilo(t.id)}>
                <td>{t.subject}</td>
                <td><span className={`badge ${ESTADOS[t.status].clase}`}>{ESTADOS[t.status].texto}</span></td>
                <td>{fecha(t.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {creando && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setCreando(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Nuevo ticket">
            <h2>Nuevo ticket</h2>
            <p className="modal-sub">Cuéntanos qué pasa con el máximo detalle posible.</p>
            {error && <div className="error-box" role="alert" style={{ marginBottom: 14 }}>{error}</div>}
            <form onSubmit={crear}>
              <div className="auth-field">
                <label className="label" htmlFor="tk-subject">Asunto</label>
                <input id="tk-subject" name="subject" className="input" required maxLength={140} placeholder="Ej: Un cliente no puede entrar" />
              </div>
              <div className="auth-field">
                <label className="label" htmlFor="tk-message">Mensaje</label>
                <textarea id="tk-message" name="message" className="input" rows={5} required maxLength={5000} placeholder="Qué ocurre, desde cuándo, a qué clientes afecta…" />
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-ghost" onClick={() => setCreando(false)} data-tv-close>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={enviando}>
                  {enviando ? "Enviando…" : "Abrir ticket"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
