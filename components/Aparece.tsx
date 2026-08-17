"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Lo que entra en pantalla, entra moviéndose.
 *
 * Una página larga sin movimiento se recorre igual que un documento: el ojo
 * baja de corrido y no distingue dónde acaba un bloque y empieza el
 * siguiente. Que cada sección aparezca cuando le toca hace dos cosas a la
 * vez: marca el ritmo de lectura y le dice al que mira que la página está
 * viva y no es una captura.
 *
 * Se anima una sola vez y luego se suelta el observador. Animar cada vez que
 * algo cruza el borde de la pantalla convierte subir y bajar en un
 * parpadeo constante, que es la razón por la que estos efectos tienen mala
 * fama.
 *
 * Y respeta a quien ha pedido que no se mueva nada. `prefers-reduced-motion`
 * no es una preferencia estética: hay gente a la que el movimiento en
 * pantalla le provoca mareo de verdad. Ahí esto no anima, aparece y ya.
 */
export default function Aparece({
  children,
  /** Milisegundos de retraso, para escalonar hermanos: 0, 80, 160… */
  retraso = 0,
  /** De dónde entra. «abajo» es lo normal; «lado» para lo que va en fila. */
  desde = "abajo",
  className = "",
  etiqueta: Etiqueta = "div",
}: {
  children: React.ReactNode;
  retraso?: number;
  desde?: "abajo" | "lado" | "escala";
  className?: string;
  etiqueta?: "div" | "section" | "li" | "span";
}) {
  const mio = useRef<HTMLElement | null>(null);
  const [dentro, setDentro] = useState(false);
  /*
   * Hasta que el JavaScript no ha tomado el mando, esto no esconde nada.
   *
   * Y no es un detalle: arrancando escondido, el HTML que sirve el servidor
   * sale con media portada a opacidad cero. Quien entre con el JavaScript
   * caído, bloqueado o simplemente lento se encuentra los tres pasos y las
   * seis tarjetas en blanco —y lo mismo ve un rastreador que no ejecute
   * scripts—. Una animación de adorno no puede costar que no se lea el
   * contenido.
   *
   * Va con `useLayoutEffect` y no con `useEffect` a propósito: corre antes
   * de que el navegador pinte, así que el paso de «visible» a «escondido y
   * listo para animar» no se llega a ver. Con `useEffect` habría un
   * fotograma con todo puesto y otro con todo quitado, que es un parpadeo.
   */
  const [conJs, setConJs] = useState(false);

  useLayoutEffect(() => {
    const el = mio.current;
    if (!el) return;
    /* Sin soporte, visible: nunca se deja contenido escondido por no poder
       animarlo, que es como una animación acaba ocultando media página */
    if (typeof IntersectionObserver === "undefined") {
      setDentro(true);
      return;
    }
    setConJs(true);
    /*
     * Lo que ya está en pantalla al llegar no se esconde para volver a
     * aparecer. Escondiéndolo también, lo primero que ve quien entra es un
     * hueco que se rellena solo, y eso se lee como que la página va lenta.
     */
    const sitio = el.getBoundingClientRect();
    if (sitio.top < window.innerHeight && sitio.bottom > 0) {
      setDentro(true);
      return;
    }
    const ojo = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue;
          setDentro(true);
          ojo.disconnect();
        }
      },
      /* Un poco antes de que asome del todo: esperando al 100 % el bloque
         termina de aparecer cuando ya lo estabas leyendo */
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 }
    );
    ojo.observe(el);
    return () => ojo.disconnect();
  }, []);

  return (
    <Etiqueta
      ref={mio as React.RefObject<never>}
      className={`${conJs ? `aparece de-${desde}` : ""} ${dentro ? "dentro" : ""} ${className}`.trim()}
      style={retraso ? { transitionDelay: `${retraso}ms` } : undefined}
    >
      {children}
    </Etiqueta>
  );
}
