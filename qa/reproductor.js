// Los mandos del reproductor: lo que se toca mientras se ve algo.
//
// Es la pantalla donde el cliente pasa el rato y la que menos se probaba:
// aquí estaba la barra gris del navegador —la de un ratón—, sin título, sin
// saltos de diez segundos, sin idiomas y sin manera de usarla con un mando.
// Se comprueba lo que hace, no cómo se ve: que el salto mueva el vídeo, que
// la pausa lo pare, que en directo no haya barra de avance y que en una
// serie se pueda pasar al episodio siguiente sin esperar a los créditos.
const { chromium, ejecutable } = require("./navegador");
const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`); };

const enPunto = (p) => p.evaluate(() => document.querySelector("video")?.currentTime ?? -1);
const parado = (p) => p.evaluate(() => document.querySelector("video")?.paused ?? null);
const hay = (p, sel) => p.locator(sel).count().then((n) => n > 0);

/**
 * Volver a dejarlo sonando desde el principio.
 *
 * El vídeo de pruebas dura seis segundos, así que cualquier salto lo lleva
 * al final y lo que se comprueba después —la pausa, la capa que se va sola—
 * mediría un vídeo terminado en vez de uno reproduciéndose. Esto no forma
 * parte de lo que se prueba: es dejar el banco de pruebas como estaba.
 */
async function volverAPonerlo(p) {
  await p.evaluate(async () => {
    const v = document.querySelector("video");
    v.currentTime = 0;
    await v.play().catch(() => {});
  });
  await p.waitForTimeout(400);
}

/** Con algo puesto y sonando de verdad, que es cuando aparecen los mandos. */
async function esperarVideo(p) {
  await p.waitForFunction(
    () => { const v = document.querySelector("video"); return v && v.currentTime > 0.15 && !v.paused; },
    { timeout: 30000 }
  );
}

(async () => {
  const b = await chromium.launch({ ...ejecutable, args: ["--autoplay-policy=no-user-gesture-required"] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const fallos = [];
  p.on("pageerror", (e) => fallos.push(String(e).slice(0, 160)));

  // Una lista propia, que es por donde entra quien usa la web
  await p.goto(BASE + "/player", { waitUntil: "networkidle" });
  await p.waitForSelector(".pa-welcome", { timeout: 20000 });
  await p.locator(".pa-welcome button:has-text('propia lista')").click();
  await p.waitForSelector(".modal");
  await p.fill("#pl-name", "Casa");
  await p.fill("#pl-host", "http://127.0.0.1:8090");
  await p.fill("#pl-user", "demo");
  await p.fill("#pl-pass", "demo123");
  await p.click(".modal button[type=submit]");
  await p.waitForSelector(".section-gate, .pa-rail", { timeout: 30000 });
  if (await hay(p, ".section-gate")) await p.locator(".section-card").first().click();
  await p.waitForTimeout(3000);

  const ir = async (t) => { await p.locator(`.pa-rail-item:has-text('${t}')`).first().click({ timeout: 10000 }); await p.waitForTimeout(2200); };

  /* ---------------- Un canal en directo ---------------- */
  await ir("Directo");
  await p.waitForSelector(".pa-live-cat:not(.pa-live-reciente)", { timeout: 20000 });
  await p.locator(".pa-live-cat:not(.pa-live-reciente)").first().click();
  await p.waitForSelector(".pa-live-chan", { timeout: 20000 });
  await p.locator(".pa-live-chan").first().click();
  /*
   * Aquí no se espera a que salga imagen, y no es por vagancia.
   *
   * El Chromium con el que se ejecuta esto no trae los códecs propietarios,
   * así que un canal en MPEG-TS —que es lo que manda un panel de verdad—
   * no puede descodificarse en esta máquina por muy bien que funcione en
   * casa del cliente. Lo que sí se puede comprobar, y es lo que importa de
   * los mandos, es que la capa dice que esto es un directo y no ofrece
   * saltar a ninguna parte. Que el orden de los intentos sea el bueno lo
   * comprueba qa/cliente-ux.js, y que un canal llegue a verse, la misma
   * suite con una lista M3U en un formato que este navegador sí abre.
   */
  await p.waitForSelector(".pa-osd", { timeout: 20000 });
  await p.mouse.move(1000, 300);

  check("En directo se dice que es en directo", await hay(p, ".pa-osd-vivo"));
  /* Y no hay barra de avance: en un canal no hay a dónde saltar, y una
     barra ahí solo puede mentir sobre cuánto queda */
  check("Y no hay barra de avance, que en un canal no significa nada",
    !(await hay(p, ".pa-osd-slider")));
  check("Ni botones de saltar diez segundos",
    !(await hay(p, "button[aria-label='Adelante 10 segundos']")));

  /* ---------------- Una película ---------------- */
  /* Se sale del canal antes: el vídeo ocupa la pantalla y mientras está
     puesto se come los clics de lo que hay detrás */
  await p.mouse.move(1000, 300);
  await p.locator(".pa-osd-btn[aria-label='Volver']").click();
  await p.waitForTimeout(1000);
  await ir("Cine");
  await p.locator(".pa-card").first().click({ timeout: 10000 });
  await p.waitForTimeout(2500);
  await p.locator("button:has-text('Reproducir')").first().click({ timeout: 10000 });
  await esperarVideo(p);
  await p.mouse.move(720, 450);

  check("Sobre el vídeo hay mandos propios, no la barra gris del navegador",
    (await hay(p, ".pa-osd")) && !(await p.evaluate(() => document.querySelector("video")?.hasAttribute("controls"))));
  check("Y dicen qué se está viendo, que ninguna otra cosa lo dice",
    (await p.locator(".pa-osd-titulo").innerText()).trim().length > 0,
    await p.locator(".pa-osd-titulo").innerText());

  /*
   * El salto de diez segundos.
   *
   * Se mide sobre el vídeo y no sobre la barra: una barra que se mueve sin
   * que se mueva la imagen es exactamente el fallo que esto tiene que
   * cazar. El vídeo de pruebas dura seis segundos, así que diez adelante
   * topan con el final —que es lo que debe pasar— y desde ahí se prueba el
   * de atrás, que sí tiene recorrido.
   */
  await p.locator("button[aria-label='Adelante 10 segundos']").click();
  await p.waitForTimeout(600);
  const alFinal = await enPunto(p);
  check("Adelantar diez segundos mueve el vídeo, sin pasarse del final",
    alFinal > 3 && alFinal <= 6, `${alFinal.toFixed(1)}s de 6`);

  await p.mouse.move(720, 460);
  await p.locator("button[aria-label='Atrás 10 segundos']").click();
  await p.waitForTimeout(600);
  const atras = await enPunto(p);
  check("Y atrás diez segundos vuelve, sin pasarse del principio",
    atras >= 0 && atras < alFinal, `${atras.toFixed(1)}s`);

  /* Pausa y sigue, con el ratón y con la barra espaciadora */
  await volverAPonerlo(p);
  await p.mouse.move(720, 460);
  await p.locator("button[aria-label='Pausa']").click();
  await p.waitForTimeout(500);
  check("El botón de pausa para el vídeo", (await parado(p)) === true);
  await p.keyboard.press(" ");
  await p.waitForTimeout(600);
  check("Y la barra espaciadora lo vuelve a poner", (await parado(p)) === false);

  /* La capa se va sola: es lo que la distingue de una barra fija */
  await volverAPonerlo(p);
  await p.mouse.move(720, 460);
  await p.waitForTimeout(400);
  check("Los mandos aparecen al mover el ratón",
    await p.evaluate(() => !document.querySelector(".pa-video-zone")?.classList.contains("sin-mandos")));
  await p.mouse.move(2, 2);
  await p.waitForTimeout(3600);
  check("Y se van solos, que lo que se ha venido a ver es la imagen",
    await p.evaluate(() => document.querySelector(".pa-video-zone")?.classList.contains("sin-mandos")));

  /* Con el vídeo parado se quedan: nadie busca el botón a ciegas */
  await volverAPonerlo(p);
  await p.mouse.move(720, 460);
  await p.locator("button[aria-label='Pausa']").click();
  await p.waitForTimeout(3600);
  check("Con el vídeo parado no se van",
    await p.evaluate(() => !document.querySelector(".pa-video-zone")?.classList.contains("sin-mandos")));

  /*
   * Y al volver se cae en la ficha de la que se entró, no en la lista:
   * ATRÁS deshace un paso, no te saca del todo.
   */
  await volverAPonerlo(p);
  await p.mouse.move(720, 460);
  await p.locator(".pa-osd-btn[aria-label='Volver']").click();
  await p.waitForSelector(".pa-video-zone", { state: "detached", timeout: 15000 }).catch(() => {});
  check("Al volver del vídeo se cae en la ficha de la que se entró",
    (await hay(p, ".ficha")) || (await hay(p, ".modal-backdrop")));

  check("Sin errores de JavaScript en todo el recorrido", fallos.length === 0, fallos[0] || "");

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas del reproductor OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
