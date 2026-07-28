// El panel de administración de la plataforma, de punta a punta.
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

const SECCIONES = ["resumen", "proveedores", "revendedores", "clientes", "dominios", "registro", "facturas"];

(async () => {
  const RUN = Date.now().toString(36).slice(-5);

  // --- Un proveedor nuevo con revendedor, dominio y clientes ---
  let r = await call("/api/provider/auth", { method: "POST", body: JSON.stringify({ action: "register", email: `adm${RUN}@t.com`, password: "supersecreta1", company: `Empresa ${RUN}` }) });
  const prov = ck(r.setCookie, "xp_provider");
  const dom = await call("/api/provider/domains", { method: "POST", body: JSON.stringify({ host: "127.0.0.1", port: 8090, label: `dom${RUN}` }) }, prov);
  const domainId = dom.body.domain.id;
  r = await call("/api/provider/resellers", { method: "POST", body: JSON.stringify({ email: `rev${RUN}@t.com`, password: "revendedor123", name: `Revende ${RUN}` }) }, prov);
  check("Revendedor de prueba creado", r.status === 200 || r.status === 201, String(r.status));

  for (const [i, u] of [`cli${RUN}a`, `cli${RUN}b`].entries()) {
    await call("/api/provider/customers", {
      method: "POST",
      body: JSON.stringify({ username: u, password: "clave1234", domainId, expiresInDays: i === 0 ? 30 : 0 }),
    }, prov);
  }
  // Un acceso correcto y otro fallido, para el registro
  await call("/api/customer/login", { method: "POST", body: JSON.stringify({ username: `cli${RUN}a`, password: "clave1234", deviceKey: `dev${RUN}` }) });
  await call("/api/customer/login", { method: "POST", body: JSON.stringify({ username: `cli${RUN}a`, password: "malísima", deviceKey: `dev${RUN}` }) });

  // --- Nadie sin permiso entra ---
  const sinSesion = [];
  for (const ruta of SECCIONES) {
    r = await call(`/api/admin/${ruta}`);
    if (r.status !== 403) sinSesion.push(`${ruta}:${r.status}`);
  }
  check("Sin sesión no se ve nada del panel", sinSesion.length === 0, sinSesion.join(" "));

  r = await call("/api/auth/register", { method: "POST", body: JSON.stringify({ email: `curioso${RUN}@t.com`, password: "supersecreta1" }) });
  const normal = ck(r.setCookie, "xp_session");
  const negados = [];
  for (const ruta of SECCIONES) {
    r = await call(`/api/admin/${ruta}`, {}, normal);
    if (r.status !== 403) negados.push(`${ruta}:${r.status}`);
  }
  check("Una cuenta normal tampoco", negados.length === 0, negados.join(" "));

  r = await call("/api/admin/proveedores", { method: "PATCH", body: JSON.stringify({ id: 1, estado: "suspended" }) }, normal);
  check("Ni suspender a nadie", r.status === 403);

  // --- El administrador ---
  r = await call("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@totalplayer.app", password: "admin12345" }) });
  const admin = ck(r.setCookie, "xp_session");

  r = await call("/api/admin/resumen", {}, admin);
  const res = r.body.resumen;
  check("El resumen cuenta proveedores, clientes y revendedores",
    res.proveedores.total >= 1 && res.clientes.total >= 2 && res.revendedores.total >= 1,
    `${res.proveedores.total} prov · ${res.clientes.total} cli · ${res.revendedores.total} rev`);
  check("Distingue clientes activos de caducados", res.clientes.activos <= res.clientes.total);
  check("Y trae 30 días de altas para la gráfica", Array.isArray(r.body.altas) && r.body.altas.length === 30);

  r = await call(`/api/admin/proveedores?buscar=adm${RUN}`, {}, admin);
  const mio = r.body.proveedores[0];
  check("Los proveedores se buscan por correo", r.body.proveedores.length === 1 && mio.email === `adm${RUN}@t.com`);
  check("Con sus clientes, revendedores y dominios contados",
    mio.clientes === 2 && mio.revendedores === 1 && mio.dominios === 1,
    `${mio.clientes} cli · ${mio.revendedores} rev · ${mio.dominios} dom`);
  check("Y el catálogo de planes para poder cambiarlo", (r.body.planes || []).length >= 1);

  r = await call(`/api/admin/revendedores?buscar=rev${RUN}`, {}, admin);
  const rev = r.body.revendedores[0];
  check("Cada revendedor sale con su proveedor", Boolean(rev) && rev.proveedor.includes(RUN), rev?.proveedor);
  check("Y con sus cuentas activas, que es lo que se mira", typeof rev.clientesActivos === "number");

  r = await call(`/api/admin/clientes?buscar=cli${RUN}`, {}, admin);
  check("El buscador global encuentra clientes de cualquier proveedor", r.body.clientes.length === 2, `${r.body.clientes.length}`);
  r = await call(`/api/admin/clientes?buscar=cli${RUN}&estado=activos`, {}, admin);
  check("Y se filtran por estado", r.body.clientes.length === 2, `${r.body.clientes.length} activos`);

  r = await call(`/api/admin/dominios?buscar=dom${RUN}`, {}, admin);
  check("Los dominios dicen a cuántos clientes sirven", r.body.dominios[0]?.clientes === 2, `${r.body.dominios[0]?.clientes}`);

  r = await call(`/api/admin/registro?buscar=cli${RUN}`, {}, admin);
  check("El registro guarda los accesos con su IP", r.body.accesos.length >= 1);
  r = await call(`/api/admin/registro?fallidos=1&buscar=cli${RUN}`, {}, admin);
  check("Y sabe cuáles fallaron", r.body.accesos.length >= 1 && r.body.accesos.every((a) => a.ok === 0), `${r.body.accesos.length} fallidos`);

  r = await call("/api/admin/facturas", {}, admin);
  check("Las facturas de todos los proveedores en un sitio", Array.isArray(r.body.facturas));

  // --- Tocar un proveedor queda anotado ---
  r = await call("/api/admin/proveedores", { method: "PATCH", body: JSON.stringify({ id: mio.id, estado: "suspended" }) }, admin);
  check("Se puede suspender a un proveedor", r.status === 200);
  r = await call(`/api/admin/proveedores?buscar=adm${RUN}`, {}, admin);
  check("Y se nota en su ficha", r.body.proveedores[0].estado === "suspended");

  r = await call("/api/admin/proveedores", { method: "PATCH", body: JSON.stringify({ id: mio.id, plan: "inventado" }) }, admin);
  check("Un plan que no existe se rechaza", r.status === 400);

  r = await call("/api/admin/proveedores", { method: "PATCH", body: JSON.stringify({ id: mio.id, estado: "active", plan: "starter" }) }, admin);
  check("Reactivar y cambiar de plan, en una", r.status === 200);

  r = await call("/api/admin/registro", {}, admin);
  const anotado = r.body.auditoria.filter((a) => a.sobre === `adm${RUN}@t.com`);
  check("Cada cambio queda escrito con quién lo hizo", anotado.length >= 2 && anotado[0].admin === "admin@totalplayer.app", `${anotado.length} apuntes`);
  check("Y con qué se cambió", anotado.some((a) => a.detalle.includes("suspendido")), anotado[0]?.detalle);

  r = await call("/api/admin/proveedores", { method: "PATCH", body: JSON.stringify({ id: 999999, estado: "suspended" }) }, admin);
  check("Un proveedor que no existe da 404", r.status === 404);

  // --- El panel en el navegador ---
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));

  await p.goto(BASE + "/login?next=/admin", { waitUntil: "networkidle" });
  await p.fill("#email", "admin@totalplayer.app");
  await p.fill("#password", "admin12345");
  await p.click("button:has-text('Entrar')");
  await p.waitForSelector(".panel-nav", { timeout: 20000 });

  const secciones = await p.locator(".panel-nav-item").allInnerTexts();
  check("El menú lleva a todo, no solo a los tickets", secciones.length >= 8,
    secciones.map((s) => s.split("\n")[0].trim()).join(" | "));
  await p.waitForSelector(".panel-card", { timeout: 15000 });
  check("Abre por el resumen", (await p.locator(".panel-card").count()) >= 6, `${await p.locator(".panel-card").count()} tarjetas`);
  check("Con la gráfica de altas", (await p.locator(".admin-barra").count()) === 30);
  await p.screenshot({ path: __dirname + "/70-admin-resumen.png" });

  for (const [nombre, espera] of [
    ["Proveedores", ".panel-table"],
    ["Revendedores", ".panel-table"],
    ["Clientes", ".panel-table"],
    ["Dominios", ".panel-table"],
    ["Registro", ".panel-tabs"],
    ["Facturación", ".panel-table, .pa-empty"],
    ["Soporte", ".panel-table, .pa-empty"],
  ]) {
    await p.locator(`.panel-nav-item:has-text("${nombre}")`).click();
    await p.waitForSelector(espera, { timeout: 20000 });
    check(`Sección «${nombre}» carga`, true);
  }

  // Suspender desde la tabla, sin salir de ella
  await p.locator(".panel-nav-item:has-text('Proveedores')").click();
  await p.waitForSelector(".panel-table");
  await p.fill("input[aria-label='Buscar proveedores']", `adm${RUN}`);
  await p.waitForFunction(() => document.querySelectorAll(".panel-table tbody tr").length === 1, { timeout: 15000 });
  await p.locator(".panel-table tbody tr").first().click();
  await p.waitForSelector(".admin-detalle", { timeout: 10000 });
  check("La fila de un proveedor se abre en su sitio", true);
  await p.locator(".admin-detalle button:has-text('Suspender')").click();
  await p.waitForSelector(".badge-danger", { timeout: 15000 });
  check("Y se le suspende desde ahí", (await p.locator(".panel-table .badge-danger").first().innerText()).includes("suspendido"));
  await p.screenshot({ path: __dirname + "/72-admin-proveedores.png" });

  // En el móvil las tablas se deslizan solas, sin romper la página
  const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await m.goto(BASE + "/login?next=/admin", { waitUntil: "networkidle" });
  await m.fill("#email", "admin@totalplayer.app");
  await m.fill("#password", "admin12345");
  await m.click("button:has-text('Entrar')");
  await m.waitForSelector(".panel-card", { timeout: 20000 });
  check("El panel entra en un móvil", (await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0);
  await m.locator(".panel-nav-item:has-text('Proveedores')").click();
  await m.waitForSelector(".panel-table", { timeout: 20000 });
  check("Y sus tablas no desbordan la página",
    (await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0);

  // Nadie más lo ve
  const otro = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await otro.goto(BASE + "/admin", { waitUntil: "networkidle" });
  await otro.waitForSelector(".auth-card", { timeout: 15000 });
  check("Quien no es admin sigue viendo solo el portero", (await otro.locator("h1").innerText()).includes("Solo administración"));

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas del panel de administración OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 500)); process.exit(1); });
