"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { imgSrc } from "@/lib/img";
import {
  FilaPortada,
  MetaTitulo,
  Titulo,
  armarPortada,
  candidatosDestacado,
  conMeta,
  datosDe,
  llaveTmdb,
} from "@/lib/portada";

/**
 * La portada de cine y de series, en el reproductor web.
 *
 * Es la misma idea que en la aplicación de televisión, con las mismas reglas
 * —que viven en `lib/portada.ts` y no aquí—: banner arriba con lo mejor de
 * los últimos años, filas debajo, sin títulos repetidos y sin huecos grises.
 * Lo que cambia es el mando: aquí se usa con el ratón o con el dedo, así que
 * no hay foco que mover ni filas que recorrer con flechas.
 *
 * Aparece solo cuando no hay ni categoría elegida ni búsqueda: en cuanto el
 * cliente filtra por algo, lo que quiere es la rejilla entera de eso, no un
 * escaparate.
 */

interface Props {
  titulos: Titulo[];
  categorias: { id: string; nombre: string }[];
  /** Qué hacer al pulsar un título: se le pasa el identificador del panel. */
  alAbrir: (id: string) => void;
  /** El botón del final, que lleva a la rejilla de siempre. */
  alVerTodo: () => void;
  /** Para pedirle a `/api/meta` con la sesión de una tele por MAC. */
  mac?: string;
}

