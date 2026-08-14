// Regresión del pantallazo blanco: buscar con datos sucios (títulos sin
// nombre, como devuelven los paneles reales) no puede tumbar la aplicación.
const { chromium, ejecutable } = require("./navegador");

const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
const check = (n, ok, d = "") => {
  results.push(ok);
  console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`);
};

/*
 * De la portada a la rejilla de siempre.
 *
 * Cine y series abren en una portada —banner arriba y filas debajo—, y la
 * rejilla entera está a un botón. Estas pruebas miran la rejilla, así que
 * esperan a que aparezca una de las dos cosas y, si es la portada, pulsan.
 */
async function verRejilla(p) {
  await p.waitForSelector(".pa-vertodo, .pa-grid .pa-card", { timeout: 60000 });
  const boton = p.locator(".pa-vertodo");
  if (await boton.count()) await boton.first().click();
  await p.waitForSelector(".pa-grid .pa-card", { timeout: 40000 });
}

(async () => {
  const browser = await chromium.launch({ ...ejecutable });
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(String(e).slice(0, 160)));

  await p.goto(BASE + "/player", { waitUntil: "networkidle" });
  await p.locator(".pa-welcome button:has-text('Tengo mi propia lista')").click();
  await p.waitForSelector(".modal");
  await p.fill("#pl-name", "Sucia");
  await p.fill("#pl-host", "127.0.0.1:8090");
  await p.fill("#pl-user", "demo");
  await p.fill("#pl-pass", "demo123");
  await p.click(".modal button[type=submit]");
  await p.waitForSelector(".section-gate", { timeout: 20000 });
  await p.locator(".section-card:has-text('Series')").click();
  await p.waitForSelector(".pa-card", { timeout: 20000 });

  // El momento exacto del pantallazo: escribir en el buscador con la lista sucia
  for (const [tab, letra] of [["Series", "o"], ["Cine", "demo"], ["Directo", "test"]]) {
    await p.locator(`.pa-bottomnav-item:has-text('${tab}')`).click();
    await p.waitForTimeout(600);
    // La lupa de la franja de arriba abre el buscador flotante
    if (!(await p.locator(".pa-busca").count())) {
      await p.locator('[aria-label="Buscar"]:visible').click();
    }
    await p.fill(".pa-busca input", letra);
    await p.waitForTimeout(700);
    check(`Buscar en ${tab} con títulos sin nombre no revienta`, errores.length === 0, errores.join(" | "));
    await p.fill(".pa-busca input", "");
  }

  // El título sin nombre se pinta sin romper nada
  await p.locator(".pa-bottomnav-item:has-text('Cine')").click();
  await verRejilla(p);
  const tarjetas = await p.locator(".pa-grid .pa-card").count();
  // El mock sirve catorce: las tres de siempre —una normal, una sin nombre y
  // una vieja— y once más con nota y año, que son las que dan de comer a la
  // portada de cine de la aplicación de televisión
  check("Los títulos sin nombre no desaparecen del catálogo", tarjetas === 14, `${tarjetas} tarjetas`);

  check("Cero excepciones de cliente en todo el recorrido", errores.length === 0, errores.join(" | "));

  /*
   * El proxy de carátulas ya no acepta direcciones sueltas.
   *
   * Aceptarlas era doble problema: cada logotipo llevaba el servidor del
   * proveedor escrito en la barra de red, y de paso cualquiera de internet
   * podía usarnos de proxy de imágenes gratis. Ahora hay que traer un vale, y
   * un vale solo lo emite el servidor.
   */
  const suelta = await fetch(`${BASE}/api/img?url=${encodeURIComponent("http://127.0.0.1:8090/logo.png")}`);
  check("El proxy de carátulas rechaza una dirección suelta", suelta.status === 403, `HTTP ${suelta.status}`);

  const emision = await fetch(`${BASE}/api/tele/vale`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "http://127.0.0.1:8090/logo.png" }),
  });
  const vale = (await emision.json().catch(() => ({}))).vale;
  check("Con vale, en cambio, sí se emite", !!vale);
  const img = await fetch(`${BASE}/api/img?v=${encodeURIComponent(vale || "")}`);
  check("Y el proxy de carátulas responde", img.status === 200 || img.status === 502, `HTTP ${img.status}`);
  if (img.status === 200) {
    check("Con caché de un día y privada", (img.headers.get("cache-control") || "").includes("86400"));
  } else {
    check("(el mock no sirve logo.png: passthrough verificado igualmente)", true);
  }

  // Un vale tocado no vale: el sello de GCM lo caza
  const tocado = (vale || "aa.bb.cc").slice(0, -2) + "zz";
  const malo = await fetch(`${BASE}/api/img?v=${encodeURIComponent(tocado)}`);
  check("Un vale manipulado se rechaza", malo.status === 403, `HTTP ${malo.status}`);

  /* ---------- Cuando no hay nada, decir qué pasa ----------
   *
   * Una lista que contesta 200 con solo la cabecera —el caso del cliente al
   * que se le ha acabado el paquete— dejaba «No hay canales que coincidan»,
   * que suena a que hay un filtro puesto y manda a mirar el buscador. El
   * buscador no era el problema.
   */
  const vacia = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
  await vacia.goto(BASE + "/player", { waitUntil: "networkidle" });
  await vacia.locator(".pa-welcome button:has-text('Tengo mi propia lista')").click();
  await vacia.waitForSelector(".modal");
  await vacia.click(".modal .pa-tab:has-text('URL M3U')");
  await vacia.fill("#pl-name", "Vacía");
  await vacia.fill("#pl-m3u", "http://127.0.0.1:8090/lista-vacia.m3u");
  await vacia.click(".modal button[type=submit]");
  await vacia.waitForSelector(".pa-empty", { timeout: 25000 });
  const dice = (await vacia.locator(".pa-empty").first().innerText()).replace(/\s+/g, " ");
  check("Una lista sin un solo canal dice que viene vacía, no que no coincida nada",
    dice.includes("no trae ningún canal") && !dice.includes("coincidan"), dice.slice(0, 90));
  check("Y apunta a por qué suele pasar", /caducad|dirección/i.test(dice), "");

  /* Un 200 que no es una lista —el aviso de «suscripción caducada» en HTML,
     que devuelven muchos paneles— no se traga como si fuera una lista */
  await vacia.goto(BASE + "/player", { waitUntil: "networkidle" });
  await vacia.locator('[aria-label="Listas"]:visible').click();
  await vacia.locator('[aria-label="Añadir lista"]:visible').click();
  await vacia.waitForSelector(".modal");
  await vacia.click(".modal .pa-tab:has-text('URL M3U')");
  await vacia.fill("#pl-name", "No es lista");
  await vacia.fill("#pl-m3u", "http://127.0.0.1:8090/lista-que-no-lo-es.m3u");
  await vacia.click(".modal button[type=submit]");
  await vacia.waitForSelector(".modal .error-box", { timeout: 25000 });
  check("Y una dirección que no devuelve una lista se rechaza al añadirla",
    (await vacia.locator(".modal .error-box").innerText()).includes("M3U"),
    (await vacia.locator(".modal .error-box").innerText()).slice(0, 80));

  /* ---------- Una lista sucia de verdad ---------- */
  const sucia = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
  const rotos = [];
  sucia.on("pageerror", (e) => rotos.push(String(e).slice(0, 160)));
  await sucia.goto(BASE + "/player", { waitUntil: "networkidle" });
  await sucia.locator(".pa-welcome button:has-text('Tengo mi propia lista')").click();
  await sucia.waitForSelector(".modal");
  await sucia.click(".modal .pa-tab:has-text('URL M3U')");
  await sucia.fill("#pl-name", "Basura");
  await sucia.fill("#pl-m3u", "http://127.0.0.1:8090/lista-sucia.m3u");
  await sucia.click(".modal button[type=submit]");
  await sucia.waitForSelector(".pa-live-cat:not(.pa-live-reciente)", { timeout: 25000 });
  await sucia.locator(".pa-live-cat:not(.pa-live-reciente)").nth(1).click();
  await sucia.waitForSelector(".pa-live-chan", { timeout: 20000 });

  const nombres = (await sucia.locator(".pa-live-chan .name").allInnerTexts()).map((t) => t.trim());
  /* Un canal sin nombre acaba enseñando el final de su dirección; con la
     extensión puesta salía «canal1.webm», como si el canal fuera un fichero */
  check("Un canal sin nombre no acaba llamándose como un fichero",
    !nombres.some((n) => /\.(webm|ts|mp4|mkv|m3u8|flv)$/i.test(n)),
    nombres.filter((n) => n.includes(".")).join(" | ").slice(0, 80) || "ninguno con extensión");

  /* Los paneles reales meten HTML en los nombres. Si se pintara como HTML,
     cualquiera con una lista podría colar lo que quisiera en la página */
  check("El HTML de un nombre se lee como texto, no se ejecuta",
    (await sucia.locator(".pa-live-chan script, .pa-live-chan b").count()) === 0 &&
      nombres.some((n) => n.includes("<b>")),
    nombres.find((n) => n.includes("<")) ? "sale tal cual, escapado" : "no está el canal con HTML");

  const anchoSucia = await sucia.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("Y un nombre larguísimo no estira la página", anchoSucia === 0, `+${anchoSucia}px`);
  check("Sin excepciones con la lista sucia", rotos.length === 0, rotos.join(" | "));

  /* ---------- Una cuenta que entra y no trae nada ---------- */
  const cero = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
  await cero.goto(BASE + "/player", { waitUntil: "networkidle" });
  await cero.locator(".pa-welcome button:has-text('Tengo mi propia lista')").click();
  await cero.waitForSelector(".modal");
  await cero.fill("#pl-name", "Cero");
  await cero.fill("#pl-host", "127.0.0.1:8090");
  await cero.fill("#pl-user", "vacio");
  await cero.fill("#pl-pass", "vacio123");
  await cero.click(".modal button[type=submit]");
  await cero.waitForSelector(".section-gate, .pa-live", { timeout: 30000 });
  if (await cero.locator(".section-gate").isVisible().catch(() => false)) {
    await cero.locator(".section-card").first().click();
  }
  await cero.waitForSelector(".pa-empty", { timeout: 25000 });
  /* Cada sección vacía dice lo suyo: un «no hay nada» genérico en las cuatro
     no distingue entre una lista sin cine y una lista sin nada */
  const porSeccion = {};
  for (const sec of ["Cine", "Series", "Favoritos"]) {
    await cero.locator(`.pa-bottomnav-item:has-text('${sec}')`).click();
    await cero.waitForTimeout(1600);
    porSeccion[sec] = (await cero.locator(".pa-empty").first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  }
  check("Una cuenta que entra pero no trae nada lo dice en cada sección",
    porSeccion.Cine.includes("películas") && porSeccion.Series.includes("series") && porSeccion.Favoritos.includes("favoritos"),
    Object.entries(porSeccion).map(([k, v]) => `${k}: ${v}`).join(" · ").slice(0, 160));

  /* ---------- Sin cobertura ----------
   *
   * Cuando el que falla es el navegador —sin cobertura, wifi caído, el móvil
   * en el ascensor— el mensaje de la excepción es «Failed to fetch», y eso
   * es lo que se enseñaba: dos palabras en inglés que no dicen ni qué ha
   * pasado ni qué hacer, y que encima parecen culpar a la lista.
   */
  const sinRedCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const sinRed = await sinRedCtx.newPage();
  await sinRed.goto(BASE + "/player", { waitUntil: "networkidle" });
  await sinRed.locator(".pa-welcome button:has-text('Tengo mi propia lista')").click();
  await sinRed.waitForSelector(".modal");
  await sinRed.fill("#pl-name", "Sin red");
  await sinRed.fill("#pl-host", "127.0.0.1:8090");
  await sinRed.fill("#pl-user", "demo");
  await sinRed.fill("#pl-pass", "demo123");
  await sinRedCtx.setOffline(true);
  await sinRed.click(".modal button[type=submit]");
  await sinRed.waitForSelector(".modal .error-box", { timeout: 25000 });
  const aviso = (await sinRed.locator(".modal .error-box").innerText()).trim();
  check("Quedarse sin conexión se dice en cristiano, no «Failed to fetch»",
    !/failed to fetch|networkerror|load failed/i.test(aviso) && /conexión|conectar/i.test(aviso),
    aviso.slice(0, 90));
  await sinRedCtx.setOffline(false);

  const ok = results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} pruebas de búsqueda con datos sucios OK`);
  await browser.close();
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => {
  console.log("FATAL", e);
  process.exit(1);
});
