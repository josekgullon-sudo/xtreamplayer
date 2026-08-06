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

  const entrarProveedor = async (p) => {
    await p.fill("#email", "demo@proveedor.test");
    await p.fill("#password", "demo12345");
    await p.click("button[type=submit]");
    await p.waitForTimeout(2500);
  };

  await foto("01-portada", 1440, 900, "/");
  await foto("02-portada-movil", 390, 844, "/");
  await foto("03-precios", 1440, 900, "/precios");
  await foto("04-precios-movil", 390, 844, "/precios");
  await foto("05-panel", 1440, 900, "/panel", entrarProveedor);
  await foto("06-panel-movil", 390, 844, "/panel", entrarProveedor);
  await foto("07-apps", 1440, 900, "/apps");
  await foto("08-player", 1440, 900, "/player");

  await nav.close();
})();
