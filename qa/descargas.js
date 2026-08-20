/*
 * Descargas para ver sin conexión.
 *
 * La web no descarga nada: se lo pide al envoltorio nativo —la aplicación de
 * Fire TV, la de Android, el programa de Windows— a través de `TPDescargas`.
 * Aquí se pone un envoltorio de mentira que hace lo mismo que hacen ellos:
 * acepta el encargo, va subiendo el porcentaje y acaba diciendo que ya está.
 *
 * Lo que se prueba es lo que ve el cliente: que el botón solo aparece donde
 * se puede guardar, que lo que se pulsa empieza a bajar, que la pantalla de
 * descargas cuenta en qué va, y que quitarlo lo quita de verdad. Que el
 * fichero acabe en el disco es cosa de cada envoltorio y se prueba allí.
 */
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
 * El envoltorio de mentira.
 *
 * Es a propósito idéntico de tonto a los de verdad: recibe texto, devuelve
 * texto, y no sabe nada de la web. Si esto se pudiera hacer más listo, el
 * puente estaría mal diseñado —el de Android no puede pasar objetos—.
 */
const ENVOLTORIO = () => {
  const cosas = [];
  window.TPDescargas = {
    bajar(encargo) {
      const e = JSON.parse(encargo);
      const suyo = { ...e, estado: "bajando", parte: 0, bytes: 0, url: "" };
      cosas.push(suyo);
      const reloj = setInterval(() => {
        suyo.parte += 20;
        if (suyo.parte >= 100) {
          suyo.parte = 100;
          suyo.estado = "lista";
          suyo.bytes = 1610612736;
          suyo.url = e.url;
          clearInterval(reloj);
        }
      }, 250);
    },
    quitar(id) {
      const i = cosas.findIndex((c) => c.id === id);
      if (i >= 0) cosas.splice(i, 1);
    },
    lista() {
      return JSON.stringify(cosas);
    },
  };
};

