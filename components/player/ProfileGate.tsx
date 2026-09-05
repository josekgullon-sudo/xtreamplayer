"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

interface Profile {
  id: number;
  name: string;
  avatar: string;
  kids: boolean;
  /** Si pide PIN. Cuál es no sale del servidor. */
  conPin?: boolean;
}

const COLORES = ["#e5192b", "#2ecc8f", "#3b82f6", "#f59e0b", "#a855f7"];

/**
 * Perfil recordado en este aparato. Quien ve la tele solo en su casa no
 * quiere elegirse a sí mismo cada noche; quien comparte cuenta, sí. Lo
 * decide el usuario con la casilla, y se guarda por aparato: recordarlo en
 * el salón no obliga a nadie en el móvil.
 */
const K_PERFIL_FIJO = "xp.perfilFijo.v1";

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
  /** El perfil cuyo PIN se está pidiendo, si hay alguno. */
  const [pidiendoPin, setPidiendoPin] = useState<Profile | null>(null);
  /** El perfil que se está editando: su nombre y su PIN. */
  const [editando, setEditando] = useState<Profile | null>(null);
  const [recordar, setRecordar] = useState(false);
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

    // Perfil fijado en este aparato: se entra directo con él
    const fijo = Number(localStorage.getItem(K_PERFIL_FIJO) || 0);
    const recordado = fijo ? data.profiles.find((p: Profile) => p.id === fijo) : null;
    if (recordado) {
      await fetch("/api/profiles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: recordado.id }),
      }).catch(() => {});
      onReadyRef.current(recordado);
      setVisible(false);
      onResueltoRef.current?.();
      return;
    }

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

  async function elegir(p: Profile, pin?: string) {
    const res = await fetch("/api/profiles", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: p.id, pin }),
    });
    /*
     * El perfil con PIN pide su PIN.
     *
     * Lo que protege a un niño no es un candado en SU perfil —ese tiene que
     * poder abrirlo él—, sino uno en los de los mayores: sin esto, salirse
     * del perfil infantil es elegir otro en esta misma pantalla.
     */
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      if (d.pide === "pin") {
        setPidiendoPin(p);
        setError(pin ? "Ese PIN no es" : null);
        return;
      }
      setError(d.error || "No se pudo elegir el perfil");
      return;
    }
    setPidiendoPin(null);
    // La casilla se lee al elegir, no al marcarla: así fijar el perfil es
    // parte del mismo gesto de entrar, sin un botón de guardar aparte
    try {
      if (recordar) localStorage.setItem(K_PERFIL_FIJO, String(p.id));
      else localStorage.removeItem(K_PERFIL_FIJO);
    } catch {
      /* almacenamiento bloqueado: se entra igual, solo que sin recordar */
    }
    onReadyRef.current(p);
    setVisible(false);
    onResueltoRef.current?.();
  }

  /**
   * Guardar el nombre y el PIN de un perfil.
   *
   * `pinSuelto` sirve para «quitar el PIN», que no viene del formulario
   * sino de su propio botón: mandar el campo vacío también lo quitaría,
   * pero entonces cambiar solo el nombre lo borraría sin querer.
   */
  async function guardarPerfil(e: React.FormEvent<HTMLFormElement> | null, pinSuelto?: string) {
    e?.preventDefault();
    if (!editando) return;
    const form = e ? new FormData(e.currentTarget) : null;
    const cambios: Record<string, string> = {};
    const nombre = String(form?.get("name") || "").trim();
    if (nombre) cambios.name = nombre;
    const pin = pinSuelto !== undefined ? pinSuelto : String(form?.get("pin") || "").trim();
    /* Vacío desde el formulario es «no lo toques»; desde el botón, «quítalo» */
    if (pinSuelto !== undefined || pin) cambios.pin = pin;

    const res = await fetch(`/api/profiles/${editando.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cambios),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "No se pudo guardar");
      return;
    }
    setEditando(null);
    setError(null);
    await load();
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
                {/* El candado, sobre el avatar: dice antes de pulsar que
                    esto va a pedir algo */}
                {p.conPin && (
                  <span className="profile-candado" aria-hidden="true">
                    <Icon name="lock" size={13} />
                  </span>
                )}
              </span>
              <span className="profile-name">{p.name}</span>
              {p.kids && <span className="badge badge-accent">Infantil</span>}
              {/*
                Editar, en la propia tarjeta.
                Es donde se busca —«¿quién está viendo?» es la pantalla de
                los perfiles— y es lo único que faltaba para poder poner un
                PIN sin pasar por ningún ajuste escondido.
              */}
              <span
                className="profile-editar"
                role="button"
                tabIndex={0}
                aria-label={`Editar ${p.name}`}
                onClick={(e) => { e.stopPropagation(); setEditando(p); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setEditando(p); } }}
              >
                <Icon name="pencil" size={13} />
              </span>
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

        <label className="profile-recordar">
          <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} />
          <span>Entrar siempre con este perfil en este dispositivo</span>
        </label>

        {profiles.length >= max && (
          <p className="profile-limit">
            {owner === "customer"
              ? `Tu proveedor te permite ${max} perfil${max === 1 ? "" : "es"}.`
              : `Tu plan incluye ${max} perfil${max === 1 ? "" : "es"}. Premium sube a 5.`}
          </p>
        )}

        {/* Y el teclado del PIN, cuatro cifras y ya */}
        {pidiendoPin && (
          <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setPidiendoPin(null)}>
            <div className="modal" style={{ maxWidth: 340 }} role="dialog" aria-modal="true" aria-label="PIN del perfil">
              <h2>PIN de {pidiendoPin.name}</h2>
              <p className="modal-sub">Este perfil está protegido con cuatro cifras.</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const pin = String(new FormData(e.currentTarget).get("pin") || "");
                  elegir(pidiendoPin, pin);
                }}
              >
                <input
                  id="pf-pin"
                  name="pin"
                  className="input pin-campo"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  required
                  autoFocus
                  autoComplete="off"
                  placeholder="••••"
                />
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setPidiendoPin(null)} data-tv-close>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary">Entrar</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Editar un perfil: su nombre y su PIN */}
        {editando && (
          <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setEditando(null)}>
            <div className="modal" style={{ maxWidth: 400 }} role="dialog" aria-modal="true" aria-label="Editar perfil">
              <h2>Editar {editando.name}</h2>
              <form onSubmit={guardarPerfil}>
                <div className="auth-field">
                  <label className="label" htmlFor="pf-ed-name">Nombre</label>
                  <input id="pf-ed-name" name="name" className="input" required maxLength={30} defaultValue={editando.name} />
                </div>
                <div className="auth-field">
                  <label className="label" htmlFor="pf-ed-pin">PIN de cuatro cifras</label>
                  <input
                    id="pf-ed-pin"
                    name="pin"
                    className="input pin-campo"
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    autoComplete="off"
                    defaultValue=""
                    placeholder={editando.conPin ? "Tiene PIN · escribe otro para cambiarlo" : "Sin PIN"}
                  />
                  {/*
                    Lo que hace un PIN aquí, dicho: el que se pone en el
                    perfil de los mayores es lo que impide que el niño se
                    salga del suyo eligiendo otro en esta misma pantalla.
                  */}
                  <p className="campo-pista">
                    Ponlo en los perfiles de los mayores: así, desde el perfil infantil no se puede cambiar a otro.
                  </p>
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
                  {editando.conPin ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => guardarPerfil(null, "")}>
                      Quitar el PIN
                    </button>
                  ) : (
                    <span />
                  )}
                  <span style={{ display: "flex", gap: 10 }}>
                    <button type="button" className="btn btn-ghost" onClick={() => setEditando(null)} data-tv-close>
                      Cancelar
                    </button>
                    <button type="submit" className="btn btn-primary">Guardar</button>
                  </span>
                </div>
              </form>
            </div>
          </div>
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
