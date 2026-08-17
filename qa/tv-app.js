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
async function abrirPrimeraCarpeta(tv) {
  await tv.waitForSelector(".tv-fila.tv-carpeta", { timeout: 20000 });
  await tv.locator(".tv-fila.tv-carpeta").first().click();
  await tv.waitForSelector(".tv-fila:not(.tv-carpeta)", { timeout: 20000 });
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
  await tv.waitForSelector(".tv-tiles", { timeout: 25000 });
  check("Se puede entrar con usuario desde la propia tele", true);

  const tiles = await tv.locator(".tv-tile").allInnerTexts();
  check("Portada con cuatro accesos y nada más", tiles.length === 4, tiles.join(" | ").replace(/\n/g, " "));
  check("Con la marca del proveedor", (await tv.locator(".tv-marca").innerText()).toUpperCase().includes("TOTALFLIX"));
  check("Y la MAC a la vista", (await tv.locator(".tv-pie-mac").innerText()).includes(":"));
  check("Sin cabecera de la web ni menús", !(await tv.locator(".site-header").isVisible().catch(() => false)));

  // --- El mando ---
  await tv.keyboard.press("ArrowDown");
  check("Las flechas mueven el foco", (await tv.locator(".tv-tile.foco").innerText()).includes("Películas"));
  await tv.keyboard.press("ArrowUp");
  await tv.keyboard.press("Enter");

  /* --- El directo abre en la lista, no en una portada de carátulas ---
     Tuvo su portada, con banner y tarjetas apaisadas, copiada de la de cine.
     En cine funciona: una película se elige por el cartel. Un canal no tiene
     cartel, tiene un logotipo cuadrado que estirado queda como una mancha,
     así que la portada gastaba media pantalla en imágenes que no dicen nada
     y dejaba ocho canales a la vista donde caben veinte. */
  await tv.waitForSelector(".tv-fila", { timeout: 25000 });
  check("TV en directo abre en la lista, sin portada de carátulas",
    (await tv.locator(".tv-carrusel").count()) === 0);
  check("Con las carpetas en filas, que es como se lee una guía",
    (await tv.locator(".tv-fila.tv-carpeta").count()) >= 1);
  await tv.screenshot({ path: __dirname + "/93-tv-directo.png" });

  check("OK entra en TV en directo y lista lo que hay", (await tv.locator(".tv-fila").count()) >= 2);
  check("Empezando por carpetas, no por miles de canales", (await tv.locator(".tv-fila.tv-carpeta").count()) >= 1);

  await tv.keyboard.press("Enter");
  await tv.waitForFunction(() => document.querySelectorAll(".tv-fila:not(.tv-carpeta)").length > 0, { timeout: 20000 });
  check("Al abrir una carpeta salen sus canales", (await tv.locator(".tv-fila:not(.tv-carpeta)").count()) >= 1);
  check("Numerados, que en una tele el número importa", /001/.test(await tv.locator(".tv-fila").first().innerText()));
  /* --- La cabecera viva del directo ---
     Una lista de nombres de canal no dice nada: con el mando, asomarse a uno
     y volver cuesta cuatro pulsaciones. */
  await tv.waitForSelector(".tv-ahora", { timeout: 20000 });
  check("El directo enseña el canal enfocado en grande",
    (await tv.locator(".tv-ahora-canal").innerText()).trim().length > 0,
    (await tv.locator(".tv-ahora-canal").innerText()).replace(/\n/g, " "));
  /* El programa que está EN ANTENA, no el primero que mande el panel: el
     catálogo simulado empieza la guía en el bloque de la hora anterior, que
     es exactamente lo que hacen la mitad de los paneles de verdad */
  const conGuia = await tv
    .waitForFunction(
      () => (document.querySelector(".tv-ahora-prog")?.textContent || "").includes("El programa siguiente"),
      { timeout: 20000 }
    )
    .then(() => true)
    .catch(() => false);
  check("Con lo que echan ahora, sin entrar a probar", conGuia,
    (await tv.locator(".tv-ahora-prog").innerText()).replace(/\n/g, " "));
  check("Y no con el bloque que ya ha terminado",
    !(await tv.locator(".tv-ahora-prog").innerText()).includes("Telediario"),
    (await tv.locator(".tv-ahora-prog").innerText()).replace(/\n/g, " "));
  check("Y una barra que dice cuánto lleva", (await tv.locator(".tv-ahora-barra span").count()) === 1);
  check("Y lo que viene después", (await tv.locator(".tv-ahora-luego").innerText()).includes("Después"),
    (await tv.locator(".tv-ahora-luego").innerText()).replace(/\n/g, " "));
  await tv.keyboard.press("ArrowDown");
  await tv.waitForTimeout(300);
  check("La cabecera sigue al foco: al bajar, cambia de canal",
    (await tv.locator(".tv-ahora-canal").innerText()).trim().length > 0);

  await tv.keyboard.press("Escape");
  await tv.waitForSelector(".tv-fila.tv-carpeta", { timeout: 15000 });
  check("ATRÁS vuelve a las carpetas", true);

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
  /* ATRÁS deshace un paso cada vez, y ahora los pasos del directo son dos y
     no tres: de los canales a sus carpetas, y de las carpetas al menú. Sin
     portada intermedia no hay nada entre medias que deshacer */
  await tv.keyboard.press("Escape");
  await tv.waitForSelector(".tv-tiles", { timeout: 15000 });
  check("Y de las carpetas, al menú, sin portada de por medio", true);

  /* --- El carril de secciones ---
     Pasar de las películas a las series eran dos ATRÁS y volver a recorrer
     la portada con las flechas. Ahora las secciones están siempre a la
     izquierda, como en cualquier aplicación de televisión. */
  await tv.locator(".tv-tile:has-text('TV en directo')").click();
  await tv.waitForSelector(".tv-fila.tv-carpeta", { timeout: 25000 });
  check("Las listas traen el carril de secciones", (await tv.locator(".tv-carril-item").count()) === 5);
  check("Con la sección en la que estás marcada",
    (await tv.locator(".tv-carril-item.activo").innerText()).includes("Directo"));
  await tv.keyboard.press("ArrowLeft");
  check("◀ desde la primera columna entra en el carril",
    (await tv.locator(".tv-carril-item.foco").innerText()).replace(/\n/g, " ").includes("Directo"));
  await tv.keyboard.press("ArrowDown");
  await tv.keyboard.press("Enter");
  await tv.waitForSelector(".tv-carrusel", { timeout: 25000 });
  check("Y un OK salta a Cine sin pasar por la portada", true);
  await tv.keyboard.press("ArrowLeft");
  await tv.keyboard.press("Escape");
  check("ATRÁS dentro del carril solo sale del carril, no de la sección",
    (await tv.locator(".tv-carril-item.foco").count()) === 0 && (await tv.locator(".tv-carrusel").count()) > 0);
  await tv.screenshot({ path: __dirname + "/92-tv-carril.png" });
  await tv.keyboard.press("Escape");
  await tv.waitForSelector(".tv-tiles", { timeout: 15000 });

  /* --- El mando de cada fabricante ---
     Un televisor no manda «Escape»: Samsung manda el código 10009 y LG el
     461, y ninguno rellena e.key con nada reconocible. Sin traducirlos, el
     botón ATRÁS de esas teles no hacía absolutamente nada. */
  const pulsaCodigo = (codigo) =>
    tv.evaluate((c) => {
      window.dispatchEvent(new KeyboardEvent("keydown", { keyCode: c, which: c, bubbles: true, cancelable: true }));
    }, codigo);

  for (const [marca, codigo] of [["Samsung (Tizen)", 10009], ["LG (webOS)", 461]]) {
    await tv.locator(".tv-tile:has-text('TV en directo')").click();
    await tv.waitForSelector(".tv-fila.tv-carpeta", { timeout: 20000 });
    await pulsaCodigo(codigo);
    const volvio = await tv
      .waitForSelector(".tv-tiles", { timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    check(`El ATRÁS del mando de ${marca} vuelve atrás`, volvio, `código ${codigo}`);
  }

  /* --- Cine y series abren en una portada, no en una lista de carpetas ---
     Entrar en «Películas» y encontrarse cuarenta nombres de carpeta obliga a
     saber en cuál buscar antes de poder mirar nada. */
  await tv.locator(".tv-tile:has-text('Películas')").click();
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
  check("◀ en la columna 0 no sale al carril todavía", (await tv.locator(".tv-carril-item.foco").count()) === 0);
  await tv.keyboard.press("ArrowLeft");
  check("Pero pegado al borde, sí", (await tv.locator(".tv-carril-item.foco").count()) === 1);
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
     el foco —que es lo que se quiere con un ratón— */
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
  await tv.waitForSelector(".tv-tiles", { timeout: 15000 });

  // --- Series: lo mismo, y la carátula abre los episodios ---
  await tv.locator(".tv-tile:has-text('Series')").click();
  await tv.waitForSelector(".tv-carrusel", { timeout: 25000 });
  check("Las series también abren en portada", (await tv.locator(".tv-poster").count()) > 0);
  await tv.locator(".tv-carrusel .tv-poster").first().click();
  await tv.waitForSelector(".tv-fila", { timeout: 20000 });
  check("Y su carátula lleva directa a los episodios",
    (await tv.locator(".tv-poster").count()) === 0,
    (await tv.locator(".tv-fila-nombre").allInnerTexts()).slice(0, 2).join(" | "));
  await tv.keyboard.press("Escape"); // de los episodios, a la portada de series
  await tv.waitForSelector(".tv-carrusel", { timeout: 15000 });
  await tv.keyboard.press("Escape"); // y de ahí, al menú
  await tv.waitForSelector(".tv-tiles", { timeout: 15000 });
  check("Al volver a la portada, el foco queda en la sección de la que sales",
    (await tv.locator(".tv-tile.foco").innerText()).includes("Series"),
    (await tv.locator(".tv-tile.foco").innerText()).replace(/\n/g, " "));
  /* Se deja arriba del todo para lo que viene, y el ratón fuera: al volver
     del vídeo, «Seguir viendo» aparece encima de los accesos y se cuela
     justo debajo del puntero, que entonces mueve el foco él solo */
  await tv.locator(".tv-tile").first().hover();
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
  await abrirPrimeraCarpeta(tv);
  await tv.locator(".tv-fila:not(.tv-carpeta)").first().click();
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
  await tv.waitForSelector(".tv-fila:not(.tv-carpeta)", { timeout: 15000 });
  await tv.waitForTimeout(2000);
  check("Saliendo antes de tiempo, el vídeo no vuelve solo",
    (await tv.locator(".tv-viendo").count()) === 0);
  await tv.unroute("**/api/tele/ver");
  await tv.mouse.move(2, 2);

  // --- Lo último visto, para volver con un solo OK ---
  /* Dos ATRÁS: de los canales a sus carpetas, y de las carpetas al menú */
  await tv.keyboard.press("Escape");
  await tv.waitForSelector(".tv-fila.tv-carpeta", { timeout: 15000 });
  await tv.keyboard.press("Escape");
  await tv.waitForSelector(".tv-tiles", { timeout: 15000 });
  await tv.keyboard.press("Enter");
  await abrirPrimeraCarpeta(tv);
  /* El nombre de la fila, sin el número que va delante en su propia casilla */
  const canal = (await tv.locator(".tv-fila:not(.tv-carpeta) .tv-fila-nombre").first().innerText()).trim();
  await tv.locator(".tv-fila:not(.tv-carpeta)").first().click();
  /* El ratón, fuera antes de volver: al salir del vídeo, «Seguir viendo»
     aparece justo donde quedó el puntero del clic y se enfoca él solo —que
     con un ratón es lo correcto, pero aquí falsea lo que hace el mando— */
  await tv.mouse.move(2, 2);
  await tv.waitForSelector(".tv-viendo", { timeout: 20000 });
  await tv.keyboard.press("Escape");
  await tv.keyboard.press("Escape");
  await tv.keyboard.press("Escape");
  await tv.waitForSelector(".tv-tiles", { timeout: 15000 });
  check("Tras ver algo, la portada ofrece seguir viéndolo",
    await tv.locator(".tv-seguir").isVisible(), (await tv.locator(".tv-seguir").innerText()).replace(/\n/g, " "));
  check("Con el nombre de lo que se estaba viendo", (await tv.locator(".tv-seguir").innerText()).includes(canal), canal);
  await tv.screenshot({ path: __dirname + "/89-tv-seguir.png" });
  /* El ratón, otra vez fuera: el clic que puso el canal lo dejó donde ahora
     está «Seguir viendo», y desde ahí mueve el foco él solo */
  await tv.mouse.move(2, 2);

  // Y el mando llega hasta ahí: está por encima de los cuatro accesos
  await tv.keyboard.press("ArrowUp");
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
  await sinRed.waitForSelector(".tv-tiles", { timeout: 25000 });
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
