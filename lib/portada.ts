/**
 * Cómo se arma la portada de cine y de series.
 *
 * Está aquí y no dentro de una pantalla porque lo usan la aplicación de
 * televisión y —cuando le toque— el reproductor web, y porque es lo único de
 * la portada que se puede razonar sin un navegador delante: qué sale arriba,
 * en qué filas, y en qué orden.
 *
 * Es el mismo criterio que la aplicación nativa de Android
 * (`apps/androidtv-nativo/…/Catalogo.java`). Si se cambia aquí, se cambia
 * allí: son dos clientes de la misma idea, no dos ideas.
 */

/** Un título del catálogo, ya masticado: da igual si viene de cine o de series. */
export interface Titulo {
  id: string;
  nombre: string;
  imagen: string;
  /** El año que manda el panel, o vacío. */
  anio: string;
  /** La nota del panel, o vacía. Ojo: medio catálogo la trae puesta a 10. */
  nota: string;
  /*
   * Cuánta gente la ha votado, cuando viene de TMDB.
   *
   * Un 9,4 con doce votos y un 8,1 con doce mil no dicen lo mismo, y sin
   * este número no hay forma de distinguirlos. El panel no lo manda nunca:
   * o lo pone TMDB o no está.
   */
  votos?: number;
  /** Cuándo lo subió el proveedor, en segundos. 0 si no lo dice. */
  alta: number;
  sinopsis: string;
  generos: string;
  esSerie: boolean;
  /** La categoría del panel a la que pertenece. */
  categoria: string;
  /**
   * El fondo apaisado, si TMDB lo conoce.
   *
   * Un panel Xtream no manda fondos: manda carátulas verticales. Esto es lo
   * único que permite que el banner sea un banner de verdad y no una
   * carátula estirada. Vacío mientras no llegue, o para siempre si la
   * instalación no usa TMDB.
   */
  fondo?: string;
  /* ---- Y lo que solo tiene un canal de televisión ---- */
  /** Su identificador para pedir la guía. Solo en el directo. */
  epgId?: string;
  /** El número que le ha puesto el proveedor en su mando. */
  numero?: number;
}

/** Lo que TMDB añade a un título. Ver `lib/tmdb.ts` y `/api/meta`. */
/**
 * Un actor del reparto, tal y como se enseña.
 *
 * Vive aquí y no en `lib/tmdb.ts` porque esto lo leen las pantallas, y
 * `tmdb.ts` arrastra la base de datos: importarlo desde un componente de
 * cliente mete el servidor entero en el paquete del navegador.
 */
export interface Actor {
  nombre: string;
  /** El personaje que hace. Vacío si TMDB no lo dice. */
  personaje: string;
  /** Su foto, ya como dirección entera del CDN. Vacía si no la hay. */
  foto: string;
}

export interface MetaTitulo {
  llave: string;
  fondo: string;
  cartel: string;
  sinopsis: string;
  nota: number;
  /** Cuánta gente ha votado esa nota: un 9,4 con doce votos no es un 9,4 */
  votos: number;
  generos: string;
  anio: string;
}

/**
 * La llave con la que se le pregunta a TMDB por un título.
 *
 * Tiene que dar exactamente lo mismo aquí y en el servidor (`lib/tmdb.ts`),
 * porque es con lo que se emparejan la pregunta y la respuesta.
 */
export function llaveTmdb(t: Titulo): string {
  return `${t.esSerie ? "s" : "p"}:${llaveDeTitulo(t.nombre)}:${t.anio || ""}`;
}

/**
 * El título, mejorado con lo que sepa TMDB.
 *
 * Lo del proveedor manda en dos cosas: el nombre —es el que el cliente ve en
 * su lista— y la carátula, salvo que no la haya. Lo demás lo pone TMDB si lo
 * tiene, porque su sinopsis está en español, sus géneros son de verdad y su
 * nota no está puesta a 10 a mano.
 */
export function conMeta(t: Titulo, m?: MetaTitulo): Titulo {
  if (!m) return t;
  return {
    ...t,
    imagen: t.imagen || m.cartel,
    fondo: m.fondo || t.fondo,
    sinopsis: m.sinopsis || t.sinopsis,
    generos: m.generos || t.generos,
    nota: m.nota > 0 ? String(Math.round(m.nota * 10) / 10) : t.nota,
    votos: m.votos || 0,
    anio: t.anio || m.anio,
  };
}

