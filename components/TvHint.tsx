"use client";

import { useTvMode } from "./TvModeProvider";

/** Guía de mando fija en la parte inferior (solo visible en modo TV). */
export default function TvHint() {
  const { tvMode, setTvMode } = useTvMode();
  if (!tvMode) return null;

  return (
    <div className="tv-hint" role="note">
      <span>
        <span className="kbd">▲▼◀▶</span> Moverse
      </span>
      <span>
        <span className="kbd">OK</span> Seleccionar
      </span>
      <span>
        <span className="kbd">↩</span> Atrás
      </span>
      <span>
        <span className="kbd">▶❚❚</span> Play / Pausa
      </span>
      <button
        className="btn btn-ghost btn-sm"
        style={{ pointerEvents: "auto" }}
        onClick={() => setTvMode(false)}
      >
        Salir del modo TV
      </button>
    </div>
  );
}
