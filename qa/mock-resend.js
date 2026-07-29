// Un Resend de mentira: recibe los correos y los deja leer.
//
// Sirve para probar de verdad la recuperación de contraseña —hasta abrir el
// enlace que llega— sin mandar un solo correo a nadie ni necesitar una cuenta.
// La aplicación apunta aquí con RESEND_API_URL.
const http = require("http");

const correos = [];

http
  .createServer((req, res) => {
    if (req.method === "POST" && req.url === "/emails") {
      let cuerpo = "";
      req.on("data", (c) => (cuerpo += c));
      req.on("end", () => {
        try {
          const correo = JSON.parse(cuerpo);
          correos.push({ ...correo, recibido: Date.now() });
          console.log(`[correo] → ${correo.to} · ${correo.subject}`);
        } catch {
          /* cuerpo ilegible: se ignora, que aquí solo llega lo nuestro */
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: "mock-" + correos.length }));
      });
      return;
    }
    // Lo recibido, para que la suite lea el enlace del último correo
    if (req.method === "GET" && req.url.startsWith("/recibidos")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(correos));
      return;
    }
    if (req.method === "DELETE") {
      correos.length = 0;
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(404);
    res.end();
  })
  .listen(8097, () => console.log("mock resend en :8097"));
