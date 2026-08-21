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
 * Los carteles.
 *
 * Estuvieron en seis colores distintos —rojo, azul, marrón, morado, verde—
 * y en una fila juntos parecían una caja de rotuladores; se pasaron
 * entonces a escala de grises, y el remedio salió peor que la enfermedad:
 * una web que vende un reproductor de cine enseñaba una maqueta en la que
 * no había cine, solo rectángulos apagados. Parecía la pantalla de carga,
 * no el producto.
 *
 * El término medio no es «cuántos colores» sino **cuánto** color. Estos son
 * seis, sí, pero todos oscuros, todos desaturados y todos dentro de un
 * mismo recorrido de temperatura —del azul de noche al ámbar de farola—,
 * que es la paleta con la que está iluminado el cine. Se distinguen entre
 * sí, dan vida a la fila y ninguno compite con el rojo del botón, que sigue
 * siendo lo único saturado de la pantalla.
 */
const CARTELES = [
  { titulo: "Marea alta", de: "#1d4b54", a: "#0a1417" },
  { titulo: "Ciudad norte", de: "#2b3a56", a: "#0c111c" },
  { titulo: "El último tren", de: "#6b3d1f", a: "#190d07" },
  { titulo: "Noche cerrada", de: "#3a2140", a: "#110a14" },
  { titulo: "Los que vuelven", de: "#31402c", a: "#0d120f" },
  { titulo: "Frontera", de: "#5c2f24", a: "#160a08" },
];

/* Un cartel de verdad tiene la luz por arriba: sin ese matiz, un degradado
   de dos paradas se lee como un fondo de tarjeta y no como una imagen */
const cartel = (c: { de: string; a: string }) =>
  `linear-gradient(160deg, ${c.de} 0%, ${c.a} 78%), radial-gradient(ellipse 120% 60% at 50% 0%, rgba(255,255,255,0.16), transparent 70%)`;

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

        {/*
          El banner de la portada.

          Con el título escrito y no como una barra gris. Las barras dicen
          «aquí irá un título» —lenguaje de boceto— y quien entra en la web
          no está mirando un boceto, está mirando lo que le van a dar. Las
          dos líneas de debajo sí se quedan en gris: son la sinopsis, y a
          este tamaño un texto de verdad no se leería igualmente.
        */}
        <div className="maqueta-banner">
          <div className="maqueta-banner-txt">
            <span className="maqueta-t-grande">El último tren</span>
            <span className="maqueta-t-meta">2024 · Drama · 1 h 52 · <b>★ 8,1</b></span>
            <span className="maqueta-t-linea" />
            <span className="maqueta-t-linea corta" />
            <span className="maqueta-boton">Reproducir</span>
          </div>
        </div>

        <div className="maqueta-fila-t">
          <span className="maqueta-t-rotulo">Populares ahora</span>
        </div>
        <div className="maqueta-fila">
          {CARTELES.map((c, i) => (
            <div key={c.titulo} className="maqueta-cartel" style={{ backgroundImage: cartel(c) }}>
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
            <div key={c.titulo} className="maqueta-cartel chico" style={{ backgroundImage: cartel(c) }}>
              <span className="maqueta-num">{i + 1}</span>
            </div>
          ))}
        </div>
        <div className="maqueta-movil-rotulo tenue" />
        <div className="maqueta-movil-fila">
          {CARTELES.slice(3, 6).map((c) => (
            <div key={c.titulo} className="maqueta-cartel chico" style={{ backgroundImage: cartel(c) }} />
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
