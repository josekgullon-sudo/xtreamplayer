"use client";

import { useState } from "react";
import { StoredPlaylist, newLocalId } from "@/lib/storage";
import { normalizeBase, parseXtreamUrl, XtreamUserInfo } from "@/lib/xtream";

export default function AddPlaylistModal({
  loggedIn,
  onAdd,
  onClose,
}: {
  loggedIn: boolean;
  onAdd: (playlist: StoredPlaylist, saveToCloud: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"xtream" | "m3u">("xtream");
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [m3uUrl, setM3uUrl] = useState("");
  const [cloud, setCloud] = useState(loggedIn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleHostPaste(value: string) {
    setHost(value);
    // Si pegan una URL get.php completa, autorrellenamos usuario y contraseña
    const creds = parseXtreamUrl(value);
    if (creds) {
      setHost(creds.base);
      setUsername(creds.username);
      setPassword(creds.password);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (tab === "xtream") {
        const base = normalizeBase(host);
        if (!base || !username || !password) {
          setError("Rellena servidor, usuario y contraseña");
          return;
        }
        // Verificación: handshake con player_api
        const params = new URLSearchParams({ base, username, password });
        const res = await fetch(`/api/xtream?${params}`);
        const data: XtreamUserInfo & { error?: string } = await res.json();
        if (!res.ok) {
          setError(data.error || "No se pudo conectar con el servidor");
          return;
        }
        if (!data.user_info || data.user_info.auth === 0) {
          setError("Usuario o contraseña incorrectos según el servidor IPTV");
          return;
        }
        if (data.user_info.status && data.user_info.status !== "Active") {
          setError(`Tu cuenta IPTV no está activa (estado: ${data.user_info.status})`);
          return;
        }
        const playlist: StoredPlaylist = {
          id: newLocalId(),
          name: name.trim() || data.user_info?.username || "Mi lista Xtream",
          type: "xtream",
          url: base,
          username,
          password,
        };
        await onAdd(playlist, cloud);
      } else {
        const url = m3uUrl.trim();
        if (!url) {
          setError("Pega la URL de tu lista M3U");
          return;
        }
        // Los enlaces get.php son Xtream: mejor experiencia por la API
        const creds = parseXtreamUrl(url);
        if (creds && /get\.php/i.test(url)) {
          const playlist: StoredPlaylist = {
            id: newLocalId(),
            name: name.trim() || "Mi lista Xtream",
            type: "xtream",
            url: creds.base,
            username: creds.username,
            password: creds.password,
          };
          await onAdd(playlist, cloud);
          return;
        }
        const res = await fetch(`/api/m3u?url=${encodeURIComponent(url)}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "No se pudo descargar la lista");
          return;
        }
        const playlist: StoredPlaylist = {
          id: newLocalId(),
          name: name.trim() || "Mi lista M3U",
          type: "m3u",
          url,
        };
        await onAdd(playlist, cloud);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo salió mal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Añadir lista">
        <h2>Añadir lista</h2>
        <p className="modal-sub">Conecta tu cuenta Xtream Codes o pega la URL de tu lista M3U.</p>

        <div className="pa-tabs" style={{ marginBottom: 20 }}>
          <button type="button" className={`pa-tab ${tab === "xtream" ? "active" : ""}`} onClick={() => setTab("xtream")}>
            Xtream Codes
          </button>
          <button type="button" className={`pa-tab ${tab === "m3u" ? "active" : ""}`} onClick={() => setTab("m3u")}>
            URL M3U
          </button>
        </div>

        {error && (
          <div className="error-box" style={{ marginBottom: 16 }} role="alert">
            {error}
          </div>
        )}

        <form onSubmit={submit}>
          <div className="auth-field">
            <label className="label" htmlFor="pl-name">Nombre de la lista (opcional)</label>
            <input id="pl-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Casa" />
          </div>

          {tab === "xtream" ? (
            <>
              <div className="auth-field">
                <label className="label" htmlFor="pl-host">Servidor (URL con puerto)</label>
                <input
                  id="pl-host"
                  className="input"
                  value={host}
                  onChange={(e) => handleHostPaste(e.target.value)}
                  placeholder="http://servidor.com:8080 — o pega tu URL get.php completa"
                  required
                />
              </div>
              <div className="auth-field">
                <label className="label" htmlFor="pl-user">Usuario</label>
                <input id="pl-user" className="input" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="off" />
              </div>
              <div className="auth-field">
                <label className="label" htmlFor="pl-pass">Contraseña</label>
                <input id="pl-pass" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="off" />
              </div>
            </>
          ) : (
            <div className="auth-field">
              <label className="label" htmlFor="pl-m3u">URL de la lista M3U / M3U8</label>
              <input
                id="pl-m3u"
                className="input"
                value={m3uUrl}
                onChange={(e) => setM3uUrl(e.target.value)}
                placeholder="https://ejemplo.com/lista.m3u"
                required
              />
            </div>
          )}

          {loggedIn ? (
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, color: "var(--text-dim)", marginBottom: 18, cursor: "pointer" }}>
              <input type="checkbox" checked={cloud} onChange={(e) => setCloud(e.target.checked)} />
              Guardar en mi cuenta (disponible en todos mis dispositivos)
            </label>
          ) : (
            <p style={{ fontSize: 13, color: "var(--text-faint)", marginBottom: 18 }}>
              Modo invitado: la lista se guarda solo en este navegador. Crea una cuenta gratis para sincronizarla.
            </p>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy} data-tv-close>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Comprobando…" : "Añadir y reproducir"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
