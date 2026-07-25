"use client";

/**
 * Detección de televisores y navegación espacial con mando a distancia.
 *
 * Cubre Samsung (Tizen), LG (webOS), Android TV / Fire TV y navegadores de TV
 * genéricos. El mismo código sirve para las tres tiendas: solo cambia el
 * empaquetado final.
 */

export const TV_STORAGE_KEY = "xp.tvMode.v1";

/** Códigos de tecla de los mandos (los de TV difieren de los del teclado). */
export const TV_KEYS = {
  LEFT: [37, 0x25],
  UP: [38],
  RIGHT: [39],
  DOWN: [40],
  ENTER: [13, 0xd],
  // Tizen: 10009, webOS: 461, Android TV/Fire TV: 27 (Escape) y 8 (Backspace)
  BACK: [10009, 461, 27, 8],
  // Teclas de color y multimedia habituales en mandos
  PLAY_PAUSE: [179, 415, 19, 10252],
  CHANNEL_UP: [427, 33],
  CHANNEL_DOWN: [428, 34],
} as const;

export function detectTv(): boolean {
  if (typeof window === "undefined") return false;

  const ua = navigator.userAgent.toLowerCase();
  const tvSignatures = [
    "tizen",
    "web0s",
    "webos",
    "smart-tv",
    "smarttv",
    "googletv",
    "android tv",
    "aft", // Amazon Fire TV: AFTB, AFTS, AFTM…
    "hbbtv",
    "netcast",
    "viera",
    "bravia",
    "philipstv",
    "crkey", // Chromecast
  ];
  if (tvSignatures.some((sig) => ua.includes(sig))) return true;

  // APIs propias de las plataformas de TV
  const w = window as unknown as Record<string, unknown>;
  if (w.tizen || w.webOS || w.webOSSystem) return true;

  return false;
}

/** El usuario puede forzar u ocultar el modo TV manualmente. */
export function getTvPreference(): boolean | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(TV_STORAGE_KEY);
  if (stored === "1") return true;
  if (stored === "0") return false;
  return null;
}

export function setTvPreference(enabled: boolean | null) {
  if (enabled === null) localStorage.removeItem(TV_STORAGE_KEY);
  else localStorage.setItem(TV_STORAGE_KEY, enabled ? "1" : "0");
}

export function keyMatches(keyCode: number, group: readonly number[]): boolean {
  return group.includes(keyCode);
}

/* ---------------- Navegación espacial ---------------- */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Rect {
  el: HTMLElement;
  cx: number;
  cy: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

function visibleTargets(): Rect[] {
  const out: Rect[] = [];
  document.querySelectorAll<HTMLElement>(FOCUSABLE).forEach((el) => {
    if (el.offsetParent === null && el.tagName !== "BODY") return; // oculto
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    out.push({
      el,
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
    });
  });
  return out;
}

/**
 * Encuentra el siguiente elemento en la dirección dada.
 * Prioriza el solapamiento en el eje perpendicular (comportamiento esperado
 * en TV: bajar dentro de una columna, no saltar a otra) y luego la distancia.
 */
export function findNextFocus(
  direction: "up" | "down" | "left" | "right",
  current: HTMLElement | null
): HTMLElement | null {
  const targets = visibleTargets();
  if (!targets.length) return null;
  if (!current) return targets[0].el;

  const cur = targets.find((t) => t.el === current);
  if (!cur) return targets[0].el;

  const candidates = targets.filter((t) => {
    if (t.el === current) return false;
    switch (direction) {
      case "up":
        return t.cy < cur.top + 1;
      case "down":
        return t.cy > cur.bottom - 1;
      case "left":
        return t.cx < cur.left + 1;
      case "right":
        return t.cx > cur.right - 1;
    }
  });
  if (!candidates.length) return null;

  const vertical = direction === "up" || direction === "down";

  let best: Rect | null = null;
  let bestScore = Infinity;
  for (const t of candidates) {
    // Distancia en el eje de movimiento
    const primary = vertical ? Math.abs(t.cy - cur.cy) : Math.abs(t.cx - cur.cx);
    // Desalineación en el eje perpendicular
    const overlap = vertical
      ? Math.max(0, Math.min(t.right, cur.right) - Math.max(t.left, cur.left))
      : Math.max(0, Math.min(t.bottom, cur.bottom) - Math.max(t.top, cur.top));
    const misalign = vertical ? Math.abs(t.cx - cur.cx) : Math.abs(t.cy - cur.cy);
    // El solapamiento reduce mucho el coste: mantiene la navegación en columna/fila
    const score = primary + (overlap > 0 ? misalign * 0.2 : misalign * 3);
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best?.el ?? null;
}

export function focusElement(el: HTMLElement | null) {
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
}
