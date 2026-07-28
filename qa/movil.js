// UX móvil (390×844, viewport de iPhone): lo que el usuario señaló y el
// contrato de la nueva navegación inferior.
const { chromium, devices } = require("/opt/node22/lib/node_modules/playwright");

const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
const check = (n, ok, d = "") => {
  results.push(ok);
  console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`);
};

/* En el móvil el directo enseña una cosa a la vez: carpetas o canales. Esto
   deja siempre canales a la vista, venga de donde venga. */
async function abrirCanales(p) {
  // Al añadir una lista se vuelve a preguntar qué ver: se contesta y se sigue
  if (await p.locator(".section-gate").isVisible().catch(() => false)) {
    await p.locator(".section-card").first().click();
  }
  await p.waitForSelector(".pa-live", { timeout: 20000 });
  /* En el móvil se ve una cosa u otra, nunca las dos, y cuál de ellas depende
     de por dónde se venía. Esperamos a que haya algo a la vista y decidimos
     entonces; mirar solo una de las dos hacía fallar la prueba a ratos. */
  await p.waitForFunction(() => {
    const visible = (el) => el && el.getClientRects().length > 0;
    return (
      visible(document.querySelector(".pa-live-chan")) ||
      visible(document.querySelector(".pa-live-cat:not(.pa-live-reciente)"))
    );
  }, { timeout: 25000 });
  if (await p.locator(".pa-live-chan").first().isVisible().catch(() => false)) return;
  await p.locator(".pa-live-cat:not(.pa-live-reciente)").first().click();
  await p.waitForSelector(".pa-live-chan", { timeout: 20000 });
}

(async () => {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));

  // ---------- Portada: las dos puertas visibles ----------
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  const entrar = p.locator(".header-actions a:has-text('Entrar')");
  check("«Entrar» visible en la cabecera móvil", await entrar.isVisible());
  const reproductor = p.locator(".header-actions a[href='/player']");
  check("Y el botón del reproductor también", await reproductor.isVisible());
  const solapan = await p.evaluate(() => {
    const logo = document.querySelector(".logo")?.getBoundingClientRect();
    const acc = document.querySelector(".header-actions")?.getBoundingClientRect();
    return logo && acc && logo.right > acc.left + 1;
  });
  check("Sin solaparse con el logotipo", !solapan);
  const alturas = await p.evaluate(() =>
    [...document.querySelectorAll("header a, header button")]
      .filter((el) => el.offsetParent !== null)
      .map((el) => Math.round(el.getBoundingClientRect().height))
  );
  check("Todos los controles alcanzan el tamaño de dedo (≥32px)", alturas.every((h) => h >= 32), alturas.join(","));
  check("Favicon servido", (await (await fetch(BASE + "/icon.svg")).status) === 200);

  // ---------- Reproductor: lista Xtream y navegación inferior ----------
  await p.goto(BASE + "/player", { waitUntil: "networkidle" });
  await p.locator(".pa-welcome .btn-primary").click();
  await p.waitForSelector(".modal");
  await p.fill("#pl-name", "Movil");
  await p.fill("#pl-host", "127.0.0.1:8090");
  await p.fill("#pl-user", "demo");
  await p.fill("#pl-pass", "demo123");
  await p.click(".modal button[type=submit]");
  await p.waitForSelector(".section-gate", { timeout: 20000 });
  check("El panel de «¿qué quieres ver?» cabe en el móvil", await p.locator(".section-card").first().isVisible());
  await p.locator(".section-card:has-text('TV en directo')").click();

  /* Carpetas primero, canales después: en el móvil el directo enseña las
     categorías y solo al tocar una aparecen sus canales */
  await p.waitForSelector(".pa-live-cat:not(.pa-live-reciente)", { timeout: 20000 });
  const carpetas = await p.locator(".pa-live-cat:not(.pa-live-reciente)").count();
  check("Se entra por carpetas, no por miles de canales", carpetas >= 2, `${carpetas} carpetas`);
  check("Y ningún canal a la vista hasta abrir una", !(await p.locator(".pa-live-chan").first().isVisible().catch(() => false)));
  await p.locator(".pa-live-cat:not(.pa-live-reciente)").nth(1).click();
  await p.waitForSelector(".pa-live-chan", { timeout: 20000 });
  check("Tocar la carpeta enseña sus canales", await p.locator(".pa-live-chan").first().isVisible());

  // La navegación inferior es el timón
  await p.waitForSelector(".pa-bottomnav", { timeout: 5000 });
  const items = await p.locator(".pa-bottomnav-item").allInnerTexts();
  check("Barra inferior con Directo, Guía, Cine, Series y Favoritos", items.length === 5, items.join(" | ").replace(/\n/g, " "));
  const zonas = await p.locator(".pa-bottomnav-item").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  check("Botones de la barra con tamaño de dedo", zonas.every((h) => h >= 44), zonas.map(Math.round).join(","));

  // Lo que el usuario señaló: desde Directo se llega a Cine y Series
  await p.locator(".pa-bottomnav-item:has-text('Cine')").click();
  await p.waitForSelector(".pa-card", { timeout: 20000 });
  check("Desde Directo se llega a Cine con un toque", true);
  await p.locator(".pa-bottomnav-item:has-text('Series')").click();
  await p.waitForSelector(".pa-card", { timeout: 20000 });
  check("Y a Series", true);
  await p.locator(".pa-bottomnav-item:has-text('Directo')").click();
  await p.waitForSelector(".pa-live", { timeout: 20000 });
  check("Y de vuelta al directo", true);

  // Sin pestañas duplicadas ni lista lateral aplastada
  check("Las secciones de escritorio no estorban en móvil", !(await p.locator(".pa-nav-secciones").isVisible()));
  // La lupa, no el campo: el buscador vive plegado hasta que se pulsa
  check("La franja superior conserva lista y buscador", await p.locator(".pa-nav-busca .pa-icon-btn").isVisible());

  // ---------- Ver un canal y zapear (lista M3U: el mock emite de verdad) ----------
  await p.locator('.pa-nav .pa-icon-btn[aria-label="Añadir lista"]').click();
  await p.waitForSelector(".modal");
  await p.click(".modal .pa-tab:has-text('URL M3U')");
  await p.fill("#pl-name", "M3U Movil");
  await p.fill("#pl-m3u", "http://127.0.0.1:8090/lista-grande.m3u");
  await p.click(".modal button[type=submit]");
  await abrirCanales(p);
  await p.locator(".pa-live-chan").first().click();
  await p.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && v.currentTime > 0;
  }, { timeout: 25000 });
  check("El canal se reproduce", true);
  const videoBox = await p.locator(".pa-video-zone").boundingBox();
  check("El vídeo no se come la pantalla (deja sitio al zapeo)", videoBox.height < 844 * 0.5, `${Math.round(videoBox.height)}px de alto`);
  /* Con el vídeo puesto, la lista de canales sigue debajo: se zapea sin
     salir de lo que se está viendo */
  check("La lista de canales sigue bajo el vídeo", await p.locator(".pa-live-chan").first().isVisible());
  await p.locator(".pa-live-chan").nth(1).click();
  await p.waitForTimeout(1500);
  check("Se zapea desde ahí sin salir del vídeo", (await p.locator("video").count()) === 1);

  // La barra inferior sigue accesible viendo el canal
  check("La barra inferior sigue a mano mientras se ve la tele", await p.locator(".pa-bottomnav").isVisible());

  // ---------- Sin desbordes en todo el recorrido ----------
  const sobra = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("Nada desborda a lo ancho", sobra <= 1, `+${sobra}px`);

  const ok = results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} pruebas de móvil OK`);
  await browser.close();
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => {
  console.log("FATAL", e);
  process.exit(1);
});
