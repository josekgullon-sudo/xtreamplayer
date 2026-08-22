"use client";

/**
 * Red de seguridad: si algo revienta en el cliente, esto sustituye al
 * pantallazo blanco de «Application error» con una salida digna. Un dato
 * sucio de una lista IPTV nunca debería dejar la aplicación inutilizable.
 */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="auth-wrap escena">
      <div className="card auth-card" style={{ textAlign: "center" }}>
        <h1>Algo ha fallado</h1>
        <p className="auth-sub">
          Ha ocurrido un error inesperado. Suele bastar con reintentar; si se repite, recarga la página.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button className="btn btn-primary" onClick={reset}>
            Reintentar
          </button>
          <button className="btn btn-ghost" onClick={() => window.location.reload()}>
            Recargar
          </button>
        </div>
      </div>
    </div>
  );
}
