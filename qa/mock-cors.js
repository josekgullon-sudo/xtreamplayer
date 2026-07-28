// Servidor que rechaza al navegador (sin cabeceras CORS y cerrando la
// conexión), pero que sí responde a un cliente servidor→servidor con
// User-Agent de VLC. Es el caso más común: el directo falla y solo funciona
// a través de nuestro proxy.
const http = require("http");
const fs = require("fs");
const path = require("path");

const SEG = fs.existsSync(path.join(__dirname, "seg.ts")) ? fs.readFileSync(path.join(__dirname, "seg.ts")) : null;

http
  .createServer((req, res) => {
    const esNavegador = !String(req.headers["user-agent"] || "").includes("VLC");

    // Al navegador se le corta en seco: ni CORS ni respuesta
    if (esNavegador) {
      req.socket.destroy();
      return;
    }

    // A quien sí acepta (nuestro proxy) le damos el vídeo del mock bueno
    res.writeHead(302, { Location: "http://127.0.0.1:8090" + req.url });
    res.end();
  })
  .listen(8093, () => console.log("mock que bloquea al navegador en :8093"));
