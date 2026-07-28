// Servidor lento pero sano: tarda 7 s en soltar el primer byte y luego sirve
// el vídeo entero. Con un plazo fijo de 6 s se le cortaba estando bien.
const http = require("http");
const fs = require("fs");
const path = require("path");
const WEBM = fs.readFileSync(path.join(__dirname, "test.webm"));

http.createServer((req, res) => {
  if (req.url.startsWith("/lenta.m3u")) {
    res.writeHead(200, { "Content-Type": "audio/x-mpegurl" });
    return res.end(`#EXTM3U\n#EXTINF:-1 group-title="Lentos",Canal Tardón\nhttp://127.0.0.1:8098/media/canal.webm\n`);
  }
  setTimeout(() => {
    res.writeHead(200, { "Content-Type": "video/webm", "Content-Length": WEBM.length });
    res.end(WEBM);
  }, 7000);
}).listen(8098, () => console.log("mock tardón en :8098"));