export default function PortadaCatalogo({ titulos, categorias, alAbrir, alVerTodo, mac }: Props) {
  const [rotas, setRotas] = useState<Record<string, true>>({});
  const [meta, setMeta] = useState<Record<string, MetaTitulo>>({});

  const marcarRota = useCallback((url: string) => {
    setRotas((antes) => (antes[url] ? antes : { ...antes, [url]: true }));
  }, []);

  const hoy = new Date().getFullYear();
  const filasCrudas = useMemo(
    () => armarPortada(titulos, categorias, hoy),
    [titulos, categorias, hoy]
  );
  const mejor = useCallback((t: Titulo) => conMeta(t, meta[llaveTmdb(t)]), [meta]);

  /*
   * Lo que TMDB sabe, para los títulos que se ven. Se pide después de pintar:
   * la portada sale ya con lo que manda el panel y se refresca sola cuando
   * llega el fondo apaisado y la sinopsis en español. Sin clave configurada
   * en el servidor esto no devuelve nada y no cambia nada.
   */
  useEffect(() => {
    if (!filasCrudas.length) return;
    const unicos = new Map<string, Titulo>();
    for (const f of filasCrudas) for (const t of f.items) unicos.set(llaveTmdb(t), t);
    const pendientes = [...unicos.entries()].filter(([llave]) => !meta[llave]);
    if (!pendientes.length) return;

    let cancelado = false;
    (async () => {
      try {
        const r = await fetch(`/api/meta${mac ? `?mac=${encodeURIComponent(mac)}` : ""}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titulos: pendientes.slice(0, 200).map(([, t]) => ({
              nombre: t.nombre,
              anio: t.anio,
              serie: t.esSerie,
            })),
          }),
        }).then((x) => x.json());
        if (cancelado || !Array.isArray(r.meta) || !r.meta.length) return;
        setMeta((antes) => {
          const siguiente = { ...antes };
          for (const m of r.meta as MetaTitulo[]) siguiente[m.llave] = m;
          return siguiente;
        });
      } catch {
        /* Sin TMDB, la portada se queda con lo del panel */
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filasCrudas]);

  const filas: FilaPortada[] = filasCrudas
    .map((f) => {
      const items = f.items.map(mejor);
      return f.escaparate
        ? { ...f, items: items.filter((t) => !rotas[t.imagen]).slice(0, 10) }
        : { ...f, items };
    })
    .filter((f) => f.items.length >= (f.escaparate ? 4 : 1));

  const candidatos = useMemo(() => candidatosDestacado(filasCrudas, hoy), [filasCrudas, hoy]);
  const crudo = candidatos.find((t) => !rotas[t.imagen]) || null;
  const destacado = crudo ? mejor(crudo) : null;

  if (!filas.length) return null;

  return (
    <div className="pa-portada">
      {destacado && (
        <section className="pa-banner">
          {destacado.fondo && !rotas[destacado.fondo] ? (
            /* Con fondo apaisado de verdad —eso lo pone TMDB, no el panel—
               el banner es lo que se espera. Sin él hay que apañarse con la
               carátula vertical, que es lo de debajo */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="pa-banner-fondo"
              src={destacado.fondo}
              alt=""
              onError={() => marcarRota(destacado.fondo || "")}
            />
          ) : (
            imgSrc(destacado.imagen) && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="pa-banner-mancha" src={imgSrc(destacado.imagen)} alt="" aria-hidden="true" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="pa-banner-arte"
                  src={imgSrc(destacado.imagen)}
                  alt=""
                  onError={() => marcarRota(destacado.imagen)}
                />
              </>
            )
          )}
          <span className="pa-banner-velo" aria-hidden="true" />
          <div className="pa-banner-txt">
            <h2 className="pa-banner-t">{destacado.nombre}</h2>
            {datosDe(destacado) && <p className="pa-banner-datos">{datosDe(destacado)}</p>}
            {destacado.sinopsis && <p className="pa-banner-sinopsis">{destacado.sinopsis}</p>}
            {/* Con el color de la marca y su icono, como en la tele: es la
                acción de la pantalla, y salía en blanco y sin dibujo porque
                le faltaba `btn-primary` */}
            <button className="btn btn-primary btn-lg" onClick={() => alAbrir(destacado.id)}>
              <Icon name="play" size={17} />
              {destacado.esSerie ? "Ver la serie" : "Reproducir"}
            </button>
          </div>
        </section>
      )}

      {filas.map((f, i) => (
        <section className="pa-carrusel" key={`${f.titulo}-${i}`}>
          <h3 className="pa-carrusel-t">{f.titulo}</h3>
          <Tira numerada={f.numerada}>
            {f.items.map((t, n) => (
              <button className="pa-card" key={t.id} onClick={() => alAbrir(t.id)} title={t.nombre}>
                <span className="pa-card-marco">
                  {/* El título detrás del hueco: una carátula que no llega
                      deja un cuadro gris igual a todos los demás */}
                  <span className="poster-ph">{t.nombre}</span>
                  {imgSrc(t.imagen) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="poster"
                      src={imgSrc(t.imagen)}
                      alt=""
                      loading="lazy"
                      onError={() => marcarRota(t.imagen)}
                    />
                  )}
                  {f.numerada && <span className="pa-card-num">{n + 1}</span>}
                </span>
                <div className="meta">
                  <div className="title">{t.nombre}</div>
                </div>
              </button>
            ))}
          </Tira>
        </section>
      ))}

      <button className="btn btn-ghost pa-vertodo" onClick={alVerTodo}>
        Ver todo el catálogo
      </button>

      {/* Condición de TMDB para usar su API. Solo cuando de verdad se usa */}
      {Object.keys(meta).length > 0 && (
        <p className="pa-tmdb">
          Fichas e imágenes de TMDB. Este producto usa la API de TMDB pero no está avalado
          ni certificado por TMDB.
        </p>
      )}
    </div>
  );
}

/**
 * Una fila de carátulas, con sus flechas.
 *
 * En la tele la fila se recorre con el mando y se ve que sigue porque el
 * foco la va empujando. Con un ratón no: la última carátula sale cortada
 * por el borde y ahí se acaba la pista. Quien no tenga rueda horizontal
 * —que es casi todo el mundo con un ratón normal— no llega al resto del
 * catálogo, y la fila parece tener seis títulos en vez de cincuenta.
 *
 * Así que las flechas, y solo cuando sirven de algo: aparecen si hay algo
 * fuera de la vista, y cada una desaparece al llegar a su punta. Una flecha
 * que no lleva a ninguna parte es un botón que enseña a no pulsar botones.
 */
function Tira({ numerada, children }: { numerada?: boolean; children: React.ReactNode }) {
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
      <div className={`pa-carrusel-tira ${numerada ? "numerada" : ""}`} ref={tira} onScroll={mirar}>
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
