// La aplicación de televisión: activarla, manejarla con el mando y encenderla.
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
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
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await ctx.newPage();
  tv.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));

  await tv.goto(BASE + "/tv", { waitUntil: "networkidle" });
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
  await tv.screenshot({ path: __dirname + "/52-tv-portada.png" });

  // --- El mando ---
  await tv.keyboard.press("ArrowDown");
  check("Las flechas mueven el foco", (await tv.locator(".tv-tile.foco").innerText()).includes("Películas"));
  await tv.keyboard.press("ArrowUp");
  await tv.keyboard.press("Enter");
  await tv.waitForSelector(".tv-fila", { timeout: 25000 });
  check("OK entra en TV en directo y lista lo que hay", (await tv.locator(".tv-fila").count()) >= 2);
  check("Empezando por carpetas, no por miles de canales", (await tv.locator(".tv-fila.tv-carpeta").count()) >= 1);

  await tv.keyboard.press("Enter");
  await tv.waitForFunction(() => document.querySelectorAll(".tv-fila:not(.tv-carpeta)").length > 0, { timeout: 20000 });
  check("Al abrir una carpeta salen sus canales", (await tv.locator(".tv-fila:not(.tv-carpeta)").count()) >= 1);
  await tv.keyboard.press("Escape");
  await tv.waitForSelector(".tv-fila.tv-carpeta", { timeout: 15000 });
  check("ATRÁS vuelve a las carpetas", true);
  await tv.keyboard.press("Escape");
  await tv.waitForSelector(".tv-tiles", { timeout: 15000 });
  check("Y otra vez, a la portada", true);

  // --- Lo último visto, para volver con un solo OK ---
  await tv.keyboard.press("Enter");
  await tv.waitForSelector(".tv-fila.tv-carpeta", { timeout: 20000 });
  await tv.keyboard.press("Enter");
  await tv.waitForFunction(() => document.querySelectorAll(".tv-fila:not(.tv-carpeta)").length > 0, { timeout: 20000 });
  const canal = (await tv.locator(".tv-fila:not(.tv-carpeta) .tv-fila-nombre").first().innerText()).trim();
  await tv.locator(".tv-fila:not(.tv-carpeta)").first().click();
  await tv.waitForSelector(".tv-viendo", { timeout: 20000 });
  await tv.keyboard.press("Escape");
  await tv.keyboard.press("Escape");
  await tv.keyboard.press("Escape");
  await tv.waitForSelector(".tv-tiles", { timeout: 15000 });
  check("Tras ver algo, la portada ofrece seguir viéndolo",
    await tv.locator(".tv-seguir").isVisible(), (await tv.locator(".tv-seguir").innerText()).replace(/\n/g, " "));
  check("Con el nombre de lo que se estaba viendo", (await tv.locator(".tv-seguir").innerText()).includes(canal), canal);
  await tv.screenshot({ path: __dirname + "/89-tv-seguir.png" });

  // Y el mando llega hasta ahí: está por encima de los cuatro accesos
  await tv.keyboard.press("ArrowUp");
  check("El mando llega a «Seguir viendo»", (await tv.locator(".tv-seguir.foco").count()) === 1);
  await tv.keyboard.press("Enter");
  await tv.waitForSelector(".tv-viendo", { timeout: 20000 });
  check("Y con un OK vuelve a lo suyo", true);

  // --- Encender sin red ---
  const sinRed = await ctx.newPage();
  /* La tele enciende antes que el wifi: la pregunta al servidor no llega.
     Antes salía la pantalla de activación a alguien activado hace meses. */
  await sinRed.route("**/api/customer/me", (route) => route.abort());
  await sinRed.goto(BASE + "/tv", { waitUntil: "domcontentloaded" });
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
  await pn.goto(BASE + "/tv", { waitUntil: "domcontentloaded" });
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
