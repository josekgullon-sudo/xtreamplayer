// La aplicación de televisión: activarla, manejarla con el mando y encenderla.
const { chromium, ejecutable } = require("./navegador");
const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`); };

async function call(path, opts = {}, cookie = "") {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers || {}) },
  });
  return { status: res.status, body: await res.json().catch(() => ({})), setCookie: res.headers.get("set-cookie") };
}
const ck = (sc, n) => { const m = sc?.match(new RegExp(`${n}=([^;]+)`)); return m ? `${n}=${m[1]}` : ""; };

/*
 * De la portada a la lista de carpetas de siempre.
 *
 * Cine, series y ahora también el directo abren en una portada —banner
 * arriba y filas debajo—, y la lista de carpetas está a un botón. Las
 * pruebas que miran la lista pulsan ese botón si está.
 */
async function verCarpetas(tv) {
  await tv.waitForSelector(".tv-vertodas, .tv-fila.tv-carpeta", { timeout: 25000 });
  const boton = tv.locator(".tv-vertodas");
  if (await boton.count()) await boton.first().click();
  await tv.waitForSelector(".tv-fila.tv-carpeta", { timeout: 25000 });
  /* El ratón se queda donde hizo clic, y el foco sigue al ratón: sin esto,
     la primera flecha del mando parte de donde esté el puntero y no de donde
     cree la prueba */
  await tv.mouse.move(2, 2);
}

/*
 * Del menú a los canales de la primera carpeta.
 *
 * El directo abre en la lista de carpetas —«Generalistas (12)»—, así que
 * para llegar a un canal hay que entrar en una. Se repite en media prueba.
 */
/* El directo ya no entra por un índice de categorías: al abrirlo, los
   canales están delante. Y el puntero, a una esquina muerta, que en un
   navegador comparte foco con el mando */
async function esperarCanales(tv) {
  await tv.waitForSelector(".tv-dir-canal", { timeout: 20000 });
  /* Y con su guía puesta: la lista sale antes que las guías —son una
     petición por canal contra el panel— y sin esperarlas se pone un canal
     cuya guía todavía no ha llegado, que es una carrera y no una prueba */
  await tv
    .waitForFunction(
      () => (document.querySelector(".tv-dir-prog")?.textContent || "").trim().length > 0,
      { timeout: 20000 }
    )
    .catch(() => {});
  await tv.mouse.move(2, 2);
}

(async () => {
  const RUN = Date.now().toString(36).slice(-5);
  const U = `tv${RUN}`;

  // Proveedor con marca, dominio y un cliente
  let r = await call("/api/provider/auth", { method: "POST", body: JSON.stringify({ action: "register", email: `tv${RUN}@t.com`, password: "supersecreta1" }) });
  const prov = ck(r.setCookie, "xp_provider");
  await call("/api/provider/branding", { method: "PUT", body: JSON.stringify({ name: "TotalFLIX", slug: `tv${RUN}`, support: "soporte@totalflix.com" }) }, prov);
  const dom = await call("/api/provider/domains", { method: "POST", body: JSON.stringify({ host: "127.0.0.1", port: 8090 }) }, prov);
  await call("/api/provider/customers", {
    method: "POST",
    body: JSON.stringify({ username: U, password: "clave1234", domainId: dom.body.domain.id, playlistUsername: "demo", playlistPassword: "demo123", maxDevices: 5 }),
  }, prov);

  // --- Emparejado por código ---
  r = await call("/api/tv/code", { method: "POST", body: JSON.stringify({ deviceKey: `tv-salon-${RUN}` }) });
  const code = r.body.code;
  check("La tele obtiene un código de seis caracteres", /^[A-Z2-9]{6}$/.test(code || ""), code);
  check("Sin I/O/0/1, que se confunden a tres metros", !/[IO01]/.test(code || ""));

  r = await call(`/api/tv/code?code=${code}`);
  check("Mientras nadie lo reclama, la tele espera", r.body.estado === "esperando");

  r = await call("/api/tv/reclamar", { method: "POST", body: JSON.stringify({ code }) });
  check("Un desconocido no puede reclamar un código", r.status === 401);

  r = await call("/api/customer/login", { method: "POST", body: JSON.stringify({ username: U, password: "clave1234", deviceKey: "movil" }) });
  const cli = ck(r.setCookie, "xp_customer");
  r = await call("/api/tv/reclamar", { method: "POST", body: JSON.stringify({ code: "ZZZZZZ" }) }, cli);
  check("Un código inventado se rechaza", r.status === 400);
  r = await call("/api/tv/reclamar", { method: "POST", body: JSON.stringify({ code: code.toLowerCase() }) }, cli);
  check("El cliente lo reclama desde su móvil, sin importar mayúsculas", r.status === 200);

  r = await call(`/api/tv/code?code=${code}`);
  const tvCookie = ck(r.setCookie, "xp_customer");
  check("Y la tele recibe su sesión", r.body.estado === "listo" && Boolean(tvCookie));
  r = await call(`/api/tv/code?code=${code}`);
  check("El mismo código no sirve dos veces", r.body.estado === "caducado");

  // --- La tele en el navegador ---
  const b = await chromium.launch({ ...ejecutable });
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await ctx.newPage();
  tv.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));

  await tv.goto(BASE + "/tv?app=1", { waitUntil: "networkidle" });
  await tv.waitForSelector(".tv-activar", { timeout: 20000 });
  const inicio = await tv.locator(".tv-activar").innerText();
  check("Sin activar, la tele dice qué hacer", inicio.includes("Activa esta tele"));
  check("Enseña su MAC, que es lo que le pide el proveedor", /[0-9A-F]{2}:[0-9A-F]{2}:/.test(inicio), (inicio.match(/[0-9A-F:]{17}/) || [])[0]);
  check("Y ofrece entrar con usuario, sin esconderlo", inicio.includes("Entrar con usuario y contraseña"));

  // Entrar con el usuario desde la propia tele
  await tv.locator(".tv-boton:has-text('Entrar con usuario')").click();
  await tv.fill("input[name=usuario]", U);
  await tv.fill("input[name=password]", "clave1234");
  await tv.locator(".tv-boton:has-text('Entrar')").first().click();
  await tv.waitForSelector(".tv-pestanas", { timeout: 25000 });
  check("Se puede entrar con usuario desde la propia tele", true);

  /* Tres destinos en la fila de pestañas, y «Salir» arriba en la cabecera:
     no son la misma clase de cosa. Con los cuatro juntos, apagar la tele
     pesaba lo mismo que entrar en el cine */
  const tiles = await tv.locator(".tv-pestana").allInnerTexts();
  check("Portada con los tres sitios donde hay algo que ver", tiles.length === 3,
    tiles.join(" | ").replace(/\n/g, " "));
  check("Y «Salir» aparte, sin competir con ellos",
    (await tv.locator(".tv-inicio-salir").count()) === 1 &&
      (await tv.locator(".tv-pestana:has-text('Salir')").count()) === 0);
  check("Con la marca del proveedor", (await tv.locator(".tv-marca").innerText()).toUpperCase().includes("TOTALFLIX"));
  check("Y la MAC a la vista", (await tv.locator(".tv-pie-mac").innerText()).includes(":"));
  check("Sin cabecera de la web ni menús", !(await tv.locator(".site-header").isVisible().catch(() => false)));

  /* --- El inicio enseña títulos, no un menú ---
     Era un lanzador: tres tarjetas con el nombre de cada sección y ni un
     solo título a la vista. Encender la tele y encontrarse un menú es tener
     que elegir antes de haber visto nada. */
  await tv.waitForSelector(".tv-tarjeta", { timeout: 25000 });
  const filasInicio = (await tv.locator(".tv-carrusel-t").allInnerTexts()).map((t) => t.split("\n")[0].trim());
  check("El inicio abre con filas de lo que hay, no con un menú",
    filasInicio.length >= 2, filasInicio.join(" | "));

  /* Y con imagen las de cine y series: ahí se elige de entre miles, sobran
     candidatos, y un hueco gris con el nombre escrito dentro no vende nada.
     Se colaba: la fila se ordena por nota, medio catálogo trae la nota
     puesta a 10 a mano, y «Películas destacadas» salía entera sin una sola
     carátula.

     Los canales no se filtran, y es a propósito: ahí no hay escaparate que
     elegir, está lo que se emite. Un canal sin logotipo se conoce por su
     número y su nombre, y esconderlo sería quitarle canales al cliente */
  const sinImagen = await tv.evaluate(() =>
    [...document.querySelectorAll(".tv-cuerpo-portada .tv-carrusel")]
      .filter((f) => !/directo/i.test(f.querySelector(".tv-carrusel-t")?.textContent || ""))
      .flatMap((f) => [...f.querySelectorAll(".tv-tarjeta")])
      .filter((c) => !c.querySelector("img"))
      .map((c) => c.querySelector(".tv-tarjeta-t")?.textContent || "?")
  );
  check("Y las de cine y series traen todas su carátula",
    sinImagen.length === 0, sinImagen.join(" | ") || "todas con imagen");

  /* Apaisadas de verdad, no un cartel vertical encogido en medio: la
     carátula se recorta a lo ancho, que es lo que hace que una fila se lea
     como un escaparate y no como una hilera de sellos */
  const apaisadas = await tv.evaluate(() => {
    const c = document.querySelector(".tv-cuerpo-portada .tv-tarjeta-marco");
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return Math.round((r.width / r.height) * 100) / 100;
  });
  check("Y son apaisadas, no carteles verticales", apaisadas !== null && apaisadas > 1.5, `${apaisadas}:1`);

  /* --- El mando ---
     El foco se pone a mano en la primera pestaña y el puntero se aparta: en
     un navegador los dos comparten foco, y con la pantalla montándose lo que
     quede debajo del ratón quieto se lo lleva él solo. En una tele no pasa */
  await tv.locator(".tv-pestana").first().hover();
  await tv.mouse.move(2, 2);
  await tv.keyboard.press("ArrowRight");
  check("Las flechas mueven el foco", (await tv.locator(".tv-pestana.foco").innerText()).includes("Películas"));
  await tv.keyboard.press("ArrowLeft");
  await tv.keyboard.press("Enter");

  /* --- El directo abre con los canales delante ---
     Abrió en una portada de carátulas copiada de la de cine, y después en un
     índice de categorías. Las dos hacían lo mismo mal: enseñar cualquier
     cosa menos canales. Un canal no tiene cartel —tiene un logotipo cuadrado
     que estirado queda como una mancha— y una lista de categorías obliga a
     administrar antes de dejar ver. Ahora la pantalla es una: los canales a
     la izquierda y lo que dan a la derecha. */
  await tv.waitForSelector(".tv-dir-canal", { timeout: 25000 });
  check("TV en directo abre con los canales a la vista",
    (await tv.locator(".tv-dir-canal").count()) >= 2,
    `${await tv.locator(".tv-dir-canal").count()} canales`);
  check("Sin un índice de categorías por delante",
    (await tv.locator(".tv-fila.tv-carpeta").count()) === 0);
  check("Cada canal con su distintivo, que en una tele el número importa",
    (await tv.locator(".tv-dir-marca").first().innerText()).trim().length > 0 ||
      (await tv.locator(".tv-dir-marca img").count()) > 0);
  await tv.screenshot({ path: __dirname + "/93-tv-directo.png" });

  /* --- La cabecera viva del directo ---
     Una lista de nombres de canal no dice nada: con el mando, asomarse a uno
     y volver cuesta cuatro pulsaciones. */
  await tv.waitForSelector(".tv-dir-hero", { timeout: 20000 });
  check("El canal enfocado se enseña en grande, con lo que echan",
    (await tv.locator(".tv-dir-hero-t").innerText()).trim().length > 0,
    (await tv.locator(".tv-dir-hero-t").innerText()).replace(/\n/g, " "));
  /* El programa que está EN ANTENA, no el primero que mande el panel: el
     catálogo simulado empieza la guía en el bloque de la hora anterior, que
     es exactamente lo que hacen la mitad de los paneles de verdad */
  const conGuia = await tv
    .waitForFunction(
      () => (document.querySelector(".tv-dir-hero-t")?.textContent || "").includes("El programa siguiente"),
      { timeout: 20000 }
    )
    .then(() => true)
    .catch(() => false);
  check("Con lo que echan ahora, sin entrar a probar", conGuia,
    (await tv.locator(".tv-dir-hero-t").innerText()).replace(/\n/g, " "));
  check("Y no con el bloque que ya ha terminado",
    !(await tv.locator(".tv-dir-hero-t").innerText()).includes("Telediario"),
    (await tv.locator(".tv-dir-hero-t").innerText()).replace(/\n/g, " "));
  check("Y una barra que dice cuánto lleva", (await tv.locator(".tv-dir-hero-barra i").count()) === 1);
  check("Y lo que viene después, con su hora",
    (await tv.locator(".tv-dir-luego").innerText()).toUpperCase().includes("A CONTINUACIÓN"),
    (await tv.locator(".tv-dir-luego").innerText()).replace(/\n/g, " "));
  /* El puntero, a una esquina muerta, y el foco puesto a mano en el primer
     canal: en un navegador el ratón y el mando comparten el mismo foco, y
     con la pantalla todavía montándose lo que hay debajo del puntero quieto
     se lleva el foco él solo. En una tele no pasa —no hay puntero—, pero
     aquí falseaba la prueba del mando */
  await tv.locator(".tv-dir-canal").first().hover();
  await tv.mouse.move(2, 2);
  const canal1 = await tv.locator(".tv-dir-chip").innerText();
  await tv.keyboard.press("ArrowDown");
  await tv.waitForFunction(
    (antes) => (document.querySelector(".tv-dir-chip")?.textContent || "") !== antes,
    canal1,
    { timeout: 10000 }
  );
  check("La cabecera sigue al foco: al bajar, cambia de canal", true,
    `${canal1.replace(/\n/g, " ")} › ${(await tv.locator(".tv-dir-chip").innerText()).replace(/\n/g, " ")}`);

  /* Y las dos filas de la derecha, que es lo que hace de esto una pantalla
     de televisión y no una lista de nombres */
  const filasDir = (await tv.locator(".tv-dir-main .tv-carrusel-t").allInnerTexts())
    .map((t) => t.split("\n")[0].trim());
  check("Con «Carpetas» y «Canales destacados» a la derecha",
    filasDir.length === 2, filasDir.join(" | "));

  /* --- Cambiar de carpeta sin salir de la pantalla ---
     Era lo único que se hace aquí a menudo y lo único que no se podía hacer:
     costaba ir al índice completo, elegir y volver. */
  const cuantos = () => tv.locator(".tv-dir-canal").count();
  const todos = await cuantos();
  check("La primera fila de la derecha son las carpetas",
    (await tv.locator(".tv-chip-carpeta").count()) >= 2,
    (await tv.locator(".tv-chip-carpeta").allInnerTexts()).join(" | ").replace(/\n/g, " "));
  check("Con «Todos» marcada mientras no hay filtro",
    (await tv.locator(".tv-chip-carpeta.activa").innerText()).includes("Todos"));
  await tv.locator(".tv-chip-carpeta").nth(1).click();
  await tv.waitForFunction((n) => document.querySelectorAll(".tv-dir-canal").length < n, todos, { timeout: 15000 });
  check("Pulsar una carpeta filtra la lista, sin cambiar de pantalla",
    (await tv.locator(".tv-directo").count()) === 1 && (await cuantos()) < todos,
    `${await cuantos()} de ${todos} canales`);
  check("Y la cabecera de la lista dice en cuál estás",
    (await tv.locator(".tv-dir-cab h2").innerText()).trim() !== "Canales",
    (await tv.locator(".tv-dir-cab h2").innerText()).trim());
  /* Y «Todos» lo quita, que si no hay que salir para volver a verlo todo */
  await tv.locator(".tv-chip-carpeta").first().click();
  await tv.waitForFunction((n) => document.querySelectorAll(".tv-dir-canal").length === n, todos, { timeout: 15000 });
  check("Y «Todos» quita el filtro", (await cuantos()) === todos);

  /* --- El índice completo sigue estando, en su puerta ---
     La lista de la izquierda enseña lo que hay; un proveedor trae cuarenta
     categorías y miles de canales, y sin esta puerta el resto del catálogo
     dejaría de existir. */
  await tv.locator(".tv-dir-todos").click();
  await tv.waitForSelector(".tv-fila.tv-carpeta", { timeout: 20000 });
  check("«Ver todos los canales» lleva al índice de categorías",
    (await tv.locator(".tv-fila.tv-carpeta").count()) >= 1);

  /* El orden manda: las carpetas del directo salían como fueran llegando los
     canales, no como las tiene el proveedor en su panel */
  const cats = await fetch("http://127.0.0.1:8090/player_api.php?username=demo&password=demo123&action=get_live_categories").then((x) => x.json());
  const ordenPanel = cats.map((c) => c.category_name);
  // El nombre lleva detrás cuántos canales tiene: «Deportes (12)»
  const carpetas = (await tv.locator(".tv-fila-nombre").allInnerTexts()).map((t) => t.replace(/\s*\(\d+\)\s*$/, "").trim());
  check("Las carpetas del directo van en el orden del panel",
    JSON.stringify(carpetas) === JSON.stringify(ordenPanel),
    `${carpetas.join(" › ")}  (panel: ${ordenPanel.join(" › ")})`);
  check("Y ninguna carpeta vacía se cuela", !carpetas.includes("Sin carpeta"), carpetas.join(" | "));

  /* Y al abrir una, sus canales vuelven a la pantalla del directo: la
     categoría es un filtro que se pone encima, no otra pantalla */
  await tv.locator(".tv-fila.tv-carpeta").first().click();
  await tv.waitForSelector(".tv-dir-canal", { timeout: 20000 });
  check("Abrir una categoría filtra la lista, sin cambiar de pantalla",
    (await tv.locator(".tv-dir-cab h2").innerText()).trim() !== "Canales",
    (await tv.locator(".tv-dir-cab h2").innerText()).trim());
  /* Y ATRÁS deshace un paso cada vez, en el orden en que se entró: del
     filtro al índice, del índice al directo, y del directo al inicio */
  await tv.keyboard.press("Escape");
  await tv.waitForSelector(".tv-fila.tv-carpeta", { timeout: 15000 });
  check("ATRÁS quita el filtro y devuelve al índice del que se entró", true);
  await tv.keyboard.press("Escape");
  await tv.waitForSelector(".tv-dir-canal", { timeout: 15000 });
  check("Y del índice, otra vez a los canales", true);
  await tv.keyboard.press("Escape");
  await tv.waitForSelector(".tv-pestanas", { timeout: 15000 });
  check("Y de ahí, al inicio, sin pantallas de por medio", true);

  /* --- Volver al inicio y que sus botones sigan funcionando ---
     No funcionaban. Las acciones de cada tarjeta —qué hacer al pulsarla—
     vivían en una sola libreta, y entrar en Cine la reescribía entera: al
     volver al inicio, «En directo ahora» y «Series destacadas» ya no tenían
     acción y pulsarlas no hacía absolutamente nada. Las de películas sí,
     porque el identificador es el mismo y las acababa de escribir cine. Un
     fallo redondo, de los que se ven bien y no responden. */
  await tv.locator(".tv-pestana:has-text('Películas')").click();
  await tv.waitForSelector(".tv-carrusel", { timeout: 25000 });
  await tv.mouse.move(2, 2);
  await tv.keyboard.press("Escape");
  await tv.waitForSelector(".tv-pestanas", { timeout: 20000 });
  await tv.waitForSelector(".tv-tarjeta", { timeout: 20000 });
  for (const [i, cual] of [[0, "En directo ahora"], [1, "Series destacadas"]]) {
    const antes = await tv.evaluate(() => document.querySelector(".tv-app").className);
    await tv.locator(".tv-carrusel").nth(i).locator(".tv-tarjeta").first().click();
    const abrio = await tv
      .waitForFunction((q) => document.querySelector(".tv-app").className !== q, antes, { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    check(`Tras pasar por una sección, «${cual}» sigue abriendo`, abrio,
      await tv.evaluate(() => document.querySelector(".tv-app").className));
    /* De vuelta al inicio, que según lo que se haya abierto son uno o dos
       ATRÁS —del vídeo se sale a la lista de la que se entró— */
    for (let i = 0; i < 4 && !(await tv.locator(".tv-pestanas").count()); i++) {
      await tv.keyboard.press("Escape");
      await tv.waitForTimeout(900);
    }
    await tv.waitForSelector(".tv-pestanas", { timeout: 20000 });
    await tv.waitForSelector(".tv-tarjeta", { timeout: 20000 });
    await tv.mouse.move(2, 2);
  }

  /* --- La barra de secciones ---
     Pasar de las películas a las series eran dos ATRÁS y volver a recorrer
     el inicio con las flechas. Ahora las secciones están siempre arriba,
     como en cualquier aplicación de televisión. Estuvieron en un carril a la
     izquierda que había que abrir con ◀; se comía ancho por donde empieza a
     leerse la pantalla y obligaba a un gesto que no se parecía a nada. */
  await tv.locator(".tv-pestana:has-text('TV en directo')").click();
  await tv.waitForSelector(".tv-dir-canal", { timeout: 25000 });
  check("Las secciones están siempre arriba, todas",
    (await tv.locator(".tv-nav-item").count()) === 4 &&
      (await tv.locator(".tv-nav-salir").count()) === 1,
    (await tv.locator(".tv-nav-item").allInnerTexts()).join(" | "));
  check("Con la sección en la que estás marcada",
    (await tv.locator(".tv-nav-item.activo").innerText()).includes("Directo"));
  /* Cerrada enseña solo los iconos. Abierta todo el rato se lleva un trozo
     de pantalla para cinco palabras que uno se sabe de memoria a la segunda
     vez; el sitio es del contenido, que es a lo que se ha venido */
  const anchoNombre = () =>
    tv.evaluate(() => document.querySelector(".tv-nav-txt")?.getBoundingClientRect().width || 0);
  /* El ratón, sobre la lista de canales: en cualquier sitio menos la barra */
  await tv.locator(".tv-dir-canal").first().hover();
  await tv.waitForTimeout(500);
  check("La barra de secciones, cerrada: solo los iconos",
    !(await tv.locator(".tv-nav.abierta").count()) && (await anchoNombre()) < 1,
    `${Math.round(await anchoNombre())} px de nombre`);

  /* Y se abre al posar el ratón en ella, no en cada icono: puesto en los
     iconos, cruzar de «Directo» a «Series» la cerraba un instante antes de
     volver a abrirla y la barra parpadeaba */
  await tv.locator(".tv-nav-marca").hover();
  await tv.waitForTimeout(500);
  check("Y se abre con el ratón encima, aunque no sea sobre un icono",
    (await tv.locator(".tv-nav.abierta").count()) === 1 && (await anchoNombre()) > 10,
    `${Math.round(await anchoNombre())} px de nombre`);
  /* Y de vuelta a la lista, que es desde donde se sube con el mando */
  await tv.locator(".tv-dir-canal").first().hover();
  await tv.mouse.move(2, 700);
  await tv.waitForTimeout(400);

  await tv.keyboard.press("ArrowUp");
  check("▲ desde la primera fila sube a la barra",
    (await tv.locator(".tv-nav-item.foco").innerText()).replace(/\n/g, " ").includes("Directo"));
  check("Y subir con el mando también la abre",
    (await tv.locator(".tv-nav.abierta").count()) === 1);
  await tv.keyboard.press("ArrowRight");
  await tv.keyboard.press("Enter");
  await tv.waitForSelector(".tv-carrusel", { timeout: 25000 });
  check("Y un OK salta a Cine sin pasar por el inicio", true);
  await tv.keyboard.press("ArrowUp");
  await tv.keyboard.press("Escape");
  check("ATRÁS dentro de la barra solo sale de la barra, no de la sección",
    (await tv.locator(".tv-nav-item.foco").count()) === 0 && (await tv.locator(".tv-carrusel").count()) > 0);
  await tv.screenshot({ path: __dirname + "/92-tv-nav.png" });
  await tv.keyboard.press("Escape");
  await tv.waitForSelector(".tv-pestanas", { timeout: 15000 });

  /* --- El mando de cada fabricante ---
     Un televisor no manda «Escape»: Samsung manda el código 10009 y LG el
     461, y ninguno rellena e.key con nada reconocible. Sin traducirlos, el
     botón ATRÁS de esas teles no hacía absolutamente nada. */
  const pulsaCodigo = (codigo) =>
    tv.evaluate((c) => {
      window.dispatchEvent(new KeyboardEvent("keydown", { keyCode: c, which: c, bubbles: true, cancelable: true }));
    }, codigo);

  for (const [marca, codigo] of [["Samsung (Tizen)", 10009], ["LG (webOS)", 461]]) {
    await tv.locator(".tv-pestana:has-text('TV en directo')").click();
    await tv.waitForSelector(".tv-dir-canal", { timeout: 20000 });
    await pulsaCodigo(codigo);
    const volvio = await tv
      .waitForSelector(".tv-pestanas", { timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    check(`El ATRÁS del mando de ${marca} vuelve atrás`, volvio, `código ${codigo}`);
  }

  /* --- Cine y series abren en una portada, no en una lista de carpetas ---
     Entrar en «Películas» y encontrarse cuarenta nombres de carpeta obliga a
     saber en cuál buscar antes de poder mirar nada. */
  await tv.locator(".tv-pestana:has-text('Películas')").click();
  await tv.waitForSelector(".tv-carrusel", { timeout: 25000 });

  const rotulos = (await tv.locator(".tv-carrusel-t").allInnerTexts()).map((s) => s.trim());
  check("Cine abre en una portada de filas", rotulos.length >= 2, rotulos.join(" | "));
  check("Con «Mejor valoradas» la primera", rotulos[0] === "Mejor valoradas", rotulos[0]);
  check("Y «Añadidas recientemente» debajo, sin bajar a buscarla",
    rotulos[1] === "Añadidas recientemente", rotulos[1]);

  await tv.waitForSelector(".tv-banner", { timeout: 15000 });
  const titular = (await tv.locator(".tv-banner-t").innerText()).trim();
  check("Arriba, un banner con un título de verdad", titular.length > 0, titular);
  /* El caso que sacaba una comedia muda a media pantalla: la nota sola no
     vale de criterio, porque medio catálogo la trae puesta a 10 a mano */
  check("Que no es la película de 1928 con el 10 del proveedor",
    !titular.includes("Comedia Muda"), titular);
  /* La imagen del banner, sea cual sea: el fondo apaisado de TMDB si lo hay
     y la carátula del proveedor si no. Lo que no puede es no haber ninguna */
  check("Y cuya imagen ha cargado de verdad, no un hueco negro",
    await tv.evaluate(() => {
      const i = document.querySelector(".tv-banner-fondo, .tv-banner-arte");
      return Boolean(i && i.naturalWidth > 0);
    }));

  /* La fila de escaparate se limpia sola: «Sin Caratula» apunta a una imagen
     que no existe, que es lo que dejaba un cuadro gris en el puesto uno */
  await tv.waitForFunction(
    () => {
      const fila = document.querySelector(".tv-carrusel .tv-carrusel-tira");
      if (!fila) return false;
      return ![...fila.querySelectorAll(".tv-poster-nombre")].some((n) =>
        (n.textContent || "").includes("Sin Caratula")
      );
    },
    { timeout: 15000 }
  );
  const primeraFila = (await tv.locator(".tv-carrusel").first().locator(".tv-poster-nombre").allInnerTexts())
    .map((s) => s.trim());
  check("Sin cuadros grises: lo que no tiene carátula se cae del escaparate",
    !primeraFila.some((n) => n.includes("Sin Caratula")), primeraFila.slice(0, 4).join(" | "));
  check("Y sin el mismo título dos veces, aunque el proveedor le cuelgue un «4K»",
    primeraFila.includes("Estreno 1") && !primeraFila.includes("Estreno 1 4K"),
    primeraFila.slice(0, 4).join(" | "));
  check("Ni la de 1928 entre las mejor valoradas de los últimos años",
    !primeraFila.includes("Comedia Muda"), primeraFila.slice(0, 4).join(" | "));
  /* --- Lo que pone TMDB, que el panel no manda ---
     Un panel Xtream manda carátulas verticales y una nota puesta a mano. El
     fondo apaisado, la sinopsis en español y los géneros de verdad salen de
     TMDB, se piden una vez por título para toda la plataforma y se guardan.
     Sin clave configurada nada de esto existe y la portada sigue igual. */
  const conFondo = await tv
    .waitForSelector(".tv-banner-fondo", { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  check("El banner usa el fondo apaisado de TMDB, no la carátula estirada", conFondo);
  check("Y ese fondo carga de verdad",
    await tv.evaluate(() => {
      const i = document.querySelector(".tv-banner-fondo");
      return Boolean(i && i.naturalWidth > 0);
    }));
  const sinopsis = (await tv.locator(".tv-banner-sinopsis").innerText()).trim();
  check("La sinopsis es la de TMDB, en español", sinopsis.includes("Sinopsis de TMDB"), sinopsis.slice(0, 60));
  const datos = (await tv.locator(".tv-banner-datos").innerText()).trim();
  check("Y la nota y los géneros también", datos.includes("7.5") && datos.includes("Suspense"), datos);

  await tv.screenshot({ path: __dirname + "/52-tv-portada.png" });
  check("La primera fila va numerada, como cualquier ranking",
    (await tv.locator(".tv-carrusel").first().locator(".tv-poster-num").first().innerText()) === "1");

  // El mando: las flechas de lado recorren la fila, arriba y abajo cambian
  const enFoco = () => tv.evaluate(() => {
    const e = document.querySelector('[data-foco="1"]');
    return e ? `${e.dataset.fila ?? "banner"}:${e.dataset.col ?? "-"}` : "";
  });
  /* El ratón, fuera de la pantalla antes de tocar el mando: pasar por encima
     de una carátula también mueve el foco —que es lo que se quiere con un
     ratón— y aquí falsearía lo que hacen las flechas */
  await tv.mouse.move(2, 2);
  check("Al entrar, el foco está en el banner", (await enFoco()) === "-1:-", await enFoco());
  await tv.keyboard.press("ArrowDown");
  check("▼ baja del banner a la primera fila", (await enFoco()) === "0:0", await enFoco());
  await tv.keyboard.press("ArrowRight");
  check("▶ va a la carátula de al lado", (await enFoco()) === "0:1", await enFoco());
  await tv.keyboard.press("ArrowDown");
  check("Y ▼ cambia de fila sin perder la columna", (await enFoco()) === "1:1", await enFoco());

  await tv.keyboard.press("ArrowLeft");
  check("◀ vuelve a la carátula anterior, sin salirse de la fila",
    (await tv.locator(".tv-nav-item.foco").count()) === 0);
  /* Y a la barra de secciones se sube con ▲, que es donde está: subiendo
     fila a fila hasta el banner y una más */
  await tv.keyboard.press("ArrowUp");
  await tv.keyboard.press("ArrowUp");
  await tv.keyboard.press("ArrowUp");
  check("▲ desde lo más alto de la portada sube a la barra",
    (await tv.locator(".tv-nav-item.foco").count()) === 1);
  await tv.keyboard.press("Escape");

  // --- Y las carpetas siguen ahí, al final ---
  await tv.locator(".tv-vertodas").click();
  await tv.waitForSelector(".tv-fila.tv-carpeta", { timeout: 20000 });
  check("«Ver todas las carpetas» lleva al catálogo entero",
    (await tv.locator(".tv-fila.tv-carpeta").count()) > 0);
  await tv.locator(".tv-fila.tv-carpeta").first().click();
  await tv.waitForSelector(".tv-rejilla .tv-poster", { timeout: 20000 });
  check("Las películas salen en carátulas, no en lista", (await tv.locator(".tv-poster").count()) > 0);

  const caja = await tv.locator(".tv-poster-marco").first().boundingBox();
  check("Y la carátula es grande de verdad, y no un iconito",
    caja.height > 200 && caja.height > caja.width, `${Math.round(caja.width)}×${Math.round(caja.height)} px`);

  const enRejilla = await tv.evaluate(() => {
    const cel = [...document.querySelectorAll(".tv-rejilla [data-i]")];
    const arriba = cel[0].offsetTop;
    return { columnas: cel.filter((c) => c.offsetTop === arriba).length, total: cel.length };
  });
  check("Se pintan varias por fila, como una pared de cine",
    enRejilla.columnas > 1, `${enRejilla.columnas} por fila de ${enRejilla.total}`);

  // El mando, en una rejilla, no puede moverse como en una lista
  await tv.mouse.move(2, 2);
  const foco = () => tv.evaluate(() => [...document.querySelectorAll("[data-i]")].findIndex((e) => e.classList.contains("foco")));
  /* Se mide el movimiento, no la posición: el clic que entró en la carpeta
     deja el puntero encima de una carátula y pasar por encima también mueve
     el foco —que es lo que se quiere con un ratón—.

     Y hace falta una pulsación antes de tomar la medida: con el puntero
     apartado, el aro deja de pintarse a propósito, así que leer la clase
     justo después de `mouse.move` da −1 y no dónde está el foco. La primera
     tecla lo vuelve a encender donde estaba; desde ahí ya se mide el salto. */
  await tv.keyboard.press("ArrowRight");
  const partida = await foco();
  await tv.keyboard.press("ArrowRight");
  check("Mando: ▶ mueve a la carátula de al lado", (await foco()) === partida + 1,
    `de ${partida} a ${await foco()}`);
  await tv.keyboard.press("ArrowDown");
  check("Mando: ▼ baja una fila entera, sin salirse de la rejilla",
    (await foco()) === Math.min(enRejilla.total - 1, partida + 1 + enRejilla.columnas),
    `foco ${await foco()} de ${enRejilla.total}`);
  await tv.screenshot({ path: __dirname + "/91-tv-caratulas.png" });

  await tv.keyboard.press("Escape"); // de la carpeta, a la lista de carpetas
  await tv.waitForSelector(".tv-fila.tv-carpeta", { timeout: 15000 });
  await tv.keyboard.press("Escape"); // de las carpetas, a la portada
  await tv.waitForSelector(".tv-carrusel", { timeout: 15000 });
  check("Y ATRÁS deshace un paso cada vez: carpeta, carpetas, portada", true);
  await tv.keyboard.press("Escape");
  await tv.waitForSelector(".tv-pestanas", { timeout: 15000 });

  /* --- Series: la carátula abre su ficha, no una lista de episodios ---
     Una serie se abría en una columna con todas las temporadas seguidas
     —«T1 · E1», «T1 · E2»… hasta la séptima— y una película se ponía a
     reproducir en cuanto se pulsaba. En las dos faltaba lo mismo: de qué va
     el título antes de ponerlo. */
  await tv.locator(".tv-pestana:has-text('Series')").click();
  await tv.waitForSelector(".tv-carrusel", { timeout: 25000 });
  check("Las series también abren en portada", (await tv.locator(".tv-poster").count()) > 0);
  await tv.locator(".tv-carrusel .tv-poster").first().click();
  await tv.waitForSelector(".tv-ficha", { timeout: 20000 });
  check("Y su carátula abre la ficha, no una lista de episodios",
    (await tv.locator(".tv-ficha-t").innerText()).trim().length > 0,
    (await tv.locator(".tv-ficha-t").innerText()).trim());
  check("Con su sinopsis, para saber de qué va antes de ponerla",
    (await tv.locator(".tv-ficha-sinopsis").innerText()).trim().length > 0,
    (await tv.locator(".tv-ficha-sinopsis").innerText()).replace(/\n/g, " "));
  /* La ficha técnica, cada dato en su caja. En una línea con puntos todo
     pesa igual y no se distingue el año de la nota ni del género */
  const cajas = await tv.locator(".tv-ficha-dato").allInnerTexts();
  check("Con el año y las temporadas, cada dato en su caja",
    cajas.some((t) => /\d{4}/.test(t)) && cajas.some((t) => /temporada/i.test(t)),
    cajas.join(" | "));
  check("Y la nota aparte, que no es un dato de catálogo sino un juicio",
    (await tv.locator(".tv-ficha-nota").innerText()).trim().length > 0,
    (await tv.locator(".tv-ficha-nota").innerText()).replace(/\n/g, " "));
  /* De dónde vienes: sin esto la ficha aparece flotando y no se sabe si se
     llegó de una fila, de una carpeta o de una búsqueda */
  check("Y el camino de dónde vienes",
    (await tv.locator(".tv-ficha-camino").innerText()).includes("Series"),
    (await tv.locator(".tv-ficha-camino").innerText()).replace(/\n/g, " "));
  check("Con el género en su línea, junto al reparto y la dirección",
    (await tv.locator(".tv-ficha-credito").allInnerTexts()).some((t) => /Género/i.test(t)),
    (await tv.locator(".tv-ficha-credito").allInnerTexts()).join(" | ").replace(/\n/g, " "));
  /* La imagen ya no es un cartel en su caja: es el fondo de la pantalla, con
     el texto encima sobre el velo */
  check("Con la imagen de fondo a sangre, no un cartel en una caja",
    (await tv.locator(".tv-ficha-fondo, .tv-ficha-mancha").count()) === 1 &&
      (await tv.locator(".tv-ficha-cartel").count()) === 0);
  check("Con reparto y dirección, que el panel sí manda",
    (await tv.locator(".tv-ficha-credito").count()) >= 2,
    (await tv.locator(".tv-ficha-credito").allInnerTexts()).join(" | ").replace(/\n/g, " "));
  /* Las temporadas, en fila y no una detrás de otra: con siete temporadas,
     llegar a la última costaba doscientas pulsaciones hacia abajo */
  check("Las temporadas van en fila, cada una con lo suyo",
    (await tv.locator(".tv-ficha-temporada").count()) >= 1,
    (await tv.locator(".tv-ficha-temporada").allInnerTexts()).join(" | "));
  const epsFicha = await tv.locator(".tv-ficha-ep-t").allInnerTexts();
  check("Y debajo, los episodios de la temporada elegida", epsFicha.length >= 2, epsFicha.join(" | "));
  /* Un episodio se elige por lo que se ve, no por su número: eran una
     columna de títulos, y de un título no se decide nada */
  check("Cada episodio con su fotograma", (await tv.locator(".tv-ficha-ep-foto img").count()) >= 2);
  const duraciones = await tv.locator(".tv-ficha-ep-min").allInnerTexts();
  check("Y con cuánto dura, en minutos y de las dos formas que lo mandan",
    duraciones.length >= 2 && duraciones.every((d) => /^\d+ min$/.test(d.trim())),
    duraciones.join(" | "));
  check("Y una línea de qué pasa en él",
    (await tv.locator(".tv-ficha-ep-p").allInnerTexts()).some((t) => t.trim().length > 10));
  /* El mando: del botón a las temporadas, y de ahí a los episodios */
  /* El ratón deja el foco donde cayera el puntero al dibujarse la ficha
     —con el mando eso no pasa—, así que la navegación se prueba con el
     mando, que es como se usa esto de verdad */
  await tv.mouse.move(2, 2);
  await tv.keyboard.press("ArrowUp");
  await tv.keyboard.press("ArrowUp");
  check("Con el mando se sube hasta el botón de reproducir",
    (await tv.locator(".tv-ficha-ver.foco").count()) === 1);
  await tv.keyboard.press("ArrowDown");
  check("▼ baja del botón a las temporadas",
    (await tv.locator(".tv-ficha-temporada.foco").count()) === 1);
  await tv.keyboard.press("ArrowDown");
  check("Y otra vez, a los episodios",
    (await tv.locator(".tv-ficha-ep.foco").count()) === 1);
  /* En fila, así que el movimiento entre episodios es de lado */
  await tv.keyboard.press("ArrowRight");
  check("▶ dentro de los episodios pasa al siguiente",
    (await tv.locator(".tv-ficha-ep").nth(1).getAttribute("class")).includes("foco"));
  /* --- Mi lista ---
     Guardar para luego es lo que se hace con la mitad de lo que se ve en un
     catálogo de miles: se entra, no es el momento, y sin sitio donde
     apuntarlo hay que volver a buscarlo por el nombre. */
  await tv.keyboard.press("ArrowUp");
  await tv.keyboard.press("ArrowUp"); // de los episodios al botón de reproducir
  await tv.keyboard.press("ArrowRight"); // y de ahí a «Mi lista», que va al lado
  check("El mando llega al botón de guardar, al lado del de reproducir",
    (await tv.locator(".tv-ficha-guardar.foco").count()) === 1);
  await tv.keyboard.press("Enter");
  check("Y guardarlo se dice en el propio botón",
    (await tv.locator(".tv-ficha-guardar").innerText()).trim() === "En mi lista",
    (await tv.locator(".tv-ficha-guardar").innerText()).replace(/\n/g, " "));

  await tv.keyboard.press("Escape"); // de la ficha, a la portada de series
  await tv.waitForSelector(".tv-carrusel", { timeout: 15000 });
  check("Y ATRÁS vuelve a la portada de la que se entró", true);
  /* Y lo guardado sale arriba del todo: es la única fila de la portada que
     has elegido tú, el resto las decide el catálogo */
  const rotulosGuardados = await tv.locator(".tv-carrusel-t").allInnerTexts();
  check("Lo guardado abre la portada, en su propia fila",
    rotulosGuardados[0]?.trim() === "Mi lista", rotulosGuardados.slice(0, 3).join(" | "));
  check("Con el título que se guardó dentro",
    (await tv.locator(".tv-carrusel").first().locator(".tv-poster-nombre").first().innerText()).includes("Serie Demo"),
    await tv.locator(".tv-carrusel").first().locator(".tv-poster-nombre").first().innerText());
  /* Y se quita desde el mismo sitio: si guardar es un botón y quitar es ir a
     ajustes, la lista se llena y no se vacía nunca */
  await tv.locator(".tv-carrusel").first().locator(".tv-poster").first().click();
  await tv.waitForSelector(".tv-ficha-guardar", { timeout: 15000 });
  await tv.locator(".tv-ficha-guardar").click();
  check("Y se quita desde el mismo botón",
    (await tv.locator(".tv-ficha-guardar").innerText()).trim() === "Mi lista",
    (await tv.locator(".tv-ficha-guardar").innerText()).replace(/\n/g, " "));
  await tv.keyboard.press("Escape");
  await tv.waitForSelector(".tv-carrusel", { timeout: 15000 });
  check("Y la fila desaparece al quedarse vacía",
    (await tv.locator(".tv-carrusel-t").first().innerText()).trim() !== "Mi lista",
    (await tv.locator(".tv-carrusel-t").first().innerText()));
  /* El puntero, a una esquina muerta, antes de salir: al pintarse el inicio,
     lo que quede debajo del ratón quieto se lleva el foco él solo y la
     pestaña deja de estar encendida. En una tele no hay puntero */
  await tv.mouse.move(2, 2);
  await tv.keyboard.press("Escape"); // y de ahí, al menú
  await tv.waitForSelector(".tv-pestanas", { timeout: 15000 });
  check("Al volver a la portada, el foco queda en la sección de la que sales",
    (await tv.locator(".tv-pestana.foco").innerText()).includes("Series"),
    (await tv.locator(".tv-pestana.foco").innerText()).replace(/\n/g, " "));
  /* Se deja arriba del todo para lo que viene, y el ratón fuera: al volver
     del vídeo, «Seguir viendo» aparece encima de los accesos y se cuela
     justo debajo del puntero, que entonces mueve el foco él solo */
  await tv.locator(".tv-pestana").first().hover();
  await tv.mouse.move(2, 2);

  /* --- Poner un canal se ve al instante ---
     La dirección de un canal no la tiene el aparato: se le pide al servidor
     y este al panel del proveedor. Ese viaje se hacía ANTES de cambiar de
     pantalla, así que pulsabas OK y no pasaba nada —ni rótulo ni ruleta—
     hasta que el enlace llegaba. Con la lista todavía delante eso no parece
     «cargando», parece que el mando no ha respondido.
     Se simula un panel lento: el servidor tarda segundo y medio. */
  await tv.route("**/api/tele/ver", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await tv.keyboard.press("Enter");
  await esperarCanales(tv);
  await tv.locator(".tv-dir-canal").first().click();
  const alPulsar = Date.now();
  await tv.waitForSelector(".tv-viendo", { timeout: 6000 });
  const tardanza = Date.now() - alPulsar;
  check("La pantalla del canal aparece al pulsar, sin esperar al enlace",
    tardanza < 900, `${tardanza} ms con el panel tardando 1500`);
  check("Y mientras tanto dice con qué está conectando",
    (await tv.locator(".tv-viendo .pa-video-overlay").innerText()).includes("Conectando"),
    (await tv.locator(".tv-viendo .pa-video-overlay").innerText()).replace(/\n/g, " "));
  /* La guía del canal que acabas de poner, en el propio canal.
     Se borraba en el momento de entrar —la caché se vaciaba al cambiar de
     pantalla— y el rótulo decía «tu proveedor no manda la guía de este
     canal» justo del canal cuya guía se estaba leyendo en la lista un
     segundo antes. */
  check("Puesto el canal, se ve su guía y no un «no hay guía»",
    (await tv.locator(".tv-viendo-prog").innerText()).includes("El programa siguiente"),
    (await tv.locator(".tv-viendo-canal").innerText()).replace(/\n/g, " "));
  check("Con cuánto le queda y qué viene después",
    (await tv.locator(".tv-viendo-queda").innerText()).includes("quedan") &&
      (await tv.locator(".tv-viendo-luego").innerText()).includes("Después"),
    (await tv.locator(".tv-viendo-canal").innerText()).replace(/\n/g, " "));
  check("Y una barra que dice cuánto lleva", (await tv.locator(".tv-viendo-barra span").count()) === 1);
  /* Y si te sales antes de que llegue, el enlace que llega tarde no puede
     volver a abrir el vídeo él solo */
  await tv.keyboard.press("Escape");
  await tv.waitForSelector(".tv-dir-canal", { timeout: 15000 });
  await tv.waitForTimeout(2000);
  check("Saliendo antes de tiempo, el vídeo no vuelve solo",
    (await tv.locator(".tv-viendo").count()) === 0);
  await tv.unroute("**/api/tele/ver");
  await tv.mouse.move(2, 2);

  // --- Lo último visto, para volver con un solo OK ---
  /* Un solo ATRÁS: de los canales al inicio, sin índice de por medio */
  await tv.keyboard.press("Escape");
  await tv.waitForSelector(".tv-pestanas", { timeout: 15000 });
  await tv.keyboard.press("Enter");
  await esperarCanales(tv);
  /* El nombre del canal, sin el número que va delante en su propia casilla */
  const canal = (await tv.locator(".tv-dir-canal .tv-dir-nombre").first().innerText()).trim();
  await tv.locator(".tv-dir-canal").first().click();
  /* El ratón, fuera antes de volver: al salir del vídeo, «Seguir viendo»
     aparece justo donde quedó el puntero del clic y se enfoca él solo —que
     con un ratón es lo correcto, pero aquí falsea lo que hace el mando— */
  await tv.mouse.move(2, 2);
  await tv.waitForSelector(".tv-viendo", { timeout: 20000 });
  await tv.keyboard.press("Escape");
  await tv.keyboard.press("Escape");
  await tv.keyboard.press("Escape");
  await tv.waitForSelector(".tv-pestanas", { timeout: 15000 });
  check("Tras ver algo, la portada ofrece seguir viéndolo",
    await tv.locator(".tv-seguir").isVisible(), (await tv.locator(".tv-seguir").innerText()).replace(/\n/g, " "));
  check("Con el nombre de lo que se estaba viendo", (await tv.locator(".tv-seguir").innerText()).includes(canal), canal);
  await tv.screenshot({ path: __dirname + "/89-tv-seguir.png" });
  /* El ratón, otra vez fuera: el clic que puso el canal lo dejó donde ahora
     está «Seguir viendo», y desde ahí mueve el foco él solo */
  await tv.mouse.move(2, 2);

  // Y el mando llega hasta ahí: está por debajo de las pestañas
  await tv.keyboard.press("ArrowDown");
  check("El mando llega a «Seguir viendo»", (await tv.locator(".tv-seguir.foco").count()) === 1);
  await tv.keyboard.press("Enter");
  await tv.waitForSelector(".tv-viendo", { timeout: 20000 });
  check("Y con un OK vuelve a lo suyo", true);

  /* --- «Los que más ves» ---
     Es la única cuenta de lo más visto que se puede dar sin mentir: nadie
     nos dice qué ve el resto del mundo, así que se cuenta lo que pone este
     aparato. Aquí se comprueban las dos mitades: que poner un canal deja su
     raya, y que la portada la usa. */
  const rayas = await tv.evaluate(() => JSON.parse(localStorage.getItem("xp.tvVistos.v1") || "{}"));
  check("Poner un canal deja su raya en el aparato",
    Object.values(rayas).some((n) => n > 0), JSON.stringify(rayas));
  check("Y solo del directo: una película no cuenta",
    Object.keys(rayas).every((k) => k.startsWith("live-")), Object.keys(rayas).join(" | "));

  /* La raya se sigue contando, aunque de momento no la lea nadie: la fila
     «Los que más ves» vivía en la portada del directo, y esa portada ya no
     existe. El contador se deja porque el dato es del aparato y tirarlo
     sería empezar de cero el día que se ponga en la lista. */
  await tv.mouse.move(2, 2);

  // --- Encender sin red ---
  const sinRed = await ctx.newPage();
  /* La tele enciende antes que el wifi: la pregunta al servidor no llega.
     Antes salía la pantalla de activación a alguien activado hace meses. */
  await sinRed.route("**/api/customer/me", (route) => route.abort());
  await sinRed.goto(BASE + "/tv?app=1", { waitUntil: "domcontentloaded" });
  await sinRed.waitForSelector(".tv-pestanas", { timeout: 25000 });
  check("Sin red, entra igual con lo de la última vez", true);
  check("Y lo dice, en vez de disimular", await sinRed.locator(".tv-sinred").isVisible());
  check("Con su marca, no la genérica", (await sinRed.locator(".tv-marca").innerText()).toUpperCase().includes("TOTALFLIX"));
  await sinRed.screenshot({ path: __dirname + "/90-tv-sinred.png" });
  await sinRed.close();

  // Una tele que nunca se activó y tampoco tiene red: la activación, no un vacío
  const nueva = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  const pn = await nueva.newPage();
  await pn.route("**/api/customer/me", (route) => route.abort());
  await pn.goto(BASE + "/tv?app=1", { waitUntil: "domcontentloaded" });
  await pn.waitForSelector(".tv-activar", { timeout: 25000 });
  check("Una tele nueva sin red enseña la activación, no una pantalla en blanco", true);
  await nueva.close();

  // --- Lista propia contra la MAC, sin proveedor ---
  const macLibre = `AA:BB:CC:11:22:${(33 + (Date.now() % 60)).toString(16).padStart(2, "0").toUpperCase()}`;
  r = await call("/api/tv/lista", { method: "POST", body: JSON.stringify({ mac: macLibre, url: "http://127.0.0.1:8090/lista-grande.m3u", nombre: "MiLista" }) });
  check("Cualquiera puede cargar su lista contra su MAC", r.status === 200);
  r = await call(`/api/tv/mac?mac=${encodeURIComponent(macLibre)}`);
  check("Y la tele la recibe sin cuenta ni proveedor", r.body.estado === "lista" && r.body.lista?.url.includes("lista-grande"));
  r = await call("/api/tv/lista", { method: "POST", body: JSON.stringify({ mac: "NOESUNAMAC", url: "http://x.com/l.m3u" }) });
  check("Una MAC inválida se rechaza", r.status === 400);
  r = await call("/api/tv/lista", { method: "POST", body: JSON.stringify({ mac: macLibre, url: "no-es-una-url" }) });
  check("Y una dirección que no es URL, también", r.status === 400);
  r = await call(`/api/tv/lista?mac=${encodeURIComponent(macLibre)}`, { method: "DELETE" });
  check("La lista se puede borrar desde la web", r.status === 200);

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas de la tele OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 500)); process.exit(1); });
