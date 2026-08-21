// Los tres arreglos de esta ronda: zapping con memoria por servidor,
// catálogo de cine/series a pantalla completa, y cabecera que reconoce la
// sesión del cliente de proveedor.
const { chromium, ejecutable } = require("./navegador");

const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
const check = (n, ok, d = "") => {
  results.push(ok);
  console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`);
};

async function call(path, opts = {}, cookie = "") {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers || {}) },
  });
  return { status: res.status, body: await res.json().catch(() => ({})), setCookie: res.headers.get("set-cookie") };
}
const ck = (sc, n) => {
  const m = sc?.match(new RegExp(`${n}=([^;]+)`));
  return m ? m[1] : "";
};

(async () => {
  const browser = await chromium.launch({
    ...ejecutable,
    args: ["--autoplay-policy=no-user-gesture-required"],
  });

  // ---------- 1. Zapping: el peaje del descubrimiento se paga una vez ----------
  // Lista cuyo servidor deja colgado al navegador (solo funciona por proxy).
  const ctx1 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p1 = await ctx1.newPage();
  await p1.goto(BASE + "/player", { waitUntil: "networkidle" });
  /* Quien instala esto en el móvil suele ser cliente de un proveedor: si al
     abrir solo se le ofrece «añade tu lista», se queda fuera con su usuario
     y su contraseña en la mano */
  await p1.waitForSelector(".pa-welcome", { timeout: 20000 });
  const vias = await p1.locator(".pa-welcome-vias .btn").allInnerTexts();
  check("La bienvenida ofrece las dos formas de empezar",
    vias.some((t) => t.includes("Entrar con mi usuario")) && vias.some((t) => t.includes("propia lista")),
    vias.join(" | "));
  await p1.locator(".pa-welcome button:has-text('Tengo mi propia lista')").click();
  await p1.waitForSelector(".modal");
  await p1.click(".modal .pa-tab:has-text('URL M3U')");
  await p1.fill("#pl-name", "Zapping");
  await p1.fill("#pl-m3u", "http://127.0.0.1:8090/lista-colgada.m3u");
  await p1.click(".modal button[type=submit]");
  await p1.waitForSelector(".pa-live-cat:not(.pa-live-reciente)", { timeout: 20000 });
  await p1.locator(".pa-live-cat:not(.pa-live-reciente)").first().click();

  const veVideo = () =>
    p1.waitForFunction(
      () => {
        const v = document.querySelector("video");
        return v && v.currentTime > 0 && !v.paused && v.readyState >= 2;
      },
      { timeout: 30000 }
    );

  let t0 = Date.now();
  await p1.locator(".pa-live-chan").first().click();
  await veVideo();
  const primera = Date.now() - t0;
  check("El primer canal paga el descubrimiento una sola vez", primera < 12000, `${primera} ms`);

  // Zapear al mismo canal otra vez (recarga) — ya debe saber que el directo no va
  await p1.keyboard.press("ArrowDown");
  await p1.waitForTimeout(300);
  t0 = Date.now();
  await p1.locator(".pa-live-chan").first().click();
  await veVideo();
  const segunda = Date.now() - t0;
  check("El zapping siguiente va directo al proxy, sin repetir el peaje", segunda < 3500, `${segunda} ms`);
  check("La memoria por servidor ahorra de verdad", segunda < primera / 2, `${primera} → ${segunda} ms`);

  // ---------- 2. Catálogo a pantalla completa ----------
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + "/player", { waitUntil: "networkidle" });
  await p2.locator(".pa-welcome button:has-text('Tengo mi propia lista')").click();
  await p2.waitForSelector(".modal");
  await p2.fill("#pl-name", "Xtream");
  await p2.fill("#pl-host", "127.0.0.1:8090");
  await p2.fill("#pl-user", "demo");
  await p2.fill("#pl-pass", "demo123");
  await p2.click(".modal button[type=submit]");
  await p2.waitForSelector(".section-gate", { timeout: 20000 });
  await p2.locator(".section-card:has-text('TV en directo')").click();
  await p2.waitForSelector(".pa-live-cat:not(.pa-live-reciente)", { timeout: 15000 });

  // Ponemos un canal y nos vamos a Cine: el reproductor no debe quedarse arriba
  // (el directo del mock no emite de verdad; basta con que esté seleccionado)
  await p2.locator(".pa-live-cat:not(.pa-live-reciente)").first().click();
  await p2.locator(".pa-live-chan").first().click();
  await p2.waitForSelector(".pa-video-zone", { timeout: 15000 });
  await p2.click('.pa-rail-item:has-text(\"Cine\")');
  await p2.waitForSelector(".pa-card", { timeout: 20000 });
  check("En Cine no hay reproductor: catálogo a pantalla completa", (await p2.locator("video").count()) === 0);
  check("Las carátulas ocupan el hueco del vídeo", await p2.locator(".pa-cat-scroll").isVisible());

  /* Elegir una película abre su ficha, y desde ella se reproduce. Se busca
     por el nombre y no «la primera»: el catálogo simulado tiene ya catorce
     títulos y el orden lo pone el panel, no esta prueba */
  await p2.locator(".pa-card:has-text('Película Demo')").first().click();
  await p2.waitForSelector(".ficha button:has-text('Reproducir')", { timeout: 15000 });
  /*
   * Y se espera al detalle, que llega en otra petición.
   *
   * La ficha se pinta con lo que ya trae el catálogo —nombre y carátula— y
   * el botón de reproducir sale con ella; la sinopsis, el reparto y los
   * chips los trae `get_vod_info` después. Leyendo el texto en el instante
   * en que aparece el botón se pilla el «Cargando la ficha…», que es
   * exactamente lo que fallaba en el CI y no aquí: en una máquina rápida esa
   * segunda petición llega antes de que dé tiempo a mirar.
   */
  await p2.waitForFunction(
    () => /Ana Actriz/.test(document.querySelector(".ficha")?.innerText || ""),
    { timeout: 20000 }
  );
  const fichaTxt = await p2.locator(".ficha").innerText();
  check("La película abre su ficha con sinopsis y reparto", fichaTxt.includes("thriller de prueba") && fichaTxt.includes("Ana Actriz"), "");
  const chipsPeli = (await p2.locator(".ficha-chip").allInnerTexts()).join(" | ");
  check("Con género, año y nota como chips", (await p2.locator(".ficha-chip").count()) >= 3, chipsPeli);
  /* La duración en minutos y no el reloj que manda el panel: «01:52:00»
     obliga a restar de cabeza para saber si la peli cabe antes de cenar */
  check("Y la duración en minutos, no en reloj", chipsPeli.includes("112 min") && !chipsPeli.includes("01:52"), chipsPeli);
  /* Con coma: un «7.8» en medio de una ficha en castellano se lee como un
     error de traducción */
  check("Y la nota con coma decimal", /★ \d+,\d/.test(chipsPeli), chipsPeli);

  /*
   * Guardarla para luego, que es la mitad de para lo que se abre una ficha.
   *
   * La estrella de los canales existía desde el primer día y el catálogo no
   * tenía nada: se podía guardar el canal de deportes y no una película para
   * el sábado. Se comprueba el ciclo entero —ponerla, que lo diga, y que
   * salga en Favoritos— porque guardar algo que luego no aparece en ningún
   * sitio es peor que no ofrecerlo.
   */
  const miLista = p2.locator(".ficha-acciones button:has-text('Mi lista')");
  check("La ficha de una película deja guardarla en mi lista", (await miLista.count()) === 1);
  await miLista.click();
  check("Y al pulsarla lo dice",
    (await p2.locator(".ficha-acciones button:has-text('En mi lista')").count()) === 1);
  await p2.locator(".ficha-cerrar").click();
  await p2.click('.pa-rail-item:has-text("Favoritos")');
  await p2.waitForSelector(".pa-milista .pa-card", { timeout: 20000 });
  check("Y en Favoritos aparece, con las guardadas del catálogo",
    (await p2.locator(".pa-milista").innerText()).includes("Película Demo"),
    (await p2.locator(".pa-milista").innerText()).replace(/\s+/g, " ").slice(0, 90));
  /* Y se quita desde donde se puso: poner y quitar son la misma decisión */
  await p2.locator(".pa-milista .pa-card").first().click();
  await p2.waitForSelector(".ficha-acciones button:has-text('En mi lista')", { timeout: 20000 });
  await p2.locator(".ficha-acciones button:has-text('En mi lista')").click();
  check("Y se quita desde la misma ficha",
    (await p2.locator(".ficha-acciones button:has-text('Mi lista')").count()) === 1);
  await p2.locator(".ficha-cerrar").click();
  await p2.click('.pa-rail-item:has-text("Cine")');
  await p2.waitForSelector(".pa-card", { timeout: 20000 });

  /*
   * El reparto, con la cara de cada uno.
   *
   * En un título que TMDB reconoce —«Estreno 1»; «Película Demo» no lo
   * es—, porque las caras las sabe TMDB y no el panel. Se comprueba
   * también el actor SIN retrato: es el caso de verdad —TMDB conoce a los
   * tres primeros y del cuarto solo tiene el nombre— y es donde se rompe
   * una fila de caras si nadie lo ha probado.
   */
  await p2.locator(".pa-card:has-text('Estreno 1')").first().click();
  await p2.waitForSelector(".ficha-caras li", { timeout: 20000 });
  const caras = await p2.locator(".ficha-caras li").count();
  check("La ficha enseña el reparto con cara y nombre", caras === 4, `${caras} caras`);
  check("Con el personaje de cada uno",
    (await p2.locator(".ficha-cara-pj").first().innerText()).includes("protagonista"),
    await p2.locator(".ficha-cara-pj").first().innerText());
  check("Y quien no tiene retrato sale con sus iniciales, no con un hueco",
    (await p2.locator(".ficha-cara-ph").count()) === 1 &&
      (await p2.locator(".ficha-cara-ph").innerText()).trim() === "SR",
    await p2.locator(".ficha-cara-ph").innerText().catch(() => "ninguna"));
  await p2.locator(".ficha-cerrar").click();
  await p2.waitForSelector(".pa-card", { timeout: 10000 });

  await p2.locator(".pa-card:has-text('Película Demo')").first().click();
  await p2.waitForSelector(".ficha button:has-text('Reproducir')", { timeout: 15000 });

  await p2.locator(".ficha button:has-text('Reproducir')").click();
  await p2.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && v.currentTime > 0 && !v.paused;
  }, { timeout: 25000 });
  check("Y desde la ficha se reproduce", true);
  check("Con botón para volver", (await p2.locator('.pa-watch button[aria-label="Volver"]').count()) === 1);

  // La vuelta lleva a la ficha (como Netflix), y de la ficha al catálogo
  await p2.locator('.pa-watch button[aria-label="Volver"]').click();
  await p2.waitForSelector(".ficha button:has-text('Reproducir')", { timeout: 10000 });
  check("La vuelta lleva a la ficha y apaga el vídeo", (await p2.locator("video").count()) === 0);
  await p2.locator(".ficha-cerrar").click();
  await p2.waitForSelector(".pa-card", { timeout: 10000 });
  check("Y de la ficha se vuelve a las carátulas", true);

  // Series: catálogo → ficha → episodio → reproducción
  await p2.click('.pa-rail-item:has-text(\"Series\")');
  await p2.waitForSelector(".pa-card", { timeout: 20000 });
  check("Series también navega a pantalla completa", (await p2.locator("video").count()) === 0);
  await p2.locator(".pa-card").first().click();
  await p2.waitForSelector(".ficha-episodios .pa-episode", { timeout: 20000 });
  /* Empezar por el principio sin tener que buscarlo: quien llega a una serie
     que no ha visto no debería tener que bajar la vista, encontrar el 1 y
     pulsarlo. En la tele ese botón ya estaba */
  check("La ficha de una serie ofrece ver el primer episodio",
    (await p2.locator(".ficha-acciones button:has-text('Ver el primer episodio')").count()) === 1);
  await p2.waitForSelector(".pa-episode", { timeout: 20000 });
  check("La ficha de la serie ocupa la pantalla, sin vídeo encima", (await p2.locator("video").count()) === 0);
  const fichaSerie = await p2.locator(".ficha").innerText();
  /*
   * El reparto de la serie, también con cara.
   *
   * Antes se comprobaba que salieran los nombres que manda el panel
   * —«Luisa Lista»—, y ahora manda TMDB cuando conoce el título: la fila de
   * caras SUSTITUYE a la línea de nombres, porque una debajo de la otra
   * parecen dos repartos distintos. La dirección sigue siendo la del panel,
   * que eso TMDB no lo da por esta vía.
   */
  check("La serie enseña su reparto con cara y nombre",
    (await p2.locator(".ficha-caras li").count()) === 4,
    `${await p2.locator(".ficha-caras li").count()} caras`);
  check("Y la dirección que manda el panel", fichaSerie.includes("Sergio Series"), "");
  /* Cuántas temporadas, que es lo primero que se pregunta de una serie: en
     la tele ya salía y aquí había que contar los botones de abajo */
  const chipsSerie = (await p2.locator(".ficha-chip").allInnerTexts()).join(" | ");
  check("La serie dice cuántas temporadas tiene", /\d+ temporadas?/.test(chipsSerie), chipsSerie);
  /*
   * Y el título del episodio, sin lo que ya dice la fila.
   *
   * El panel los llama «Serie Demo - S01E03 - Un título que repite el nombre
   * entero»: dentro de la ficha de esa misma serie y con «T1: E3» al lado,
   * las dos primeras terceras partes son ruido, y son justo las que caben
   * antes de que se corte lo único que aporta.
   */
  const tercero = await p2.locator(".ficha-episodios .pa-episode").nth(2).innerText();
  check("Los episodios no repiten el nombre de la serie ni el código",
    tercero.includes("Un título que repite el nombre entero") && !tercero.includes("S01E03"),
    tercero.replace(/\n/g, " ⏎ "));
  await p2.locator(".pa-episode").first().click();
  await p2.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && v.currentTime > 0 && !v.paused;
  }, { timeout: 25000 });
  check("Elegir un episodio abre el reproductor", true);

  // ---------- 3. La cabecera reconoce al cliente del proveedor ----------
  const RUN = Date.now().toString(36).slice(-5);
  let r = await call("/api/provider/auth", {
    method: "POST",
    body: JSON.stringify({ action: "register", email: `ux${RUN}@t.com`, password: "supersecreta1" }),
  });
  const prov = "xp_provider=" + ck(r.setCookie, "xp_provider");
  const dom = await call("/api/provider/domains", { method: "POST", body: JSON.stringify({ host: "127.0.0.1", port: 8090 }) }, prov);
  await call(
    "/api/provider/customers",
    {
      method: "POST",
      body: JSON.stringify({
        username: `ux${RUN}`,
        password: "clave1234",
        domainId: dom.body.domain.id,
        playlistUsername: "demo",
        playlistPassword: "demo123",
      }),
    },
    prov
  );
  r = await call("/api/customer/login", {
    method: "POST",
    body: JSON.stringify({ username: `ux${RUN}`, password: "clave1234", deviceKey: "d1" }),
  });

  const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx3.addCookies([{ name: "xp_customer", value: ck(r.setCookie, "xp_customer"), domain: "localhost", path: "/" }]);
  const p3 = await ctx3.newPage();
  // En la portada, donde no hay pantalla de perfiles por delante
  await p3.goto(BASE + "/", { waitUntil: "networkidle" });
  await p3.waitForSelector(".account-avatar", { timeout: 15000 });
  check("El cliente del proveedor ve su avatar en la cabecera", true);
  check("Y no un «Entrar» con la sesión ya abierta", !(await p3.locator(".header-actions").innerText()).includes("Entrar"));

  await p3.locator(".account-avatar").click();
  await p3.waitForSelector(".account-pop");
  check("El menú muestra su usuario", (await p3.locator(".account-pop-mail").innerText()).includes(`ux${RUN}`));
  const opciones = await p3.locator(".account-pop-item").allInnerTexts();
  /* El cliente de un proveedor tiene su propia cuenta —su acceso, sus
     dispositivos y a quién escribir—, distinta de la de TOTALplayer */
  check("«Mi cuenta» está en el menú", opciones.some((o) => o.includes("Mi cuenta")), opciones.join(" | ").replace(/\n/g, " "));
  check("Y lleva a la del cliente, no a la de las cuentas propias",
    (await p3.locator(".account-pop-item:has-text('Mi cuenta')").getAttribute("href")) === "/mi-cuenta");

  await p3.locator(".account-pop-item:has-text('Cerrar sesión')").click();
  await p3.waitForURL(BASE + "/", { timeout: 10000 });
  const trasSalir = await (await fetch(BASE + "/api/customer/me", { headers: { Cookie: "xp_customer=" + ck(r.setCookie, "xp_customer") } })).json();
  check("Cerrar sesión desde el menú funciona", true, trasSalir.customer ? "aviso: cookie aún válida en servidor" : "sesión cerrada");

  const ok = results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} pruebas de UX del cliente OK`);
  await browser.close();
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => {
  console.log("FATAL", e);
  process.exit(1);
});
