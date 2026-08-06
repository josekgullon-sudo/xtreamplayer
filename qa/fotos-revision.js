// Capturas para revisar el diseño a ojo. No es una prueba: no comprueba nada,
// solo retrata las pantallas que venden el producto para poder mirarlas.
const { chromium, ejecutable } = require("./navegador");
const fs = require("fs");

const B = "http://localhost:3101";
const D = "/tmp/rev";

(async () => {
  fs.mkdirSync(D, { recursive: true });
  const nav = await chromium.launch({ ...ejecutable });

  async function foto(nombre, ancho, alto, ir, antes) {
    const ctx = await nav.newContext({ viewport: { width: ancho, height: alto } });
    const p = await ctx.newPage();
    await p.goto(B + ir, { waitUntil: "networkidle" }).catch(() => {});
    if (antes) await antes(p).catch((e) => console.log("  aviso:", nombre, String(e).slice(0, 90)));
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${D}/${nombre}.png` });
    console.log("✓", nombre);
    await ctx.close();
  }

  /* Un proveedor nuevo, como en qa/panel-ui: el del sembrado arrastra datos
     de otras pruebas y el panel sale distinto cada vez */
  const RUN = Date.now().toString(36).slice(-5);
  const entrarProveedor = async (p) => {
    await p.goto(B + "/proveedores/registro", { waitUntil: "networkidle" });
    await p.fill("#p-email", `foto${RUN}@t.com`);
    await p.fill("#p-pass", "supersecreta1");
    if (await p.locator("#p-company").count()) await p.fill("#p-company", "Marca Demo");
    await p.click("button:has-text('Empezar prueba gratis')");
    await p.waitForSelector(".panel-nav-item", { timeout: 20000 });
    await p.waitForTimeout(1500);
  };

  await foto("01-portada", 1440, 900, "/");
  await foto("02-portada-movil", 390, 844, "/");
  await foto("03-precios", 1440, 900, "/precios");
  await foto("04-precios-movil", 390, 844, "/precios");
  await foto("05-panel", 1440, 900, "/", entrarProveedor);
  await foto("06-panel-movil", 390, 844, "/", entrarProveedor);
  await foto("07-apps", 1440, 900, "/apps");
  await foto("08-player", 1440, 900, "/player");
  await foto("10-cuenta", 1440, 900, "/mi-cuenta");

  await nav.close();
})();
