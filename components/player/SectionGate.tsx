"use client";

import { useEffect, useRef } from "react";
import Icon, { IconName } from "@/components/Icon";
import Tira from "./Tira";

export type Seccion = "live" | "vod" | "series" | "favs";

interface Opcion {
  id: Seccion;
  titulo: string;
  descripcion: string;
  icono: IconName;
}

/** Un canal listo para pinchar desde la portada */
export interface PortadaCanal {
  key: string;
  nombre: string;
  logo: string;
  play: () => void;
}

/** Una película o serie con su carátula, lista para abrir su ficha */
export interface PortadaTitulo {
  key: string | number;
  nombre: string;
  poster: string;
  abrir: () => void;
}

export interface Portada {
  canales: PortadaCanal[];
  pelis: PortadaTitulo[];
  series: PortadaTitulo[];
  recientes: { key: string; nombre: string; play: () => void }[];
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
  portada,
}: {
  marca: string;
  perfil?: string | null;
  conCine: boolean;
  conFavoritos: boolean;
  onElegir: (seccion: Seccion) => void;
  /** Contenido real bajo las tarjetas (solo escritorio): canales y carátulas */
  portada?: Portada;
}) {
  const primeroRef = useRef<HTMLButtonElement>(null);

  /** Suelta el perfil fijado en este aparato y vuelve a preguntar */
  function cambiarPerfil() {
    try {
      localStorage.removeItem("xp.perfilFijo.v1");
    } catch {
      /* almacenamiento bloqueado */
    }
    window.location.reload();
  }

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
        <p className="section-gate-sub">
          Elige por dónde empezar. Podrás cambiar cuando quieras.
          {/* Aquí y no solo en el menú de cuenta: esta pantalla lo tapa todo,
              así que quien fijó su perfil se quedaría sin salida */}
          {perfil && (
            <>
              {" · "}
              <button className="section-gate-cambiar" onClick={cambiarPerfil}>
                No soy {perfil}
              </button>
            </>
          )}
        </p>

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

        {/*
          La portada: contenido de verdad bajo las tarjetas, al estilo de los
          reproductores de escritorio — canales numerados a un lado, carriles
          de carátulas al otro. En el móvil se oculta por CSS: allí la
          pantalla es de las tarjetas y la navegación inferior.
        */}
        {portada && portada.canales.length + portada.pelis.length + portada.series.length > 0 && (
          <div className="portada">
            {portada.recientes.length > 0 && (
              <div className="portada-recientes">
                <span className="canales-recientes-label">Seguir viendo</span>
                {portada.recientes.map((r) => (
                  <button key={r.key} className="btn btn-ghost btn-sm" onClick={r.play}>
                    <><Icon name="play" size={13} /> {r.nombre}</>
                  </button>
                ))}
              </div>
            )}

            <div className="portada-cols">
              {portada.canales.length > 0 && (
                <section className="portada-canales">
                  <div className="portada-head">
                    <h3>TV en directo</h3>
                    <button className="canales-ver-todos" onClick={() => onElegir("live")}>
                      Ver todos <Icon name="chevronRight" size={13} />
                    </button>
                  </div>
                  <div className="portada-lista">
                    {portada.canales.map((c, i) => (
                      <button key={c.key} className="portada-canal" onClick={c.play} title={c.nombre}>
                        <span className="portada-num">{String(i + 1).padStart(3, "0")}</span>
                        {c.logo ? (
                          <img
                            className="canal-logo"
                            src={c.logo}
                            alt=""
                            loading="lazy"
                            onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
                          />
                        ) : (
                          <span className="canal-logo canal-logo-ph">{c.nombre.trim().slice(0, 1).toUpperCase()}</span>
                        )}
                        <span className="portada-canal-nombre">{c.nombre}</span>
                        <Icon name="play" size={14} className="portada-play" />
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {(portada.pelis.length > 0 || portada.series.length > 0) && (
                <div className="portada-rails">
                  {portada.pelis.length > 0 && (
                    <PortadaRail titulo="Películas" titulos={portada.pelis} verTodo={() => onElegir("vod")} />
                  )}
                  {portada.series.length > 0 && (
                    <PortadaRail titulo="Series" titulos={portada.series} verTodo={() => onElegir("series")} />
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PortadaRail({ titulo, titulos, verTodo }: { titulo: string; titulos: PortadaTitulo[]; verTodo: () => void }) {
  return (
    <section className="portada-rail">
      <div className="portada-head">
        <h3>{titulo}</h3>
        <button className="canales-ver-todos" onClick={verTodo}>
          Ver todo <Icon name="chevronRight" size={13} />
        </button>
      </div>
      <Tira clase="portada-posters">
        {titulos.map((t) => (
          <button key={t.key} className="portada-poster" onClick={t.abrir} title={t.nombre}>
            {t.poster ? (
              <img
                src={t.poster}
                alt={t.nombre}
                loading="lazy"
                onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
              />
            ) : (
              <span className="portada-poster-ph"><Icon name="film" size={22} /></span>
            )}
            <span className="portada-poster-nombre">{t.nombre}</span>
          </button>
        ))}
      </Tira>
    </section>
  );
}
