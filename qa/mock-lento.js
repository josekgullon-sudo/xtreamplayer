// Servidor que responde muy despacio: reproduce la lista grande que tarda
// una eternidad, que es el caso donde el indicador de carga tiene que verse.
const http = require("http");

const CANALES = Array.from({ length: 40 }, (_, i) =>
  `#EXTINF:-1 group-title="Lento",Canal Lento ${i + 1}\nhttp://127.0.0.1:8090/live/u/p/1.m3u8`
).join("\n");

http
  .createServer((req, res) => {
    if (req.url.startsWith("/lenta.m3u")) {
      res.writeHead(200, { "Content-Type": "audio/x-mpegurl" });
      res.write("#EXTM3U\n");
      // Va soltando el contenido a cachos durante ~9 s
      let n = 0;
      const trozos = CANALES.split("\n");
      const t = setInterval(() => {
        if (n >= trozos.length) {
          clearInterval(t);
          return res.end();
        }
        res.write(trozos[n] + "\n");
        n += 1;
      }, 220);
      req.on("close", () => clearInterval(t));
      return;
    }
    res.writeHead(404).end();
  })
  .listen(8092, () => console.log("mock lento en :8092"));