export interface FilaPortada {
  titulo: string;
  items: Titulo[];
  /** Va del 1 al 10, con el número encima de la carátula. */
  numerada?: boolean;
  /**
   * Es un escaparate: se ha elegido de todo el catálogo, así que sobran
   * candidatos y la pantalla puede tirar los que no tengan carátula. En la
   * fila de una carpeta no vale —ahí están los títulos que hay, y esconder
   * la mitad porque el proveedor no les puso imagen es quitarle catálogo al
   * cliente—.
   */
  escaparate?: boolean;
  /** La carpeta de la que sale. Vacío si es una fila inventada. */
  categoriaId?: string;
  /**
   * Sus tarjetas son apaisadas y no carátulas verticales.
   *
   * Un canal de televisión no tiene cartel: tiene logotipo. Estirarlo a 2:3
   * deja un dibujo pequeño flotando en un rectángulo vacío, así que las
   * filas del directo van en tarjetas anchas con el logotipo centrado.
   */
  anchas?: boolean;
}

/** Cuántas carpetas entran en la portada: más son más filas que nadie baja. */
const CARPETAS_EN_PORTADA = 6;
/** Cuántos títulos por fila de carpeta. */
const POR_FILA = 20;
/** Y cuántos candidatos se preparan en una de escaparate, para diez puestos. */
const CANDIDATOS_POR_FILA = 30;
/** Cuántos años atrás siguen contando como «de ahora». */
const VENTANA_DE_ANIOS = 3;
/** Por debajo de esto no merece la pena filtrar por año: no quedaría fila. */
const MINIMO_PARA_FILTRAR = 8;

/**
 * Los adornos que un proveedor le cuelga al título y que no lo cambian.
 *
 * La misma película está en «ESTRENOS» y en «ACCIÓN», y a veces la segunda
 * copia se llama igual con un «4K» detrás. Para quien mira la tele son la
 * misma película, y verla dos veces en la misma fila —una en el puesto 1 y
 * otra en el 4— es de las cosas que hacen pensar que la aplicación está rota.
 *
 * Van sin tildes porque cuando esto se aplica ya se han quitado.
 */
const ADORNOS =
  /\b(4k|uhd|fhd|hd|sd|hdr|dolby|atmos|latino|castellano|espanol|vose|imax|remux|webdl|web-dl|bluray)\b/g;

/**
 * El mismo título escrito de dos maneras da la misma llave.
 *
 * «30 (2007)» y «30 (2007) HD» acaban los dos en «302007». El año se mantiene
 * a propósito —«Alien (1979)» y «Alien (2017)» no son la misma película— y
 * por eso no se borra lo que va entre paréntesis.
 */
