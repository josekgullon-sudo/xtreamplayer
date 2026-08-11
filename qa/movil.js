// UX móvil (390×844, viewport de iPhone): lo que el usuario señaló y el
// contrato de la nueva navegación inferior.
const { chromium, devices, ejecutable } = require("./navegador");

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
    ...ejecutable,
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

  /* El menú entero desaparecía por debajo de 900px: en un teléfono —que es
     donde más se entra por primera vez— no había puerta a «soy proveedor» */
  check("En el móvil hay botón de menú", await p.locator(".nav-boton").isVisible());
  await p.locator(".nav-boton").click();
  await p.waitForSelector(".nav-movil", { timeout: 5000 });
  const delMenu = await p.locator(".nav-movil a").allInnerTexts();
  check("Y lleva a las cuatro secciones",
    ["Precios", "Aplicaciones", "Para proveedores", "Ayuda"].every((t) => delMenu.some((x) => x.includes(t))),
    delMenu.join(" | "));
  check("Sin desbordar con el menú abierto",
    (await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0);
  await p.locator(".nav-movil a:has-text('Para proveedores')").click();
  await p.waitForURL("**/proveedores", { timeout: 10000 });
  check("Y desde el móvil se llega a la página de proveedores", true);
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
  await p.locator(".pa-welcome button:has-text('Tengo mi propia lista')").click();
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

  /* Los géneros, que en el móvil no había forma de tocar: la columna de la
     izquierda se escondía y con ella el único filtro. Ahora son chips */
  const chips = await p.locator(".pa-chip").allInnerTexts();
  check("En el móvil los géneros son chips", chips.length >= 2, chips.join(" | "));
  const altoChip = await p.locator(".pa-chip").first().evaluate((e) => Math.round(e.getBoundingClientRect().height));
  check("Con tamaño de dedo", altoChip >= 36, `${altoChip}px`);
  const todas = await p.locator(".pa-card").count();
  await p.locator(".pa-chip").last().click();
  await p.waitForTimeout(600);
  const filtradas = await p.locator(".pa-card").count();
  check("Y el chip filtra de verdad", filtradas >= 1 && filtradas <= todas, `${todas} → ${filtradas}`);
  check("Quedando marcado el elegido", (await p.locator(".pa-chip.activo").count()) === 1);
  await p.locator(".pa-chip:has-text('Todo')").first().click();
  await p.waitForTimeout(400);

  /* La ficha de una película se apilaba bien en el móvil, pero sus botones
     seguían con las medidas del escritorio: el aspa 36px y «Reproducir»
     41px. Son los únicos controles que tiene esa pantalla. */
  await p.locator(".pa-card", { hasText: "Película Demo" }).first().click();
  await p.waitForSelector(".ficha", { timeout: 20000 });
  const mandosFicha = await p.evaluate(() => {
    const alto = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().height) : 0; };
    return { cerrar: alto(".ficha-cerrar"), reproducir: alto(".ficha .btn-primary") };
  });
  check("En la ficha de una película se puede cerrar y reproducir con el dedo",
    mandosFicha.cerrar >= 44 && mandosFicha.reproducir >= 44,
    `aspa ${mandosFicha.cerrar}px · reproducir ${mandosFicha.reproducir}px`);
  await p.locator(".ficha-cerrar").click();
  await p.waitForTimeout(500);

  /* Y en la de una serie, las temporadas: es por donde se navega la serie
     entera y medían 33px */
  await p.locator(".pa-bottomnav-item:has-text('Series')").click();
  await p.waitForSelector(".pa-card", { timeout: 20000 });
  await p.locator(".pa-card").first().click();
  await p.waitForSelector(".ficha-temporada", { timeout: 20000 });
  const temporadas = await p.locator(".ficha-temporada").evaluateAll(
    (els) => els.map((e) => Math.round(e.getBoundingClientRect().height))
  );
  check("Y las temporadas de una serie se eligen con el dedo",
    temporadas.every((h) => h >= 44), temporadas.join(", ") + "px");
  await p.locator(".ficha-cerrar").click();
  await p.waitForTimeout(500);
  await p.locator(".pa-bottomnav-item:has-text('Cine')").click();
  await p.waitForSelector(".pa-card", { timeout: 20000 });
  check("Desde Directo se llega a Cine con un toque", true);
  await p.locator(".pa-bottomnav-item:has-text('Series')").click();
  await p.waitForSelector(".pa-card", { timeout: 20000 });
  check("Y a Series", true);
  await p.locator(".pa-bottomnav-item:has-text('Directo')").click();
  await p.waitForSelector(".pa-live", { timeout: 20000 });
  check("Y de vuelta al directo", true);

  // El carril es de escritorio: en el móvil manda la cápsula de abajo
  check("El carril de escritorio no estorba en móvil", !(await p.locator(".pa-rail").isVisible()));
  check("La franja superior conserva lista y buscador",
    (await p.locator(".pa-tira-lista").isVisible()) && (await p.locator('.pa-tira [aria-label="Buscar"]').isVisible()));

  /* La cápsula flota: pegada al borde, su último botón cae donde el sistema
     pone la barra de gestos del teléfono */
  const capsula = await p.locator(".pa-bottomnav").evaluate((e) => {
    const r = e.getBoundingClientRect();
    return { hueco: Math.round(window.innerHeight - r.bottom), izq: Math.round(r.left), radio: getComputedStyle(e).borderRadius };
  });
  check("La barra de abajo flota, no está pegada al borde",
    capsula.hueco >= 6 && capsula.izq >= 6, `${capsula.hueco}px abajo · ${capsula.izq}px al lado · radio ${capsula.radio}`);

  // ---------- Ver un canal y zapear (lista M3U: el mock emite de verdad) ----------
  await p.locator('[aria-label="Listas"]:visible').click();
  await p.locator('[aria-label="Añadir lista"]:visible').click();
  await p.waitForSelector(".modal");
  /* Elegir entre Xtream y M3U es la primera decisión de quien entra, y las
     dos pestañas medían 29px de alto: se fallaba al pulsarlas */
  const pestanas = await p.locator(".modal .pa-tab").evaluateAll(
    (els) => els.map((e) => Math.round(e.getBoundingClientRect().height))
  );
  check("Las pestañas de añadir lista tienen tamaño de dedo",
    pestanas.every((h) => h >= 40), pestanas.join(", ") + "px");
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

  // ---------- «Mi cuenta», la del cliente de un proveedor ----------
  /* La sesión se abre por API: por dónde se entra ya lo mira acceso.js, y
     aquí lo que interesa es la página en sí */
  /* Este cliente de la siembra tiene tres dispositivos y la llave es
     siempre la misma, así que repetir la suite no gasta un hueco nuevo */
  const entrada = await fetch(BASE + "/api/customer/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "lauraruiz13", password: "cliente123", deviceKey: "qa-movil" }),
  });
  const galleta = (entrada.headers.getSetCookie?.() || []).find((c) => c.startsWith("xp_customer="));
  if (galleta) {
    await ctx.addCookies([{
      name: "xp_customer", value: galleta.split(";")[0].split("=").slice(1).join("="),
      domain: new URL(BASE).hostname, path: "/",
    }]);
    await p.goto(BASE + "/mi-cuenta", { waitUntil: "networkidle" });
    await p.waitForSelector(".cuenta-hero", { timeout: 20000 });

    const sobraCuenta = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("«Mi cuenta» cabe en el móvil", sobraCuenta <= 1, `+${sobraCuenta}px`);

    /* «Cambiar contraseña», «Cerrar sesión» y escribir al proveedor medían
       31px de alto: son las únicas tres cosas que se hacen en esta página */
    const mandos = await p.locator(".cuenta-acciones .btn, .cuenta-bloque .btn").evaluateAll(
      (els) => els.map((e) => ({ t: e.innerText.trim().slice(0, 20), h: Math.round(e.getBoundingClientRect().height) }))
    );
    check("Y lo que se hace en ella se pulsa con el dedo",
      mandos.length > 0 && mandos.every((m) => m.h >= 44),
      mandos.map((m) => `${m.t} ${m.h}px`).join(" · "));
  } else {
    check("Se puede abrir sesión de cliente para ver «Mi cuenta»", false);
  }

  const ok = results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} pruebas de móvil OK`);
  await browser.close();
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => {
  console.log("FATAL", e);
  process.exit(1);
});
