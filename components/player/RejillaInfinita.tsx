"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/*
 * Una rejilla de carátulas que crece según se baja.
 *
 * Cine y series se cortaban en 400 con un «Mostrando 400 de 12.000 — usa la
 * búsqueda para afinar». Quien no sabe qué busca no puede afinar nada: el
 * catálogo entero estaba ahí y no había forma de llegar a él.
 *
 * No se virtualiza como la lista de canales porque aquí las filas no tienen
 * un ancho fijo de columnas —cambia con el tamaño de la ventana—, y calcular
 * eso a mano se rompe en cuanto alguien toca el CSS. Se pinta un trozo y se
 * añade otro cuando el final entra en pantalla, que para carátulas con carga
 * perezosa da el mismo resultado sin inventar cuentas.
 */

/** Cuántas se pintan de entrada, y cuántas se añaden cada vez. */
const TRAMO = 120;

export default function RejillaInfinita<T>({
  items,
  tarjeta,
  clave,
  onRango,
}: {
  items: T[];
  tarjeta: (item: T, indice: number) => ReactNode;
  /** Al cambiar (otra categoría, otra búsqueda), se vuelve a empezar por el principio. */
  clave?: string;
  /** Cuántas hay puestas ahora mismo, para quien tenga que traer algo por cada una. */
  onRango?: (desde: number, hasta: number) => void;
}) {
  const [tope, setTope] = useState(TRAMO);
  const final = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTope(TRAMO);
  }, [clave, items.length]);

  useEffect(() => {
    const marca = final.current;
    if (!marca || tope >= items.length) return;
    if (typeof IntersectionObserver === "undefined") {
      setTope((t) => t + TRAMO);
      return;
    }
    /* El margen hace que el siguiente tramo esté puesto antes de llegar:
       así no se ve el salto ni el hueco en blanco mientras carga */
    const ojo = new IntersectionObserver(
      (entradas) => { if (entradas.some((e) => e.isIntersecting)) setTope((t) => t + TRAMO); },
      { rootMargin: "600px" }
    );
    ojo.observe(marca);
    return () => ojo.disconnect();
  }, [tope, items.length]);

  /* En un efecto: quien escucha esto guarda algo en su estado, y hacerlo a
     media pintura es un bucle */
  useEffect(() => {
    onRango?.(0, Math.min(tope, items.length));
  }, [onRango, tope, items.length]);

  return (
    <>
      {items.slice(0, tope).map((it, i) => tarjeta(it, i))}
      {tope < items.length && <div ref={final} className="pa-rejilla-final" aria-hidden="true" />}
    </>
  );
}
