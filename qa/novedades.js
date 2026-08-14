// «Novedades»: lo último que ha subido el proveedor, sin buscarlo a mano.
const { chromium, ejecutable } = require("./navegador");
const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`); };

/*
 * De la portada a la rejilla de siempre.
 *
 * Cine y series abren en una portada —banner arriba y filas debajo—, y la
 * rejilla entera está a un botón. Estas pruebas miran la rejilla, así que
 * pulsan ese botón si está.
 */
async function verRejilla(p) {
  await p.waitForSelector(".pa-vertodo, .pa-grid .pa-card", { timeout: 60000 });
  const boton = p.locator(".pa-vertodo");
  if (await boton.count()) await boton.first().click();
  await p.waitForSelector(".pa-grid .pa-card", { timeout: 40000 });
}

async function conLista(p) {
  await p.goto(BASE + "/player", { waitUntil: "networkidle" });
  await p.waitForSelector(".pa-welcome", { timeout: 20000 });
  await p.click(".pa-welcome button:has-text('Tengo mi propia lista')");
  await p.waitForSelector(".modal");
  await p.fill("#pl-name", "Nuevo");
  await p.fill("#pl-host", "127.0.0.1:8090");
  await p.fill("#pl-user", "demo");
  await p.fill("#pl-pass", "demo123");
  await p.click(".modal button[type=submit]");
  await p.waitForSelector(".section-gate", { timeout: 25000 });
}

(async () => {
  const b = await chromium.launch({ ...ejecutable });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
  p.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));

  await conLista(p);

  // La portada enseña primero lo más nuevo (el catálogo tarda en llegar)
  await p.waitForSelector(".portada-rails .portada-poster", { timeout: 20000 });
  const portada = await p.locator(".portada-rails .portada-poster-nombre").allInnerTexts();
  check("En la portada manda lo último subido", portada[0] === "Película Demo", portada.join(" | "));

  await p.locator(".section-card:has-text('Películas')").click();
  await verRejilla(p);

  const generos = await p.locator(".pa-live-cat .name").allInnerTexts();
  check("«Novedades» sale en la columna, la primera", generos[1] === "Novedades", generos.join(" | "));

  await p.locator(".pa-live-nuevo").click();
  await p.waitForTimeout(500);
  const nuevas = await p.locator(".pa-grid .pa-card .title").allInnerTexts();
  check("Enseña lo subido hace poco", nuevas.includes("Película Demo"), nuevas.join(" | "));
  check("Y deja fuera lo viejo, aunque tenga fecha", !nuevas.includes("Película Vieja"), nuevas.join(" | "));
  check("Y los títulos sin fecha", nuevas.length === 1, `${nuevas.length} títulos`);
  await p.screenshot({ path: __dirname + "/79-novedades.png" });

  // En series, igual
  await p.locator(".pa-rail-item:has-text('Series')").click();
  await verRejilla(p);
  check("También en series", (await p.locator(".pa-live-nuevo").count()) === 1);
  await p.locator(".pa-live-nuevo").click();
  await p.waitForTimeout(500);
  check("Con su serie recién tocada", (await p.locator(".pa-grid .pa-card .title").allInnerTexts()).includes("Serie Demo"));

  // Volver a «Todo» devuelve el catálogo entero
  await p.locator(".pa-live-cat:has-text('Todo')").first().click();
  await p.waitForTimeout(400);
  await verRejilla(p);
  check("«Todo» sigue enseñando el catálogo completo", (await p.locator(".pa-grid .pa-card").count()) >= 1);

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas de novedades OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
