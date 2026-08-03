/*
 * «Atrás» cierra lo de encima, no la aplicación.
 *
 * La ficha de una película, la de una serie y el vídeo se abren encima de lo
 * que había, sin cambiar de dirección. Para el navegador eso no era un paso
 * que deshacer, así que en la aplicación de Android el botón de atrás
 * —que hace lo mismo que el gesto del navegador— se saltaba la ficha y
 * cerraba la aplicación entera. Y el aspa estaba, pero nadie usa el aspa
 * teniendo un botón de atrás.
 */
const { chromium, ejecutable } = require("./navegador");

const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`); };

(async () => {
  const b = await chromium.launch({ ...ejecutable, args: ["--autoplay-policy=no-user-gesture-required"] });
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));

  await p.goto(BASE + "/player", { waitUntil: "networkidle" });
  await p.locator(".pa-welcome button:has-text('Tengo mi propia lista')").click();
  await p.waitForSelector(".modal");
  await p.fill("#pl-name", "Catálogo");
  await p.fill("#pl-host", "127.0.0.1:8090");
  await p.fill("#pl-user", "demo");
  await p.fill("#pl-pass", "demo123");
  await p.click(".modal button[type=submit]");
  await p.waitForSelector(".section-gate", { timeout: 40000 });
  await p.locator(".section-card:has-text('Películas')").click();
  await p.waitForSelector(".pa-grid .pa-card", { timeout: 40000 });

  // ---------- La ficha de una película ----------
  await p.locator(".pa-grid .pa-card").first().click();
  await p.waitForSelector(".ficha", { timeout: 20000 });
  check("La ficha de una película se abre", true);

  await p.goBack();
  await p.waitForTimeout(700);
  check("Y «atrás» la cierra", (await p.locator(".ficha").count()) === 0);
  check("Sin salirse del reproductor", p.url().includes("/player"), p.url());
  check("Y deja a la vista el catálogo, donde estabas", (await p.locator(".pa-grid .pa-card").count()) > 0);

  // ---------- Cerrar con el aspa no deja pasos sueltos ----------
  /* Si al cerrar con el aspa se quedara el paso que añadimos, haría falta
     pulsar atrás dos veces para salir, y la segunda saldría de la nada */
  await p.locator(".pa-grid .pa-card").first().click();
  await p.waitForSelector(".ficha", { timeout: 20000 });
  await p.locator(".ficha-cerrar").click();
  await p.waitForTimeout(700);
  check("Cerrando con el aspa la ficha también se va", (await p.locator(".ficha").count()) === 0);
  const largoAntes = await p.evaluate(() => history.length);
  await p.locator(".pa-grid .pa-card").first().click();
  await p.waitForSelector(".ficha", { timeout: 20000 });
  await p.locator(".ficha-cerrar").click();
  await p.waitForTimeout(700);
  const largoDespues = await p.evaluate(() => history.length);
  check("Abrir y cerrar fichas no llena el historial",
    largoDespues <= largoAntes + 1, `${largoAntes} → ${largoDespues}`);

  // ---------- Escape hace lo mismo, con teclado ----------
  await p.locator(".pa-grid .pa-card").first().click();
  await p.waitForSelector(".ficha", { timeout: 20000 });
  await p.keyboard.press("Escape");
  await p.waitForTimeout(700);
  check("Y con teclado, Escape cierra la ficha", (await p.locator(".ficha").count()) === 0);

  // ---------- El vídeo ----------
  /* Esta en concreto: es la única del catálogo simulado con vídeo detrás */
  await p.locator(".pa-grid .pa-card", { hasText: "Película Demo" }).first().click();
  await p.waitForSelector(".ficha", { timeout: 20000 });
  await p.locator(".ficha .btn-primary:has-text('Reproducir')").click();
  await p.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && v.currentTime > 0.2 && !v.paused;
  }, { timeout: 30000 });
  check("▶ La película arranca", true);

  await p.goBack();
  await p.waitForTimeout(900);
  check("«Atrás» sale del vídeo y devuelve a la ficha",
    (await p.locator(".ficha").count()) === 1 && (await p.locator("video").count()) === 0);

  await p.goBack();
  await p.waitForTimeout(700);
  check("Y otra vez atrás, al catálogo", (await p.locator(".ficha").count()) === 0);
  check("Siempre dentro del reproductor", p.url().includes("/player"), p.url());

  // ---------- La ficha de una serie ----------
  await p.locator(".pa-bottomnav button:has-text('Series')").first().click();
  await p.waitForSelector(".pa-grid .pa-card", { timeout: 30000 });
  await p.locator(".pa-grid .pa-card").first().click();
  await p.waitForSelector(".ficha", { timeout: 20000 });
  await p.goBack();
  await p.waitForTimeout(700);
  check("Con las series, igual", (await p.locator(".ficha").count()) === 0);

  // ---------- Un canal en directo ----------
  /* Con una lista M3U, que es la que tiene vídeo de verdad detrás de cada
     canal: el directo es lo que más se usa y no puede quedar sin probar */
  await p.locator('.pa-nav .pa-icon-btn[aria-label="Añadir lista"]').click();
  await p.waitForSelector(".modal");
  await p.click(".modal .pa-tab:has-text('URL M3U')");
  await p.fill("#pl-name", "Directo");
  await p.fill("#pl-m3u", "http://127.0.0.1:8090/lista.m3u");
  await p.click(".modal button[type=submit]");
  await p.waitForSelector(".section-gate, .pa-live", { timeout: 40000 });
  if (await p.locator(".section-gate").isVisible().catch(() => false)) {
    await p.locator(".section-card:has-text('TV en directo')").click();
  }
  await p.waitForTimeout(900);
  if (!(await p.locator(".pa-live-chan").first().isVisible().catch(() => false))) {
    await p.locator(".pa-live-cat:not(.pa-live-reciente)").first().click();
  }
  await p.waitForSelector(".pa-live-chan", { timeout: 20000 });
  await p.locator(".pa-live-chan", { hasText: "Canal Test WebM" }).first().click();
  await p.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && v.currentTime > 0.2 && !v.paused;
  }, { timeout: 30000 });
  await p.goBack();
  await p.waitForTimeout(900);
  check("Y viendo un canal, «atrás» cierra el vídeo y no la aplicación",
    (await p.locator("video").count()) === 0 && p.url().includes("/player"));

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas de «atrás» OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
