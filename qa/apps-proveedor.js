// «Aplicaciones» en el panel del proveedor: lo que le manda a su cliente.
//
// Tenía el enlace de su marca en un sitio, la activación de la tele en otro y
// las instrucciones en ninguno, así que lo que acababa mandando por WhatsApp
// era lo que recordaba. Aquí se comprueba que estén las tres cosas y que se
// copien de un botón.
const { chromium, ejecutable } = require("./navegador");
const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`); };

(async () => {
  const RUN = Date.now().toString(36).slice(-5);
  const b = await chromium.launch({ ...ejecutable });
  const ctx = await b.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const p = await ctx.newPage();

  // Alta de proveedor por la web, como cualquiera
  await p.goto(BASE + "/proveedores/registro", { waitUntil: "networkidle" });
  await p.fill("#p-email", `apps${RUN}@t.com`);
  await p.fill("#p-pass", "supersecreta1");
  if (await p.locator("#p-company").count()) await p.fill("#p-company", `Apps ${RUN}`);
  await p.click("button:has-text('Empezar prueba gratis')");
  await p.waitForSelector(".panel-nav", { timeout: 25000 });

  // Su marca, con enlace propio: es lo que tiene que salir en las instrucciones
  await p.locator(".panel-nav-item:has-text('Marca')").click();
  await p.waitForSelector("#b-slug", { timeout: 15000 });
  await p.fill("#b-name", `Tele ${RUN}`);
  await p.fill("#b-slug", `tele${RUN}`);
  await p.locator("button:has-text('Guardar')").first().click();
  await p.waitForTimeout(1200);

  await p.locator(".panel-nav-item:has-text('Aplicaciones')").click();
  await p.waitForSelector(".apps-tarjeta", { timeout: 15000 });

  const tarjetas = await p.locator(".apps-tarjeta h3").allInnerTexts();
  check("Están los tres sitios donde ve un cliente", tarjetas.length === 3, tarjetas.join(" | "));

  const suDireccion = await p.locator(".factura-fiscales .cred").innerText();
  check("Y su dirección de marca, no la genérica", suDireccion.includes(`/m/tele${RUN}`), suDireccion);

  const textoTv = await p.locator(".apps-texto").first().innerText();
  check("Las instrucciones de la tele llevan su enlace", textoTv.includes(`/m/tele${RUN}/tv`), textoTv.split("\n")[2]?.trim());
  check("Y explican la MAC y el código, que es lo que pregunta el cliente",
    textoTv.includes("MAC") && textoTv.includes("código"));
  check("Con su marca, no con la nuestra", textoTv.includes(`Tele ${RUN}`) && !textoTv.includes("TOTALplayer"));

  const textoMovil = await p.locator(".apps-texto").nth(1).innerText();
  check("Las del móvil dicen cómo se instala en iPhone y en Android",
    textoMovil.includes("pantalla de inicio") && textoMovil.includes("Instalar aplicación"));

  // Copiar es el gesto: si hay que seleccionar a mano, no lo usa nadie
  await p.locator(".apps-tarjeta").first().locator("button:has-text('Copiar')").click();
  await p.waitForTimeout(400);
  const portapapeles = await p.evaluate(() => navigator.clipboard.readText());
  check("El botón copia el texto tal cual", portapapeles.includes(`/m/tele${RUN}/tv`), `${portapapeles.length} letras`);
  check("Y avisa de que lo ha copiado",
    (await p.locator(".apps-tarjeta").first().innerText()).includes("Copiado"));

  await p.screenshot({ path: __dirname + "/92-panel-apps.png", fullPage: true });

  /*
   * Y todas las secciones del panel se titulan igual que su botón del menú.
   *
   * A «Aplicaciones» le faltaba la línea en la tabla de títulos: se pulsaba
   * en el menú y la pantalla salía sin encabezado, con un hueco donde las
   * demás llevan su nombre. Y «Mi panel XUI» se titulaba «Conexión del
   * panel», así que se pulsaba una cosa y se llegaba a otra. Se recorre el
   * menú entero porque el fallo no está en una pantalla: está en olvidarse
   * de una al añadirla.
   */
  const menu = await p.locator(".panel-nav-item").allInnerTexts();
  const sinTitulo = [];
  const distinto = [];
  for (let i = 0; i < menu.length; i++) {
    const nombre = menu[i].replace(/\s+/g, " ").replace(/\s*\d+$/, "").trim();
    if (!nombre || /Salir|Ver reproductor/.test(nombre)) continue;
    await p.locator(".panel-nav-item").nth(i).click();
    await p.waitForTimeout(500);
    const titulo = (await p.locator(".panel-head h1").innerText().catch(() => "")).trim();
    if (!titulo) sinTitulo.push(nombre);
    /* «Plan» se titula «Plan y facturación»: vale que lo amplíe, no que hable
       de otra cosa. Basta con que el nombre del menú esté dentro */
    else if (!titulo.toLowerCase().includes(nombre.toLowerCase())) distinto.push(`${nombre} → ${titulo}`);
  }
  check("Ninguna sección del panel se queda sin título", sinTitulo.length === 0, sinTitulo.join(" | "));
  check("Y ninguna se titula distinto de como se llama en el menú", distinto.length === 0, distinto.join(" | "));

  // Un revendedor no gestiona el plan: esto tampoco es suyo
  const rev = await ctx.newPage();
  await rev.goto(BASE + "/panel", { waitUntil: "networkidle" });
  check("La sección vive en el panel del proveedor", (await rev.locator(".panel-nav-item:has-text('Aplicaciones')").count()) === 1);
  await rev.close();

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas de «Aplicaciones» OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
