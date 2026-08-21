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

/*
 * Las imágenes: una apaisada y otra vertical, y que se distingan.
 *
 * Eran las dos el mismo PNG gris de 8×5 —«no importa qué se vea, importa que
 * cargue»—, y con eso ninguna captura de pantalla podía enseñar si un fondo
 * apaisado estaba puesto, recortado del revés o directamente ausente: todo
 * salía gris. Ahora el fondo va en 16:9 con un degradado y una diagonal
 * —la diagonal dice por dónde se ha recortado— y la carátula en 2:3 con
 * otros colores y una franja abajo. Siguen siendo dos ficheros de un kilo.
 */
const FONDO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAASCAIAAAC1qksFAAAFY0lEQVR42k3QseuqXADG8fuX3KlBcpAcFAfD4YDDAXk1xEQpoQMNB4IaQhocBBuUhgTBhhCHM0gOEQ4OQQ4JDU5tTW3N73/wvsGFHxee/cP3+fXfv+53faoZUFeeqodUBagzpEqVKsYUmVA5oo6YOiypxKX2HrULqDCitjHlp5SXURtCrU/U6kItagrfqHlLzTpq+qSsF2W8qdGH+ufXb/rRo+9/mD8D9BnSpUoXY5pM6BzRR0wflnTi0nuP3gV0GNHbmPZT2svoDaHXJ3p1oRc1jW/0vKVnHT190taLNt706EN/AebRY+59phkwV56ph0z1I40ZMmFyxBwxc1gyicvsPWYXMGHEbGPGTxkvYzaEWZ+Y1YVZ1Ay+MfOWmXXM9MlYL8Z4M6MP8wXYR4+999lmwF55th6yFWDPkC1Vtvg7a8kmLrv32F3AhhG7jVk/Zb2M3RB2fWJXF3ZRs/jGzlt21rHTJ2u9WOPNjj7sF+AePe7e55oBd+W5eshVgDtDrlS5YsyRCZcj7oi5w48UcGHEbWPOTzkv4zaEW5+41YVb1By+cfOWm3Xc9MlZL854c6MP9wWER0+494VmIFx5oR4KFRDOUChVoRgLZCLkSDhi4bAUElfYe8IuEMIfLBM2RFifhNVFWNQCvgnzVph1wvQpWC/BeAujj/AFxEdPvPfFZiBeebEeihUQz1AsVbEYi2Qi5kg8YvGwFBNX3HviLhDDSNzGop+K3t8f1iK+ifNWnHXi9ClaL9F4i6OP+AWkR0+696VmIF15qR5KFZDOUCpVqRhLZCLlSDpi6bCUElfae9IukMJI2saSn0peJm2ItD5Jq4u0+JE6afqUrJdkvKXRR/oC4NED9z5oBuDKg3oIKgDOEJQqKMaATECOwBGDwxIkLth7YBeAMALbGPgp8DKwIWB9AqsLWNQA38C8BbO/sz7gC8iPnnzvy81AvvJyPZQrIJ+hXKpyMZbJRM6RfMTyYSknrrz35F0gh5G8jWU/lb1M3hB5fZJXF3lRy/gmz1t51snTp2y9ZOMtj77Gr9/w0YP3PmwG8MrDeggrAM8QliosxpBMYI7gEcPDEiYu3HtwF8AwgtsY+in0MrghcH2Cqwtc1BDf4LyFsw5On9B6QeMNRx/4LVAePeXeV5qBcuWVeqhUQDlDpVSVYqyQiZIj5YiVw1JJXGXvKbtACSNlGyt+qniZsiHK+qSsLsqiVvBNmbfKrFOmT8V6KcZbGX2UL6A9etq9rzUD7cpr9VCrgHaGWqlqxVgjEy1H2hFrh6WWuNre03aBFkbaNtb8VPMybUO09UlbXbRFreGbNm+1WadNn5r10oy3NvpoX0B/9PR7X28G+pXX66FeAf0M9VLVi7FOJnqO9CPWD0s9cfW9p+8CPYz0baz7qe5l+obo65O+uuiLWsc3fd7qs06fPnXrpRtvffTRv4D56Jn3vtkMzCtv1kOzAuYZmqVqFmOTTMwcmUdsHpZm4pp7z9wFZhiZ29j0U9PLzA0x1ydzdTEXtYlv5rw1Z505fZrWyzTe5uhjfgH70bPvfbsZ2Fferod2BewztEvVLsY2mdg5so/YPiztxLX3nr0L7DCyt7Htp7aX2Rtir0/26mIvahvf7Hlrzzp7+rStl2287dHH/gLOo+fc+04zcK68Uw+dCjhn6JSqU4wdMnFy5Byxc1g6ievsPWcXOGHkbGPHTx0vczbEWZ+c1cVZ1A6+OfPWmXXO9OlYL8d4O6OP8wXQo4fufdQM0JVH9RBVAJ0hKlVUjBGZoByhI0aHJUpctPfQLkBhhLYx8lPkZWhD0PqEVhe0qBG+oXmLZh2aPpH1QsYbjT7on/8BX54dTzNsu7gAAAAASUVORK5CYII=",
  "base64"
);
const CARTEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAwAAAASCAIAAADgy6hbAAABuUlEQVR42q3KMcqwIBgAYA/xDd8R2luFdxAcDAQHCcFBxLkDNDYIDUFB0CA1BA6CQ4PuHaBD/Uf4lw+e8UFNwU2BppCm0KawpvCmiKbIpqim6KaYpjjUPrh9oH1I+9D2Ye3D20e0j2wf1T66fUz7OAQZQwbIBDKFzCBzyAKyhKwga8gGskNdwl2CLpEu0S6xLvEuiS7JLqku6S6ZLjnUR9xH6CPpI+0j6yPvo+ij7KPqo+6j6aND9sb2BnsTe1N7M3tzewt7S3sre2t7G3s7NFx4uGC4yHDR4WLDxYdLDJccLjVcerjMcDk0BjwGGAMZAx0DGwMfgxiDHIMagx6DGYND/sD+AH8Qf1B/MH9wfwh/SH8of2h/GH84tO1422HbybbTbWfbzrddbLvcdrXtetvNtjt0rvhc4VzJudJzZefKz1WcqzxXda76XM25OpQWnBZIC0kLTQtLC0+LSItMi0qLTotJi0N1xnWGOpM60zqzOvM6izrLOqs66zqbOjv0evx6eD15PX09ez1/vXi9fL16vX69eb1D34S/Cb6JfBP9JvZN/JvEN8lvUt+kv8l8k0M/P7//9XfpH1jyA415JsgDAAAAAElFTkSuQmCC",
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
      /* Apaisada o vertical según lo que se haya pedido, que es lo que
         distingue un fondo de una carátula en las rutas de TMDB */
      const png = /cartel|perfil/.test(url.pathname) ? CARTEL : FONDO;
      res.writeHead(200, { "Content-Type": "image/png", "Content-Length": png.length });
      return res.end(png);
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
