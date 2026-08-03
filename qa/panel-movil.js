/*
 * El panel del proveedor en un teléfono.
 *
 * El proveedor es quien paga, y su panel solo se había mirado en un
 * escritorio de 1440px. En «Mi marca» el formulario y su vista previa iban
 * en dos columnas de ancho fijo: en un móvil la vista previa se quedaba
 * fuera de la pantalla y la página entera se arrastraba de lado, que es el
 * síntoma clásico de «esto no está hecho para el móvil».
 *
 * Se recorren todos los apartados midiendo lo mismo en cada uno: que nada
 * desborde, que nada se salga por la derecha y que se pueda pulsar con el
 * dedo. Un apartado nuevo que se olvide del móvil cae aquí.
 */
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`); };

/** Los apartados que ve un proveedor recién dado de alta. */
const APARTADOS = ["Clientes", "Revendedores", "Mi marca", "Aplicaciones", "Plan", "Facturas", "API", "Soporte"];

async function sinDesbordar(p) {
  return p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/*
 * Lo que se sale de la pantalla por la derecha sin tener dónde deslizarse.
 *
 * Una tabla de clientes más ancha que un teléfono no es un fallo: vive
 * dentro de una caja que se desliza de lado, y eso es lo que hay que hacer
 * con una tabla. El fallo es salirse sin que nada se deslice, porque
 * entonces lo que se arrastra es la página entera y no hay forma de volver.
 */
async function seSalen(p) {
  return p.evaluate(() => {
    const puedeDeslizarse = (el) => {
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        if (["auto", "scroll"].includes(getComputedStyle(n).overflowX)) return true;
      }
      return false;
    };
    const out = [];
    for (const el of document.querySelectorAll(".panel-main *")) {
      const r = el.getBoundingClientRect();
      if (r.width > 2 && r.right > window.innerWidth + 2 && !puedeDeslizarse(el)) {
        out.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0]}`);
      }
      if (out.length > 3) break;
    }
    return out;
  });
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await (await b.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
  })).newPage();
  p.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));

  // Alta por la web, como cualquiera
  const RUN = Date.now().toString(36).slice(-5);
  await p.goto(BASE + "/proveedores/registro", { waitUntil: "networkidle" });
  check("Darse de alta como proveedor cabe en el móvil", (await sinDesbordar(p)) === 0);
  await p.fill("#p-email", `pmov${RUN}@t.com`);
  await p.fill("#p-pass", "supersecreta1");
  if (await p.locator("#p-company").count()) await p.fill("#p-company", `Movil ${RUN}`);
  await p.click("button:has-text('Empezar prueba gratis')");
  await p.waitForSelector(".panel-nav", { timeout: 30000 });
  await p.waitForTimeout(2000);
  check("Y se entra al panel", true);

  /* La columna del panel se convierte en una tira que se desliza de lado.
     Que se deslice ella es justo lo que evita que arrastre a la página */
  const tira = await p.locator(".panel-nav").evaluate((el) => ({
    ancha: el.scrollWidth > el.clientWidth,
    rueda: ["auto", "scroll"].includes(getComputedStyle(el).overflowX),
  }));
  check("El menú del panel se desliza solo, sin llevarse la página",
    !tira.ancha || tira.rueda, JSON.stringify(tira));

  const alto = await p.locator(".panel-nav-item").first().evaluate((e) => Math.round(e.getBoundingClientRect().height));
  check("Y sus apartados se pulsan con el dedo", alto >= 40, `${alto}px`);

  for (const nombre of APARTADOS) {
    const boton = p.locator(`.panel-nav-item:has-text("${nombre}")`).first();
    if (!(await boton.count())) { check(`Existe el apartado ${nombre}`, false); continue; }
    await boton.click();
    await p.waitForTimeout(1400);

    const desborde = await sinDesbordar(p);
    const fuera = await seSalen(p);
    check(`«${nombre}» cabe en la pantalla`, desborde === 0 && fuera.length === 0,
      desborde ? `+${desborde}px` : fuera.join(", "));
  }

  await p.locator('.panel-nav-item:has-text("Mi marca")').click();
  await p.waitForTimeout(1200);
  /* Formulario y vista previa, uno debajo del otro: en dos columnas de 300px
     mínimo no caben en 390, y la de la derecha se iba fuera de la pantalla */
  const columnas = await p.locator(".panel-marca").evaluate(
    (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length
  );
  check("En «Mi marca», el formulario y su vista previa van uno debajo del otro",
    columnas === 1, `${columnas} columna(s)`);

  await p.screenshot({ path: __dirname + "/97-panel-movil.png", fullPage: true });

  /* ---------- Las tablas, con clientes de verdad ----------
   *
   * El proveedor de arriba acaba de darse de alta y no tiene ninguno, así
   * que sus tablas están vacías y no prueban nada. El de la siembra tiene
   * veinticuatro clientes y tres revendedores, que es donde se veía el
   * problema: siete columnas son 932px de tabla en 390px de pantalla, y la
   * de los botones —la que hace algo— se quedaba fuera.
   */
  const entrada = await fetch(BASE + "/api/provider/auth", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "login", email: "demo@totalplayer.app", password: "demo12345" }),
  });
  const galleta = (entrada.headers.getSetCookie?.() || []).find((c) => c.startsWith("xp_provider="));
  const conDatos = await b.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
  });
  await conDatos.addCookies([{
    name: "xp_provider", value: galleta.split(";")[0].split("=").slice(1).join("="),
    domain: new URL(BASE).hostname, path: "/",
  }]);
  const d = await conDatos.newPage();
  d.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));

  for (const [nombre, titulo] of [["Clientes", "Usuario"], ["Revendedores", "Email"]]) {
    await d.goto(BASE + "/panel", { waitUntil: "networkidle" });
    await d.locator(`.panel-nav-item:has-text("${nombre}")`).first().click();
    await d.waitForSelector(".panel-table tbody tr", { timeout: 25000 });
    await d.waitForTimeout(1200);

    const t = await d.evaluate(() => {
      const tabla = document.querySelector(".panel-table");
      const fila = tabla.querySelector("tbody tr");
      const celdas = [...fila.querySelectorAll("td")];
      return {
        anchoTabla: tabla.scrollWidth,
        pantalla: window.innerWidth,
        // Cada dato lleva al lado de qué es: si no, es una lista de valores sueltos
        etiquetadas: celdas.filter((e) => e.getAttribute("data-etiqueta") || e.classList.contains("celda-titulo") || e.classList.contains("col-actions")).length,
        celdas: celdas.length,
        todoALaVista: celdas.every((e) => e.getBoundingClientRect().right <= window.innerWidth + 1),
        acciones: [...fila.querySelectorAll(".row-actions .btn, .row-actions .icon-btn")]
          .map((e) => Math.round(e.getBoundingClientRect().height)),
      };
    });

    check(`La lista de ${nombre.toLowerCase()} cabe en el móvil`,
      t.anchoTabla <= t.pantalla, `${t.anchoTabla}px en ${t.pantalla}px`);
    check(`Y se ve entera, sin arrastrarla de lado`, t.todoALaVista);
    check(`Con cada dato diciendo de qué es`, t.etiquetadas === t.celdas, `${t.etiquetadas}/${t.celdas}`);
    /* Es lo que se va a un panel en el móvil a hacer: desactivar a quien no
       ha pagado. Estaba fuera de la pantalla. */
    check(`Y los botones de cada ${titulo === "Usuario" ? "cliente" : "revendedor"} se pulsan con el dedo`,
      t.acciones.length > 0 && t.acciones.every((h) => h >= 44), t.acciones.join(", ") + "px");
  }
  /* Los dominios ya eran fichas, pero editar y eliminar medían 45×31. Y
     editar es lo que salva el día cuando un dominio cae: se cambia aquí y
     todos sus clientes pasan al nuevo destino sin tocar nada más. */
  await d.goto(BASE + "/panel", { waitUntil: "networkidle" });
  await d.locator('.panel-nav-item:has-text("Dominios")').first().click();
  await d.waitForSelector(".domain-card", { timeout: 25000 });
  await d.waitForTimeout(1000);
  const mandosDominio = await d.locator(".domain-card-head .btn").evaluateAll(
    (els) => els.map((e) => Math.round(e.getBoundingClientRect().height))
  );
  check("Y los dominios se editan y se borran con el dedo",
    mandosDominio.length > 0 && mandosDominio.every((h) => h >= 44),
    [...new Set(mandosDominio)].join(", ") + "px");

  await d.screenshot({ path: __dirname + "/98-panel-movil-listas.png", fullPage: true });

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas del panel en el móvil OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
