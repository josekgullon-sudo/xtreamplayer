"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

interface Profile {
  id: number;
  name: string;
  avatar: string;
  kids: boolean;
}

const COLORES = ["#e5192b", "#2ecc8f", "#3b82f6", "#f59e0b", "#a855f7"];

function inicial(nombre: string) {
  return nombre.trim().slice(0, 1).toUpperCase() || "?";
}

/**
 * Pantalla de «¿quién está viendo?». Solo aparece cuando la cuenta tiene
 * más de un perfil o el usuario decide cambiarlo: con uno solo se entra
 * directo, para no meter un paso de más a quien no lo necesita.
 */
export default function ProfileGate({
  onReady,
  onResuelto,
}: {
  onReady: (profile: Profile) => void;
  /**
   * Se llama en cuanto esta pantalla deja de tener nada que preguntar, tanto
   * si eligió el usuario como si nunca llegó a mostrarse (invitado, o cuenta
   * con un solo perfil). El reproductor lo necesita para saber cuándo puede
   * enseñar la suya sin pisarse con esta.
   */
  onResuelto?: () => void;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [max, setMax] = useState(1);
  const [owner, setOwner] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guardamos el callback en una referencia: si dependiéramos de él, cada
  // render del reproductor crearía uno nuevo y la carga se repetiría en bucle.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onResueltoRef = useRef(onResuelto);
  onResueltoRef.current = onResuelto;

  const load = useCallback(async () => {
    const res = await fetch("/api/profiles");
    const data = await res.json();
    if (!data.owner) {
      // Invitado sin cuenta: no hay perfiles que elegir
      setVisible(false);
      onResueltoRef.current?.();
      return;
    }
    setOwner(data.owner);
    setProfiles(data.profiles);
    setMax(data.max);

    /*
     * Se pregunta siempre al entrar, también con un solo perfil: quien comparte
     * la cuenta necesita ver de quién es la sesión antes de empezar, y es el
     * único momento en que puede cambiarla. Saltárselo cuando solo hay uno
     * ahorraba un clic, pero dejaba a esa persona sin manera de saber con qué
     * perfil estaba viendo.
     */
    setVisible(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function elegir(p: Profile) {
    await fetch("/api/profiles", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: p.id }),
    });
    onReadyRef.current(p);
    setVisible(false);
    onResueltoRef.current?.();
  }

  async function crear(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: String(form.get("name") || ""), kids: form.get("kids") === "on" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "No se pudo crear el perfil");
      return;
    }
    setCreating(false);
    const res2 = await fetch("/api/profiles");
    const d2 = await res2.json();
    setProfiles(d2.profiles);
    setMax(d2.max);
  }

  if (!visible) return null;

  return (
    <div className="profile-gate">
      <div className="profile-gate-inner">
        <h1>¿Quién está viendo?</h1>
        <p className="profile-gate-sub">Cada perfil guarda sus propios favoritos y su historial.</p>

        {error && (
          <div className="error-box" style={{ marginBottom: 18 }} role="alert">
            {error}
          </div>
        )}

        <div className="profile-list">
          {profiles.map((p, i) => (
            <button key={p.id} className="profile-item" onClick={() => elegir(p)}>
              <span className="profile-avatar" style={{ background: COLORES[i % COLORES.length] }}>
                {inicial(p.name)}
              </span>
              <span className="profile-name">{p.name}</span>
              {p.kids && <span className="badge badge-accent">Infantil</span>}
            </button>
          ))}

          {profiles.length < max && (
            <button className="profile-item profile-add" onClick={() => setCreating(true)}>
              <span className="profile-avatar profile-avatar-add">
                <Icon name="plus" size={26} />
              </span>
              <span className="profile-name">Añadir perfil</span>
            </button>
          )}
        </div>

        {profiles.length >= max && (
          <p className="profile-limit">
            {owner === "customer"
              ? `Tu proveedor te permite ${max} perfil${max === 1 ? "" : "es"}.`
              : `Tu plan incluye ${max} perfil${max === 1 ? "" : "es"}. Premium sube a 5.`}
          </p>
        )}

        {creating && (
          <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setCreating(false)}>
            <div className="modal" style={{ maxWidth: 400 }} role="dialog" aria-modal="true" aria-label="Nuevo perfil">
              <h2>Nuevo perfil</h2>
              <p className="modal-sub">Ponle un nombre para reconocerlo.</p>
              <form onSubmit={crear}>
                <div className="auth-field">
                  <label className="label" htmlFor="pf-name">Nombre</label>
                  <input id="pf-name" name="name" className="input" required maxLength={30} placeholder="Ej: Salón, Ana, Niños" />
                </div>
                <label className="perm-row" style={{ marginBottom: 18 }}>
                  <input type="checkbox" name="kids" />
                  <span>
                    <strong>Perfil infantil</strong>
                    <small>Pensado para que los peques tengan su propio espacio.</small>
                  </span>
                </label>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setCreating(false)} data-tv-close>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary">Crear perfil</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
