"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Loading, { MENSAJES_CUENTA } from "@/components/Loading";

interface PlanInfo {
  plan: "free" | "premium";
  source: "trial" | "subscription" | "free";
  trialDaysLeft: number;
  premiumUntil: number;
  maxCloudPlaylists: number;
}

export default function AccountPanel() {
  const [email, setEmail] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      setNotice("¡Pago completado! Tu Premium se activará en unos segundos.");
    } else if (params.get("checkout") === "cancelled") {
      setNotice("Pago cancelado. Puedes suscribirte cuando quieras.");
    }
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setEmail(d.user?.email ?? null);
        setPlan(d.plan ?? null);
        setBillingEnabled(Boolean(d.billingEnabled));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function goTo(endpoint: "checkout" | "portal") {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/billing/${endpoint}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error || "Algo salió mal");
        return;
      }
      window.location.href = data.url;
    } catch {
      setNotice("No se pudo conectar. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <div className="auth-wrap escena"><Loading messages={MENSAJES_CUENTA} /></div>;

  if (!email) {
    return (
      <div className="auth-wrap escena">
        <div className="card auth-card" style={{ textAlign: "center" }}>
          <h1>Tu cuenta</h1>
          <p className="auth-sub">Inicia sesión para ver tu plan y tus listas sincronizadas.</p>
          <Link href="/login?next=/cuenta" className="btn btn-primary" style={{ width: "100%" }}>
            Iniciar sesión
          </Link>
          <p className="auth-alt">
            ¿No tienes cuenta? <Link href="/registro">Regístrate gratis</Link> — incluye 15 días de Premium.
          </p>
        </div>
      </div>
    );
  }

  const planLabel =
    plan?.source === "subscription"
      ? "Premium"
      : plan?.source === "trial"
        ? `Premium (prueba: ${plan.trialDaysLeft} ${plan.trialDaysLeft === 1 ? "día" : "días"} restantes)`
        : "Gratis";

  return (
    <div className="auth-wrap escena">
      <div className="card auth-card">
        <h1>Tu cuenta</h1>
        <p className="auth-sub">{email}</p>

        {notice && (
          <div
            className={notice.startsWith("¡") ? "badge badge-success" : "error-box"}
            style={{ marginBottom: 16, display: "block", padding: "10px 14px", fontSize: 14 }}
            role="status"
          >
            {notice}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderTop: "1px solid var(--border)" }}>
          <span style={{ color: "var(--text-dim)", fontSize: 14 }}>Plan actual</span>
          <span className={`badge ${plan?.plan === "premium" ? "badge-accent" : "badge-success"}`}>{planLabel}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderTop: "1px solid var(--border)", marginBottom: 20 }}>
          <span style={{ color: "var(--text-dim)", fontSize: 14 }}>Listas en la nube</span>
          <span style={{ fontSize: 14 }}>hasta {plan?.maxCloudPlaylists}</span>
        </div>

        {plan?.source === "subscription" ? (
          <button className="btn btn-ghost" style={{ width: "100%" }} onClick={() => goTo("portal")} disabled={busy}>
            Gestionar suscripción (facturas, tarjeta, cancelar)
          </button>
        ) : (
          <>
            <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => goTo("checkout")} disabled={busy || !billingEnabled}>
              {busy ? "Un momento…" : "Pasar a Premium — 2,99 €/mes"}
            </button>
            {!billingEnabled && (
              <p style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 10, textAlign: "center" }}>
                Los pagos estarán disponibles muy pronto.
                {plan?.source === "trial" ? " Mientras tanto, disfruta de tu prueba Premium." : ""}
              </p>
            )}
            {plan?.source === "trial" && (
              <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 10, textAlign: "center" }}>
                Al acabar la prueba pasarás al plan Gratis automáticamente — sin cargos ni sorpresas.
              </p>
            )}
          </>
        )}

        <p className="auth-alt" style={{ marginTop: 24 }}>
          <Link href="/player">← Volver al reproductor</Link>
        </p>
      </div>
    </div>
  );
}
