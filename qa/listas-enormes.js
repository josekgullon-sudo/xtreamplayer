/*
 * Una lista del tamaño de las de verdad: 8.000 canales, 3.000 películas y
 * 1.500 series.
 *
 * Todo lo demás se probaba con listas de tres canales, y con tres canales
 * nunca se veía el problema: «Todos los canales» cortaba en 500 y el
 * catálogo en 400, sin decirlo. El cliente con una lista normal —entre
 * 5.000 y 15.000 canales— no tenía forma de llegar a los demás.
 *
 * Aquí se comprueban las dos mitades del arreglo: que estén todos (se puede
 * llegar al último) y que no estén todos pintados a la vez (el navegador no
 * aguanta 8.000 botones con su imagen).
 */
const { chromium, ejecutable } = require("./navegador");

const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`); };

/** Baja del todo en un contenedor y espera a que se pinte lo nuevo. */
async function alFinal(p, selector) {
  await p.evaluate((s) => { const c = document.querySelector(s); if (c) c.scrollTop = c.scrollHeight; }, selector);
  await p.waitForTimeout(350);
}

(async () => {
  const browser = await chromium.launch({ ...ejecutable });
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  p.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));

  // ---------- 8.000 canales por M3U ----------
  await p.goto(BASE + "/player", { waitUntil: "networkidle" });
  await p.locator(".pa-welcome button:has-text('Tengo mi propia lista')").click();
  await p.waitForSelector(".modal");
  await p.click(".modal .pa-tab:has-text('URL M3U')");
  await p.fill("#pl-name", "Lista Enorme");
  await p.fill("#pl-m3u", "http://127.0.0.1:8090/lista-enorme.m3u");
  const t0 = Date.now();
  await p.click(".modal button[type=submit]");
  await p.waitForFunction(
    () => document.querySelectorAll(".pa-live-cat:not(.pa-live-reciente)").length >= 20,
    { timeout: 60000 }
  );
  const tarda = Date.now() - t0;
  check("Una lista de 8.000 canales entra", true, `${(tarda / 1000).toFixed(1)}s`);
  check("Y no tarda una eternidad en pintarse", tarda < 25000, `${(tarda / 1000).toFixed(1)}s`);

  const carpetas = await p.locator(".pa-live-cat:not(.pa-live-reciente)").count();
  check("Con sus 40 carpetas, todas", carpetas === 41, `${carpetas - 1} carpetas + «Todos los canales»`);

  const total = await p.locator(".pa-live-cats .pa-live-n").first().innerText();
  check("Y la cuenta de arriba dice cuántos hay", total.replace(/\D/g, "") === "8000", total);

  // ---------- Todos los canales: están todos, pero no todos pintados ----------
  await p.locator(".pa-live-cat:has-text('Todos los canales')").click();
  await p.waitForSelector(".pa-live-chan", { timeout: 20000 });

  const pintados = await p.locator(".pa-live-chan").count();
  /* Si estuvieran los 8.000 en el DOM, el móvil no podría desplazarse. Aquí
     se pinta la ventana visible y un colchón: unas decenas. */
  check("No se pintan los 8.000 botones de golpe", pintados > 0 && pintados < 200, `${pintados} filas en pantalla`);

  const lista = ".pa-live-chans .pa-live-scroll";
  const altoTotal = await p.evaluate((s) => document.querySelector(s).scrollHeight, lista);
  /* La barra de desplazamiento tiene que medir lo que mide la lista entera:
     si midiera solo lo pintado, el cliente creería que se acaba ahí */
  check("Pero la barra mide la lista entera", altoTotal > 8000 * 30, `${Math.round(altoTotal / 1000)}k px`);

  // El último canal existe y se puede llegar a él
  await alFinal(p, lista);
  const ultimo = (await p.locator(".pa-live-chan").last().innerText()).replace(/\s+/g, " ").trim();
  check("Se llega hasta el canal 8.000", ultimo.includes("Canal 8000"), ultimo);

  const numUltimo = await p.locator(".pa-live-chan").last().locator(".pa-live-num").innerText();
  check("Y va numerado de verdad, no desde 1", numUltimo === "8000", numUltimo);

  // Cada fila de «Todos los canales» dice de qué carpeta es
  const conCarpeta = await p.locator(".pa-live-chan .pa-live-sub").count();
  check("Cada fila sigue diciendo de qué carpeta es", conCarpeta > 0, `${conCarpeta} de ${await p.locator(".pa-live-chan").count()}`);

  // Y el de abajo del todo se reproduce igual que el primero
  await p.locator(".pa-live-chan", { hasText: "Canal 8000" }).first().click();
  await p.waitForFunction(() => {
    const v = document.querySelector(".pa-video-zone video");
    return v && v.currentTime > 0.3 && !v.paused;
  }, { timeout: 25000 });
  check("▶ Y el último de la lista se reproduce", true);

  // ---------- Cambiar de carpeta empieza por el principio ----------
  await p.locator(".pa-live-cat:has-text('Carpeta 20')").click();
  await p.waitForTimeout(400);
  const arriba = await p.evaluate((s) => document.querySelector(s).scrollTop, lista);
  check("Al cambiar de carpeta se empieza por arriba", arriba < 20, `${arriba}px`);
  const primeroDeCarpeta = await p.locator(".pa-live-chan").first().innerText();
  check("Y sale el primero de esa carpeta", primeroDeCarpeta.includes("Canal 3801"), primeroDeCarpeta.replace(/\s+/g, " "));

  // ---------- Buscar dentro de 8.000 ----------
  await p.locator(".pa-nav-busca .pa-icon-btn").click();
  await p.fill(".pa-nav-busca input", "Canal 7777");
  await p.waitForTimeout(600);
  const encontrados = await p.locator(".pa-live-chan").allInnerTexts();
  check("Buscar un canal concreto entre 8.000 lo encuentra",
    encontrados.some((t) => t.includes("Canal 7777")), `${encontrados.length} resultados`);
  await p.fill(".pa-nav-busca input", "");
  await p.keyboard.press("Escape");

  await p.screenshot({ path: __dirname + "/95-lista-enorme.png" });

  // ---------- Catálogo de verdad por Xtream: 3.000 películas ----------
  await p.locator('.pa-nav .pa-icon-btn[aria-label="Añadir lista"]').click();
  await p.waitForSelector(".modal");
  await p.fill("#pl-name", "Catálogo Enorme");
  await p.fill("#pl-host", "127.0.0.1:8090");
  await p.fill("#pl-user", "enorme");
  await p.fill("#pl-pass", "enorme123");
  await p.click(".modal button[type=submit]");
  await p.waitForSelector(".section-gate", { timeout: 60000 });
  await p.locator(".section-card:has-text('Películas')").click();
  await p.waitForSelector(".pa-grid .pa-card", { timeout: 60000 });
  await p.waitForSelector(".pa-grid .pa-card", { timeout: 40000 });
  const cartelesInicio = await p.locator(".pa-grid .pa-card").count();
  check("El catálogo no pinta las 3.000 carátulas de golpe",
    cartelesInicio > 0 && cartelesInicio <= 200, `${cartelesInicio} carátulas`);

  /* Antes ponía «Mostrando 400 de 3.000 — usa la búsqueda para afinar»:
     quien no sabe qué busca no puede afinar nada */
  const textoCine = await p.locator(".pa-cat-scroll").innerText();
  check("Y ya no dice que solo enseña 400", !textoCine.includes("Mostrando 400"), "");

  // Bajando se van añadiendo, hasta pasar del tope viejo
  const rejilla = ".pa-cat-scroll";
  for (let i = 0; i < 6; i++) await alFinal(p, rejilla);
  const cartelesLuego = await p.locator(".pa-grid .pa-card").count();
  check("Bajando salen más, y se pasa del tope viejo de 400",
    cartelesLuego > 400 && cartelesLuego > cartelesInicio, `${cartelesInicio} → ${cartelesLuego}`);

  // ---------- Lo mismo en series ----------
  await p.locator(".pa-nav-item:has-text('Series')").first().click();
  await p.waitForSelector(".pa-grid .pa-card", { timeout: 40000 });
  const seriesInicio = await p.locator(".pa-grid .pa-card").count();
  for (let i = 0; i < 6; i++) await alFinal(p, rejilla);
  const seriesLuego = await p.locator(".pa-grid .pa-card").count();
  check("Y las series también crecen al bajar",
    seriesLuego > 400 && seriesLuego > seriesInicio, `${seriesInicio} → ${seriesLuego}`);

  // ---------- Y lo mismo en un teléfono ----------
  /* La altura de fila se mide de una fila de verdad, y en el móvil mide el
     doble que en el escritorio. Si se midiera mal, el hueco reservado no
     cuadraría con lo pintado y la lista daría saltos al desplazar. */
  const movil = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
  });
  const m = await movil.newPage();
  m.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));
  await m.goto(BASE + "/player", { waitUntil: "networkidle" });
  await m.locator(".pa-welcome button:has-text('Tengo mi propia lista')").click();
  await m.waitForSelector(".modal");
  await m.click(".modal .pa-tab:has-text('URL M3U')");
  await m.fill("#pl-name", "Enorme Móvil");
  await m.fill("#pl-m3u", "http://127.0.0.1:8090/lista-enorme.m3u");
  await m.click(".modal button[type=submit]");
  await m.waitForSelector(".pa-live-cat:not(.pa-live-reciente)", { timeout: 60000 });
  await m.locator(".pa-live-cat:has-text('Todos los canales')").click();
  await m.waitForSelector(".pa-live-chan", { timeout: 30000 });

  const altoFila = await m.locator(".pa-live-chan").first().evaluate((el) => el.getBoundingClientRect().height);
  check("En el móvil las filas siguen siendo del tamaño del dedo", altoFila >= 70, `${Math.round(altoFila)}px`);

  const pintadosMovil = await m.locator(".pa-live-chan").count();
  check("Y tampoco se pintan los 8.000", pintadosMovil > 0 && pintadosMovil < 200, `${pintadosMovil} filas`);

  /* El hueco reservado tiene que cuadrar con la altura de fila medida: si se
     midiera con la del escritorio, la barra mediría la mitad de lo que debe */
  const altoMovil = await m.evaluate((s) => document.querySelector(s).scrollHeight, lista);
  check("Y la barra mide con la fila del móvil, no con la del escritorio",
    altoMovil > 8000 * altoFila * 0.9, `${Math.round(altoMovil / 1000)}k px para ${Math.round(altoFila)}px de fila`);

  await alFinal(m, lista);
  const ultimoMovil = (await m.locator(".pa-live-chan").last().innerText()).replace(/\s+/g, " ");
  check("Y desde el móvil también se llega al canal 8.000", ultimoMovil.includes("Canal 8000"), ultimoMovil);

  const desborda = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("Sin desbordar a lo ancho", desborda === 0, `+${desborda}px`);
  await m.screenshot({ path: __dirname + "/96-lista-enorme-movil.png" });

  await browser.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas de listas enormes OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 500)); process.exit(1); });
