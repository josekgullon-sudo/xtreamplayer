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

  /*
   * Recién dado de alta y sin un solo dominio: los tres primeros pasos.
   *
   * El «Nuevo cliente» del paso 2 estuvo apagado hasta que hubiera dominio,
   * y el alta funciona igual sin ninguno —el formulario pregunta entonces
   * el servidor a mano—. O sea que apagarlo cerraba una puerta que estaba
   * abierta, y encima el mismo botón de la barra de la tabla, doscientos
   * píxeles más abajo, nunca estuvo apagado: la misma acción ofrecida y
   * negada en la misma pantalla. Se comprueba aquí, que es el único momento
   * en que un proveedor no tiene dominios.
   */
  await p.waitForSelector(".primeros-pasos", { timeout: 15000 });
  const nuevoEnPaso2 = p.locator(".primeros-pasos button:has-text('Nuevo cliente')");
  check("Sin dominios todavía, dar de alta un cliente sigue estando a mano",
    await nuevoEnPaso2.isEnabled(), await nuevoEnPaso2.count() ? "" : "no está el botón");
  await nuevoEnPaso2.click();
  await p.waitForSelector(".modal", { timeout: 10000 });
  const consejo = await p.locator(".modal .nota-box").innerText().catch(() => "");
  check("Y el formulario explica por dónde se acorta, sin vestirlo de error",
    /dominios/i.test(consejo) && (await p.locator(".modal .error-box").count()) === 0,
    consejo.replace(/\n+/g, " ").slice(0, 70));
  await p.click(".modal button:has-text('Cancelar')");
  await p.waitForSelector(".modal-backdrop", { state: "detached", timeout: 10000 });

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

  /*
   * La columna que se mira todos los días: cuándo se le acaba a cada uno.
   *
   * La tabla enseñaba el alta —que se mira una vez en la vida— y para saber
   * a quién había que cobrarle esta semana había que abrir las fichas una a
   * una. Se comprueba con tres clientes de tres estados distintos, que es lo
   * que distingue una columna útil de una columna con fechas.
   */
  {
    /* El alta, desde la propia página: la sesión del proveedor va en una
       cookie httpOnly, que desde aquí no se puede leer para reenviarla */
    const alta = (usuario, expiresAt) =>
      p.evaluate(async ([u, exp]) => {
        const res = await fetch("/api/provider/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: u, password: "clave1234", expiresAt: exp, playlistUrl: "http://127.0.0.1:8090/lista.m3u" }),
        });
        return res.status;
      }, [usuario, expiresAt]);
    const DIA = 86_400_000;
    const altas = [
      await alta(`cad${RUN}v`, Date.now() - 2 * DIA),   // vencido
      await alta(`cad${RUN}p`, Date.now() + 3 * DIA),   // vence esta semana
      await alta(`cad${RUN}l`, Date.now() + 300 * DIA), // le sobra tiempo
    ];
    check("Los tres clientes de prueba se dan de alta", altas.every((s) => s < 400), altas.join(" "));

    await p.goto(BASE + "/panel", { waitUntil: "networkidle" });
    await p.locator(".panel-nav-item:has-text('Clientes')").first().click();
    await p.waitForSelector(".panel-table", { timeout: 15000 });
    await p.waitForTimeout(800);

    /* En mayúsculas por el CSS, así que se compara sin distinguirlas */
    const cabeceras = (await p.locator(".panel-table thead th").allInnerTexts()).map((t) => t.trim().toLowerCase());
    check("La tabla de clientes dice cuándo caduca cada uno",
      cabeceras.includes("caduca"), cabeceras.filter(Boolean).join(" · "));

    check("El vencido se marca, y no como una fecha más",
      (await p.locator(".celda-caduca .cad-vencido").count()) >= 1);
    check("El que vence esta semana dice cuánto le queda",
      /\d+ días?/.test(await p.locator(".celda-caduca .cad-pronto").first().innerText().catch(() => "")),
      await p.locator(".celda-caduca .cad-pronto").first().innerText().catch(() => "no hay ninguno"));

    /* Los que urgen, arriba: en una cartera de cien, quien vence es lo que
       se busca y no se puede pedir que se recorra la lista entera */
    const primero = await p.locator(".panel-table tbody tr .celda-caduca").first().innerText();
    check("Y los que urgen salen primero", /Caducado/.test(primero), primero.replace(/\s+/g, " ").trim());

    check("Con un filtro para el trabajo de la semana",
      (await p.locator(".chip-filtro").count()) === 1,
      await p.locator(".chip-filtro").innerText().catch(() => "no está"));
    await p.locator(".chip-filtro").click();
    await p.waitForTimeout(600);
    const filasFiltradas = await p.locator(".panel-table tbody tr").count();
    check("Que deja solo a los que vencen o han vencido", filasFiltradas === 2, `${filasFiltradas} filas`);

    /* Renovar sin salir de la fila: era abrir la ficha, calcular la fecha y
       escribirla a mano */
    await p.locator(".panel-table tbody tr").first().hover();
    await p.locator(".celda-caduca .act-renovar").first().click();
    await p.waitForTimeout(1200);
    check("Y «+1 mes» lo renueva desde la propia tabla",
      (await p.locator(".panel-table tbody tr").count()) === 1,
      `${await p.locator(".panel-table tbody tr").count()} siguen venciendo`);
  }

  /*
   * Y volver a entrar, que es lo que hace un proveedor todos los días.
   *
   * Todas las pruebas del panel crean un proveedor nuevo por
   * /proveedores/registro y siguen desde ahí, así que la pantalla de
   * /proveedores/login no la abría ninguna. Es por donde entra cada mañana
   * cualquiera que ya tenga cuenta: si ese formulario se rompe, se quedan
   * todos fuera y no se cae una sola prueba.
   */
  await p.locator(".panel-nav-item:has-text('Salir')").click();
  await p.waitForURL(/\/(proveedores|$)/, { timeout: 20000 }).catch(() => {});
  await p.goto(BASE + "/proveedores/login", { waitUntil: "networkidle" });
  await p.waitForSelector("#p-email", { timeout: 20000 });
  check("Un proveedor con cuenta tiene por dónde volver a entrar",
    (await p.locator("#p-company").count()) === 0, "sin el campo de empresa, que es del alta");
  await p.fill("#p-email", `pui${RUN}@t.com`);
  await p.fill("#p-pass", "supersecreta1");
  await p.locator("button:has-text('Entrar al panel')").click();
  await p.waitForSelector(".panel-nav", { timeout: 25000 });
  check("Y al entrar aparece su panel, con lo suyo dentro",
    (await p.locator(".panel-nav-item:has-text('Clientes')").count()) === 1);
  /* Con una contraseña que no es, no se entra y se dice.
     Se espera a que el «Salir» termine de navegar: si no, la salida y esta
     visita salen a la vez y el navegador cancela una de las dos */
  await p.locator(".panel-nav-item:has-text('Salir')").click();
  await p.waitForSelector(".panel-nav", { state: "detached", timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1200);
  await p.goto(BASE + "/proveedores/login", { waitUntil: "networkidle" });
  await p.waitForSelector("#p-email", { timeout: 20000 });
  await p.fill("#p-email", `pui${RUN}@t.com`);
  await p.fill("#p-pass", "estanoes");
  await p.locator("button:has-text('Entrar al panel')").click();
  await p.waitForSelector(".error-box", { timeout: 15000 }).catch(() => {});
  check("Y con la contraseña equivocada lo dice, en vez de dejarlo en blanco",
    (await p.locator(".error-box").count()) === 1,
    (await p.locator(".error-box").innerText().catch(() => "sin aviso")).trim());

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas pasan`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
