// QA del modo TV: detección por user-agent y navegación con mando.
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

const TIZEN_UA =
  "Mozilla/5.0 (SMART-TV; LINUX; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) 94.0.4606.31/7.0 TV Safari/537.36";
const WEBOS_UA =
  "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94 Safari/537.36 WebAppManager";
const FIRETV_UA =
  "Mozilla/5.0 (Linux; Android 9; AFTKA Build/PS7233) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106 Safari/537.36";

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

  // --- Detección automática por user-agent ---
  for (const [name, ua] of [["Samsung Tizen", TIZEN_UA], ["LG webOS", WEBOS_UA], ["Fire TV", FIRETV_UA]]) {
    const ctx = await browser.newContext({ userAgent: ua, viewport: { width: 1920, height: 1080 } });
    const p = await ctx.newPage();
    await p.goto(BASE + "/", { waitUntil: "networkidle" });
    await p.waitForTimeout(400);
    const isTv = await p.evaluate(() => document.documentElement.classList.contains("tv-mode"));
    check(`Detección automática: ${name}`, isTv);
    if (name === "Samsung Tizen") {
      check("Guía de mando visible en TV", await p.locator(".tv-hint").isVisible());
      // Quien llega a la web desde una tele tiene que poder volver a la
      // interfaz normal: es la única salida, ya no hay botón en la cabecera
      check(
        "Y con salida del modo TV a la vista",
        await p.locator(".tv-hint button:has-text('Salir del modo TV')").isVisible()
      );
    }
    await ctx.close();
  }

  // --- Escritorio NO debe activar modo TV ---
  const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desk = await deskCtx.newPage();
  await desk.goto(BASE + "/", { waitUntil: "networkidle" });
  await desk.waitForTimeout(300);
  check("Escritorio sin modo TV", !(await desk.evaluate(() => document.documentElement.classList.contains("tv-mode"))));

  /*
   * La tele tiene su propia aplicación en /tv. La cabecera ya no lleva un
   * interruptor de «Modo TV»: eran dos cosas para lo mismo y obligaba a
   * elegir sin saber en qué se diferencian.
   */
  check(
    "Sin interruptor de «Modo TV» en la cabecera",
    (await desk.locator(".site-header button:has-text('Modo TV')").count()) === 0
  );
  const menu = await desk.locator(".nav-links a").allInnerTexts();
  const acciones = await desk.locator(".header-actions a").allInnerTexts();
  const todos = [...menu, ...acciones].map((t) => t.trim().toLowerCase());
  check("Sin entradas repetidas entre menú y botones", new Set(todos).size === todos.length, todos.join(" | "));
  await desk.goto(BASE + "/tv", { waitUntil: "networkidle" });
  await desk.waitForSelector(".tv-app, .tv-activar", { timeout: 15000 });
  check("La aplicación de tele vive en /tv", true);
  await deskCtx.close();

  // --- Navegación con mando en el reproductor ---
  const tvCtx = await browser.newContext({ userAgent: TIZEN_UA, viewport: { width: 1920, height: 1080 } });
  const tv = await tvCtx.newPage();
  tv.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));

  await tv.goto(BASE + "/player", { waitUntil: "networkidle" });
  await tv.waitForSelector(".pa-welcome", { timeout: 15000 });

  // Añadir lista M3U navegando (el modal se abre con OK sobre el botón)
  await tv.locator(".pa-welcome button:has-text('Tengo mi propia lista')").focus();
  await tv.keyboard.press("Enter");
  await tv.waitForSelector(".modal");
  check("Mando: OK abre el modal", true);

  // Atrás (Escape, código 27) cierra el modal
  await tv.keyboard.press("Escape");
  await tv.waitForTimeout(400);
  check("Mando: Atrás cierra el modal", (await tv.locator(".modal").count()) === 0);

  // Cargamos una lista para probar la navegación en la parrilla
  await tv.locator(".pa-welcome button:has-text('Tengo mi propia lista')").focus();
  await tv.keyboard.press("Enter");
  await tv.waitForSelector(".modal");
  await tv.click(".modal .pa-tab:has-text('URL M3U')");
  await tv.fill("#pl-m3u", "http://127.0.0.1:8090/lista.m3u");
  await tv.click(".modal button[type=submit]");
  /*
   * «Seguir viendo» comparte clase con las categorías: esperamos a una que
   * no sea reciente para no dar por cargada una parrilla que aún no está.
   */
  await tv.waitForSelector(".pa-live-cat:not(.pa-live-reciente)", { timeout: 15000 });

  // Foco en una categoría y navegación vertical
  await tv.locator(".pa-live-cat:not(.pa-live-reciente)").first().focus();
  const before = await tv.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 30));
  await tv.keyboard.press("ArrowDown");
  await tv.waitForTimeout(250);
  const after = await tv.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 30));
  check("Mando: ▼ mueve el foco", before !== after, `${before} → ${after}`);

  await tv.keyboard.press("ArrowUp");
  await tv.waitForTimeout(250);
  const backUp = await tv.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 30));
  check("Mando: ▲ vuelve atrás", backUp === before, `${after} → ${backUp}`);

  // Abrir la categoría con OK: los canales salen a la derecha
  await tv.keyboard.press("Enter");
  await tv.waitForSelector(".pa-live-chan", { timeout: 10000 });
  check("Mando: OK abre la categoría y saca sus canales", true);

  await tv.locator(".pa-live-chan", { hasText: "Canal Test WebM" }).first().focus();
  await tv.keyboard.press("Enter");
  await tv.waitForFunction(
    () => {
      const v = document.querySelector(".pa-video-zone video");
      return v && v.currentTime > 0.3 && !v.paused;
    },
    { timeout: 20000 }
  );
  check("▶ Mando: OK reproduce el canal", true);

  // Play/pausa con la tecla multimedia del mando (keyCode 179)
  await tv.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { keyCode: 179, bubbles: true }));
  });
  await tv.waitForTimeout(500);
  const paused = await tv.evaluate(() => document.querySelector(".pa-video-zone video")?.paused);
  check("Mando: tecla Play/Pausa pausa el vídeo", paused === true);

  // El foco es visible (outline)
  const outline = await tv.evaluate(() => {
    const el = document.querySelector(".pa-live-chan");
    el?.focus();
    return getComputedStyle(el).outlineWidth;
  });
  check("Foco visible en TV (outline)", parseFloat(outline) >= 3, outline);

  await tvCtx.close();
  await browser.close();

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} pruebas de modo TV OK`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
