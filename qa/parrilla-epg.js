// La parrilla: qué echan ahora y en las próximas horas.
const { chromium, ejecutable } = require("./navegador");
const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`); };

async function conLista(p) {
  await p.goto(BASE + "/player", { waitUntil: "networkidle" });
  await p.waitForSelector(".pa-welcome", { timeout: 20000 });
  await p.click(".pa-welcome button:has-text('Tengo mi propia lista')");
  await p.waitForSelector(".modal");
  await p.fill("#pl-name", "Guia");
  await p.fill("#pl-host", "127.0.0.1:8090");
  await p.fill("#pl-user", "demo");
  await p.fill("#pl-pass", "demo123");
  await p.click(".modal button[type=submit]");
  await p.waitForSelector(".section-gate", { timeout: 25000 });
  await p.locator(".section-card:has-text('TV en directo')").click();
  await p.waitForSelector(".pa-live-cat:not(.pa-live-reciente)", { timeout: 20000 });
}

(async () => {
  const b = await chromium.launch({ ...ejecutable });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
  p.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));

  await conLista(p);

  check("«Guía» está en la barra de secciones", (await p.locator(".pa-nav-item:has-text('Guía')").count()) === 1);
  await p.locator(".pa-nav-item:has-text('Guía')").click();
  await p.waitForSelector(".pa-guia", { timeout: 20000 });
  await p.waitForSelector(".pa-guia-prog", { timeout: 25000 });

  check("Se pinta una fila por canal de la categoría", (await p.locator(".pa-guia-fila").count()) >= 1);
  check("Con sus programas colocados en el tiempo", (await p.locator(".pa-guia-prog").count()) >= 2,
    `${await p.locator(".pa-guia-prog").count()} programas`);

  const titulos = await p.locator(".pa-guia-prog-titulo").allInnerTexts();
  // Vienen en base64 desde el panel: si no se descodifican, se ven como ruido
  check("Y los títulos vienen descodificados", titulos.includes("El programa siguiente"), titulos.slice(0, 3).join(" | "));

  check("Lo que se emite ahora va marcado", (await p.locator(".pa-guia-prog.emitiendo").count()) >= 1);
  check("Y una línea dice por dónde va la hora", (await p.locator(".pa-guia-ahora").count()) === 1);

  const horas = await p.locator(".pa-guia-hora").allInnerTexts();
  check("La regla enseña cuatro horas en medias horas", horas.length === 8, horas.join(" "));

  // Un programa que empieza dentro de la ventana no puede salirse de ella
  const dentro = await p.evaluate(() => {
    const ancho = document.querySelector(".pa-guia-progs").getBoundingClientRect().width;
    return [...document.querySelectorAll(".pa-guia-prog")].every((el) => {
      const r = el.getBoundingClientRect();
      const base = el.closest(".pa-guia-progs").getBoundingClientRect();
      return r.left >= base.left - 1 && r.right <= base.right + 1 && ancho > 0;
    });
  });
  check("Ningún programa se sale de la parrilla", dentro);
  await p.screenshot({ path: __dirname + "/80-parrilla.png" });

  // Moverse en el tiempo
  const diaAntes = await p.locator(".pa-guia-dia").innerText();
  const primeraHora = (await p.locator(".pa-guia-hora").first().innerText()).trim();
  await p.locator(".pa-guia-barra button[aria-label='Una hora después']").click();
  await p.waitForTimeout(400);
  const despues = (await p.locator(".pa-guia-hora").first().innerText()).trim();
  check("Se avanza una hora", primeraHora !== despues, `${primeraHora} → ${despues}`);
  await p.locator(".pa-guia-barra button:has-text('Ahora')").click();
  await p.waitForTimeout(400);
  check("Y «Ahora» devuelve al presente", (await p.locator(".pa-guia-hora").first().innerText()).trim() === primeraHora);
  check("El día se dice con letras", /^[a-záéíóú]+, \d+ de /i.test(diaAntes), diaAntes);

  // Pulsar un programa pone el canal
  await p.locator(".pa-guia-prog").first().click();
  await p.waitForSelector(".pa-video-zone video", { timeout: 20000 });
  check("Pulsar un programa pone ese canal", (await p.locator(".pa-video-zone").count()) === 1);

  // La categoría manda sobre qué canales salen
  await p.locator(".pa-nav-item:has-text('Guía')").click();
  await p.waitForSelector(".pa-guia-fila", { timeout: 20000 });
  const cats = await p.locator(".pa-guia .pa-live-cat .name").allInnerTexts();
  check("Las categorías siguen a la izquierda", cats.length >= 2, cats.join(" | "));
  await p.locator(".pa-guia .pa-live-cat").nth(1).click();
  await p.waitForTimeout(800);
  check("Y al cambiar de categoría cambian los canales", (await p.locator(".pa-guia-canal").count()) >= 1);

  // --- Móvil ---
  const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await conLista(m);
  // En el móvil las secciones viven en la barra de abajo
  check("«Guía» está también en la barra de abajo", (await m.locator(".pa-bottomnav-item:has-text('Guía')").count()) === 1);
  await m.locator(".pa-bottomnav-item:has-text('Guía')").click();
  await m.waitForSelector(".pa-guia-prog", { timeout: 25000 });
  const desborde = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("En el móvil la parrilla se desliza sola, sin romper la página", desborde === 0, `${desborde}px`);

  /* La columna de canales medía 130px y cortaba el nombre en «La U…»: en una
     parrilla, lo primero que hay que saber es de qué canal es la fila */
  const nombre = m.locator(".pa-guia-canal .name").first();
  const cabe = await nombre.evaluate((e) => e.scrollWidth <= e.clientWidth + 1);
  check("Y el nombre del canal se lee entero", cabe, await nombre.innerText());

  /* Moverse en el tiempo con el dedo: los tres botones medían 31px de alto */
  const mandos = await m.locator(".pa-guia-barra .btn").evaluateAll(
    (els) => els.map((e) => Math.round(e.getBoundingClientRect().height))
  );
  check("Y se puede viajar en el tiempo con el dedo",
    mandos.length >= 3 && mandos.every((h) => h >= 40), mandos.join(", ") + "px");

  await m.screenshot({ path: __dirname + "/81-parrilla-movil.png" });

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas de la parrilla OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
