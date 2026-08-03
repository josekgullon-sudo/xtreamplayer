// Una factura que le sirva al gestor: con quién la emite, a quién y con IVA.
//
// El servidor debe arrancarse con los datos del emisor, como en producción:
//   BILLING_NAME="TOTALplayer SL" BILLING_TAX_ID="B00000000" \
//   BILLING_ADDRESS="Calle Mayor 1, Madrid" BILLING_VAT_PERCENT=21
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

  let r = await call("/api/provider/auth", { method: "POST", body: JSON.stringify({ action: "register", email: `fis${RUN}@t.com`, password: "supersecreta1", company: `Fiscal ${RUN}` }) });
  const prov = ck(r.setCookie, "xp_provider");

  const admin = ck((await call("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@totalplayer.app", password: "admin12345" }) })).setCookie, "xp_session");
  const provId = (await call(`/api/admin/proveedores?buscar=fis${RUN}`, {}, admin)).body.proveedores[0].id;
  // 121 € para que el desglose al 21% dé números redondos: 100 + 21
  await call("/api/admin/facturas", { method: "POST", body: JSON.stringify({ proveedorId: provId, concepto: `Plan Basic ${RUN}`, importe: 121 }) }, admin);

  // --- Lo que ve el proveedor ---
  r = await call("/api/provider/invoices", {}, prov);
  const f = r.body.invoices[0];
  check("La factura llega con su desglose calculado en el servidor", f.ivaPorcentaje === 21, `${f.ivaPorcentaje}%`);
  check("Base y cuota suman exactamente el total",
    f.baseCents + f.ivaCents === f.amountCents && f.baseCents === 10000,
    `${f.baseCents} + ${f.ivaCents} = ${f.amountCents}`);
  check("Y con los datos de quien la emite", Boolean(r.body.emisor?.nif), `${r.body.emisor?.nombre} · ${r.body.emisor?.nif}`);
  check("Sus datos fiscales empiezan vacíos", r.body.billing.taxId === "");

  // --- Los rellena él ---
  r = await call("/api/provider/invoices", {
    method: "PUT",
    body: JSON.stringify({ taxName: `Fiscal ${RUN} S.L.`, taxId: "B12345678", taxAddress: "Calle Mayor 1, 28013 Madrid" }),
  }, prov);
  check("Puede guardar los suyos", r.status === 200);
  r = await call("/api/provider/invoices", {}, prov);
  check("Y quedan guardados", r.body.billing.taxId === "B12345678", r.body.billing.taxName);

  r = await call("/api/provider/invoices", { method: "PUT", body: JSON.stringify({ taxName: "Cuela" }) });
  check("Sin sesión no se tocan los de nadie", r.status === 401);

  // --- La factura impresa ---
  const b = await chromium.launch({ ...ejecutable });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 950 } })).newPage();
  await p.goto(BASE + "/acceso?rol=proveedor", { waitUntil: "networkidle" });
  await p.locator(".access-tab:has-text('Soy proveedor')").click();
  await p.fill("#p-email", `fis${RUN}@t.com`);
  await p.fill("#p-pass", "supersecreta1");
  await p.locator("form button.btn-primary").click();
  await p.waitForSelector(".panel-nav", { timeout: 20000 });
  await p.locator(".panel-nav-item:has-text('Facturas')").click();
  await p.waitForSelector(".panel-table", { timeout: 20000 });

  check("Con los datos puestos ya no avisa de que faltan",
    (await p.locator(".factura-fiscales.incompleto").count()) === 0);

  /* Lo que se le manda al gestor es el PDF del servidor; «Ver» es la hoja
     de la propia página, para comprobar un dato de un vistazo */
  const enlacePdf = p.locator("a:has-text('Descargar PDF')").first();
  check("Cada factura se baja en PDF de un clic",
    (await enlacePdf.getAttribute("href"))?.includes("/api/facturas/"),
    await enlacePdf.getAttribute("href"));

  await p.locator("button:has-text('Ver')").first().click();
  await p.waitForSelector(".factura-hoja", { state: "attached", timeout: 10000 });
  /* La hoja solo se ve al imprimir: en pantalla está montada pero oculta, así
     que le decimos al navegador que está imprimiendo y ya la leemos */
  await p.emulateMedia({ media: "print" });
  const hoja = await p.locator(".factura-hoja").innerText();
  check("La factura dice quién la emite, con NIF", hoja.includes("B00000000"), hoja.split("\n")[1]);
  check("Y a quién se la emite, con el suyo", hoja.includes("B12345678") && hoja.includes(`Fiscal ${RUN} S.L.`));
  check("Con la dirección fiscal del cliente", hoja.includes("Calle Mayor 1"));
  check("Y el IVA desglosado", hoja.includes("Base imponible") && hoja.includes("IVA (21%)"), hoja.match(/IVA \(\d+%\)/)?.[0]);
  check("Con el total que se cobró", hoja.includes("121,00"), hoja.match(/121[,.]\d+/)?.[0]);
  await p.screenshot({ path: __dirname + "/86-factura.png" });

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas de facturación fiscal OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
