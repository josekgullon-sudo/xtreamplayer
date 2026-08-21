"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Icon from "@/components/Icon";

/**
 * Una fila de carátulas que se desplaza de lado, con sus flechas.
 *
 * En la tele la fila se recorre con el mando y se ve que sigue porque el
 * foco la va empujando. Con un ratón no: la última carátula sale cortada
 * por el borde y ahí se acaba la pista. Quien no tenga rueda horizontal
 * —que es casi todo el mundo con un ratón normal— no llega al resto del
 * catálogo, y una fila de cincuenta títulos parece tener seis.
 *
 * Las flechas salen solo cuando sirven de algo: aparecen si hay algo fuera
 * de la vista y cada una desaparece al llegar a su punta. Una flecha que no
 * lleva a ninguna parte es un botón que enseña a no pulsar botones.
 *
 * La clase de la tira se pasa desde fuera porque las dos filas que hay en
 * el reproductor —la del catálogo y la de la pantalla de entrada— tienen
 * medidas distintas y cada una las suyas. Lo que comparten es esto: el
 * envoltorio, las flechas y cuándo se enseñan.
 */
export default function Tira({
  clase,
  children,
}: {
  clase: string;
  children: ReactNode;
}) {
  const tira = useRef<HTMLDivElement>(null);
  const [puedeIzq, setPuedeIzq] = useState(false);
  const [puedeDer, setPuedeDer] = useState(false);

  const mirar = useCallback(() => {
    const e = tira.current;
    if (!e) return;
    /* Un punto de margen: los anchos de desplazamiento son decimales y el
       final exacto casi nunca cae redondo, así que sin holgura la flecha
       derecha se queda encendida para siempre en la última carátula */
    setPuedeIzq(e.scrollLeft > 1);
    setPuedeDer(e.scrollLeft + e.clientWidth < e.scrollWidth - 1);
  }, []);

  useEffect(() => {
    mirar();
    const e = tira.current;
    if (!e) return;
    /* Y al cambiar de tamaño: la fila cabe entera en una ventana ancha y
       deja de caber al estrecharla, y las flechas tienen que enterarse */
    const ojo = new ResizeObserver(mirar);
    ojo.observe(e);
    return () => ojo.disconnect();
  }, [mirar, children]);

  /* Casi una pantalla, no una entera: dejando una carátula a la vista se
     sabe por dónde se iba, que es lo que evita perder el sitio */
  const correr = (hacia: 1 | -1) => {
    const e = tira.current;
    if (e) e.scrollBy({ left: hacia * Math.round(e.clientWidth * 0.85), behavior: "smooth" });
  };

  return (
    <div className="pa-fila">
      {puedeIzq && (
        <button className="pa-fila-flecha izq" onClick={() => correr(-1)} aria-label="Ver lo anterior">
          <Icon name="chevronRight" size={20} />
        </button>
      )}
      <div className={clase} ref={tira} onScroll={mirar}>
        {children}
      </div>
      {puedeDer && (
        <button className="pa-fila-flecha der" onClick={() => correr(1)} aria-label="Ver lo siguiente">
          <Icon name="chevronRight" size={20} />
        </button>
      )}
    </div>
  );
}
