/**
 * Qué se está emitiendo AHORA, según lo que manda el panel.
 *
 * `get_short_epg` devuelve una tira de programas, y empieza donde le parece
 * a cada panel: unos por el que está en curso y otros por el bloque de la
 * hora anterior, que ya terminó. Cogiendo el primero a ciegas se anuncia
 * como «ahora» algo emitido hace una hora — y en la lista de canales eso es
 * peor que no poner nada, porque parece un dato y no lo es.
 *
 * La aplicación de televisión ya lo hacía bien y el reproductor web no, así
 * que la regla vive aquí y la usan los dos. No hay dos maneras correctas de
 * saber qué están echando.
 */

export interface Emision {
  title?: string;
  description?: string;
  start?: string | number;
  end?: string | number;
  start_timestamp?: string | number;
  stop_timestamp?: string | number;
}

/**
 * Una hora del panel, en milisegundos. Cero si no se entiende.
 *
 * Vienen de dos formas: unix en segundos, y «2026-08-12 21:00:00» sin zona
 * horaria. Lo segundo se lee como hora local y se acepta el desvío: esto
 * vale para pintar una barra de progreso, no para programar una grabación.
 */
export function momento(v?: string | number): number {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(v);
  if (Number.isFinite(n) && n > 1000000000) return n * 1000;
  const t = Date.parse(String(v).replace(" ", "T"));
  return Number.isFinite(t) ? t : 0;
}

/**
 * En qué posición de la tira está lo que se emite ahora.
 *
 * Si ninguna franja contiene el reloj —el panel no manda horas, o las manda
 * mal— se devuelve la primera: es lo que había antes de todo esto y sigue
 * siendo mejor que un hueco.
 */
export function indiceEnAntena(listado: Emision[], cuando = Date.now()): number {
  const i = listado.findIndex((e) => {
    const desde = momento(e.start_timestamp ?? e.start);
    const hasta = momento(e.stop_timestamp ?? e.end);
    return desde && hasta && desde <= cuando && cuando < hasta;
  });
  return i < 0 ? 0 : i;
}
