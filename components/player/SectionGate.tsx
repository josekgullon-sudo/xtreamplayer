"use client";

import { useEffect, useRef } from "react";
import Icon, { IconName } from "@/components/Icon";

export type Seccion = "live" | "vod" | "series" | "favs";

interface Opcion {
  id: Seccion;
  titulo: string;
  descripcion: string;
  icono: IconName;
}

/**
 * Pantalla de entrada: «¿qué quieres ver?».
 *
 * Con una lista grande, caer directamente en el listado de canales obliga a
 * buscar la pestaña de cine o series antes de saber siquiera que existen.
 * Preguntarlo de entrada, con tres destinos grandes, hace visible todo lo que
 * incluye la suscripción y evita ese paseo.
 *
 * Solo aparece cuando hay más de un destino: si la lista únicamente trae
 * canales, preguntar entre una sola opción es un paso de más.
 */
export default function SectionGate({
  marca,
  perfil,
  conCine,
  conFavoritos,
  onElegir,
}: {
  marca: string;
  perfil?: string | null;
  conCine: boolean;
  conFavoritos: boolean;
  onElegir: (seccion: Seccion) => void;
}) {
  const primeroRef = useRef<HTMLButtonElement>(null);

  // El foco arranca en la primera tarjeta para poder elegir con el mando o
  // con el teclado sin tener que tabular desde el principio de la página.
  useEffect(() => {
    primeroRef.current?.focus();
  }, []);

  const opciones: Opcion[] = [
    {
      id: "live",
      titulo: "TV en directo",
      descripcion: "Todos tus canales, ordenados por categoría",
      icono: "tv",
    },
  ];
  if (conCine) {
    opciones.push(
      { id: "vod", titulo: "Películas", descripcion: "El catálogo de cine de tu lista", icono: "film" },
      { id: "series", titulo: "Series", descripcion: "Temporadas y episodios, listos para ver", icono: "series" }
    );
  }
  if (conFavoritos) {
    opciones.push({ id: "favs", titulo: "Favoritos", descripcion: "Lo que has marcado con la estrella", icono: "star" });
  }

  return (
    <div className="section-gate" role="dialog" aria-modal="true" aria-label="Elige qué quieres ver">
      <div className="section-gate-inner">
        <p className="section-gate-brand">{marca}</p>
        <h1>{perfil ? `Hola, ${perfil}. ¿Qué te apetece ver?` : "¿Qué te apetece ver?"}</h1>
        <p className="section-gate-sub">Elige por dónde empezar. Podrás cambiar cuando quieras.</p>

        <div className="section-gate-grid">
          {opciones.map((o, i) => (
            <button
              key={o.id}
              ref={i === 0 ? primeroRef : undefined}
              className="section-card"
              onClick={() => onElegir(o.id)}
            >
              <span className="section-card-icon">
                <Icon name={o.icono} size={34} />
              </span>
              <span className="section-card-title">{o.titulo}</span>
              <span className="section-card-desc">{o.descripcion}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
