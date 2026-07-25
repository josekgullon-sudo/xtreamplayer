"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { detectTv, findNextFocus, focusElement, getTvPreference, setTvPreference, TV_KEYS, keyMatches } from "@/lib/tv";

interface TvContextValue {
  tvMode: boolean;
  setTvMode: (enabled: boolean) => void;
}

const TvContext = createContext<TvContextValue>({ tvMode: false, setTvMode: () => {} });

export function useTvMode() {
  return useContext(TvContext);
}

/**
 * Activa el modo TV (interfaz grande + navegación por mando) y gestiona el
 * foco espacial. En TV el usuario no tiene ratón: cada pulsación de flecha
 * mueve el foco al elemento visualmente más cercano en esa dirección.
 */
export default function TvModeProvider({ children }: { children: React.ReactNode }) {
  const [tvMode, setTvModeState] = useState(false);

  useEffect(() => {
    const preference = getTvPreference();
    setTvModeState(preference !== null ? preference : detectTv());
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("tv-mode", tvMode);
  }, [tvMode]);

  const setTvMode = useCallback((enabled: boolean) => {
    setTvPreference(enabled);
    setTvModeState(enabled);
  }, []);

  // Navegación con mando
  useEffect(() => {
    if (!tvMode) return;

    function onKeyDown(e: KeyboardEvent) {
      const code = e.keyCode || 0;
      const active = document.activeElement as HTMLElement | null;
      const inTextField =
        active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA") && active.getAttribute("type") !== "checkbox";

      // Atrás: sale del campo de texto, cierra modal o vuelve atrás
      if (keyMatches(code, TV_KEYS.BACK)) {
        if (inTextField) {
          active?.blur();
          e.preventDefault();
          return;
        }
        const closeBtn = document.querySelector<HTMLElement>(".modal-backdrop [data-tv-close]");
        if (closeBtn) {
          closeBtn.click();
          e.preventDefault();
          return;
        }
        if (window.history.length > 1) {
          e.preventDefault();
          window.history.back();
        }
        return;
      }

      // Dentro de un campo de texto, izquierda/derecha mueven el cursor
      if (inTextField && (keyMatches(code, TV_KEYS.LEFT) || keyMatches(code, TV_KEYS.RIGHT))) return;

      let direction: "up" | "down" | "left" | "right" | null = null;
      if (keyMatches(code, TV_KEYS.UP)) direction = "up";
      else if (keyMatches(code, TV_KEYS.DOWN)) direction = "down";
      else if (keyMatches(code, TV_KEYS.LEFT)) direction = "left";
      else if (keyMatches(code, TV_KEYS.RIGHT)) direction = "right";

      if (direction) {
        const next = findNextFocus(direction, active);
        if (next) {
          e.preventDefault();
          focusElement(next);
        }
        return;
      }

      // Play/pausa del mando sobre el vídeo
      if (keyMatches(code, TV_KEYS.PLAY_PAUSE)) {
        const video = document.querySelector<HTMLVideoElement>(".pa-video-zone video");
        if (video) {
          e.preventDefault();
          if (video.paused) video.play().catch(() => {});
          else video.pause();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [tvMode]);

  // Al entrar en modo TV, coloca el foco en algo útil
  useEffect(() => {
    if (!tvMode) return;
    const timer = setTimeout(() => {
      if (document.activeElement === document.body || !document.activeElement) {
        focusElement(findNextFocus("down", null));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [tvMode]);

  return <TvContext.Provider value={{ tvMode, setTvMode }}>{children}</TvContext.Provider>;
}
