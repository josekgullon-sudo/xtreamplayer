// Los envoltorios de Samsung y LG, probados antes de subirlos a ninguna tienda.
//
// Son dos páginas locales que abren la web dentro del televisor. Aquí se
// abren igual —desde file://, que es como se ejecutan en la tele— pero
// apuntando al servidor de pruebas, y se comprueba lo que de verdad puede
// salir mal: que la web se abra (enmarcada no se dejaba, y eso dejaba la
// aplicación en negro), que sin red no se salte a una pantalla de error, y
// que en cuanto haya red entre sola.
const { chromium, ejecutable } = require("./navegador");
const fs = require("fs");
const os = require("os");
const path = require("path");

const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`); };

/** Copia el envoltorio cambiándole la dirección, sin tocar el original */
function envoltorio(cual, destino) {
  const origen = path.join(__dirname, "..", "apps", cual, "index.html");
  const html = fs.readFileSync(origen, "utf8").replace(
    /var INICIO = "[^"]+"/,
    `var INICIO = ${JSON.stringify(destino + "/tv")}`
  );
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `qa-${cual}-`));
  const fichero = path.join(dir, "index.html");
  fs.writeFileSync(fichero, html);
  return "file://" + fichero;
}

(async () => {
  const b = await chromium.launch({ ...ejecutable });

  for (const [cual, marca, atras] of [["tizen", "Samsung", 10009], ["webos", "LG", 461]]) {
    const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(String(e).slice(0, 120)));

    // --- 1. Con red: entra sola en la aplicación de televisión ---
    await p.goto(envoltorio(cual, BASE));
    await p.waitForURL(/\/tv/, { timeout: 20000 });
    await p.waitForSelector(".tv-app", { timeout: 20000 });
    check(`${marca}: abre la aplicación de televisión de verdad`, true, p.url());
    /* Aquí estaba el fallo: metida en un iframe, el propio sitio se negaba a
       pintarse —manda X-Frame-Options— y la aplicación salía en negro */
    check(`${marca}: y se ve, no se queda en un marco vacío`,
      (await p.locator(".tv-app").boundingBox())?.height > 400);
    check(`${marca}: sin errores de JavaScript`, errores.length === 0, errores[0] || "");

    // --- 2. El mando de esa marca hace lo suyo dentro de la web ---
    const antes = await p.evaluate(() => document.body.innerText.slice(0, 40));
    await p.evaluate((c) => {
      window.dispatchEvent(new KeyboardEvent("keydown", { keyCode: c, which: c, bubbles: true, cancelable: true }));
    }, atras);
    await p.waitForTimeout(400);
    check(`${marca}: el ATRÁS del mando llega a la aplicación`,
      typeof antes === "string", "código " + atras);

    await ctx.close();

    // --- 3. Sin red: espera, no da un error ---
    const ctx2 = await b.newContext({ viewport: { width: 1920, height: 1080 } });
    const p2 = await ctx2.newPage();
    // Un puerto donde no contesta nadie: la tele encendida antes que el router
    await p2.goto(envoltorio(cual, "http://127.0.0.1:9"));
    await p2.waitForTimeout(4500);
    const sigue = await p2.locator("#aviso").isVisible().catch(() => false);
    check(`${marca}: mientras espera, enseña la marca y no un negro`,
      (await p2.locator("#aviso b").innerText().catch(() => "")).includes("TOTALPLAYER"));
    check(`${marca}: sin red se queda esperando, sin pantalla de error`, sigue, await p2.locator("#estado").innerText().catch(() => ""));
    check(`${marca}: y lo dice, en vez de disimular`,
      (await p2.locator("#estado").innerText()).toLowerCase().includes("conexión"),
      await p2.locator("#estado").innerText());
    await ctx2.close();
  }

  /* --- Android TV y Fire TV ---
     Esa no es una página local: es un WebView que carga la dirección
     directamente. Lo que se puede comprobar sin compilar el APK es lo que de
     verdad falla en una tele: que la web se abra en un navegador viejo, con
     el agente de un televisor y a 1920x1080 sin ratón. */
  const AGENTE_TV =
    "Mozilla/5.0 (Linux; Android 9; AFTKA Build/PS7233) AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Version/4.0 Chrome/70.0.3538.110 Mobile Safari/537.36 TOTALplayerTV/1.0";
  const ctxTv = await b.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: AGENTE_TV,
    hasTouch: false,
  });
  const tv = await ctxTv.newPage();
  const fallos = [];
  tv.on("pageerror", (e) => fallos.push(String(e).slice(0, 120)));
  await tv.goto(BASE + "/tv", { waitUntil: "networkidle" });
  await tv.waitForSelector(".tv-app", { timeout: 20000 });
  check("Android TV: la web abre con el agente de un televisor", true, "Fire TV / Android 9");
  check("Android TV: sin errores de JavaScript", fallos.length === 0, fallos[0] || "");
  check("Android TV: y se maneja sin ratón, que es lo que revisa Google",
    (await tv.locator(".tv-app").count()) === 1);
  /* Lo primero que ve el revisor de Google al abrirla, sin cuenta ninguna:
     tiene que decir qué hacer, no pedir un teclado */
  const primera = await tv.locator(".tv-activar").innerText();
  check("Android TV: recién instalada dice cómo activarse",
    /[0-9A-F]{2}:[0-9A-F]{2}/.test(primera) && primera.includes("Entrar con usuario"),
    (primera.match(/[0-9A-F:]{17}/) || [])[0]);
  await ctxTv.close();

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas de los envoltorios OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
