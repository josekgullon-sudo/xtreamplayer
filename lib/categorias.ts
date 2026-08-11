import type { IconName } from "@/components/Icon";

/**
 * De qué va una carpeta, mirándole el nombre.
 *
 * Una lista de proveedor trae sesenta carpetas y buena parte empiezan por la
 * misma palabra: «DAZN SLB», «DAZN - MOTO GP», «DAZN | EVENTOS», «DAZN - F1».
 * Puestas una debajo de otra son la misma mancha de texto y hay que leerlas
 * enteras para distinguirlas. Con un casco, un calendario y un balón delante
 * se distinguen de un vistazo, que es como se elige carpeta.
 *
 * El nombre es lo único que hay: el panel no manda ningún tipo, ni un icono,
 * ni nada parecido. Así que se busca por palabras, en el orden en que están
 * escritas aquí abajo — y ese orden importa: «MOTO GP» tiene que caer en
 * motor antes de que «GP» se lo lleve otra cosa, y «CANALES 4K» tiene que
 * caer en televisión y no en cine por la palabra «canal».
 *
 * Lo que no encaja en nada se queda con el icono de televisión, que es lo
 * que es: una carpeta de canales.
 */

/** Sin acentos, sin signos y en minúsculas: «DAZN | Fútbol» y «dazn futbol» son lo mismo */
function llano(texto: string): string {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/*
 * Cada familia, con las palabras por las que se reconoce. Van en orden: la
 * primera que casa manda.
 *
 * Las palabras se buscan sueltas —rodeadas de espacio o de principio y fin—
 * y no como trozo de otra: «f1» no puede saltar dentro de «f10», ni «tdt»
 * dentro de «tdtx». Con `includes()` a pelo, «serie a» le robaba las
 * carpetas a las series de televisión.
 */
const FAMILIAS: { icono: IconName; palabras: string[] }[] = [
  { icono: "casco", palabras: ["f1", "formula", "formula 1", "moto", "motogp", "moto gp", "motor", "rally", "nascar", "indycar", "superbike"] },
  { icono: "guante", palabras: ["ufc", "boxeo", "boxing", "mma", "wwe", "aew", "lucha", "combate"] },
  { icono: "balon", palabras: ["futbol", "laliga", "la liga", "premier", "champions", "bundesliga", "serie a", "ligue 1", "hypermotion", "rfef", "copa", "mundial", "eurocopa", "libertadores", "mls", "liga mx"] },
  { icono: "silbato", palabras: ["deporte", "deportes", "sport", "sports", "dazn", "espn", "bein", "eurosport", "basket", "nba", "acb", "tenis", "golf", "padel", "ciclismo", "atletismo", "nfl", "mlb", "nhl"] },
  { icono: "calendario", palabras: ["evento", "eventos", "event", "events", "ppv", "24 7", "24 h"] },
  { icono: "bebe", palabras: ["infantil", "infantiles", "kids", "nino", "ninos", "dibujos", "cartoon", "disney", "junior", "baby", "peques"] },
  { icono: "musica", palabras: ["musica", "music", "mtv", "radio", "hits", "conciertos"] },
  { icono: "noticias", palabras: ["noticia", "noticias", "news", "informativo", "informativos", "24h", "actualidad"] },
  { icono: "libro", palabras: ["documental", "documentales", "docu", "discovery", "natgeo", "national geographic", "history", "historia", "ciencia", "naturaleza"] },
  { icono: "lock", palabras: ["adulto", "adultos", "xxx", "adult", "erotico", "porno"] },
  { icono: "film", palabras: ["cine", "peliculas", "pelicula", "movie", "movies", "estrenos"] },
  { icono: "series", palabras: ["serie", "series", "novela", "novelas", "temporada"] },
  { icono: "antena", palabras: ["tdt", "autonomico", "autonomicos", "nacional", "nacionales", "locales", "generalista", "generalistas"] },
];

/** Qué icono le toca a esta carpeta. Nunca devuelve nada vacío. */
export function iconoDeCategoria(nombre: string): IconName {
  const n = ` ${llano(nombre)} `;
  for (const familia of FAMILIAS) {
    for (const palabra of familia.palabras) {
      if (n.includes(` ${palabra} `)) return familia.icono;
    }
  }
  return "tv";
}
