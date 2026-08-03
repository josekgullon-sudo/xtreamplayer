// La sección «Mi panel XUI» del panel de proveedor, de punta a punta en navegador.
const { chromium, ejecutable } = require("./navegador");
const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`); };

(async () => {
  const RUN = Date.now().toString(36).slice(-5);
  const b = await chromium.launch({ ...ejecutable });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

  // Alta de proveedor por la web
  await p.goto(BASE + "/proveedores/registro", { waitUntil: "networkidle" });
  await p.fill("#p-email", `pui${RUN}@t.com`);
  await p.fill("#p-pass", "supersecreta1");
  const empresa = await p.locator("#p-company").count();
  if (empresa) await p.fill("#p-company", "PruebaUI");
  await p.click("button:has-text('Empezar prueba gratis')");
  await p.waitForURL("**/panel", { timeout: 15000 });
  await p.waitForSelector(".panel-nav", { timeout: 15000 });

  // Dominio primero, para poder importar
  await p.click(".panel-nav-item:has-text('Dominios')");
  await p.click("button:has-text('Añadir mi primer dominio')");
  await p.fill("#d-host", "127.0.0.1");
  await p.fill("#d-port", "8090");
  await p.click(".modal button[type=submit]");
  await p.waitForSelector(".domain-card", { timeout: 10000 });

  // La sección nueva existe y conecta
  const item = p.locator(".panel-nav-item:has-text('Mi panel XUI')");
  check("«Mi panel XUI» aparece en el menú del panel", (await item.count()) === 1);
  await item.click();
  await p.waitForSelector("#pn-url");
  await p.fill("#pn-url", "http://127.0.0.1:8090");
  await p.fill("#pn-key", "XUIKEY123");
  await p.click("button:has-text('Conectar panel')");
  await p.waitForSelector("[role=status]", { timeout: 20000 });
  const aviso = await p.locator("[role=status]").innerText();
  check("Conecta y verifica con el código de API", aviso.includes("verificado"), aviso.trim());

  // Importación desde la propia pantalla
  await p.waitForSelector("#pn-dominio");
  await p.click("button:has-text('Importar del panel')");
  await p.waitForSelector("table.panel-table", { timeout: 20000 });
  const resumen = await p.locator("div.card >> text=/clientes importados/").innerText().catch(() => "");
  check("Importa y muestra el resumen con los omitidos", resumen.includes("2") && (await p.locator("td:has-text('paneloff')").count()) === 1, resumen.trim());
  await p.screenshot({ path: __dirname + "/42-panel-xui.png", fullPage: true });

  // Y los clientes aparecen en la pestaña Clientes
  await p.click(".panel-nav-item:has-text('Clientes')");
  await p.waitForSelector(".panel-table", { timeout: 10000 });
  const filas = await p.locator(".panel-table tbody tr").count();
  check("Los importados están en la lista de clientes", filas >= 2, `${filas} filas`);

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas pasan`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
