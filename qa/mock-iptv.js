// Servidor IPTV simulado (Xtream + M3U) sin cabeceras CORS, como los reales.
const http = require("http");
const fs = require("fs");
const path = require("path");

const WEBM = fs.readFileSync(path.join(__dirname, "test.webm"));
const MKV = fs.readFileSync(path.join(__dirname, "pelicula.mkv"));
const MKV_REAL = fs.readFileSync(path.join(__dirname, "pelicula-real.mkv"));
const MKV_HEVC = fs.readFileSync(path.join(__dirname, "pelicula-hevc.mkv"));
const b64 = (s) => Buffer.from(s).toString("base64");

const M3U = `#EXTM3U
#EXTINF:-1 tvg-id="test1" tvg-logo="http://127.0.0.1:8090/logo.png" group-title="Pruebas",Canal Test WebM
http://127.0.0.1:8090/media/canal1.webm
#EXTINF:-1 group-title="Pruebas",Canal Test 2
http://127.0.0.1:8090/media/canal2.webm
#EXTINF:-1 group-title="Deportes",Deporte Test
http://127.0.0.1:8090/media/canal3.webm
`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:8090");
  const p = url.pathname;

  // Lista cuyo canal apunta a un servidor que rechaza al navegador:
  // sirve para medir cuánto se tarda en caer al proxy.
  if (p === "/lista-bloqueada.m3u") {
    res.writeHead(200, { "Content-Type": "audio/x-mpegurl" });
    return res.end(
      `#EXTM3U\n#EXTINF:-1 group-title="Bloqueados",Canal Bloqueado\nhttp://127.0.0.1:8093/media/canal1.webm\n`
    );
  }

  // Lista cuyo canal apunta a un servidor que deja al navegador colgado
  if (p === "/lista-colgada.m3u") {
    res.writeHead(200, { "Content-Type": "audio/x-mpegurl" });
    return res.end(
      `#EXTM3U\n#EXTINF:-1 group-title="Colgados",Canal Colgado\nhttp://127.0.0.1:8094/media/canal1.webm\n`
    );
  }

  // Lista cuyo canal es un directo .m3u8 contra un servidor que nunca contesta
  if (p === "/lista-directo-muerto.m3u") {
    res.writeHead(200, { "Content-Type": "audio/x-mpegurl" });
    return res.end(
      `#EXTM3U\n#EXTINF:-1 group-title="Muertos",Directo Muerto\nhttp://127.0.0.1:8091/live/u/p/1.m3u8\n`
    );
  }

  // Lista grande con varias carpetas, para ver la parrilla como con una real
  if (p === "/lista-grande.m3u") {
    const grupos = {
      "Generalistas": ["La 1 HD", "La 2", "Antena 3 HD", "Cuatro", "Telecinco HD", "laSexta"],
      "Deportes": ["DAZN 1", "DAZN 2", "GOL PLAY", "Eurosport 1", "Eurosport 2", "Teledeporte", "M+ Deportes", "M+ Liga"],
      "Cine y Series": ["M+ Estrenos", "TCM", "Hollywood", "AXN", "Calle 13", "FOX", "Comedy Central"],
      "Infantil": ["Clan", "Boing", "Disney Channel", "Nickelodeon"],
      "Documentales": ["National Geographic", "Discovery", "Historia", "Odisea"],
      "Musica": ["MTV", "Sol Musica", "Hit TV"],
    };
    let out = "#EXTM3U\n";
    for (const [g, canales] of Object.entries(grupos)) {
      for (const c of canales) {
        out += `#EXTINF:-1 group-title="${g}",${c}\nhttp://127.0.0.1:8090/media/canal1.webm\n`;
      }
    }
    res.writeHead(200, { "Content-Type": "audio/x-mpegurl" });
    return res.end(out);
  }

  /* Lista del tamaño de una de verdad: 8.000 canales en 40 carpetas. Las
     listas de proveedor traen entre 5.000 y 15.000, y con la lista pequeña
     de arriba nunca se veía lo que pasaba al pintarlas todas. */
  if (p === "/lista-enorme.m3u") {
    let out = "#EXTM3U\n";
    for (let g = 1; g <= 40; g++) {
      for (let c = 1; c <= 200; c++) {
        const n = (g - 1) * 200 + c;
        out += `#EXTINF:-1 group-title="Carpeta ${String(g).padStart(2, "0")}",Canal ${n}\n`;
        out += `http://127.0.0.1:8090/media/canal1.webm\n`;
      }
    }
    res.writeHead(200, { "Content-Type": "audio/x-mpegurl" });
    return res.end(out);
  }

  // Película en MKV (H.264 + AC3): el caso que ningún navegador reproduce
  // sin el conversor del servidor
  if (p === "/lista-mkv.m3u") {
    res.writeHead(200, { "Content-Type": "audio/x-mpegurl" });
    return res.end(`#EXTM3U\n#EXTINF:-1 group-title="Cine",Pelicula MKV\nhttp://127.0.0.1:8090/media/pelicula.mkv\n`);
  }

  if (p === "/media/pelicula-hevc.mkv") {
    res.writeHead(200, { "Content-Type": "video/x-matroska", "Content-Length": MKV_HEVC.length });
    return res.end(MKV_HEVC);
  }

  if (p === "/media/pelicula-real.mkv") {
    res.writeHead(200, { "Content-Type": "video/x-matroska", "Content-Length": MKV_REAL.length });
    return res.end(MKV_REAL);
  }

  if (p === "/media/pelicula.mkv") {
    res.writeHead(200, { "Content-Type": "video/x-matroska", "Content-Length": MKV.length });
    return res.end(MKV);
  }

  if (p === "/lista.m3u") {
    res.writeHead(200, { "Content-Type": "audio/x-mpegurl" });
    return res.end(M3U);
  }

  // API de administración XUI simulada: la que usa la importación directa
  // del panel. Acepta el código de acceso en la ruta (XUI.one) o como
  // api_key, y devuelve la lista con casos sucios reales: uno desactivado
  // y uno cuya contraseña el panel no entrega.
  if (p === "/XUIKEY123/api.php" || (p === "/api.php" && url.searchParams.get("api_key") === "XUIKEY123")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    if (url.searchParams.get("action") === "user" && url.searchParams.get("sub") === "list") {
      return res.end(
        JSON.stringify({
          status: "STATUS_SUCCESS",
          data: [
            { username: "panelu1", password: "clavepanel1", exp_date: "1893456000", enabled: 1 },
            { username: "panelu2", password: "clavepanel2", exp_date: null, enabled: "1" },
            { username: "paneloff", password: "clavepanel3", exp_date: "1893456000", enabled: 0 },
            { username: "panelsinpass", password: "", exp_date: null, enabled: 1 },
          ],
        })
      );
    }
    return res.end(JSON.stringify({ status: "STATUS_FAILURE", error: "accion desconocida" }));
  }
  if (p === "/api.php") {
    // Código incorrecto: los XUI reales contestan con un fallo genérico
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "STATUS_FAILURE", error: "INVALID ACCESS CODE" }));
  }

  if (p === "/player_api.php") {
    const action = url.searchParams.get("action");
    const user = url.searchParams.get("username");
    const pass = url.searchParams.get("password");
    res.writeHead(200, { "Content-Type": "application/json" });

    /* Un segundo usuario con un catálogo del tamaño de uno de verdad: 8.000
       canales, 3.000 películas y 1.500 series. Con el catálogo de tres
       películas de abajo nunca se veía qué pasaba al pintarlo entero. */
    if (user === "enorme" && pass === "enorme123") {
      if (!action) {
        return res.end(JSON.stringify({
          user_info: { username: "enorme", status: "Active", exp_date: "1893456000", max_connections: "1" },
          server_info: { url: "127.0.0.1", port: "8090" },
        }));
      }
      const lista = (n, hacer) => Array.from({ length: n }, (_, i) => hacer(i + 1));
      const enorme = {
        get_live_categories: lista(40, (i) => ({ category_id: String(i), category_name: `Carpeta ${String(i).padStart(2, "0")}` })),
        get_live_streams: lista(8000, (i) => ({
          stream_id: i, name: `Canal ${i}`, stream_icon: "",
          category_id: String(Math.floor((i - 1) / 200) + 1),
        })),
        get_vod_categories: lista(20, (i) => ({ category_id: String(100 + i), category_name: `Género ${i}` })),
        get_vod_streams: lista(3000, (i) => ({
          stream_id: 10000 + i, name: `Película ${i}`, stream_icon: "", container_extension: "webm",
          category_id: String(100 + (Math.floor((i - 1) / 150) + 1)), added: "1700000000",
        })),
        get_series_categories: lista(10, (i) => ({ category_id: String(200 + i), category_name: `Serie género ${i}` })),
        get_series: lista(1500, (i) => ({
          series_id: 20000 + i, name: `Serie ${i}`, cover: "", plot: "",
          category_id: String(200 + (Math.floor((i - 1) / 150) + 1)), last_modified: "1700000000",
        })),
      };
      return res.end(JSON.stringify(enorme[action] ?? []));
    }

    if (user !== "demo" || pass !== "demo123") {
      return res.end(JSON.stringify({ user_info: { auth: 0 } }));
    }
    if (!action) {
      return res.end(
        JSON.stringify({
          user_info: { username: "demo", status: "Active", exp_date: "1893456000", max_connections: "1" },
          server_info: { url: "127.0.0.1", port: "8090" },
        })
      );
    }
    const data = {
      get_live_categories: [
        { category_id: "1", category_name: "Generalistas" },
        { category_id: "2", category_name: "Deportes" },
      ],
      get_live_streams: [
        // Con Catch Up, como los canales que guardan los últimos días
        { stream_id: 1, name: "La Uno Test", stream_icon: "", category_id: "1", epg_channel_id: "uno.test", tv_archive: 1, tv_archive_duration: 7 },
        { stream_id: 2, name: "Deportes Test HD", stream_icon: "", category_id: "2" },
        { stream_id: 3, name: null, stream_icon: "", category_id: "2" },
      ],
      get_vod_categories: [{ category_id: "10", category_name: "Estrenos" }],
      get_vod_streams: [
        // «added» en segundos y como texto, que es como lo manda XUI
        { stream_id: 100, name: "Película Demo", stream_icon: "", category_id: "10", container_extension: "webm", added: String(Math.floor((Date.now() - 2 * 86400000) / 1000)) },
        // Dato sucio real: paneles que devuelven títulos sin nombre
        { stream_id: 101, name: null, stream_icon: "", category_id: "10", container_extension: "webm", added: "" },
        { stream_id: 102, name: "Película Vieja", stream_icon: "", category_id: "10", container_extension: "webm", added: String(Math.floor((Date.now() - 900 * 86400000) / 1000)) },
      ],
      get_series_categories: [{ category_id: "20", category_name: "Drama" }],
      get_series: [{ series_id: 200, name: "Serie Demo", cover: "", category_id: "20", plot: "Una serie de prueba.", last_modified: String(Math.floor((Date.now() - 86400000) / 1000)) }],
      get_vod_info: {
        info: {
          name: "Película Demo",
          plot: "Un thriller de prueba en el que un reproductor IPTV debe demostrar que puede con todo.",
          cast: "Ana Actriz, Pepe Actor",
          director: "Dora Directora",
          genre: "Thriller, Drama",
          releasedate: "2026-01-15",
          rating: "7.8",
          duration: "01:52:00",
        },
        movie_data: { stream_id: 100, name: "Película Demo", container_extension: "webm" },
      },
      get_series_info: {
        info: {
          name: "Serie Demo",
          plot: "Una serie de prueba.",
          cast: "Luisa Lista, Carlos Canal",
          director: "Sergio Series",
          genre: "Comedia",
          releaseDate: "2025-09-01",
          rating: "8.2",
        },
        episodes: {
          "1": [
            { id: "300", episode_num: 1, title: "Piloto", container_extension: "webm", season: 1 },
            { id: "301", episode_num: 2, title: "Segundo", container_extension: "webm", season: 1 },
          ],
        },
      },
      get_short_epg: {
        // Parrilla alrededor de «ahora»: una hora por programa, con las dos
        // formas en que XUI manda las horas (texto y unix en segundos)
        epg_listings: (() => {
          const enPunto = Math.floor(Date.now() / 3600000) * 3600000 - 3600000;
          const texto = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
          const titulos = [
            "Telediario de prueba",
            "El programa siguiente",
            "Cine de sobremesa",
            "Documental de pruebas",
            "Late show",
            "Madrugada",
          ];
          return titulos.map((t, i) => {
            const ini = enPunto + i * 3600000;
            return {
              id: String(500 + i),
              title: b64(t),
              description: b64(`Descripción de ${t}.`),
              start: texto(ini),
              end: texto(ini + 3600000),
              start_timestamp: String(Math.floor(ini / 1000)),
              stop_timestamp: String(Math.floor((ini + 3600000) / 1000)),
            };
          });
        })(),
      },
    };
    return res.end(JSON.stringify(data[action] ?? []));
  }

  // Catch Up: el panel lo sirve por su propio guion, con hora y duración
  if (p === "/streaming/timeshift.php") {
    const start = url.searchParams.get("start") || "";
    const dur = url.searchParams.get("duration") || "";
    if (!/^\d{4}-\d{2}-\d{2}:\d{2}-\d{2}$/.test(start) || !/^\d+$/.test(dur)) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      return res.end("start o duration mal formados");
    }
    res.writeHead(200, { "Content-Type": "video/webm", "Content-Length": WEBM.length });
    return res.end(WEBM);
  }

  // Streams: /live/u/p/1.m3u8|.ts, /movie/u/p/100.webm, /series/u/p/300.webm, /media/*.webm
  if (/\.webm$/.test(p)) {
    res.writeHead(200, { "Content-Type": "video/webm", "Content-Length": WEBM.length });
    return res.end(WEBM);
  }
  if (/\.m3u8$/.test(p)) {
    res.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl" });
    return res.end("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXTINF:4.0,\nseg0.ts\n#EXT-X-ENDLIST\n");
  }
  res.writeHead(404);
  res.end("not found");
});

server.listen(8090, () => console.log("mock IPTV en :8090"));
