import { getDb } from "./db";
import { llaveDeTitulo } from "./portada";

/**
 * Lo que TMDB sabe de una película o una serie.
 *
 * Existe porque un panel IPTV manda el nombre y poco más: no manda fondos
 * apaisados —solo carátulas verticales—, ni sinopsis en español, ni géneros,
 * y la nota la trae medio catálogo puesta a 10 a mano. Sin esto, la portada
 * tiene que apañarse estirando una carátula, que es exactamente lo que se
 * veía mal en la tele.
 *
 * Tres reglas, y las tres son de coste:
 *
 * 1. **Se pregunta una vez por título y para toda la plataforma.** El
 *    resultado va a `tmdb_cache` y no se vuelve a preguntar. «Dune (2024)»
 *    la tienen todos los proveedores: se consulta una vez, no una por
 *    proveedor y desde luego no una por cliente.
 * 2. **Solo se pregunta por lo que se va a enseñar.** Un proveedor trae
 *    treinta mil películas; una portada enseña ciento cincuenta. Recorrer el
 *    catálogo entero por adelantado sería la manera de convertir esto en un
 *    problema.
 * 3. **Las imágenes no pasan por aquí.** Se devuelve la ruta que da TMDB y
 *    el cliente se la pide a su CDN. Al contrario que las carátulas del
 *    proveedor —que sí hay que servir desde aquí, porque su dirección no
 *    puede salir—, estas son públicas y no hay nada que esconder.
 *
 * Sin `TMDB_API_KEY` en el entorno, todo esto queda apagado y devuelve
 * vacío: la aplicación funciona igual que antes, con lo que mande el panel.
 */

const CLAVE = process.env.TMDB_API_KEY || "";
/* La dirección sale del entorno para poder probar esto sin salir a
   internet, igual que se hace con el correo en qa/mock-resend.js */
const API = process.env.TMDB_API_URL || "https://api.themoviedb.org/3";
/* Y el de las imágenes, que las sirve su CDN y no este servidor */
const IMAGENES = process.env.TMDB_IMG_URL || "https://image.tmdb.org/t/p";
/** El idioma de las sinopsis. Cuando llegue el punto 9, saldrá de ahí. */
const IDIOMA = process.env.TMDB_IDIOMA || "es-ES";

/** Un título que TMDB no conoce se vuelve a buscar al mes, no cada vez. */
const CADUCA_SIN_ENCONTRAR = 30 * 24 * 60 * 60 * 1000;

export interface Meta {
  /** La llave con la que se pidió, para que el cliente sepa a quién es. */
  llave: string;
  /** El fondo apaisado, ya como dirección entera del CDN de TMDB. */
  fondo: string;
  /** Y la carátula vertical, para los títulos que el panel manda sin ella. */
  cartel: string;
  sinopsis: string;
  nota: number;
  generos: string;
  anio: string;
}

export function hayTmdb(): boolean {
  return Boolean(CLAVE);
}

/**
 * La llave de un título: la misma que usa la portada para no repetirlos.
 *
 * Con el año dentro, porque «Alien (1979)» y «Alien (2017)» no son la misma
 * película, y con la marca de serie, porque hay series y películas que se
 * llaman igual.
 */
export function llaveDe(nombre: string, anio: string, serie: boolean): string {
  return `${serie ? "s" : "p"}:${llaveDeTitulo(nombre)}:${anio || ""}`;
}

/*
 * El grifo, y por qué está aquí.
 *
 * TMDB aguanta de sobra lo que le vamos a pedir, pero el que tiene que
 * aguantar es este servidor: si el primer cliente de un proveedor nuevo abre
 * la portada y se disparan ciento cincuenta peticiones a la vez, lo que se
 * queda sin aire es nuestro proceso, no el suyo. Con seis a la vez, una
 * portada entera tarda unos segundos en completarse y mientras tanto se
 * enseña lo que mande el panel.
 */
const A_LA_VEZ = Number(process.env.TMDB_A_LA_VEZ || 6);
/** Y un tope duro por si alguien pide una lista larguísima de golpe. */
const MAXIMO_POR_TANDA = 200;

