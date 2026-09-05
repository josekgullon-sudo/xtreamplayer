// El cupo de aparatos y el PIN de los perfiles.
//
// Dos sitios donde antes se dejaba al cliente tirado: pasarse del cupo de
// aparatos era un error seco —«pide a tu proveedor que libere uno»—, y no
// había manera de impedir que un niño se saliera de su perfil eligiendo
// otro en la misma pantalla.
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

  let r = await call("/api/provider/auth", { method: "POST", body: JSON.stringify({ action: "register", email: `cp${RUN}@t.com`, password: "supersecreta1", company: "TotalFLIX" }) });
  const prov = `xp_provider=${ck(r.setCookie, "xp_provider")}`;
  const dom = await call("/api/provider/domains", { method: "POST", body: JSON.stringify({ host: "127.0.0.1", port: 8090 }) }, prov);
  const U = `cp${RUN}`;
  /* Dos aparatos de cupo, que es lo corriente en IPTV */
  await call("/api/provider/customers", {
    method: "POST",
    body: JSON.stringify({ username: U, password: "clave1234", domainId: dom.body.domain.id, playlistUsername: "demo", playlistPassword: "demo123", maxDevices: 2, maxProfiles: 4 }),
  }, prov);

  const entrar = (deviceKey, platform, liberar) =>
    call("/api/customer/login", {
      method: "POST",
      body: JSON.stringify({ username: U, password: "clave1234", deviceKey, platform, liberar }),
    });

  /* ---------- El cupo ---------- */
  await entrar(`salon-${RUN}`, "tv");
  await entrar(`movil-${RUN}`, "web");
  r = await entrar(`cocina-${RUN}`, "tv");
  check("Con el cupo lleno no se entra", r.status === 403);
  check("Y se dice qué hacer, no solo qué pasa",
    /cierra uno/i.test(r.body.error || ""), r.body.error);
  check("Con la lista de los aparatos que lo ocupan",
    Array.isArray(r.body.dispositivos) && r.body.dispositivos.length === 2,
    `${(r.body.dispositivos || []).length} aparatos`);
  check("Cada uno con qué es y cuándo se vio, que es como se reconoce el propio",
    r.body.dispositivos.every((d) => d.llave && d.plataforma && d.visto > 0),
    JSON.stringify(r.body.dispositivos[0] || {}));

  /* Y cerrando uno se entra, en la misma llamada */
  const elQueSobra = r.body.dispositivos.find((d) => d.llave === `salon-${RUN}`);
  r = await entrar(`cocina-${RUN}`, "tv", elQueSobra.llave);
  check("Cerrando uno de los suyos, entra", r.status === 200, r.body.error || "");
  check("Y sigue habiendo dos, no tres", r.body.devices?.used === 2, JSON.stringify(r.body.devices));

  /* Lo que no puede es cerrar el de otro */
  await call("/api/provider/customers", {
    method: "POST",
    body: JSON.stringify({ username: `${U}b`, password: "clave1234", domainId: dom.body.domain.id, playlistUsername: "demo", playlistPassword: "demo123", maxDevices: 1 }),
  }, prov);
  await call("/api/customer/login", { method: "POST", body: JSON.stringify({ username: `${U}b`, password: "clave1234", deviceKey: `ajeno-${RUN}` }) });
  r = await entrar(`otra-${RUN}`, "web", `ajeno-${RUN}`);
  check("Pero no puede cerrar el aparato de otro cliente", r.status === 403, `${r.status}`);
  r = await call("/api/customer/login", { method: "POST", body: JSON.stringify({ username: `${U}b`, password: "clave1234", deviceKey: `ajeno-${RUN}` }) });
  check("Que sigue entrando como si nada", r.status === 200);

  /* ---------- El PIN ---------- */
  r = await entrar(`salon-${RUN}`, "tv", `movil-${RUN}`);
  const sesion = `xp_customer=${ck(r.setCookie, "xp_customer")}`;

  r = await call("/api/profiles", {}, sesion);
  const suyo = r.body.profiles[0];
  check("Todo el mundo tiene su perfil", Boolean(suyo), JSON.stringify(r.body.profiles || []).slice(0, 80));
  check("Y de fábrica no pide PIN", suyo.conPin === false);

  r = await call(`/api/profiles/${suyo.id}`, { method: "PATCH", body: JSON.stringify({ pin: "12" }) }, sesion);
  check("Un PIN de dos cifras no vale", r.status === 400, r.body.error);
  r = await call(`/api/profiles/${suyo.id}`, { method: "PATCH", body: JSON.stringify({ pin: "2468" }) }, sesion);
  check("Y uno de cuatro sí", r.status === 200);

  r = await call("/api/profiles", {}, sesion);
  check("El perfil dice que pide PIN", r.body.profiles[0].conPin === true);
  check("Pero no dice cuál es",
    !JSON.stringify(r.body.profiles).includes("2468"), JSON.stringify(r.body.profiles).slice(0, 100));

  r = await call("/api/profiles", { method: "PUT", body: JSON.stringify({ profileId: suyo.id }) }, sesion);
  check("Sin el PIN no se entra en ese perfil", r.status === 403 && r.body.pide === "pin", r.body.error);
  r = await call("/api/profiles", { method: "PUT", body: JSON.stringify({ profileId: suyo.id, pin: "1111" }) }, sesion);
  check("Con un PIN que no es, tampoco", r.status === 403);
  r = await call("/api/profiles", { method: "PUT", body: JSON.stringify({ profileId: suyo.id, pin: "2468" }) }, sesion);
  check("Con el suyo, sí", r.status === 200);

  /*
   * Y lo que de verdad protege: desde el perfil del niño no se puede pasar
   * al de los mayores. El infantil no lleva PIN —tiene que poder entrar él—
   * y el de los mayores sí, que es al revés de lo que parece.
   */
  r = await call("/api/profiles", { method: "POST", body: JSON.stringify({ name: "Peques", kids: true }) }, sesion);
  check("Se puede crear un perfil infantil", r.status === 200 || r.status === 201, `${r.status}`);
  r = await call("/api/profiles", {}, sesion);
  const nino = r.body.profiles.find((p) => p.kids);
  r = await call("/api/profiles", { method: "PUT", body: JSON.stringify({ profileId: nino.id }) }, sesion);
  check("En el infantil se entra sin PIN, que para eso es suyo", r.status === 200);
  r = await call("/api/profiles", { method: "PUT", body: JSON.stringify({ profileId: suyo.id }) }, sesion);
  check("Y desde ahí no se puede volver al de los mayores sin el PIN", r.status === 403);

  /* Quitarlo también se puede */
  await call(`/api/profiles/${suyo.id}`, { method: "PATCH", body: JSON.stringify({ pin: "" }) }, sesion);
  r = await call("/api/profiles", { method: "PUT", body: JSON.stringify({ profileId: suyo.id }) }, sesion);
  check("Quitando el PIN se vuelve a entrar sin nada", r.status === 200);

  /* ---------- Y en pantalla ---------- */
  const b = await chromium.launch({ ...ejecutable });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const fallos = [];
  p.on("pageerror", (e) => fallos.push(String(e).slice(0, 160)));

  /* El cupo, con la lista y el botón de cerrar uno */
  await call(`/api/profiles/${suyo.id}`, { method: "PATCH", body: JSON.stringify({ pin: "2468" }) }, sesion);
  await p.goto(BASE + "/acceso", { waitUntil: "networkidle" });
  await p.locator(".access-tab:has-text('Soy cliente')").click().catch(() => {});
  await p.waitForSelector("#cu-user", { timeout: 20000 });
  await p.fill("#cu-user", U);
  await p.fill("#cu-pass", "clave1234");
  /* El botón no lleva type: dentro de un form, el de por defecto ya es
     «submit», así que se busca por su texto */
  await p.locator("form:has(#cu-user) button:has-text('Entrar')").first().click();
  await p.waitForSelector(".aparatos-cupo", { timeout: 20000 });
  check("En pantalla salen los aparatos que ocupan el cupo",
    (await p.locator(".aparatos-cupo .aparato").count()) === 2,
    `${await p.locator(".aparatos-cupo .aparato").count()} filas`);
  check("Con «hace tanto», que es lo que permite reconocer el propio",
    /hace|ahora mismo/i.test(await p.locator(".aparato-que").first().innerText()),
    await p.locator(".aparato-que").first().innerText().then((t) => t.replace(/\n/g, " · ")));

  await p.locator(".aparatos-cupo .aparato button").first().click();
  /* Entra y se va a /player, que en un navegador de a pie le enseña el
     cartel de las aplicaciones —eso es lo correcto, ver lib/envoltorio.ts—.
     Lo que se comprueba aquí es que la puerta del cupo se abrió */
  await p.waitForFunction(() => !document.querySelector(".aparatos-cupo"), { timeout: 25000 });
  check("Cerrando uno desde la pantalla, entra", true);

  /*
   * Y la pantalla de perfiles, con el PIN, dentro de la aplicación.
   *
   * Es donde la ve el cliente: en un navegador de a pie no reproduce nada
   * —le sale el cartel—, así que se abre como lo haría el APK.
   */
  await p.goto(BASE + "/player?app=1", { waitUntil: "networkidle" });
  await p.waitForSelector(".profile-item", { timeout: 25000 });
  check("El perfil con PIN lo dice con un candado", await hay(p, ".profile-candado"));
  await p.locator(".profile-item").first().click();
  await p.waitForSelector("#pf-pin", { timeout: 15000 });
  check("Y al elegirlo pide las cuatro cifras", true);
  await p.fill("#pf-pin", "1111");
  await p.locator("form:has(#pf-pin) button:has-text('Entrar')").click();
  await p.waitForTimeout(1200);
  check("Con un PIN que no es, no entra y lo dice", await hay(p, "#pf-pin"), "sigue pidiéndolo");
  await p.fill("#pf-pin", "2468");
  await p.locator("form:has(#pf-pin) button:has-text('Entrar')").click();
  await p.waitForSelector("#pf-pin", { state: "detached", timeout: 15000 });
  check("Y con el suyo, entra", true);

  /* Y el lápiz de editar, que es por donde se pone el PIN */
  await p.goto(BASE + "/player?app=1", { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  if (await hay(p, ".profile-item")) {
    check("Cada perfil se puede editar desde su propia tarjeta",
      (await p.locator(".profile-editar").count()) > 0);
  }

  check("Sin errores de JavaScript por el camino", fallos.length === 0, fallos[0] || "");

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas del cupo y el PIN OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
