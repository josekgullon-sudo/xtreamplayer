// Capturas para revisar el diseño a ojo. No es una prueba: no comprueba nada,
// solo retrata las pantallas que venden el producto para poder mirarlas.
const { chromium, ejecutable } = require("./navegador");
const fs = require("fs");

const B = "http://localhost:3101";
const D = "/tmp/rev";

(async () => {
  fs.mkdirSync(D, { recursive: true });
  const nav = await chromium.launch({ ...ejecutable });

  /*
   * `completa` retrata la página entera y no solo la primera pantalla.
   *
   * Para las de venta —portada, precios, aparatos— es lo único que sirve:
   * mirar solo el titular no dice si la tabla de tramos o las tarjetas de
   * funciones están bien puestas, que es lo que hay debajo. Para las de la
   * aplicación —el reproductor, la cuenta— la primera pantalla ES la
   * pantalla, y una foto de tres metros de alto se lee peor.
   */
  async function foto(nombre, ancho, alto, ir, antes, completa = false) {
    const ctx = await nav.newContext({ viewport: { width: ancho, height: alto } });
    const p = await ctx.newPage();
    await p.goto(B + ir, { waitUntil: "networkidle" }).catch(() => {});
    if (antes) await antes(p).catch((e) => console.log("  aviso:", nombre, String(e).slice(0, 90)));
    /*
     * Se baja la página entera antes de retratarla.
     *
     * Media web pública aparece al llegar a ella (`components/Aparece.tsx`):
     * nace a opacidad cero y se enciende cuando el observador la ve entrar.
     * Sin bajar antes, lo que sale en la foto son huecos donde están las seis
     * tarjetas de funciones o la tabla de tramos — y esto existe justamente
     * para mirar esas pantallas, así que la foto mentía en lo único que se le
     * pedía. Con pausas de verdad entre saltos: el observador avisa en el
     * siguiente fotograma, y bajando de golpe no le da tiempo a ninguno.
     */
    await p.evaluate(async () => {
      const paso = Math.round(window.innerHeight * 0.6);
      for (let y = 0; y < document.documentElement.scrollHeight; y += paso) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 250));
      }
      window.scrollTo(0, 0);
    });
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${D}/${nombre}.png`, fullPage: completa });
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

  await foto("01-portada", 1440, 900, "/", null, true);
  await foto("02-portada-movil", 390, 844, "/", null, true);
  await foto("03-precios", 1440, 900, "/precios", null, true);
  await foto("04-precios-movil", 390, 844, "/precios", null, true);
  await foto("05-panel", 1440, 900, "/", entrarProveedor);
  await foto("06-panel-movil", 390, 844, "/", entrarProveedor);
  await foto("07-apps", 1440, 900, "/apps", null, true);
  await foto("08-player", 1440, 900, "/player");
  await foto("10-cuenta", 1440, 900, "/mi-cuenta");

  await nav.close();
})();
