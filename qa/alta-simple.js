// El alta de un cliente: un solo usuario y una sola contraseña, los de XUI.
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

(async () => {
  const RUN = Date.now().toString(36).slice(-5);

  let r = await call("/api/provider/auth", { method: "POST", body: JSON.stringify({ action: "register", email: `alta${RUN}@t.com`, password: "supersecreta1", company: `Alta ${RUN}` }) });
  const prov = ck(r.setCookie, "xp_provider");
  const dom = await call("/api/provider/domains", { method: "POST", body: JSON.stringify({ host: "127.0.0.1", port: 8090 }) }, prov);
  const domainId = dom.body.domain.id;

  // --- Con un solo par de credenciales ---
  r = await call("/api/provider/customers", {
    method: "POST",
    body: JSON.stringify({ username: `uno${RUN}`, password: "clave1234", domainId }),
  }, prov);
  check("Se da de alta sin repetir usuario y contraseña", r.status === 200, String(r.status));
  check("Y la lista queda con esas mismas credenciales", r.body.customer?.playlistUsername === `uno${RUN}`, r.body.customer?.playlistUsername);

  // Y sirven de verdad contra el servidor de la lista
  r = await call("/api/customer/login", { method: "POST", body: JSON.stringify({ username: `uno${RUN}`, password: "clave1234", deviceKey: `d${RUN}` }) });
  const cli = ck(r.setCookie, "xp_customer");
  check("El cliente entra con ese usuario", r.status === 200);
  r = await call("/api/customer/me", {}, cli);
  check("Y su lista lleva su usuario, no otro inventado",
    r.body.playlist?.username === `uno${RUN}` && r.body.playlist?.password === "clave1234",
    `${r.body.playlist?.username} / ${r.body.playlist?.password}`);

  // --- Quien las tenga distintas, las sigue mandando ---
  r = await call("/api/provider/customers", {
    method: "POST",
    body: JSON.stringify({ username: `dos${RUN}`, password: "clave1234", domainId, playlistUsername: "viejo", playlistPassword: "viejaclave" }),
  }, prov);
  check("Si son distintas, mandan las de la lista", r.body.customer?.playlistUsername === "viejo", r.body.customer?.playlistUsername);

  // --- Sin dominio, escribiendo el servidor a mano ---
  r = await call("/api/provider/customers", {
    method: "POST",
    body: JSON.stringify({ username: `tres${RUN}`, password: "clave1234", playlistUrl: "http://127.0.0.1:8090" }),
  }, prov);
  check("También sin dominio guardado", r.status === 200 && r.body.customer?.playlistUsername === `tres${RUN}`, r.body.customer?.playlistUsername);

  r = await call("/api/provider/customers", {
    method: "POST",
    body: JSON.stringify({ username: `cuatro${RUN}`, password: "clave1234" }),
  }, prov);
  check("Sin dominio ni servidor sigue avisando", r.status === 400, r.body.error);

  // --- El formulario ---
  const b = await chromium.launch({ ...ejecutable });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  await p.goto(BASE + "/acceso?rol=proveedor", { waitUntil: "networkidle" });
  await p.locator(".access-tab:has-text('Soy proveedor')").click();
  await p.fill("#p-email", `alta${RUN}@t.com`);
  await p.fill("#p-pass", "supersecreta1");
  await p.locator("form button.btn-primary").click();
  await p.waitForSelector(".panel-nav", { timeout: 20000 });
  await p.locator("button:has-text('Nuevo cliente')").first().click();
  await p.waitForSelector(".modal");

  const visibles = await p.locator(".modal .auth-field:visible label").allInnerTexts();
  check("El formulario pide un solo usuario y una sola contraseña",
    visibles.filter((t) => /usuario|contraseña/i.test(t)).length === 2,
    visibles.join(" | "));
  check("Y dice de dónde sacarlos", (await p.locator(".modal-sub").innerText()).includes("ya tiene en tu panel"));
  check("Lo raro queda plegado, no fuera", (await p.locator(".modal details:has-text('otro usuario')").count()) === 1);
  await p.screenshot({ path: __dirname + "/76-alta-cliente.png" });

  await p.fill("#c-user", `form${RUN}`);
  await p.fill("#c-pass", "clave1234");
  await p.click(".modal button[type=submit]");
  await p.waitForSelector(".modal", { state: "detached", timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(800);
  r = await call(`/api/provider/customers?q=form${RUN}`, {}, prov);
  check("Y da de alta desde el panel con solo eso", r.body.customers?.[0]?.playlistUsername === `form${RUN}`, r.body.customers?.[0]?.playlistUsername);

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas del alta simplificada OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
