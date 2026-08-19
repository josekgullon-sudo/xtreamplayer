"use client";

/**
 * La maqueta del producto que preside la portada.
 *
 * Está dibujada con HTML y CSS, no es una imagen, y eso es a propósito por
 * tres motivos. Se ve nítida en cualquier pantalla —una captura de 1.400 px
 * en un monitor 4K se ve blanda—; pesa unos kilobytes en vez de medio mega,
 * que en el primer golpe de vista de la portada es justo lo que no se puede
 * gastar; y se adapta sola al móvil, mientras que una captura de escritorio
 * encogida a 360 px no deja leer nada.
 *
 * Las carátulas son inventadas y genéricas, y va escrito debajo: enseñar
 * carteles de películas de verdad en una web que no vende películas es
 * apropiarse de la obra de otro para decorar la nuestra. Un reproductor no
 * tiene catálogo —eso lo pone el proveedor de cada cliente—, así que lo
 * honesto es que la maqueta enseñe la interfaz, que es lo nuestro, y no un
 * contenido que no damos.
 */

/*
 * Los carteles, en grises y de un solo tono cada uno.
 *
 * Eran seis degradados de seis colores distintos —rojo, azul, marrón,
 * morado, verde—, y en una fila juntos parecían una caja de rotuladores.
 * Con la escala de grises pasa lo contrario: se distinguen igual, porque lo
 * que los separa es el salto de claridad, y lo único con color en toda la
 * maqueta vuelve a ser el botón. Que es de lo que va esto.
 */
const CARTELES = [
  { titulo: "Marea alta", tono: "#3a3a41" },
  { titulo: "Ciudad norte", tono: "#26262b" },
  { titulo: "El último tren", tono: "#45454d" },
  { titulo: "Noche cerrada", tono: "#1c1c20" },
  { titulo: "Los que vuelven", tono: "#33333a" },
  { titulo: "Frontera", tono: "#2a2a2f" },
];

const PESTANAS = ["Inicio", "Cine", "Series", "En directo", "Favoritos"];

export default function MaquetaProducto() {
  return (
    <div className="maqueta" aria-hidden="true">
      {/* La pantalla grande: lo que se ve en una tele o en el ordenador */}
      <div className="maqueta-tele">
        <div className="maqueta-barra">
          <span className="maqueta-avatar" />
          {PESTANAS.map((p, i) => (
            <span key={p} className={`maqueta-pestana ${i === 0 ? "activa" : ""}`}>
              {p}
            </span>
          ))}
          <span className="maqueta-logo">
            TOTAL<b>player</b>
          </span>
        </div>

        {/* El banner de la portada, con su botón y su ficha */}
        <div className="maqueta-banner">
          <div className="maqueta-banner-txt">
            <span className="maqueta-t-grande" />
            <span className="maqueta-t-linea" />
            <span className="maqueta-t-linea corta" />
            <span className="maqueta-boton">Reproducir</span>
          </div>
        </div>

        <div className="maqueta-fila-t">
          <span className="maqueta-t-rotulo" />
        </div>
        <div className="maqueta-fila">
          {CARTELES.map((c, i) => (
            <div key={c.titulo} className="maqueta-cartel" style={{ background: c.tono }}>
              {i < 3 && <span className="maqueta-num">{i + 1}</span>}
              <span className="maqueta-cartel-t">{c.titulo}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Y el móvil delante: la misma lista, en el bolsillo */}
      <div className="maqueta-movil">
        <div className="maqueta-movil-barra">
          <span className="maqueta-logo pequeno">
            TOTAL<b>player</b>
          </span>
        </div>
        <div className="maqueta-movil-rotulo">
          <span className="maqueta-punto" />
          En directo
        </div>
        <div className="maqueta-movil-fila">
          {CARTELES.slice(0, 3).map((c, i) => (
            <div key={c.titulo} className="maqueta-cartel chico" style={{ background: c.tono }}>
              <span className="maqueta-num">{i + 1}</span>
            </div>
          ))}
        </div>
        <div className="maqueta-movil-rotulo tenue" />
        <div className="maqueta-movil-fila">
          {CARTELES.slice(3, 6).map((c) => (
            <div key={c.titulo} className="maqueta-cartel chico" style={{ background: c.tono }} />
          ))}
        </div>
      </div>

      {/* El botón de play, encima de todo: dice «esto se mira», no «esto se lee» */}
      <span className="maqueta-play">
        <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor" aria-hidden="true">
          <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z" />
        </svg>
      </span>
    </div>
  );
}
