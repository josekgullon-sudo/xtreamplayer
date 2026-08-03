// Buscar una vez y encontrar en todo: canales, películas y series.
const { chromium, ejecutable } = require("./navegador");
const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`); };

async function conLista(p) {
  await p.goto(BASE + "/player", { waitUntil: "networkidle" });
  await p.waitForSelector(".pa-welcome", { timeout: 20000 });
  await p.click(".pa-welcome button:has-text('Tengo mi propia lista')");
  await p.waitForSelector(".modal");
  await p.fill("#pl-name", "Busca");
  await p.fill("#pl-host", "127.0.0.1:8090");
  await p.fill("#pl-user", "demo");
  await p.fill("#pl-pass", "demo123");
  await p.click(".modal button[type=submit]");
  await p.waitForSelector(".section-gate", { timeout: 25000 });
  await p.locator(".section-card:has-text('TV en directo')").click();
  await p.waitForSelector(".pa-live-cat:not(.pa-live-reciente)", { timeout: 20000 });
}

async function buscar(p, texto) {
  await p.locator(".pa-nav-busca .pa-icon-btn").click().catch(() => {});
  await p.fill(".pa-nav-busca input", texto);
}

(async () => {
  const b = await chromium.launch({ ...ejecutable });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
  p.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));

  await conLista(p);

  // Una sola letra no dispara nada: media lista coincidiría
  await buscar(p, "d");
  await p.waitForTimeout(400);
  check("Con una sola letra no se busca todavía", (await p.locator(".pa-buscador").count()) === 0);

  // Estando en el directo, se encuentra una película
  await p.fill(".pa-nav-busca input", "Demo");
  await p.waitForSelector(".pa-buscador", { timeout: 10000 });
  // El CSS los pinta en mayúsculas: comparamos sin distinguir
  const bloques = (await p.locator(".pa-buscador-bloque h3").allInnerTexts()).map((t) => t.toLowerCase());
  check("Desde el directo se encuentra cine y series",
    bloques.some((t) => t.includes("películas")) && bloques.some((t) => t.includes("series")),
    bloques.map((t) => t.replace(/\n/g, " ")).join(" | "));
  check("La cabecera dice cuántos hay", /\d+ resultados? para «Demo»/.test(await p.locator(".pa-buscador-cab h2").innerText()));
  await p.screenshot({ path: __dirname + "/77-busqueda-global.png" });

  // Una película desde el buscador abre su ficha, sin pasar por su pestaña
  await p.locator(".pa-buscador-bloque:has-text('Películas') .portada-poster").first().click();
  await p.waitForSelector(".ficha", { timeout: 20000 });
  check("Una película lleva directa a su ficha", true);
  check("Y la búsqueda se limpia sola", (await p.locator(".pa-nav-busca input").inputValue()) === "");
  await p.locator(".ficha-cerrar").click();
  await p.waitForSelector(".ficha", { state: "detached", timeout: 10000 });

  // Y al revés: buscando un canal aparece su bloque
  await buscar(p, "Test");
  await p.waitForSelector(".pa-buscador-canales", { timeout: 10000 });
  check("Y buscando un canal, sale su bloque",
    (await p.locator(".pa-buscador-bloque h3").allInnerTexts()).some((t) => t.toLowerCase().includes("canales")));

  // Un canal desde el buscador se pone y devuelve al directo
  await p.fill(".pa-nav-busca input", "Uno");
  await p.waitForSelector(".pa-buscador-canales .pa-live-chan", { timeout: 10000 });
  const nombreCanal = (await p.locator(".pa-buscador-canales .pa-live-chan .name").first().innerText()).trim();
  await p.locator(".pa-buscador-canales .pa-live-chan").first().click();
  await p.waitForSelector(".pa-live", { timeout: 15000 });
  check("Un canal devuelve al directo, no se queda en la búsqueda", (await p.locator(".pa-buscador").count()) === 0);
  /* El mock no sirve este canal por HLS: comprobamos que se monta el
     reproductor y arranca la cadena de intentos, que es lo que depende de mí */
  await p.waitForSelector(".pa-video-zone video", { timeout: 15000 });
  const overlay = await p.locator(".pa-video-overlay").innerText().catch(() => "");
  check("Y es el canal que se pulsó el que se pone a cargar",
    (await p.locator(".pa-video-zone").count()) === 1 && overlay.includes(nombreCanal),
    `${nombreCanal} · ${overlay.split("\n")[0]}`);

  // Nada que coincida se dice claro
  await buscar(p, "zzzzqqq");
  await p.waitForSelector(".pa-buscador .pa-empty", { timeout: 10000 });
  check("Sin resultados lo dice, no deja la pantalla vacía", (await p.locator(".pa-buscador .pa-empty").innerText()).includes("Nada con ese nombre"));

  // Y se limpia con su botón
  await p.locator(".pa-buscador-cab button:has-text('Limpiar')").click();
  await p.waitForSelector(".pa-live", { timeout: 10000 });
  check("El botón de limpiar devuelve a donde estabas", (await p.locator(".pa-buscador").count()) === 0);

  // --- En el móvil ---
  const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await conLista(m);
  await buscar(m, "Demo");
  await m.waitForSelector(".pa-buscador", { timeout: 15000 });
  const desborde = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("En el móvil no desborda a lo ancho", desborde === 0, `${desborde}px`);
  check("Y los resultados se ven", (await m.locator(".pa-buscador-bloque").count()) >= 1);
  await m.screenshot({ path: __dirname + "/78-busqueda-movil.png" });

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas de búsqueda global OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
