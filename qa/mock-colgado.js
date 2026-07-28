// Servidor que se queda colgado: acepta la petición y no responde nunca.
// Reproduce el caso de un proveedor que bloquea al navegador sin cerrar.
const http = require("http");
http.createServer((req, res) => {
  if (req.url.startsWith("/lista.m3u")) {
    res.writeHead(200, { "Content-Type": "audio/x-mpegurl" });
    return res.end(`#EXTM3U
#EXTINF:-1 group-title="Pruebas",Canal Colgado
http://127.0.0.1:8091/live/u/p/1.m3u8
`);
  }
  // El resto de rutas no contestan jamás
}).listen(8091, () => console.log("mock colgado en :8091"));
