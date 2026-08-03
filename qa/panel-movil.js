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

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas del panel en el móvil OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
