// Receptor de avisos: guarda lo que le llega para que la prueba lo mire.
// Hace de bot de Telegram, canal de Discord o lo que sea que el
// administrador ponga en ADMIN_WEBHOOK_URL.
const http = require("http");

const recibidos = [];

http
  .createServer((req, res) => {
    if (req.method === "POST") {
      let cuerpo = "";
      req.on("data", (c) => (cuerpo += c));
      req.on("end", () => {
        try {
          recibidos.push(JSON.parse(cuerpo));
        } catch {
          recibidos.push({ crudo: cuerpo });
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
      });
      return;
    }
    // GET: lo recibido hasta ahora, para comprobarlo desde la prueba
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(recibidos));
  })
  .listen(8099, () => console.log("receptor de avisos en :8099"));
