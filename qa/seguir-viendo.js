// Continuar viendo: por dónde iba cada uno, guardado en la cuenta.
//
// Se prueba lo que de verdad tiene que pasar: que se apunte solo mientras
// se ve, que al volver a abrir la película empiece por donde se dejó, que
// la fila lo ofrezca con lo que queda, que un aparato distinto vea lo mismo
// —que es la razón de guardarlo en la cuenta y no en el aparato— y que lo
// terminado salga de la fila.
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
const ck = (sc, n) => { const m = sc?.match(new RegExp(`${n}=([^;]+)`)); return m ? m[1] : ""; };
const hay = (p, sel) => p.locator(sel).count().then((n) => n > 0);

(async () => {
  const RUN = Date.now().toString(36).slice(-5);

  /* ---------- La ruta, primero: es donde vive la regla ---------- */
  let r = await call("/api/provider/auth", { method: "POST", body: JSON.stringify({ action: "register", email: `sv${RUN}@t.com`, password: "supersecreta1", company: "TotalFLIX" }) });
  const prov = `xp_provider=${ck(r.setCookie, "xp_provider")}`;
  const dom = await call("/api/provider/domains", { method: "POST", body: JSON.stringify({ host: "127.0.0.1", port: 8090 }) }, prov);
  const U = `sv${RUN}`;
  await call("/api/provider/customers", {
    method: "POST",
    body: JSON.stringify({ username: U, password: "clave1234", domainId: dom.body.domain.id, playlistUsername: "demo", playlistPassword: "demo123", maxDevices: 5 }),
  }, prov);
  r = await call("/api/customer/login", { method: "POST", body: JSON.stringify({ username: U, password: "clave1234", deviceKey: `salon-${RUN}` }) });
  const cli = ck(r.setCookie, "xp_customer");
  const sesion = `xp_customer=${cli}`;

  r = await call("/api/vistos", {}, sesion);
  check("Una cuenta nueva no tiene nada a medias", (r.body.vistos || []).length === 0);

  /*
   * Diez segundos de una película de dos horas no es haberla empezado.
   *
   * Sin este suelo, «seguir viendo» se llena de cosas que solo se rozaron
   * al mirar qué eran, y deja de servir para lo que está.
   */
  r = await call("/api/vistos", { method: "POST", body: JSON.stringify({ llave: "l1:vod:1", titulo: "Rozada", segundo: 10, duracion: 7200 }) }, sesion);
  check("Rozar algo diez segundos no cuenta como haberlo empezado", r.body.guardado === false);
  check("Y no sale en la lista", ((await call("/api/vistos", {}, sesion)).body.vistos || []).length === 0);

  await call("/api/vistos", { method: "POST", body: JSON.stringify({ llave: "l1:vod:1", titulo: "A medias", segundo: 1800, duracion: 7200 }) }, sesion);
  r = await call("/api/vistos", {}, sesion);
  check("Media hora de dos horas sí cuenta", r.body.vistos.length === 1 && r.body.vistos[0].segundo === 1800,
    JSON.stringify(r.body.vistos[0] || {}).slice(0, 90));
  check("Y no está dada por terminada", r.body.vistos[0].acabado === false);

  /* Volver a apuntar la misma cosa la actualiza, no la duplica */
  await call("/api/vistos", { method: "POST", body: JSON.stringify({ llave: "l1:vod:1", titulo: "A medias", segundo: 2400, duracion: 7200 }) }, sesion);
  r = await call("/api/vistos", {}, sesion);
  check("Seguir viéndola mueve el punto, no crea otra entrada",
    r.body.vistos.length === 1 && r.body.vistos[0].segundo === 2400, `${r.body.vistos.length} entradas`);

  /* Los créditos no son «a medias» */
  await call("/api/vistos", { method: "POST", body: JSON.stringify({ llave: "l1:vod:2", titulo: "Terminada", segundo: 7100, duracion: 7200 }) }, sesion);
  r = await call("/api/vistos", {}, sesion);
  const terminada = r.body.vistos.find((v) => v.llave === "l1:vod:2");
  check("Lo que va por los créditos se da por terminado", terminada?.acabado === true);

  /*
   * Y lo de un cliente no es lo de otro.
   *
   * Es lo que hace que esto pueda vivir en la cuenta: si el historial se
   * escapara de una cuenta a otra, sería peor que no tenerlo.
   */
  await call("/api/provider/customers", {
    method: "POST",
    body: JSON.stringify({ username: `${U}b`, password: "clave1234", domainId: dom.body.domain.id, playlistUsername: "demo", playlistPassword: "demo123", maxDevices: 5 }),
  }, prov);
  r = await call("/api/customer/login", { method: "POST", body: JSON.stringify({ username: `${U}b`, password: "clave1234", deviceKey: `otro-${RUN}` }) });
  const otro = `xp_customer=${ck(r.setCookie, "xp_customer")}`;
  check("El historial de un cliente no lo ve otro",
    ((await call("/api/vistos", {}, otro)).body.vistos || []).length === 0);
  check("Y sin sesión no hay historial ninguno",
    ((await call("/api/vistos")).body.vistos || []).length === 0);

  /*
   * Otro aparato del MISMO cliente sí lo ve. Es la razón de todo esto: la
   * tele del salón y el móvil son la misma persona, y una serie se empieza
   * en uno y se sigue en el otro.
   */
  r = await call("/api/customer/login", { method: "POST", body: JSON.stringify({ username: U, password: "clave1234", deviceKey: `movil-${RUN}` }) });
  const enElMovil = `xp_customer=${ck(r.setCookie, "xp_customer")}`;
  r = await call("/api/vistos", {}, enElMovil);
  check("Lo empezado en la tele se ve desde el móvil, que es de lo que se trata",
    (r.body.vistos || []).some((v) => v.llave === "l1:vod:1" && v.segundo === 2400),
    `${(r.body.vistos || []).length} apuntes`);

  /* Y se puede quitar de la fila */
  await call("/api/vistos?llave=l1:vod:1", { method: "DELETE" }, sesion);
  check("Quitar algo de «seguir viendo» lo quita",
    !((await call("/api/vistos", {}, sesion)).body.vistos || []).some((v) => v.llave === "l1:vod:1"));

  /* ---------- Y ahora, viéndolo de verdad ---------- */
  const b = await chromium.launch({ ...ejecutable, args: ["--autoplay-policy=no-user-gesture-required"] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const fallos = [];
  p.on("pageerror", (e) => fallos.push(String(e).slice(0, 160)));

  await p.goto(BASE + "/player", { waitUntil: "networkidle" });
  await p.waitForSelector(".pa-welcome", { timeout: 20000 });
  await p.locator(".pa-welcome button:has-text('propia lista')").click();
  await p.waitForSelector(".modal");
  await p.fill("#pl-name", "Casa");
  await p.fill("#pl-host", "http://127.0.0.1:8090");
  await p.fill("#pl-user", "demo");
  await p.fill("#pl-pass", "demo123");
  await p.click(".modal button[type=submit]");
  await p.waitForSelector(".section-gate, .pa-rail", { timeout: 30000 });
  if (await hay(p, ".section-gate")) await p.locator(".section-card").first().click();
  await p.waitForTimeout(3000);

  await p.locator(".pa-rail-item:has-text('Cine')").first().click();
  await p.waitForTimeout(2500);
  const cual = await p.locator(".pa-card").first().getAttribute("title");
  await p.locator(".pa-card").first().click();
  await p.waitForTimeout(2500);
  await p.locator("button:has-text('Reproducir')").first().click();
  await p.waitForFunction(() => { const v = document.querySelector("video"); return v && v.currentTime > 0.2; }, { timeout: 30000 });

  /* Se deja a mitad: el vídeo de pruebas dura seis segundos, así que tres
     son la mitad justa y están por encima del suelo del 3% */
  await p.evaluate(async () => {
    const v = document.querySelector("video");
    v.currentTime = 3;
    await new Promise((r) => setTimeout(r, 800));
    v.pause();
  });
  await p.waitForTimeout(1200);

  /*
   * En el aparato, que es donde le toca a este.
   *
   * Quien se pega su propia lista no tiene cuenta —esa es la gracia de la
   * web pública—, así que aquí no hay servidor donde guardar nada. Lo de la
   * cuenta se ha probado arriba, contra la ruta.
   */
  const guardado = Object.values(
    await p.evaluate(() => JSON.parse(localStorage.getItem("xp.vistos.v1") || "{}"))
  );
  check("Parar a mitad de una película la apunta",
    guardado.length === 1 && guardado[0].segundo >= 2 && guardado[0].segundo <= 4,
    JSON.stringify(guardado[0] || {}).slice(0, 110));
  check("Con su título y su carátula, para poder pintarla luego",
    guardado[0]?.titulo === cual, `${guardado[0]?.titulo} vs ${cual}`);

  /* Se sale y se vuelve a abrir la misma: tiene que arrancar donde se dejó */
  await p.mouse.move(720, 460);
  await p.locator(".pa-osd-btn[aria-label='Volver']").click();
  await p.waitForSelector(".pa-video-zone", { state: "detached", timeout: 15000 }).catch(() => {});
  await p.keyboard.press("Escape");
  await p.waitForTimeout(1200);

  check("Y aparece la fila de «seguir viendo»", await hay(p, ".pa-seguir"));
  const enLaFila = await p.locator(".pa-seguir .pa-card").first().innerText();
  check("Con lo que queda escrito, que es lo que se pregunta",
    /quedan?\s+\d+\s+min/i.test(enLaFila), enLaFila.replace(/\n/g, " · "));
  check("Y con la barra de cuánto llevas sobre la carátula",
    await hay(p, ".pa-seguir .pa-avance-barra"));

  await p.locator(".pa-seguir .pa-card").first().click();
  await p.waitForFunction(() => { const v = document.querySelector("video"); return v && v.currentTime > 0; }, { timeout: 30000 });
  await p.waitForTimeout(1500);
  const retomado = await p.evaluate(() => document.querySelector("video").currentTime);
  check("Y al volver a ponerla arranca por donde se dejó, no desde el principio",
    retomado >= 2, `${retomado.toFixed(1)}s`);

  /*
   * Y sobrevive a cerrar y volver a abrir.
   *
   * Es la prueba de que esto sirve para algo: guardado solo en memoria, la
   * fila desaparecería al recargar, que es justo cuando hace falta.
   */
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForSelector(".section-gate, .pa-rail", { timeout: 30000 });
  if (await hay(p, ".section-gate")) await p.locator(".section-card:has-text('Películas')").click();
  await p.waitForTimeout(3500);
  check("Y sigue ahí al cerrar y volver a abrir", await hay(p, ".pa-seguir"));

  /*
   * Y la tele lo ve.
   *
   * Es la razón entera de que esto viva en la cuenta y no en el aparato:
   * empiezas una película en el móvil y el televisor del salón te ofrece
   * seguirla. Se comprueba con la sesión del cliente de proveedor, que es
   * quien tiene cuenta y quien enciende las dos cosas.
   */
  {
    await call("/api/vistos", {
      method: "POST",
      body: JSON.stringify({
        llave: "tv:vod:400", titulo: "Dejada a medias", clase: "movie", idStream: "400",
        extension: "webm", segundo: 1500, duracion: 3600,
      }),
    }, sesion);

    const ctxTv = await b.newContext({ viewport: { width: 1920, height: 1080 } });
    await ctxTv.addCookies([{ name: "xp_customer", value: cli, domain: "localhost", path: "/" }]);
    const tv = await ctxTv.newPage();
    await tv.goto(BASE + "/tv?app=1", { waitUntil: "networkidle" });
    await tv.waitForSelector(".tv-carrusel, .tv-perfil", { timeout: 40000 });
    if (await hay(tv, ".tv-perfil")) {
      await tv.locator(".tv-perfil").first().click();
      await tv.waitForSelector(".tv-carrusel", { timeout: 40000 });
    }
    await tv.waitForTimeout(2500);
    const boton = await tv.locator(".tv-seguir").innerText().catch(() => "");
    check("La tele ofrece seguir con lo que se dejó a medias en el móvil",
      boton.includes("Dejada a medias"), boton.replace(/\n/g, " · ") || "no hay botón");
    check("Y dice cuánto queda, que es lo que se pregunta",
      /quedan?\s+\d+\s+min/i.test(boton), boton.replace(/\n/g, " · "));
    await ctxTv.close();
  }

  check("Sin errores de JavaScript por el camino", fallos.length === 0, fallos[0] || "");

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas de «seguir viendo» OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
