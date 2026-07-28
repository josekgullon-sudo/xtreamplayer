// La web que ve quien todavía no es cliente: precios, proveedores y ayuda.
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`); };

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 950 } })).newPage();
  p.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));

  // --- Precios ---
  await p.goto(BASE + "/precios", { waitUntil: "networkidle" });
  const bloques = await p.locator(".precios-titulo").allInnerTexts();
  check("Precios habla de los dos públicos", bloques.length === 2, bloques.join(" | "));
  check("El de ver tu lista, con sus dos planes", (await p.locator(".price-card").count()) === 2);
  /* Los tramos salen de la base de datos: escritos a mano acabarían siendo
     un precio distinto del que se cobra */
  const filas = await p.locator(".compare-table tbody tr").count();
  check("Y el de proveedores, con sus tramos", filas >= 4, `${filas} tramos`);
  const tabla = await p.locator(".compare-table").innerText();
  check("Con precios de verdad, no inventados", tabla.includes("20 €") && tabla.includes("100"), tabla.split("\n")[1]);
  check("Y con salida a la prueba de proveedor", await p.locator("a[href='/proveedores/registro']").isVisible());
  check("Sin desbordar a lo ancho",
    (await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0);
  await p.screenshot({ path: __dirname + "/85-precios.png", fullPage: true });

  // Lo que ya no se promete: perfiles y guía son de todos, y multipantalla no existe
  const texto = await p.locator("main").innerText();
  check("Ya no se vende como novedad lo que ya está", !texto.includes("multipantalla"), "sin «multipantalla»");
  check("Y se dice qué no somos", texto.includes("no vende ni incluye contenido"));

  // --- Ayuda ---
  await p.goto(BASE + "/faq", { waitUntil: "networkidle" });
  const preguntas = await p.locator(".faq-item summary").allInnerTexts();
  check("La ayuda cubre lo que hay hoy", preguntas.length >= 11, `${preguntas.length} preguntas`);
  check("Incluida la guía y lo ya emitido", preguntas.some((q) => q.includes("guía de programación")));
  check("Y qué hacer con el usuario que te dio tu proveedor", preguntas.some((q) => q.includes("usuario y una contraseña")));
  check("Y que también sirve para proveedores", preguntas.some((q) => q.includes("Soy proveedor")));

  // Los datos estructurados llevan la respuesta, no una excusa
  // La página lleva dos bloques de datos estructurados: nos interesa el de la ayuda
  const bloquesLd = await p.locator('script[type="application/ld+json"]').allInnerTexts();
  const jsonLd = bloquesLd.map((t) => JSON.parse(t)).find((j) => j["@type"] === "FAQPage");
  const respuestas = jsonLd.mainEntity.map((q) => q.acceptedAnswer.text);
  check("Google recibe las respuestas de verdad",
    respuestas.every((t) => t.length > 40) && !respuestas.some((t) => t.includes("Consulta la respuesta completa")),
    `${respuestas.length} respuestas, la más corta ${Math.min(...respuestas.map((t) => t.length))} letras`);

  // --- Proveedores ---
  await p.goto(BASE + "/proveedores", { waitUntil: "networkidle" });
  check("La página de proveedores sigue en pie", (await p.locator(".compare-table tbody tr").count()) >= 4);
  check("Con su prueba sin tarjeta", (await p.locator("main").innerText()).includes("Sin tarjeta"));

  // --- Que se llegue desde el menú ---
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  for (const [texto, ruta] of [["Precios", "/precios"], ["Para proveedores", "/proveedores"], ["Ayuda", "/faq"]]) {
    await p.locator(`.nav-links a:has-text("${texto}")`).click();
    await p.waitForURL(`**${ruta}`, { timeout: 10000 });
    check(`Desde el menú se llega a ${texto}`, true);
    await p.goBack({ waitUntil: "networkidle" });
  }

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas de la web pública OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
