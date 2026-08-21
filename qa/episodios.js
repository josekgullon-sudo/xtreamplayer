/*
 * El título de un episodio, sin lo que ya dice la fila.
 *
 * Esta es la única suite que no abre un navegador: lo que se comprueba es
 * una regla de texto, y para eso montar un servidor, una lista y una ficha
 * es pagar veinte segundos por cada caso. Aquí caben diez formas distintas
 * de escribir el mismo título —que es lo que mandan los paneles de verdad—
 * y se ven todas de golpe.
 *
 * El módulo es TypeScript y se carga con `--experimental-strip-types`, que
 * es lo que trae Node 22: los tipos se tiran y se ejecuta el JavaScript de
 * debajo. Sin compilar nada ni duplicar la función en una copia de pruebas
 * que se quedaría vieja al primer cambio.
 */
const results = [];
const check = (n, ok, d = "") => {
  results.push(ok);
  console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`);
};

(async () => {
  const { tituloDeEpisodio } = await import("../lib/episodios.ts");

  /* [título tal y como lo manda el panel, nombre de la serie, lo que se lee] */
  const casos = [
    ["Serie Demo - S01E03 - Un título que repite el nombre entero", "Serie Demo",
      "Un título que repite el nombre entero", "Nombre de la serie y código por delante"],
    ["Serie Demo - S01E04 - Otro título igual de largo", "Serie Demo",
      "Otro título igual de largo", "Y el siguiente igual"],
    ["1x05 El del bar", "Serie Demo", "El del bar", "Código a la europea, sin el nombre"],
    ["La Casa de Papel 2x07 - El plan", "La Casa de Papel", "El plan", "Nombre de varias palabras"],
    ["Los Simpson: Temporada 5 Episodio 2 - Cabo del miedo", "Los Simpson",
      "Cabo del miedo", "Y escrito con todas las letras"],
    ["El Ministerio del Tiempo - S02E03 - Tiempo de hechizos", "El Ministerio del Tiempo",
      "Tiempo de hechizos", "Con tildes, que ocupan distinto al comparar"],
    ["Piloto", "Serie Demo", "Piloto", "Un título limpio se queda como está"],
    ["S01E03", "Serie Demo", "S01E03", "Y uno que SOLO es el código, también"],
    ["Serie Demo", "Serie Demo", "Serie Demo", "Igual que uno que solo es el nombre"],
    ["", "Serie Demo", "", "Sin título no hay nada que limpiar"],
    ["Aquí no manda Serie Demo", "Serie Demo", "Aquí no manda Serie Demo",
      "El nombre por el medio no es un prefijo: no se toca"],
  ];

  for (const [titulo, serie, esperado, porque] of casos) {
    const sale = tituloDeEpisodio(titulo, serie);
    check(porque, sale === esperado, sale === esperado ? "" : `«${titulo}» → «${sale}», esperaba «${esperado}»`);
  }

  const fallan = results.filter((x) => !x).length;
  console.log(`\n${results.length - fallan}/${results.length} pruebas de títulos de episodio OK`);
  process.exit(fallan ? 1 : 0);
})();