export function llaveDeTitulo(nombre: string): string {
  return (nombre || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(ADORNOS, " ")
    .replace(/[^a-z0-9]+/g, "");
}

/** La misma lista, quedándose con la primera copia de cada título. */
export function sinRepetir(de: Titulo[]): Titulo[] {
  const vistos = new Set<string>();
  const unos: Titulo[] = [];
  for (const t of de) {
    const llave = llaveDeTitulo(t.nombre);
    if (!llave || !vistos.has(llave)) {
      if (llave) vistos.add(llave);
      unos.push(t);
    }
  }
  return unos;
}

function comoNumero(v: string): number {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Los cuatro dígitos del año, de una fecha escrita como sea. */
export function anioDe(fecha?: string | number): string {
  const m = /(19|20)\d{2}/.exec(String(fecha ?? ""));
  return m ? m[0] : "";
}

function deAhora(t: Titulo, hoy: number): boolean {
  if (!hoy) return true;
  const suyo = Number(t.anio);
  return suyo > 0 && suyo >= hoy - (VENTANA_DE_ANIOS - 1);
}

/**
 * Se queda con los de los últimos años, y solo si quedan bastantes.
 *
 * Ordenando solo por la nota, arriba salía una comedia de 1928 con un 10
 * puesto a mano por el proveedor: técnicamente la mejor valorada del
 * catálogo y ninguna razón para abrir la aplicación. Pero un proveedor con
 * catálogo viejo, o que no manda el año, se quedaría sin fila, así que por
 * debajo de ocho títulos se afloja y se enseña el catálogo entero.
 */
function soloDeAhora(de: Titulo[], hoy: number): Titulo[] {
  if (!hoy) return de;
  const nuevos = de.filter((t) => deAhora(t, hoy));
  return nuevos.length >= MINIMO_PARA_FILTRAR ? nuevos : de;
}

/**
 * Las filas de la portada.
 *
 * Las dos inventadas van primero porque son las que contestan a «¿y qué
 * veo?», que es la pregunta con la que se entra aquí.
 *
 * Un aviso que conviene tener escrito: «en tendencia» **no es un dato que
 * exista**. Nadie nos dice qué se está viendo más. Lo que hay es la nota que
 * manda el proveedor, así que esa fila es «mejor valoradas» y se llama así.
 * Inventar una tendencia ordenando por cualquier cosa y ponerle ese nombre
 * sería mentirle al cliente.
 */
export function armarPortada(
  titulos: Titulo[],
  categorias: { id: string; nombre: string }[],
  hoy: number
): FilaPortada[] {
  if (!titulos.length) return [];

  const filas: FilaPortada[] = [];

  const valoradas = sinRepetir(
    soloDeAhora(titulos, hoy)
      .filter((t) => t.imagen && comoNumero(t.nota) > 0)
      .sort((a, b) => comoNumero(b.nota) - comoNumero(a.nota) || b.alta - a.alta)
  ).slice(0, CANDIDATOS_POR_FILA);
  if (valoradas.length >= 4) {
    filas.push({ titulo: "Mejor valoradas", items: valoradas, numerada: true, escaparate: true });
  }

  const recientes = sinRepetir(
    titulos.filter((t) => t.imagen && t.alta > 0).sort((a, b) => b.alta - a.alta)
  ).slice(0, CANDIDATOS_POR_FILA);
  if (recientes.length >= 4) {
    filas.push({ titulo: "Añadidas recientemente", items: recientes, escaparate: true });
  }

  /* Y las carpetas, en el orden que las manda el panel: ese orden lo ha
     puesto el proveedor a propósito —sus destacados primero— */
  for (const c of categorias) {
    if (filas.filter((f) => f.categoriaId).length >= CARPETAS_EN_PORTADA) break;
    const suyos = sinRepetir(titulos.filter((t) => t.categoria === c.id));
    if (!suyos.length) continue;
    filas.push({ titulo: c.nombre, items: suyos.slice(0, POR_FILA), categoriaId: c.id });
  }

  return filas;
}

/**
 * Por qué orden se prueban los títulos para el banner de arriba.
 *
 * No se elige a dedo —«el primero que tenga carátula»—: si esa carátula no
 * llega, la portada abre con un hueco negro del alto de media pantalla. Esto
 * devuelve una lista de candidatos y la pantalla va bajando por ella hasta
 * que una imagen carga de verdad.
 *
 * Ser de ahora pesa más que nada: un catálogo tiene miles de títulos viejos
 * con la nota a tope y ninguno de ellos es una razón para abrir la
 * aplicación.
 */
export function candidatosDestacado(filas: FilaPortada[], hoy: number): Titulo[] {
  const todos = filas.flatMap((f) => f.items);
  return sinRepetir(todos)
    .filter((t) => t.imagen)
    .sort(
      (a, b) =>
        luce(b, hoy) - luce(a, hoy) ||
        comoNumero(b.nota) - comoNumero(a.nota) ||
        b.alta - a.alta
    );
}

function luce(t: Titulo, hoy: number): number {
  let puntos = 0;
  if (deAhora(t, hoy)) puntos += 12;
  if (t.sinopsis.length > 60) puntos += 4;
  else if (t.sinopsis) puntos += 2;
  if (comoNumero(t.nota) > 0) puntos += 2;
  if (t.anio) puntos += 1;
  if (t.generos) puntos += 1;
  return puntos;
}

/** «2026 · ★ 8,2 · Terror», con lo que haya. */
export function datosDe(t: Titulo): string {
  /* La nota con coma: un «8.2» en medio de una línea en castellano se lee
     como un error de traducción */
  return [t.anio, comoNumero(t.nota) > 0 ? `★ ${t.nota.replace(".", ",")}` : "", t.generos]
    .filter(Boolean)
    .join("   ·   ");
}
