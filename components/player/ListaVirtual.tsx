"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/*
 * Una lista larga que solo pinta lo que se ve.
 *
 * «Todos los canales» llevaba un tope de 500: con una lista de 8.000 el
 * cliente veía 500 y los otros 7.500 no existían. Quitar el tope sin más
 * dejaba 8.000 botones con su imagen en el DOM, y el móvil se arrastraba al
 * desplazar.
 *
 * Aquí se pinta solo la ventana visible más un colchón, y el hueco de lo que
 * no está se rellena con dos separadores vacíos, para que la barra de
 * desplazamiento mida lo que tiene que medir.
 *
 * La altura de fila no se escribe a mano: se mide de una fila de verdad ya
 * pintada. Así vale igual para el escritorio (48px), el móvil (74px) y el
 * modo tele (78px) sin repetir aquí los números del CSS, que cambiarían por
 * su cuenta en cuanto alguien tocara la hoja de estilos.
 */

/** Por debajo de esto no compensa: se pinta entera. */
const UMBRAL = 200;
/** Filas de más por arriba y por abajo, para que el mando pueda saltar a ellas. */
const COLCHON = 8;

export default function ListaVirtual<T>({
  items,
  fila,
  altoPorDefecto = 48,
  clave,
}: {
  items: T[];
  fila: (item: T, indice: number) => ReactNode;
  /** Solo para el primer pintado, antes de poder medir una fila de verdad. */
  altoPorDefecto?: number;
  /** Al cambiar, se vuelve arriba: al cambiar de categoría se empieza por el principio. */
  clave?: string;
}) {
  const ancla = useRef<HTMLDivElement>(null);
  const [alto, setAlto] = useState(altoPorDefecto);
  const [rango, setRango] = useState<[number, number]>([0, 40]);

  const virtual = items.length > UMBRAL;

  const recalcular = useCallback(() => {
    const caja = ancla.current?.parentElement;
    if (!caja) return;
    const h = alto > 8 ? alto : altoPorDefecto;
    const desde = Math.max(0, Math.floor(caja.scrollTop / h) - COLCHON);
    const hasta = desde + Math.ceil(caja.clientHeight / h) + COLCHON * 2;
    setRango((v) => (v[0] === desde && v[1] === hasta ? v : [desde, hasta]));
  }, [alto, altoPorDefecto]);

  useEffect(() => {
    if (!virtual) return;
    const caja = ancla.current?.parentElement;
    if (!caja) return;
    recalcular();
    caja.addEventListener("scroll", recalcular, { passive: true });
    const observador = typeof ResizeObserver !== "undefined" ? new ResizeObserver(recalcular) : null;
    observador?.observe(caja);
    window.addEventListener("resize", recalcular);
    return () => {
      caja.removeEventListener("scroll", recalcular);
      observador?.disconnect();
      window.removeEventListener("resize", recalcular);
    };
  }, [virtual, recalcular]);

  /* Al cambiar de lista se vuelve arriba: quedarse a la altura del canal 900
     de la lista anterior no se parece a nada que el cliente haya pedido */
  useEffect(() => {
    const caja = ancla.current?.parentElement;
    if (caja) caja.scrollTop = 0;
    setRango([0, 40]);
  }, [clave]);

  /* Medir una fila ya pintada, en cada pintado: es lo que hace que al girar
     el móvil o al entrar en modo tele las cuentas sigan saliendo */
  useLayoutEffect(() => {
    if (!virtual) return;
    const primera = ancla.current?.nextElementSibling as HTMLElement | null;
    if (!primera) return;
    const medido = primera.offsetHeight + parseFloat(getComputedStyle(primera).marginBottom || "0");
    if (medido > 8 && Math.abs(medido - alto) > 1) setAlto(medido);
  });

  if (!virtual) return <>{items.map((it, i) => fila(it, i))}</>;

  const desde = Math.min(rango[0], Math.max(0, items.length - 1));
  const hasta = Math.min(rango[1], items.length);

  return (
    <>
      <div ref={ancla} style={{ height: desde * alto }} aria-hidden="true" />
      {items.slice(desde, hasta).map((it, i) => fila(it, desde + i))}
      <div style={{ height: Math.max(0, (items.length - hasta) * alto) }} aria-hidden="true" />
    </>
  );
}
