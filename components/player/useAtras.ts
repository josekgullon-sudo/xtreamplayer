"use client";

import { useEffect, useRef } from "react";

export interface Capa {
  /** Si esta capa está abierta ahora mismo. */
  abierta: boolean;
  /** Cerrarla. La de más adentro es la que cierra «atrás». */
  cerrar: () => void;
}

/*
 * Que «atrás» cierre la capa de encima, y no la aplicación entera.
 *
 * La ficha de una película, la de una serie y el vídeo se abren encima de lo
 * que había, sin cambiar de dirección. Para el navegador eso no es un paso
 * atrás que deshacer, así que:
 *
 * - En la aplicación de Android, el botón de atrás preguntaba a la web si
 *   tenía algo que deshacer, no lo tenía, y cerraba la aplicación. El cliente
 *   abría una película, se arrepentía, pulsaba atrás y se le cerraba todo.
 * - En el móvil, el gesto de volver hacía lo mismo.
 * - Y con teclado, Escape no cerraba nada.
 *
 * Se añade un paso al historial y ese paso es lo que «atrás» deshace. Así el
 * botón del teléfono, el gesto del navegador y Escape acaban en el mismo
 * sitio, sin que la aplicación de Android tenga que saber nada de fichas.
 *
 * El paso es UNO, no uno por capa. Poner y quitar pasos al pasar de la ficha
 * al vídeo no funciona: history.back() no ocurre cuando se llama, sino un
 * rato después, y el paso que se añadía para el vídeo se lo llevaba por
 * delante el back() de la ficha —el vídeo se cerraba solo nada más abrirlo—.
 * Con un único paso mientras haya algo abierto, ese cambio no toca el
 * historial y la carrera no existe.
 */
export function useAtras(capas: Capa[]) {
  const capasRef = useRef(capas);
  capasRef.current = capas;

  /** Hay un paso nuestro en el historial. */
  const puesto = useRef(false);
  /** Hemos pedido un history.back() y todavía no ha llegado. */
  const enVuelo = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const volver = () => {
      if (enVuelo.current) {
        // El back() lo pedimos nosotros al cerrar por otro medio: ya está
        enVuelo.current = false;
        puesto.current = false;
        if (capasRef.current.some((c) => c.abierta)) {
          history.pushState({ xpCapa: 1 }, "");
          puesto.current = true;
        }
        return;
      }
      puesto.current = false;
      const abiertas = capasRef.current.filter((c) => c.abierta);
      abiertas[abiertas.length - 1]?.cerrar();
      // Si debajo queda otra, el efecto de abajo repone el paso al repintar
    };

    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !puesto.current) return;
      // Escribiendo en un campo, Escape es para salir del campo
      const donde = e.target as HTMLElement | null;
      if (donde && /^(INPUT|TEXTAREA|SELECT)$/.test(donde.tagName)) return;
      history.back();
    };

    window.addEventListener("popstate", volver);
    document.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("popstate", volver);
      document.removeEventListener("keydown", tecla);
    };
  }, []);

  /* La cuenta de capas abiertas como dependencia: cambia al abrir, al cerrar
     y al pasar de la ficha al vídeo, que son los tres momentos en que hay
     que mirar si el paso sigue haciendo falta */
  const cuantas = capas.filter((c) => c.abierta).length;
  useEffect(() => {
    if (typeof window === "undefined" || enVuelo.current) return;
    if (cuantas > 0 && !puesto.current) {
      history.pushState({ xpCapa: 1 }, "");
      puesto.current = true;
    } else if (cuantas === 0 && puesto.current) {
      /* Cerrada por el aspa o tocando el fondo: sin quitar el paso haría
         falta pulsar atrás dos veces para salir, y la primera no haría nada */
      puesto.current = false;
      enVuelo.current = true;
      history.back();
    }
  }, [cuantas]);
}
