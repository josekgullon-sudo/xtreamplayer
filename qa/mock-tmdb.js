// TMDB de mentira, para poder probar la portada sin salir a internet.
//
// Contesta a `/search/movie` y `/search/tv` como el de verdad —con
// `results`, `backdrop_path`, `poster_path`, `overview`, `vote_average`,
// `vote_count` y
// `genre_ids`—, a `/movie/{id}/credits` y `/tv/{id}/credits` con el reparto,
// y sirve las imágenes en `/t/p/...`. Reconoce los títulos que el mock IPTV
// manda en el catálogo y no reconoce el resto, que es justo lo que pasa con
// un catálogo real: TMDB acierta mucho, no siempre.
const http = require("http");

/* Un PNG de 8×5 en gris: no importa qué se vea, importa que el navegador lo
   cargue y no dispare el `onError` que tira la imagen de la portada */
const FONDO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAFCAYAAAB4ka1VAAAAHElEQVQI12P8//8/AzbAxIAHjEqOSo5KjkqOTEkAcHwHkQ0Y1eIAAAAASUVORK5CYII=",
  "base64"
);

/** Lo que «conoce» este TMDB: por el título ya limpio de adornos. */
function ficha(consulta, serie) {
  const q = String(consulta || "").trim().toLowerCase();
  const estreno = /^estreno (\d+)$/.exec(q);
  if (estreno) {
    const n = Number(estreno[1]);
    return {
      id: 1000 + n,
      backdrop_path: `/fondo-${n}.png`,
      poster_path: `/cartel-${n}.png`,
      overview: `Sinopsis de TMDB para el estreno ${n}: la que el panel del proveedor no manda y es la que se lee en el banner.`,
      vote_average: 7.5,
      // Y cuánta gente la ha votado: sin esto, la ficha se probaba siempre
      // sin el «según N valoraciones» y no había forma de ver ese camino
      vote_count: 12845,
      release_date: `${new Date().getFullYear()}-03-0${(n % 9) + 1}`,
      genre_ids: [53, 18],
    };
  }
  if (q === "serie demo" && serie) {
    return {
      id: 2000,
      backdrop_path: "/fondo-serie.png",
      poster_path: "/cartel-serie.png",
      overview: "Una serie que TMDB sí conoce, con su sinopsis en español.",
      vote_average: 8.4,
      vote_count: 3120,
      first_air_date: "2025-09-01",
      genre_ids: [18, 10759],
    };
  }
  // Lo demás no lo conoce: se guarda como «no encontrado» y no se repite
  return null;
}

/*
 * El reparto de un título, como lo manda TMDB.
 *
 * Con un actor SIN foto a propósito: es el caso que se da de verdad —TMDB
 * conoce a los tres primeros y del cuarto solo tiene el nombre— y es donde
 * se rompe una fila de caras si nadie lo ha probado.
 */
function reparto(id) {
  if (!id) return [];
  return [
    { name: "Ana Actriz", character: "La protagonista", profile_path: "/cara-1.png" },
    { name: "Pepe Actor", character: "El otro", profile_path: "/cara-2.png" },
    { name: "Lola Secundaria", character: "La vecina", profile_path: "/cara-3.png" },
    { name: "Sin Retrato", character: "El del bar", profile_path: null },
  ];
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://x");

    if (url.pathname.startsWith("/t/p/")) {
      res.writeHead(200, { "Content-Type": "image/png", "Content-Length": FONDO.length });
      return res.end(FONDO);
    }

    const serie = url.pathname === "/search/tv";
    if (url.pathname === "/search/movie" || serie) {
      if (!url.searchParams.get("api_key")) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ status_message: "sin clave" }));
      }
      const uno = ficha(url.searchParams.get("query"), serie);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ results: uno ? [uno] : [] }));
    }

    /* El reparto: `/movie/1001/credits` y `/tv/2000/credits` */
    const creditos = /^\/(movie|tv)\/(\d+)\/credits$/.exec(url.pathname);
    if (creditos) {
      if (!url.searchParams.get("api_key")) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ status_message: "sin clave" }));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ cast: reparto(Number(creditos[2])) }));
    }

    res.writeHead(404);
    res.end();
  })
  .listen(8095, () => console.log("mock TMDB en :8095"));
