// Servidor que deja al navegador colgado: acepta la conexión y no contesta
// nunca. Es el peor caso real (y el más común cuando un proveedor filtra por
// User-Agent sin cerrar la conexión), porque no hay error que detectar: solo
// el plazo de espera saca al reproductor de ahí.
// A quien se identifica como VLC —nuestro proxy— sí le sirve.
const http = require("http");

const abiertas = [];
http
  .createServer((req, res) => {
    const esNavegador = !String(req.headers["user-agent"] || "").includes("VLC");
    if (esNavegador) {
      abiertas.push(res); // ni responder ni cerrar: colgado
      return;
    }
    res.writeHead(302, { Location: "http://127.0.0.1:8090" + req.url });
    res.end();
  })
  .listen(8094, () => console.log("mock que cuelga al navegador en :8094"));
