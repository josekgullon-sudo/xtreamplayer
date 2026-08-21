/**
 * El título de un episodio, sin lo que ya dice la fila.
 *
 * Los paneles copian la ficha entera del proveedor, y ahí un episodio se
 * llama «Serie Demo - S01E03 - Un título que repite el nombre entero». En
 * una lista dentro de la ficha de esa misma serie, con su número al lado,
 * las dos primeras terceras partes son ruido: se sabe de qué serie es
 * —estás dentro— y se sabe qué número es —está en la fila—. Lo único que
 * aporta el título es lo último, y es justo lo que se corta cuando no cabe.
 *
 * Se quitan el nombre de la serie y el código de temporada y episodio
 * cuando van por delante, en cualquiera de los dos órdenes. Si al quitarlos
 * no queda nada —hay episodios que se llaman solo «S01E03»— se devuelve el
 * original: es peor un renglón vacío que uno repetido.
 */

/** Sin acentos, sin signos y en minúsculas, para comparar nombres. */
function llano(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Los separadores con los que un panel pega las partes de un título. */
const SEPARADOR = /^[\s\-–—:.·|]+/;

/** «S01E03», «1x03», «T1E3», «Temporada 1 Episodio 3». */
const CODIGO = /^(?:s\s*\d{1,3}\s*e\s*\d{1,4}|t\s*\d{1,3}\s*e\s*\d{1,4}|\d{1,3}\s*x\s*\d{1,4}|temporada\s*\d{1,3}\s*(?:episodio\s*\d{1,4})?|episodio\s*\d{1,4}|cap[ií]tulo\s*\d{1,4})/i;

/**
 * Le quita al texto el nombre de la serie, si va por delante.
 *
 * Palabra a palabra sobre el texto DE VERDAD y comparando su versión llana,
 * en vez de recortar por la longitud del nombre sin tildes: «El Ministerio
 * del Tiempo» ocupa distinto con acentos que sin ellos, y contando por la
 * versión llana el corte cae a media palabra.
 */
function sinElNombre(texto: string, palabras: string[]): string {
  if (!palabras.length) return texto;
  const trozos = /[\p{L}\p{N}]+/gu;
  let trozo: RegExpExecArray | null;
  let cuantas = 0;
  let hasta = 0;
  while (cuantas < palabras.length && (trozo = trozos.exec(texto))) {
    /* La primera tiene que estar al principio: si el nombre aparece por el
       medio, no es un prefijo y no hay nada que quitar */
    if (cuantas === 0 && trozo.index !== 0) return texto;
    if (llano(trozo[0]) !== palabras[cuantas]) return texto;
    hasta = trozo.index + trozo[0].length;
    cuantas++;
  }
  return cuantas === palabras.length ? texto.slice(hasta) : texto;
}

export function tituloDeEpisodio(titulo: string, nombreDeLaSerie: string): string {
  const original = (titulo || "").trim();
  if (!original) return "";

  let queda = original;
  const serie = llano(nombreDeLaSerie);

  /* Dos pasadas: el nombre puede ir antes o después del código, y hay
     paneles que ponen «Serie - S01E03 - Serie - Título» */
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    const antes = queda;
    queda = queda.replace(SEPARADOR, "");

    if (serie) {
      if (llano(queda) === serie) {
        /* El título es exactamente el nombre de la serie: quitándolo no
           queda nada, y lo que hay tampoco aporta. Se deja como está */
        return original;
      }
      queda = sinElNombre(queda, serie.split(" ").filter(Boolean));
    }

    queda = queda.replace(SEPARADOR, "");
    const codigo = CODIGO.exec(queda);
    if (codigo) queda = queda.slice(codigo[0].length);

    if (queda === antes) break;
  }

  queda = queda.replace(SEPARADOR, "").trim();
  return queda || original;
}

/**
 * «52 min», de lo que mande el panel.
 *
 * Unos lo dan en minutos sueltos —«52»— y otros como un reloj —«01:52:00»—,
 * y hay quien manda «0» o una cadena vacía. Lo que no se entiende no se
 * enseña: un «0 min» debajo de un episodio es peor que no poner nada.
 */
export function minutosDe(bruto?: string): string {
  const t = String(bruto || "").trim();
  if (!t) return "";
  const reloj = t.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (reloj) {
    const min = Number(reloj[1]) * 60 + Number(reloj[2]);
    return min > 0 ? `${min} min` : "";
  }
  const n = parseInt(t, 10);
  return Number.isFinite(n) && n > 0 ? `${n} min` : "";
}

/**
 * Lo mismo, pero mirando también el campo en segundos.
 *
 * Xtream manda la duración de una película por duplicado: `duration` como
 * un reloj —«01:52:00»— y `duration_secs` como un número —«6720»—. Hay
 * paneles que solo mandan el segundo, y ahí `minutosDe` lee 6720 y escribe
 * «6720 min», que es una película de cuatro días. Por eso los segundos
 * entran por su propia puerta y no por la de los minutos.
 */
export function duracionDe(bruto?: string | number, segundos?: string | number): string {
  const conReloj = minutosDe(String(bruto ?? ""));
  if (conReloj) return conReloj;
  const s = Number(String(segundos ?? "").trim());
  /* Menos de un minuto no es una duración: es un 0 o un campo a medias */
  return Number.isFinite(s) && s >= 60 ? `${Math.round(s / 60)} min` : "";
}
