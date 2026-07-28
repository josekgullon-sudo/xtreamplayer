// Emitir facturas a mano y abrir el panel de un proveedor desde /admin.
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

  let r = await call("/api/provider/auth", { method: "POST", body: JSON.stringify({ action: "register", email: `fac${RUN}@t.com`, password: "supersecreta1", company: `Facturas ${RUN}` }) });
  const prov = ck(r.setCookie, "xp_provider");
  r = await call("/api/provider/auth", {}, prov);
  const provId = (await call(`/api/admin/proveedores?buscar=fac${RUN}`, {}, await (async () => {
    const l = await call("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@totalplayer.app", password: "admin12345" }) });
    return ck(l.setCookie, "xp_session");
  })())).body.proveedores?.[0]?.id;

  const login = await call("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@totalplayer.app", password: "admin12345" }) });
  const admin = ck(login.setCookie, "xp_session");
  check("El proveedor de prueba existe para la administración", Boolean(provId), String(provId));

  // --- Emitir ---
  r = await call("/api/admin/facturas", { method: "POST", body: JSON.stringify({ proveedorId: provId, concepto: `Plan Basic ${RUN}`, importe: 45 }) }, admin);
  check("Se emite una factura a mano", r.status === 200 && /^TP-\d{4}-\d{5}$/.test(r.body.numero || ""), r.body.numero);
  const numero = r.body.numero;

  r = await call(`/api/admin/facturas`, {}, admin);
  const mia = r.body.facturas.find((f) => f.numero === numero);
  check("Sale en la lista con su importe en euros", mia?.importeCents === 4500, `${mia?.importeCents} céntimos`);
  check("Y a nombre de su proveedor", (mia?.proveedor || "").includes(RUN), mia?.proveedor);
  check("Nace cobrada si no se dice otra cosa", mia?.estado === "pagada", mia?.estado);

  r = await call("/api/admin/facturas", { method: "POST", body: JSON.stringify({ proveedorId: provId, concepto: "Mes suelto", importe: 20, estado: "pendiente" }) }, admin);
  check("También se puede emitir pendiente de cobro", r.status === 200);
  const pendiente = r.body.numero;
  check("Y los números no se repiten", pendiente !== numero, `${numero} · ${pendiente}`);

  // --- Lo que no se acepta ---
  r = await call("/api/admin/facturas", { method: "POST", body: JSON.stringify({ proveedorId: provId, concepto: "", importe: 10 }) }, admin);
  check("Sin concepto se rechaza", r.status === 400, r.body.error);
  r = await call("/api/admin/facturas", { method: "POST", body: JSON.stringify({ proveedorId: provId, concepto: "Nada", importe: 0 }) }, admin);
  check("Con importe cero, también", r.status === 400, r.body.error);
  r = await call("/api/admin/facturas", { method: "POST", body: JSON.stringify({ proveedorId: 999999, concepto: "Nada", importe: 5 }) }, admin);
  check("Y a un proveedor que no existe", r.status === 404);
  r = await call("/api/admin/facturas", { method: "POST", body: JSON.stringify({ proveedorId: provId, concepto: "Cuela", importe: 5 }) });
  check("Sin ser administrador no se emite nada", r.status === 403);

  // --- Cambiar el estado ---
  const facs = (await call("/api/admin/facturas", {}, admin)).body.facturas;
  const idPendiente = facs.find((f) => f.numero === pendiente).id;
  r = await call("/api/admin/facturas", { method: "PATCH", body: JSON.stringify({ id: idPendiente, estado: "pagada" }) }, admin);
  check("Una pendiente se marca cobrada", r.status === 200);
  r = await call("/api/admin/facturas", { method: "PATCH", body: JSON.stringify({ id: idPendiente, estado: "anulada" }) }, admin);
  check("Y se puede anular", r.status === 200);
  const anulada = (await call("/api/admin/facturas", {}, admin)).body.facturas.find((f) => f.id === idPendiente);
  check("La anulada sigue estando, no se borra", anulada?.estado === "anulada", anulada?.estado);
  r = await call("/api/admin/facturas", { method: "PATCH", body: JSON.stringify({ id: idPendiente, estado: "inventado" }) }, admin);
  check("Un estado inventado se rechaza", r.status === 400);

  const auditoria = (await call("/api/admin/registro", {}, admin)).body.auditoria;
  check("Todo queda anotado en el registro",
    auditoria.some((a) => a.sobre === numero || a.detalle.includes(numero)) ||
      auditoria.some((a) => a.accion === "factura"),
    auditoria.find((a) => a.accion === "factura")?.detalle);

  // --- Abrir el panel de un proveedor ---
  r = await call("/api/admin/suplantar", { method: "POST", body: JSON.stringify({ id: provId }) });
  check("Sin ser administrador no se entra en el panel de nadie", r.status === 403);

  r = await call("/api/admin/suplantar", { method: "POST", body: JSON.stringify({ id: provId }) }, admin);
  check("El administrador sí puede", r.status === 200 && r.body.panel === "/panel");
  check("Y recibe la sesión del proveedor", Boolean(ck(r.setCookie, "xp_provider")));
  check("Con la marca que avisa de quién es el panel", (r.setCookie || "").includes("xp_suplantando"));

  await call("/api/admin/proveedores", { method: "PATCH", body: JSON.stringify({ id: provId, estado: "suspended" }) }, admin);
  r = await call("/api/admin/suplantar", { method: "POST", body: JSON.stringify({ id: provId }) }, admin);
  check("A un proveedor suspendido se avisa en vez de dar una pantalla vacía", r.status === 409, r.body.error);
  await call("/api/admin/proveedores", { method: "PATCH", body: JSON.stringify({ id: provId, estado: "active" }) }, admin);

  // --- En el navegador, con su aviso ---
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
  p.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));

  await p.goto(BASE + "/login?next=/admin", { waitUntil: "networkidle" });
  await p.fill("#email", "admin@totalplayer.app");
  await p.fill("#password", "admin12345");
  await p.click("button:has-text('Entrar')");
  await p.waitForSelector(".panel-nav", { timeout: 20000 });

  // Emitir desde la pantalla
  await p.locator(".panel-nav-item:has-text('Proveedores')").click();
  await p.waitForSelector(".panel-table", { timeout: 20000 });
  await p.locator(".panel-nav-item:has-text('Facturación')").click();
  await p.waitForSelector(".panel-toolbar", { timeout: 20000 });
  await p.locator("button:has-text('Emitir factura')").click();
  await p.waitForSelector(".admin-factura-form", { timeout: 10000 });
  await p.selectOption("#fa-prov", { label: `Facturas ${RUN}` });
  await p.fill("#fa-concepto", `Desde la pantalla ${RUN}`);
  await p.fill("#fa-importe", "12.50");
  await p.locator(".admin-factura-form button[type=submit]").click();
  // La tabla se recarga después de emitir: esperamos a que la nueva esté,
  // no a un «pagada» cualquiera que ya estuviera de antes
  await p.locator(".panel-table tbody tr", { hasText: `Desde la pantalla ${RUN}` }).first().waitFor({ timeout: 20000 });
  check("Se emite desde la pantalla", true);
  check("Con los céntimos que se escribieron",
    (await call("/api/admin/facturas", {}, admin)).body.facturas.some((f) => f.importeCents === 1250));
  await p.screenshot({ path: __dirname + "/83-admin-facturas.png" });

  // Anular desde la tabla
  await p.locator(".panel-table tbody tr", { hasText: `Desde la pantalla ${RUN}` }).locator("button:has-text('Anular')").click();
  await p.waitForTimeout(1200);
  const trasAnular = (await call("/api/admin/facturas", {}, admin)).body.facturas.find((f) => f.concepto === `Desde la pantalla ${RUN}`);
  check("Y se anula desde la tabla", trasAnular?.estado === "anulada", trasAnular?.estado);

  // Abrir el panel del proveedor y volver
  await p.locator(".panel-nav-item:has-text('Proveedores')").click();
  await p.waitForSelector(".panel-table", { timeout: 20000 });
  await p.fill("input[aria-label='Buscar proveedores']", `fac${RUN}`);
  await p.waitForFunction(() => document.querySelectorAll(".panel-table tbody tr").length === 1, { timeout: 15000 });
  await p.locator(".panel-table tbody tr").first().click();
  await p.waitForSelector(".admin-detalle", { timeout: 10000 });
  await p.locator("button:has-text('Abrir su panel')").click();
  await p.waitForURL(/\/panel/, { timeout: 20000 });
  await p.waitForSelector(".panel-suplantando", { timeout: 20000 });
  check("El panel del proveedor avisa de que lo mira un administrador",
    (await p.locator(".panel-suplantando").innerText()).includes(`Facturas ${RUN}`));
  await p.screenshot({ path: __dirname + "/84-suplantando.png" });

  await p.locator(".panel-suplantando button").click();
  await p.waitForURL(/\/admin/, { timeout: 20000 });
  check("Y se sale de ahí con un clic", true);
  const cookies = await p.context().cookies();
  check("Sin dejar la sesión del proveedor abierta", !cookies.some((c) => c.name === "xp_provider" && c.value));

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas de facturación y soporte OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 500)); process.exit(1); });
