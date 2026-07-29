// Que la web viva en una sola dirección.
//
// Al poner dominio propio, la de Railway sigue contestando y quedan dos sitios
// sirviendo lo mismo: Google reparte el posicionamiento, las sesiones no se
// comparten y los enlaces que reparten los proveedores apuntan a una
// dirección que algún día se apaga.
//
// Se prueba lo que hay que no romper: los avisos de Stripe, las comprobaciones
// de salud de Railway y lo que no se puede repetir sin efectos.
//
// Necesita el servidor arrancado con:
//   REDIRECT_TO_CANONICAL=1 NEXT_PUBLIC_SITE_URL=https://totalplayer.app
const BASE = process.env.QA_BASE || "http://localhost:3102";
const CANONICO = process.env.QA_CANONICO || "totalplayer.app";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`); };

/**
 * Una petición con el Host que se le diga, sin seguir la redirección.
 *
 * A pelo con node:http y no con fetch, porque fetch no deja poner la cabecera
 * Host —está en su lista de prohibidas— y aquí es justamente lo que se prueba.
 */
const http = require("http");
function pedir(ruta, host, metodo = "GET") {
  const url = new URL(BASE + ruta);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method: metodo,
        headers: { Host: host, "Content-Type": "application/json" },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode, destino: res.headers.location || "" }));
      }
    );
    req.on("error", reject);
    req.end(metodo === "POST" ? "{}" : undefined);
  });
}

(async () => {
  // --- Lo que sí se redirige: la web, vista desde la dirección vieja ---
  let r = await pedir("/precios", "xtreamplayer-production.up.railway.app");
  check("La dirección vieja manda a la nueva",
    r.status === 308 && r.destino.startsWith(`https://${CANONICO}/precios`), `${r.status} → ${r.destino}`);
  check("Y es permanente, para que el navegador se lo quede", r.status === 308, String(r.status));

  r = await pedir("/tv?x=1", "xtreamplayer-production.up.railway.app");
  check("Se conserva la ruta y lo que va detrás", r.destino.includes("/tv?x=1"), r.destino);

  // --- Lo que no se puede redirigir ---
  /* Stripe no sigue redirecciones en sus avisos: un webhook redirigido es un
     cobro del que la aplicación no se entera nunca */
  r = await pedir("/api/billing/webhook", "xtreamplayer-production.up.railway.app", "POST");
  check("Los avisos de Stripe no se redirigen", r.status !== 308, String(r.status));
  r = await pedir("/api/auth/me", "xtreamplayer-production.up.railway.app");
  check("Ni ninguna llamada a la API", r.status !== 308, String(r.status));

  /* Por localhost entra Railway a comprobar que la aplicación está viva: si
     le contestamos con una redirección, cree que se ha caído y la reinicia */
  r = await pedir("/", "localhost:3102");
  check("Las comprobaciones de salud pasan sin redirección", r.status !== 308, String(r.status));
  r = await pedir("/", "totalplayer.railway.internal");
  check("Y el dominio interno de Railway también", r.status !== 308, String(r.status));

  // --- Y desde el dominio bueno, la web normal ---
  r = await pedir("/precios", CANONICO);
  check("En el dominio propio no hay redirección ninguna", r.status === 200, String(r.status));

  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas del dominio único OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 300)); process.exit(1); });
