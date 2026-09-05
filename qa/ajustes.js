// Ajustes: lo que el cliente puede arreglar sin llamar a nadie.
//
// Los cuatro bloques salen de cuatro llamadas al proveedor: el idioma que se
// eligió mal y no se podía deshacer, lo que uno lleva visto y no quiere en la
// pantalla de inicio, el cupo de aparatos —la llamada más frecuente que
// recibe un proveedor— y el «no se ve nada» que nadie sabía de quién era.
//
// Se comprueba lo que hacen, no cómo se ven: que el idioma se olvide de
// verdad, que el historial se borre en el servidor, que cerrar un aparato
// libere su sitio y que el veredicto de la conexión diga algo que un cliente
// pueda leerle a su proveedor por teléfono.
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

  /* Un proveedor, un cliente suyo y dos aparatos ocupando su cupo */
  let r = await call("/api/provider/auth", {
    method: "POST",
    body: JSON.stringify({ action: "register", email: `aj${RUN}@t.com`, password: "supersecreta1", company: "TotalFLIX" }),
  });
  const prov = `xp_provider=${ck(r.setCookie, "xp_provider")}`;
  const dom = await call("/api/provider/domains", { method: "POST", body: JSON.stringify({ host: "127.0.0.1", port: 8090 }) }, prov);
  const U = `aj${RUN}`;
  await call("/api/provider/customers", {
    method: "POST",
    body: JSON.stringify({
      username: U, password: "clave1234", domainId: dom.body.domain.id,
      playlistUsername: "demo", playlistPassword: "demo123", maxDevices: 3,
    }),
  }, prov);

  const entrar = (deviceKey, platform) =>
    call("/api/customer/login", { method: "POST", body: JSON.stringify({ username: U, password: "clave1234", deviceKey, platform }) });

  await entrar(`pueblo-${RUN}`, "tv");
  r = await entrar(`salon-${RUN}`, "web");
  const sesion = `xp_customer=${ck(r.setCookie, "xp_customer")}`;

  /* ---------- Lo que se puede hacer desde la ruta ---------- */
  r = await call("/api/customer/cuenta", {}, sesion);
  check("La cuenta dice qué aparatos tiene", (r.body.dispositivos || []).length === 2, `${(r.body.dispositivos || []).length}`);
  check("Y cada uno con su llave, que es lo que hay que mandar para cerrarlo",
    (r.body.dispositivos || []).every((d) => d.llave), JSON.stringify(r.body.dispositivos?.[0] || {}));

  const elDelPueblo = r.body.dispositivos.find((d) => d.llave === `pueblo-${RUN}`);
  r = await call(`/api/customer/cuenta?llave=${encodeURIComponent(elDelPueblo.llave)}`, { method: "DELETE" }, sesion);
  check("El cliente cierra su propio aparato, sin llamar a nadie", r.status === 200, r.body.error || "");
  r = await call("/api/customer/cuenta", {}, sesion);
  check("Y su sitio queda libre", (r.body.dispositivos || []).length === 1);

  /* Lo que no puede es cerrar el de otro: la llave se inventa el aparato y
     probar llaves a mano es exactamente lo que hay que impedir */
  r = await call("/api/customer/cuenta?llave=ajeno-de-otro", { method: "DELETE" }, sesion);
  check("Pero no puede cerrar uno que no es suyo", r.status === 403, `${r.status}`);
  r = await call("/api/customer/cuenta?llave=", { method: "DELETE" }, sesion);
  check("Y sin decir cuál, no cierra nada", r.status === 400);
  r = await call("/api/customer/cuenta?llave=lo-que-sea", { method: "DELETE" });
  check("Sin sesión, tampoco", r.status === 401);

  /* El historial entero, que es lo que se pide desde Ajustes */
  await call("/api/vistos", {
    method: "POST",
    body: JSON.stringify({ llave: "aj:vod:1", titulo: "Una peli", clase: "movie", idStream: "1", segundo: 600, duracion: 3600 }),
  }, sesion);
  await call("/api/vistos", {
    method: "POST",
    body: JSON.stringify({ llave: "aj:vod:2", titulo: "Otra peli", clase: "movie", idStream: "2", segundo: 900, duracion: 3600 }),
  }, sesion);
  r = await call("/api/vistos", {}, sesion);
  check("Se apunta por dónde va cada cosa", (r.body.vistos || []).length === 2, `${(r.body.vistos || []).length}`);
  r = await call("/api/vistos?todo=1", { method: "DELETE" }, sesion);
  check("Y se puede borrar todo de una vez", r.status === 200 && r.body.todo === true);
  r = await call("/api/vistos", {}, sesion);
  check("Sin dejar nada detrás", (r.body.vistos || []).length === 0, `${(r.body.vistos || []).length}`);

  /* Y el veredicto de la conexión, que es lo que el cliente le lee por
     teléfono a su proveedor. El simulado contesta, así que tiene que decir
     que por nuestro lado todo bien */
  r = await call("/api/diag/proveedor", { method: "POST", body: "{}" }, sesion);
  check("La comprobación de conexión contesta", r.status === 200);
  check("Con una frase en cristiano, no con un código",
    typeof r.body.veredicto === "string" && r.body.veredicto.length > 40, String(r.body.veredicto).slice(0, 90));
  check("Y sin decir la dirección del proveedor, que es lo que se protege",
    !/127\.0\.0\.1|8090|player_api|http/i.test(r.body.veredicto || ""), r.body.veredicto);
  r = await call("/api/diag/proveedor", { method: "POST", body: "{}" });
  check("Sin sesión no se puede sondear nada", r.status === 401);

  /* ---------- Y en pantalla ---------- */
  const b = await chromium.launch({ ...ejecutable });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  /* El valor entero: una galleta cifrada acaba en «=» y partiendo por el
     primer «=» se entrega media */
  await ctx.addCookies([{ name: "xp_customer", value: sesion.slice("xp_customer=".length), url: BASE }]);
  const p = await ctx.newPage();
  const fallos = [];
  p.on("pageerror", (e) => fallos.push(String(e).slice(0, 160)));

  /* Dentro de la aplicación: en un navegador de a pie el cliente ve el
     cartel de las aplicaciones y no el reproductor. Ver lib/envoltorio.ts */
  await p.goto(BASE + "/player?app=1", { waitUntil: "networkidle" });
  /* Lo primero que sale es quién está viendo: es una cuenta de proveedor y
     tiene perfiles. Ver components/player/ProfileGate.tsx */
  await p.waitForSelector(".profile-item, .pa-rail, .section-gate", { timeout: 30000 });
  if (await hay(p, ".profile-item")) {
    await p.locator(".profile-item").first().click();
    await p.waitForSelector(".pa-rail, .section-gate", { timeout: 30000 });
  }
  /* Y la portada, que tapa el carril mientras está abierta */
  if (await hay(p, ".section-gate")) {
    await p.locator(".section-card").first().click();
    await p.waitForSelector(".section-gate", { state: "detached", timeout: 15000 }).catch(() => {});
  }
  /* El idioma que se recuerda: se pone a mano, que es lo que deja escrito
     el reproductor al elegirlo */
  await p.evaluate(() => localStorage.setItem("xp.idiomaAudio.v1", "Español"));

  await p.locator('[aria-label="Ajustes"]:visible').first().click();
  await p.waitForSelector(".pa-ajustes", { timeout: 15000 });
  check("Los ajustes se abren desde el carril", true);

  const bloques = await p.locator(".ajustes-bloque h3").allInnerTexts();
  check("Y llevan idioma, historial, aparatos y conexión",
    ["Idioma", "Seguir viendo", "Aparatos", "Conexión"].every((t) => bloques.some((b2) => b2.includes(t))),
    bloques.join(" | "));

  check("El idioma recordado se ve", (await p.locator(".ajustes-dato").innerText()).includes("Español"));
  await p.locator("button:has-text('Olvidar y volver a preguntar')").click();
  await p.waitForTimeout(300);
  check("Y se olvida de verdad, no solo en la pantalla",
    (await p.evaluate(() => localStorage.getItem("xp.idiomaAudio.v1"))) === null);

  await p.waitForSelector(".ajustes-aparatos li", { timeout: 15000 });
  const cuantos = await p.locator(".ajustes-aparatos li").count();
  check("Los aparatos salen con «hace tanto», que es como se reconoce el propio",
    /hace|ahora mismo/i.test(await p.locator(".ajustes-aparato-que").first().innerText()),
    (await p.locator(".ajustes-aparato-que").first().innerText()).replace(/\n/g, " · "));

  await p.locator(".ajustes-aparatos li button").first().click();
  await p.waitForFunction(
    (antes) => document.querySelectorAll(".ajustes-aparatos li").length < antes,
    cuantos,
    { timeout: 15000 }
  ).catch(() => {});
  check("Cerrar uno lo quita de la lista", (await p.locator(".ajustes-aparatos li").count()) < cuantos,
    `${cuantos} → ${await p.locator(".ajustes-aparatos li").count()}`);

  await p.locator("button:has-text('Comprobar mi conexión')").click();
  await p.waitForSelector(".ajustes-veredicto", { timeout: 30000 });
  check("La comprobación de conexión dice algo que se entiende",
    (await p.locator(".ajustes-veredicto").innerText()).length > 40,
    (await p.locator(".ajustes-veredicto").innerText()).slice(0, 80));

  /* Y se cierra con «atrás», que en un televisor es lo único que hay */
  await p.keyboard.press("Escape");
  await p.waitForTimeout(400);
  check("Se cierra con «atrás»", !(await hay(p, ".pa-ajustes")));

  check("Sin errores de JavaScript por el camino", fallos.length === 0, fallos[0] || "");

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas de ajustes OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
