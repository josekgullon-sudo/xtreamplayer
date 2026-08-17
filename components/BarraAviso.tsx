"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * La franja de arriba del todo, para lo que acaba de salir.
 *
 * Una novedad enterrada en la mitad de la portada no la ve nadie: la mitad
 * de las visitas no bajan del primer golpe de vista. Arriba del todo y en el
 * color de la marca sí se ve, y como se puede cerrar, quien no le interese
 * la quita y no vuelve a salirle.
 *
 * Se cierra por versión y no con un simple «cerrada»: el día que el aviso
 * cambie, quien lo cerró hace tres meses tiene que volver a verlo. Con una
 * bandera suelta, cerrar un aviso una vez sería cerrarlos todos para siempre.
 */
const K_CERRADA = "xp.aviso.v1";

export interface Aviso {
  /** Cámbiala cuando cambie el texto: quien la cerró volverá a verla. */
  version: string;
  texto: string;
  accion: string;
  href: string;
}

export default function BarraAviso({ aviso }: { aviso: Aviso }) {
  /*
   * Empieza escondida y aparece si toca.
   *
   * Al revés —visible y escondiéndola en cuanto se lee el almacenamiento—
   * la barra parpadea en cada carga para quien ya la cerró, y encima empuja
   * la página hacia abajo y la vuelve a subir.
   */
  const [aLaVista, setALaVista] = useState(false);

  useEffect(() => {
    try {
      setALaVista(localStorage.getItem(K_CERRADA) !== aviso.version);
    } catch {
      setALaVista(true);
    }
  }, [aviso.version]);

  if (!aLaVista) return null;

  return (
    <div className="barra-aviso" role="region" aria-label="Novedades">
      <p>
        {aviso.texto}{" "}
        <Link href={aviso.href}>{aviso.accion}</Link>
      </p>
      <button
        type="button"
        className="barra-aviso-x"
        aria-label="Cerrar el aviso"
        onClick={() => {
          setALaVista(false);
          try {
            localStorage.setItem(K_CERRADA, aviso.version);
          } catch {
            /* almacenamiento bloqueado: se cierra igual, y vuelve mañana */
          }
        }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </button>
    </div>
  );
}
