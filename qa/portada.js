// La portada estilo MaxPlayer: canales numerados + carriles de carátulas.
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`); };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

  await p.goto(BASE + "/player", { waitUntil: "networkidle" });
  await p.locator(".pa-welcome button:has-text('Tengo mi propia lista')").click();
  await p.waitForSelector(".modal");
  await p.fill("#pl-name", "Portada");
  await p.fill("#pl-host", "127.0.0.1:8090");
  await p.fill("#pl-user", "demo");
  await p.fill("#pl-pass", "demo123");
  await p.click(".modal button[type=submit]");
  await p.waitForSelector(".section-gate", { timeout: 20000 });

  // La portada aparece con contenido real
  await p.waitForSelector(".portada", { timeout: 20000 });
  const canales = await p.locator(".portada-canal").count();
  check("La portada lista canales numerados", canales >= 2, `${canales} canales`);
  check("El primer canal va numerado", (await p.locator(".portada-num").first().innerText()) === "001");
  const posters = await p.locator(".portada-poster").count();
  check("Con carriles de películas y series", posters >= 2, `${posters} carátulas`);
  check("Las tarjetas de sección siguen ahí", (await p.locator(".section-card").count()) >= 3);
  await p.screenshot({ path: __dirname + "/47-portada.png", fullPage: true });

  // Pinchar un canal: cierra la portada, cambia a Directo y el reproductor
  // arranca. (La reproducción HLS completa no se puede validar contra el
  // mock — no sirve segmentos .ts — pero el cableado del gesto sí.)
  await p.locator(".portada-canal").first().click();
  await p.waitForSelector("video", { timeout: 15000 });
  check("El canal cierra la portada y monta el reproductor", !(await p.locator(".section-gate").isVisible().catch(() => false)));
  await p.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && (v.currentTime > 0 || document.querySelector(".pa-video-zone")?.textContent?.length > 0);
  }, { timeout: 20000 });
  check("Y la cadena de intentos está en marcha", true);

  // Volver a la portada y abrir una carátula: ficha directa aunque la
  // pestaña activa fuera otra
  await p.locator(".pa-inicio").click();
  await p.waitForSelector(".portada", { timeout: 10000 });
  await p.locator(".portada-rail:has(h3:text('Películas')) .portada-poster").first().click();
  await p.waitForSelector(".ficha", { timeout: 15000 });
  check("Una carátula lleva directa a la ficha", await p.locator(".ficha h2").isVisible());
  await p.screenshot({ path: __dirname + "/48-portada-ficha.png" });

  // En el móvil la portada no estorba
  const pm = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await pm.goto(BASE + "/player", { waitUntil: "networkidle" });
  await pm.locator(".pa-welcome button:has-text('Tengo mi propia lista')").click();
  await pm.waitForSelector(".modal");
  await pm.fill("#pl-name", "PortadaM");
  await pm.fill("#pl-host", "127.0.0.1:8090");
  await pm.fill("#pl-user", "demo");
  await pm.fill("#pl-pass", "demo123");
  await pm.click(".modal button[type=submit]");
  await pm.waitForSelector(".section-gate", { timeout: 20000 });
  check("En móvil la portada queda oculta", !(await pm.locator(".portada").isVisible().catch(() => false)));

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas pasan`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