(async () => {
  const RUN = Date.now().toString(36).slice(-5);
  const U = `des${RUN}`;

  let r = await call("/api/provider/auth", { method: "POST", body: JSON.stringify({ action: "register", email: `des${RUN}@t.com`, password: "supersecreta1" }) });
  const prov = ck(r.setCookie, "xp_provider");
  const dom = await call("/api/provider/domains", { method: "POST", body: JSON.stringify({ host: "127.0.0.1", port: 8090 }) }, prov);
  await call("/api/provider/customers", {
    method: "POST",
    body: JSON.stringify({ username: U, password: "clave1234", domainId: dom.body.domain.id, playlistUsername: "demo", playlistPassword: "demo123", maxDevices: 5 }),
  }, prov);

  const b = await chromium.launch({ ...ejecutable });

  // --- Primero, sin envoltorio: un navegador no puede guardar nada ---
  const soloWeb = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  const w = await soloWeb.newPage();
  await w.goto(BASE + "/tv?app=1", { waitUntil: "networkidle" });
  await w.locator(".tv-boton:has-text('Entrar con usuario')").click();
  await w.fill("input[name=usuario]", U);
  await w.fill("input[name=password]", "clave1234");
  await w.locator(".tv-boton:has-text('Entrar')").first().click();
  await w.waitForSelector(".tv-tiles", { timeout: 25000 });
  /* Y no se dice «tu dispositivo no es compatible», que es una forma cara de
     no hacer nada: si no se puede, no se enseña */
  check("Sin envoltorio no hay acceso a descargas en la portada",
    (await w.locator(".tv-tile:has-text('Descargas')").count()) === 0,
    (await w.locator(".tv-tile").allInnerTexts()).join(" | ").replace(/\n/g, " "));
  await w.locator(".tv-tile:has-text('Películas')").click();
  await w.waitForSelector(".tv-poster", { timeout: 25000 });
  await w.locator(".tv-poster").first().click();
  await w.waitForSelector(".tv-ficha-ver", { timeout: 20000 });
  check("Ni botón de descargar en la ficha",
    (await w.locator(".tv-ficha-guardar:has-text('Descargar')").count()) === 0);
  await soloWeb.close();

  // --- Y ahora con envoltorio, que es una Fire TV o el programa de Windows ---
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.addInitScript(ENVOLTORIO);
  const tv = await ctx.newPage();
  tv.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));

  await tv.goto(BASE + "/tv?app=1", { waitUntil: "networkidle" });
  await tv.locator(".tv-boton:has-text('Entrar con usuario')").click();
  await tv.fill("input[name=usuario]", U);
  await tv.fill("input[name=password]", "clave1234");
  await tv.locator(".tv-boton:has-text('Entrar')").first().click();
  await tv.waitForSelector(".tv-tiles", { timeout: 25000 });
  check("Con envoltorio, «Descargas» sí está en la portada",
    (await tv.locator(".tv-tile:has-text('Descargas')").count()) === 1,
    (await tv.locator(".tv-tile").allInnerTexts()).join(" | ").replace(/\n/g, " "));

  // La película, y su botón
  await tv.locator(".tv-tile:has-text('Películas')").click();
  await tv.waitForSelector(".tv-poster", { timeout: 25000 });
  await tv.locator(".tv-poster").first().click();
  await tv.waitForSelector(".tv-ficha-ver", { timeout: 20000 });
  const nombreFicha = await tv.locator(".tv-ficha-t").innerText();
  check("La ficha de una película ofrece descargarla",
    (await tv.locator(".tv-ficha-guardar:has-text('Descargar')").count()) === 1);
  await tv.locator(".tv-ficha-guardar:has-text('Descargar')").click();
  /* El botón cuenta en qué va sin salir de la ficha: si hay que ir a otra
     pantalla a comprobar que ha empezado, parece que no ha pasado nada */
  await tv.waitForFunction(
    () => /Bajando|Quitar del aparato/.test(
      [...document.querySelectorAll(".tv-ficha-guardar")].map((x) => x.innerText).join(" ")
    ),
    { timeout: 15000 }
  );
  check("Y el propio botón dice en qué va", true,
    (await tv.locator(".tv-ficha-guardar").last().innerText()).replace(/\n/g, " "));

  // La pantalla de descargas, desde el carril. La ficha ocupa la pantalla
  // entera y no lleva carril: se sale con ATRÁS, como en el mando
  await tv.keyboard.press("Escape");
  await tv.waitForSelector(".tv-carril-item", { timeout: 20000 });
  await tv.locator(".tv-carril-item:has-text('Descargas')").click();
  await tv.waitForSelector(".tv-bajadas", { timeout: 20000 });
  check("La pantalla de descargas enseña lo que hay",
    (await tv.locator(".tv-bajada").count()) === 1);
  check("Con el nombre de lo que se guardó",
    (await tv.locator(".tv-bajada-nombre").innerText()).includes(nombreFicha.trim()),
    await tv.locator(".tv-bajada-nombre").innerText());
  /* Y cuenta sola: el envoltorio no avisa, se le pregunta cada segundo y
     medio mientras haya algo bajando */
  await tv.waitForFunction(
    () => /En este aparato/.test(document.querySelector(".tv-bajada-estado")?.innerText || ""),
    { timeout: 20000 }
  );
  const estado = await tv.locator(".tv-bajada-estado").innerText();
  check("Al terminar lo dice, y dice cuánto ocupa",
    estado.includes("En este aparato") && /GB|MB/.test(estado), estado);

  // El mando: fila abajo, papelera a la derecha
  await tv.mouse.move(2, 2);
  await tv.keyboard.press("ArrowRight");
  check("▶ lleva de la ficha a la papelera, en la misma fila",
    (await tv.locator(".tv-bajada-quitar.foco").count()) === 1);
  await tv.keyboard.press("Enter");
  await tv.waitForFunction(() => document.querySelectorAll(".tv-bajada").length === 0, { timeout: 10000 });
  check("Y quitarlo lo quita del aparato", true);
  check("Con la pantalla vacía diciendo dónde se guardan",
    (await tv.locator(".tv-bajadas").innerText()).includes("botón de descargar"),
    (await tv.locator(".tv-bajadas").innerText()).replace(/\n/g, " ").slice(0, 90));

  // Un episodio de una serie: lo que se guarda es el episodio, no la serie
  await tv.locator(".tv-carril-item:has-text('Series')").click();
  await tv.waitForSelector(".tv-poster", { timeout: 25000 });
  await tv.locator(".tv-poster").first().click();
  await tv.waitForSelector(".tv-ficha-ep", { timeout: 20000 });
  check("En una serie el botón habla de episodios, no de la serie entera",
    (await tv.locator(".tv-ficha-guardar:has-text('Descargar episodio')").count()) === 1);
  await tv.locator(".tv-ficha-guardar:has-text('Descargar episodio')").click();
  await tv.keyboard.press("Escape");
  await tv.waitForSelector(".tv-carril-item", { timeout: 20000 });
  await tv.locator(".tv-carril-item:has-text('Descargas')").click();
  await tv.waitForSelector(".tv-bajada", { timeout: 20000 });
  check("Y lo guardado es un episodio, con su número",
    /·\s*\d/.test(await tv.locator(".tv-bajada-nombre").innerText()),
    await tv.locator(".tv-bajada-nombre").innerText());

  await tv.screenshot({ path: __dirname + "/94-tv-descargas.png" });

  await b.close();
  const fallan = results.filter((x) => !x).length;
  console.log(`\n${results.length - fallan}/${results.length} pruebas de descargas OK`);
  process.exit(fallan ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
