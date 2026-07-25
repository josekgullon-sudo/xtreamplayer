"use client";

import { useEffect, useState } from "react";

/**
 * Indicador de carga con mensajes que se van sucediendo.
 *
 * Una lista IPTV grande puede tardar bastante en descargarse y procesarse.
 * Un texto fijo hace pensar que se ha quedado colgado; ir contando qué se
 * está haciendo mantiene la sensación de avance y evita que el usuario
 * recargue a mitad.
 */

export const MENSAJES_CANALES = [
  "Conectando con tu servidor…",
  "Descargando la lista de canales…",
  "Ordenando por categorías…",
  "Casi listo, preparando el mando…",
  "Tu lista es grande, aguanta un poco más…",
];

export const MENSAJES_CINE = [
  "Conectando con tu servidor…",
  "Buscando el catálogo de películas…",
  "Cargando carátulas…",
  "Poniendo las palomitas…",
];

export const MENSAJES_SERIES = [
  "Conectando con tu servidor…",
  "Buscando tus series…",
  "Ordenando temporadas y episodios…",
];

export const MENSAJES_PANEL = ["Cargando tu panel…", "Recuperando tus clientes…", "Casi listo…"];

export const MENSAJES_CLIENTE = ["Cargando la ficha…", "Consultando dispositivos y conexiones…"];

export const MENSAJES_LISTA = [
  "Comprobando el enlace…",
  "Conectando con el servidor…",
  "Validando tu suscripción…",
  "Preparando tus canales…",
];

export const MENSAJES_CUENTA = ["Cargando tu cuenta…", "Recuperando tus listas…"];

export const MENSAJES_ACCESO = ["Comprobando tus datos…", "Preparando tu lista…", "Encendiendo la tele…"];

export default function Loading({
  messages = MENSAJES_CANALES,
  intervalMs = 2500,
  compact = false,
}: {
  messages?: string[];
  /** Cada cuánto pasa al siguiente mensaje */
  intervalMs?: number;
  /** Versión reducida para barras laterales y huecos pequeños */
  compact?: boolean;
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Se detiene en el último mensaje: seguir rotando sería mentir sobre el avance
    if (step >= messages.length - 1) return;
    const t = setTimeout(() => setStep((s) => s + 1), intervalMs);
    return () => clearTimeout(t);
  }, [step, messages.length, intervalMs]);

  return (
    <div className={`loading ${compact ? "loading-compact" : ""}`} role="status" aria-live="polite">
      <div className="pa-spinner" />
      <p className="loading-msg">{messages[step]}</p>
      <div className="loading-bar" aria-hidden="true">
        <div className="loading-bar-fill" />
      </div>
    </div>
  );
}

/** Esqueleto de lista, para que el hueco no quede vacío mientras carga. */
export function SkeletonList({ rows = 8 }: { rows?: number }) {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skeleton-row" key={i}>
          <span className="skeleton-box" style={{ width: 28, height: 28, borderRadius: 6 }} />
          <span className="skeleton-box" style={{ flex: 1, height: 12, maxWidth: `${55 + ((i * 13) % 35)}%` }} />
        </div>
      ))}
    </div>
  );
}