interface Fila {
  llave: string;
  tmdb_id: number;
  fondo: string;
  cartel: string;
  sinopsis: string;
  nota: number;
  generos: string;
  anio: string;
  pedido_en: number;
}

function guardadas(llaves: string[]): Map<string, Fila> {
  if (!llaves.length) return new Map();
  const db = getDb();
  const huecos = llaves.map(() => "?").join(",");
  const filas = db
    .prepare(`SELECT * FROM tmdb_cache WHERE llave IN (${huecos})`)
    .all(...llaves) as Fila[];
  return new Map(filas.map((f) => [f.llave, f]));
}

function guardar(f: Fila) {
  getDb()
    .prepare(
      `INSERT INTO tmdb_cache (llave, tmdb_id, titulo, anio, fondo, cartel, sinopsis, nota, generos, pedido_en)
       VALUES (@llave, @tmdb_id, @titulo, @anio, @fondo, @cartel, @sinopsis, @nota, @generos, @pedido_en)
       ON CONFLICT(llave) DO UPDATE SET
         tmdb_id = excluded.tmdb_id, titulo = excluded.titulo, anio = excluded.anio,
         fondo = excluded.fondo, cartel = excluded.cartel, sinopsis = excluded.sinopsis,
         nota = excluded.nota, generos = excluded.generos, pedido_en = excluded.pedido_en`
    )
    .run({ ...f, titulo: "" });
}

function deFila(f: Fila): Meta | null {
  if (!f.tmdb_id) return null;
  /* En la base se guarda la ruta que da TMDB —«/abc.jpg»— y aquí se le pone
     el prefijo: así, si mañana cambian de CDN o queremos otro tamaño, no hay
     que tocar lo ya guardado */
  return {
    llave: f.llave,
    fondo: f.fondo ? `${IMAGENES}/w1280${f.fondo}` : "",
    cartel: f.cartel ? `${IMAGENES}/w342${f.cartel}` : "",
    sinopsis: f.sinopsis,
    nota: f.nota,
    generos: f.generos,
    anio: f.anio,
  };
}

/**
 * Le quita al título lo que TMDB no entiende.
 *
 * Un proveedor manda «4K | LA PELÍCULA (2026) [LAT]». Buscando eso tal cual,
 * TMDB no encuentra nada; buscando «La Película», sí. Se quitan las
 * etiquetas de calidad e idioma, lo que va entre corchetes y el año del
 * final —el año se manda aparte, que es como se acota bien la búsqueda—.
 */
