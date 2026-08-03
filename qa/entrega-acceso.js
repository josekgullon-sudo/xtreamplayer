// Entregar el acceso al cliente sin teclear el mensaje a mano.
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

  let r = await call("/api/provider/auth", { method: "POST", body: JSON.stringify({ action: "register", email: `ent${RUN}@t.com`, password: "supersecreta1", company: `Entrega ${RUN}` }) });
  const prov = ck(r.setCookie, "xp_provider");
  await call("/api/provider/branding", { method: "PUT", body: JSON.stringify({ name: `MiMarca${RUN}`, slug: `marca${RUN}` }) }, prov);
  const dom = await call("/api/provider/domains", { method: "POST", body: JSON.stringify({ host: "127.0.0.1", port: 8090 }) }, prov);

  const b = await chromium.launch({ ...ejecutable });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 950 } })).newPage();
  await p.goto(BASE + "/acceso?rol=proveedor", { waitUntil: "networkidle" });
  await p.locator(".access-tab:has-text('Soy proveedor')").click();
  await p.fill("#p-email", `ent${RUN}@t.com`);
  await p.fill("#p-pass", "supersecreta1");
  await p.locator("form button.btn-primary").click();
  await p.waitForSelector(".panel-nav", { timeout: 20000 });

  // --- Al dar de alta ---
  await p.locator("button:has-text('Nuevo cliente')").first().click();
  await p.waitForSelector(".modal");
  await p.fill("#c-user", `cli${RUN}`);
  await p.fill("#c-pass", "clave1234");
  await p.click(".modal button[type=submit]");
  await p.waitForSelector(".entrega", { timeout: 20000 });
  check("Tras el alta sale el mensaje, no solo los datos sueltos", true);

  const mensaje = await p.locator(".entrega-previa").innerText();
  check("Con el usuario y la contraseña dentro",
    mensaje.includes(`cli${RUN}`) && mensaje.includes("clave1234"),
    mensaje.split("\n")[0]);
  check("Con su enlace de marca, no el genérico", mensaje.includes(`/m/marca${RUN}`), (mensaje.match(/http\S+/) || [])[0]);
  check("Y a nombre de su marca", mensaje.includes(`MiMarca${RUN}`));
  check("Diciendo que sirve en móvil y tele", mensaje.includes("tele"));

  // Los tres caminos de salida, cada uno con el mensaje ya dentro
  const wa = await p.locator(".entrega a[href*='wa.me']").getAttribute("href");
  check("El botón de WhatsApp lleva el mensaje", decodeURIComponent(wa).includes(`cli${RUN}`), wa.slice(0, 45) + "…");
  const correo = await p.locator(".entrega a[href^='mailto:']").getAttribute("href");
  check("Y el de correo, con asunto y cuerpo",
    decodeURIComponent(correo).includes(`Tu acceso a MiMarca${RUN}`) && decodeURIComponent(correo).includes("clave1234"));
  check("Y hay copia al portapapeles", await p.locator(".entrega button:has-text('Copiar mensaje')").isVisible());
  await p.screenshot({ path: __dirname + "/87-entrega.png" });

  // --- Y después, desde la ficha del cliente ---
  await p.locator(".card button:has-text('Cerrar')").click();
  // La ficha se abre desde el nombre del cliente, no desde la fila entera
  await p.locator(".panel-table .link-btn", { hasText: `cli${RUN}` }).first().click();
  await p.waitForSelector(".detail-hero", { timeout: 20000 });
  await p.waitForSelector(".entrega", { timeout: 15000 });
  check("La ficha del cliente también lo ofrece", true);
  const wa2 = await p.locator(".entrega a[href*='wa.me']").first().getAttribute("href");
  check("Con la contraseña real de ese cliente", decodeURIComponent(wa2).includes("clave1234"));
  check("Y sin repetir el mensaje entero en pantalla", (await p.locator(".entrega.compacta").count()) === 1);

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas de entrega de acceso OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
