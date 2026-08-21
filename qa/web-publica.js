// La web que ve quien todavía no es cliente: precios, proveedores y ayuda.
const { chromium, ejecutable } = require("./navegador");
const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`); };

(async () => {
  const b = await chromium.launch({ ...ejecutable });
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
  /* El espacio entre el número y el € es el que pone `Intl` para el
     castellano, que no es el de la barra espaciadora: se normaliza antes de
     comparar o esto falla por un carácter invisible */
  const tabla = (await p.locator(".compare-table").innerText()).replace(/\s/g, " ");
  check("Con precios de verdad, no inventados", tabla.includes("20 €") && tabla.includes("100"), tabla.split(" ").slice(0, 8).join(" "));
  check("Y con salida a la prueba de proveedor", await p.locator("a[href='/proveedores/registro']").isVisible());
  check("Sin desbordar a lo ancho",
    (await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0);
  await p.screenshot({ path: __dirname + "/85-precios.png", fullPage: true });

  /* Lo ya emitido y los perfiles estaban hechos y no se vendían: quien
     compara dos reproductores lo hace por esta lista */
  const gratis = await p.locator(".price-card").first().innerText();
  check("El plan gratis cuenta lo que de verdad trae",
    /ya emitido/i.test(gratis) && /perfiles/i.test(gratis), "");

  // Lo que ya no se promete: perfiles y guía son de todos, y multipantalla no existe
  const texto = await p.locator("main").innerText();
  check("Ya no se vende como novedad lo que ya está", !texto.includes("multipantalla"), "sin «multipantalla»");
  check("Y se dice qué no somos", texto.includes("no vende ni incluye contenido"));

  /* --- Todo lo que hace ---
     Quien compara dos reproductores lo hace por esta lista, y estaba
     repartida entre Precios, Para proveedores y la portada. */
  await p.goto(BASE + "/funciones", { waitUntil: "networkidle" });
  const grupos = (await p.locator(".funcs-t").allInnerTexts()).map((t) => t.trim());
  check("Las funciones están agrupadas y no en una lista de treinta puntos",
    grupos.length >= 4, grupos.join(" · "));
  const fichas = await p.locator(".func-card").count();
  check("Con una ficha por función, diciendo qué hace", fichas >= 20, `${fichas} funciones`);

  /* Que no se anuncie nada que no esté hecho, ni en las fichas ni en ningún
     apartado de «en camino». Hubo uno y se quitó: sin nadie trabajando en
     ello ni fecha, no es una hoja de ruta sino una lista de deseos, y en la
     página de funciones se lee como una promesa */
  const todoLoQuePone = await p.locator("main").innerText();
  check("No se anuncia nada que no esté hecho",
    !/VPN|Multiview|AirPlay|Chromecast/i.test(todoLoQuePone),
    (todoLoQuePone.match(/VPN|Multiview|AirPlay|Chromecast/i) || ["nada de eso"])[0]);

  check("Y se llega desde el menú",
    (await p.locator(".site-header a[href='/funciones']").count()) >= 1);

  /*
   * La página que no está.
   *
   * Salía la de fábrica de Next —«404 · This page could not be found», en
   * inglés, sobre blanco y sin una salida— dentro de un producto que está
   * entero en castellano y en oscuro. Quien llega aquí es casi siempre un
   * cliente con un enlace viejo de su proveedor, y eso no se lee como «te
   * has equivocado de dirección» sino como «esto no es donde creías».
   *
   * Es una pantalla que solo aparece cuando algo va mal, o sea que si nadie
   * la comprueba no se entera nadie de que se ha vuelto a romper.
   */
  const perdida = await p.goto(BASE + "/esto-no-existe-y-no-va-a-existir", { waitUntil: "networkidle" });
  check("Una dirección que no existe contesta 404 de verdad", perdida.status() === 404, String(perdida.status()));
  const textoPerdida = await p.locator("body").innerText();
  check("Y con la página del producto, no la de fábrica en inglés",
    !textoPerdida.includes("This page could not be found") && /reproductor|principio/i.test(textoPerdida),
    textoPerdida.replace(/\s+/g, " ").slice(0, 80));
  check("Con salida al reproductor y a la portada",
    (await p.locator("a[href='/player']").count()) >= 1 && (await p.locator("a[href='/']").count()) >= 1);

  // --- Ayuda ---
  await p.goto(BASE + "/faq", { waitUntil: "networkidle" });
  const preguntas = await p.locator(".faq-item summary").allInnerTexts();
  check("La ayuda cubre lo que hay hoy", preguntas.length >= 11, `${preguntas.length} preguntas`);
  check("Incluida la guía y lo ya emitido", preguntas.some((q) => q.includes("guía de programación")));
  check("Y qué hacer con el usuario que te dio tu proveedor", preguntas.some((q) => q.includes("usuario y una contraseña")));
  check("Y que también sirve para proveedores", preguntas.some((q) => q.includes("Soy proveedor")));
  /* La pregunta que llega por soporte en cuanto el servicio lleva un mes en
     pie. Estaba resuelta en el producto y sin contestar aquí, así que el
     cliente escribía a su proveedor y el proveedor a nosotros. */
  check("Y qué hacer si se te olvida la contraseña",
    preguntas.some((q) => q.toLowerCase().includes("contraseña") && q.toLowerCase().includes("olvidado")),
    preguntas.find((q) => q.toLowerCase().includes("olvidado")) || "(no está)");
  /* Están plegadas: hay que abrirla para leer la respuesta */
  await p.locator(".faq-item", { hasText: "olvidado" }).click();
  const laDeLaClave = await p.locator(".faq-item", { hasText: "olvidado" }).innerText();
  check("Y que al cliente de un proveedor se le manda a su proveedor",
    laDeLaClave.includes("proveedor"), "");

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

  /* Lo que está hecho y no se contaba: un proveedor que compara opciones
     pregunta por las cuatro, y la página no contestaba a ninguna. Si algún
     día se quitan del producto, esto avisa antes de que la página mienta. */
  const loQueIncluye = await p.locator(".features-grid").innerText();
  for (const [que, palabra] of [
    ["los revendedores y sus permisos", "revendedores"],
    ["traerse los clientes desde XUI", "XUI"],
    ["las facturas", "factura"],
    ["la API", "API"],
  ]) {
    check(`Y dice que incluye ${que}`, new RegExp(palabra, "i").test(loQueIncluye));
  }

  /* La marca blanca va en todos los tramos. Estaba puesta como un
     «escríbenos», y así parece un extra que se paga aparte */
  const cierre = await p.locator("main").innerText();
  check("Y que la marca propia va incluida, no como un extra",
    /incluid\w+ en todos los tramos/i.test(cierre), "");

  // --- En qué aparatos se ve ---
  /* La pregunta que hace todo el mundo —«¿y esto en mi tele?»— no tenía
     página: había que saber de memoria que existía /tv */
  await p.goto(BASE + "/apps", { waitUntil: "networkidle" });
  /* Se comprueban los logotipos, no los titulares: es lo que mira quien
     entra buscando si su aparato está en la lista */
  const aparatos = (await p.locator(".marca").allInnerTexts()).map((t) => t.trim()).join(" | ");
  check("La página enseña el logotipo de cada aparato",
    ["Android TV", "Google TV", "Fire TV", "Samsung", "LG", "iPhone", "Windows", "Mac", "Linux"]
      .every((m) => aparatos.includes(m)),
    aparatos);
  check("Y son dibujos, no imágenes traídas de fuera",
    (await p.locator(".marca svg").count()) >= 6 && (await p.locator(".marca img").count()) === 0);

  /* Instalarlo en el móvil es la única vía en Apple —su tienda no admite
     reproductores IPTV genéricos—, así que tiene que estar explicado */
  await p.goto(BASE + "/apps/movil", { waitUntil: "networkidle" });
  const movil = await p.locator("main").innerText();
  check("La página del móvil explica las dos formas de instalarlo",
    movil.includes("Safari") && movil.includes("pantalla de inicio") && movil.includes("Chrome"));
  check("Y dice por qué no está en la App Store", movil.includes("App Store"));

  // El manifiesto es lo que hace que, instalada, se abra como aplicación
  const manifiesto = await (await fetch(BASE + "/manifest.webmanifest")).json();
  check("El manifiesto la declara instalable",
    manifiesto.display === "standalone" && manifiesto.start_url === "/player",
    `${manifiesto.display} · arranca en ${manifiesto.start_url}`);
  check("Con iconos propios, y uno recortable para Android",
    manifiesto.icons?.length >= 2 && manifiesto.icons.some((i) => i.purpose === "maskable"),
    `${manifiesto.icons?.length} iconos`);
  for (const icono of manifiesto.icons || []) {
    const r = await fetch(BASE + icono.src);
    check(`El icono ${icono.sizes} existe de verdad`, r.status === 200 && (r.headers.get("content-type") || "").includes("image"));
  }

  await p.goto(BASE + "/apps", { waitUntil: "networkidle" });
  await p.locator(".app-card").first().click();
  await p.waitForURL("**/apps/androidtv", { timeout: 10000 });
  const tele = await p.locator("main").innerText();
  check("La de la tele explica cómo se activa", tele.includes("MAC") && tele.includes("código"));
  check("Y lleva al reproductor de tele mientras no haya aplicación",
    (await p.locator("a[href='/tv']").count()) >= 1);
  /* Sin esta frase, la ficha de Google Play se cae: es el motivo de rechazo
     más habitual en reproductores de este tipo */
  await p.locator(".faq-item:has-text('canales')").click();
  check("Y deja claro que no incluye canales",
    (await p.locator(".faq-item:has-text('canales')").innerText()).includes("No"),
    "");

  // --- Que se llegue desde el menú ---
  await p.goto(BASE + "/", { waitUntil: "networkidle" });

  /* La portada tiene que contestar «¿y en lo mío?» sin hacer bajar: quien no
     ve su aparato en la lista se va */
  const enPortada = (await p.locator(".compat .marca").allInnerTexts()).map((t) => t.trim()).join(" | ");
  /* Sin mirar mayúsculas: «SAMSUNG» va en versalitas porque su logotipo es
     justamente eso, la palabra, y lo que importa aquí es que la marca esté */
  const hayMarcas = ["Android TV", "Fire TV", "Samsung", "LG", "iPhone", "Windows", "Mac", "Linux"]
    .every((m) => enPortada.toLowerCase().includes(m.toLowerCase()));
  check("La portada enseña en qué aparatos se ve", hayMarcas, enPortada);
  /* Y cada una con algo delante: un icono, o su nombre en la forma que la
     distingue. Una lista de diez palabras sueltas no se lee de un vistazo,
     que es lo único que esta tira tiene que conseguir */
  const conDistintivo = await p.evaluate(() =>
    [...document.querySelectorAll(".compat .marca")].filter(
      (m) => m.querySelector("svg, .marca-samsung, .marca-lg")
    ).length
  );
  check("Y cada una con su distintivo delante, no solo el nombre",
    conDistintivo === (await p.locator(".compat .marca").count()),
    `${conDistintivo} de ${await p.locator(".compat .marca").count()}`);
  check("Y desde ahí se llega a la página de cada aparato",
    (await p.locator(".compat-pie a[href='/apps']").count()) === 1);

  for (const [texto, ruta] of [["Precios", "/precios"], ["Aplicaciones", "/apps"], ["Para proveedores", "/proveedores"], ["Ayuda", "/faq"]]) {
    await p.locator(`.nav-links a:has-text("${texto}")`).click();
    await p.waitForURL(`**${ruta}`, { timeout: 10000 });
    check(`Desde el menú se llega a ${texto}`, true);
    await p.goBack({ waitUntil: "networkidle" });
  }

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas de la web pública OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