export function paraBuscar(nombre: string): string {
  return (nombre || "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\((?:19|20)\d{2}\)/g, " ")
    .replace(
      /\b(4k|uhd|fhd|hd|sd|hdr|dolby|atmos|latino|castellano|espa[nñ]ol|vose|imax|remux|web-?dl|bluray|multi|dual)\b/gi,
      " "
    )
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function preguntar(nombre: string, anio: string, serie: boolean): Promise<Fila | null> {
  const busca = paraBuscar(nombre);
  if (!busca) return null;

  const params = new URLSearchParams({
    api_key: CLAVE,
    query: busca,
    language: IDIOMA,
    include_adult: "false",
  });
  if (anio) params.set(serie ? "first_air_date_year" : "year", anio);

  const res = await fetch(`${API}/search/${serie ? "tv" : "movie"}?${params}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const datos = (await res.json()) as {
    results?: {
      id: number;
      backdrop_path?: string | null;
      poster_path?: string | null;
      overview?: string;
      vote_average?: number;
      release_date?: string;
      first_air_date?: string;
      genre_ids?: number[];
    }[];
  };

  const uno = (datos.results || [])[0];
  if (!uno) return null;
  return {
    llave: "",
    tmdb_id: uno.id,
    /* Solo la ruta: la dirección entera la arma el cliente contra el CDN de
       TMDB, así que por este servidor no pasa ni un byte de imagen */
    fondo: uno.backdrop_path || "",
    cartel: uno.poster_path || "",
    sinopsis: (uno.overview || "").trim(),
    nota: Number(uno.vote_average) || 0,
    generos: generosDe(uno.genre_ids || []),
    anio: (uno.release_date || uno.first_air_date || "").slice(0, 4),
    pedido_en: Date.now(),
  };
}

/**
 * Pide lo que falte y devuelve lo que se sepa de cada título.
 *
 * Lo que ya está guardado sale sin tocar la red. Lo que no, se pregunta con
 * el grifo puesto. Si TMDB falla o tarda, se devuelve lo que haya: esto
 * nunca puede dejar una pantalla sin pintar.
 */
export async function metaDe(
  titulos: { nombre: string; anio?: string; serie?: boolean }[]
): Promise<Meta[]> {
  if (!CLAVE || !titulos.length) return [];

  const pedidos = titulos.slice(0, MAXIMO_POR_TANDA).map((t) => ({
    ...t,
    anio: t.anio || "",
    serie: Boolean(t.serie),
    llave: llaveDe(t.nombre, t.anio || "", Boolean(t.serie)),
  }));

  // Una misma portada puede traer el mismo título dos veces
  const unicos = new Map(pedidos.map((p) => [p.llave, p]));
  const ya = guardadas([...unicos.keys()]);

  const salida: Meta[] = [];
  const faltan: typeof pedidos = [];
  for (const p of unicos.values()) {
    const guardada = ya.get(p.llave);
    if (guardada) {
      /* Lo que no se encontró se reintenta al mes: TMDB añade títulos, y un
         estreno de la semana pasada puede no estar todavía */
      const caducado = !guardada.tmdb_id && Date.now() - guardada.pedido_en > CADUCA_SIN_ENCONTRAR;
      if (!caducado) {
        const m = deFila(guardada);
        if (m) salida.push(m);
        continue;
      }
    }
    faltan.push(p);
  }

  for (let i = 0; i < faltan.length; i += A_LA_VEZ) {
    const tanda = faltan.slice(i, i + A_LA_VEZ);
    const hechas = await Promise.all(
      tanda.map(async (p) => {
        try {
          const fila = await preguntar(p.nombre, p.anio, p.serie);
          const guardable: Fila = fila
            ? { ...fila, llave: p.llave }
            : {
                llave: p.llave,
                tmdb_id: 0,
                fondo: "",
                cartel: "",
                sinopsis: "",
                nota: 0,
                generos: "",
                anio: "",
                pedido_en: Date.now(),
              };
          guardar(guardable);
          return deFila(guardable);
        } catch {
          /* Un fallo de red no se guarda como «no existe»: se deja para la
             próxima vez, que puede ser dentro de un minuto */
          return null;
        }
      })
    );
    for (const m of hechas) if (m) salida.push(m);
  }

  return salida;
}

/**
 * Los géneros, por su número.
 *
 * TMDB los manda como identificadores y su lista completa es otra petición.
 * Son veinte y no cambian nunca desde hace años, así que están aquí escritos:
 * una llamada menos por título y una dependencia menos que se puede caer.
 */
const GENEROS: Record<number, string> = {
  28: "Acción",
  12: "Aventura",
  16: "Animación",
  35: "Comedia",
  80: "Crimen",
  99: "Documental",
  18: "Drama",
  10751: "Familia",
  14: "Fantasía",
  36: "Historia",
  27: "Terror",
  10402: "Música",
  9648: "Misterio",
  10749: "Romance",
  878: "Ciencia ficción",
  10770: "Televisión",
  53: "Suspense",
  10752: "Bélica",
  37: "Western",
  10759: "Acción y aventura",
  10762: "Infantil",
  10763: "Noticias",
  10764: "Telerrealidad",
  10765: "Ciencia ficción y fantasía",
  10766: "Telenovela",
  10767: "Entrevistas",
  10768: "Bélica y política",
};

function generosDe(ids: number[]): string {
  return ids
    .map((n) => GENEROS[n])
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
}
