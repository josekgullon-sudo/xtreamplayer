// E2E completo: añadir lista M3U y Xtream por UI, navegar y reproducir vídeo real.
const { chromium, ejecutable } = require("./navegador");

const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

(async () => {
  const browser = await chromium.launch({ ...ejecutable });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));

  // ---------- M3U como invitado ----------
  await page.goto(BASE + "/player", { waitUntil: "networkidle" });
  await page.locator(".pa-welcome button:has-text('Tengo mi propia lista')").click();
  await page.waitForSelector(".modal");
  await page.click(".modal .pa-tab:has-text('URL M3U')");
  await page.fill("#pl-name", "Lista Test");
  await page.fill("#pl-m3u", "http://127.0.0.1:8090/lista.m3u");
  await page.click(".modal button[type=submit]");
  /* «Todos los canales» aparece antes que las carpetas de la lista: si nos
     conformamos con la primera coincidencia, leemos la columna a medio
     hacer y la comprobación falla a ratos */
  await page.waitForFunction(
    () => document.querySelectorAll(".pa-live-cat:not(.pa-live-reciente)").length >= 2,
    { timeout: 15000 }
  );
  check("M3U añadida y canales cargados", true);

  const groups = await page.locator(".pa-live-cat:not(.pa-live-reciente)").allInnerTexts();
  check("Grupos del M3U", groups.some((g) => g.includes("Pruebas")) && groups.some((g) => g.includes("Deportes")), groups.join(" | "));

  // Expandir grupo y reproducir
  await page.locator(".pa-live-cat:not(.pa-live-reciente)", { hasText: "Pruebas" }).click();
  await page.locator(".pa-live-chan", { hasText: "Canal Test WebM" }).click();
  await page.waitForFunction(
    () => {
      const v = document.querySelector(".pa-video-zone video");
      return v && v.currentTime > 0.3 && !v.paused;
    },
    { timeout: 20000 }
  );
  check("▶ VÍDEO REPRODUCIENDO (M3U → nativo)", true);
  await page.screenshot({ path: __dirname + "/07-playing-m3u.png" });

  check("Now playing visible", (await page.locator(".pa-live-titulo h2").innerText()).includes("Canal Test WebM"));

  // Favorito
  await page.locator(".pa-live-titulo button", { hasText: "Favorito" }).click();
  await page.click('.pa-rail-item:has-text("Favoritos")');
  /* Se espera a que el canal esté en la lista, no a que pasen 400 ms. Con un
     tiempo fijo, en una máquina lenta se cuenta antes de que la lista se haya
     repintado y la comprobación falla sin que nada esté roto */
  const enFavoritos = page.locator(".pa-live-chan", { hasText: "Canal Test WebM" });
  await enFavoritos.first().waitFor({ timeout: 15000 }).catch(() => {});
  check("Favoritos funciona", (await enFavoritos.count()) >= 1);
  await page.click('.pa-rail-item:has-text(\"Canales\")');

  // Búsqueda. El campo se llama desde el carril y aparece flotando encima
  await page.locator('[aria-label="Buscar"]:visible').click();
  await page.fill(".pa-busca input", "Deporte");
  /* Y aquí igual: se espera a que TODO lo que queda a la vista case con lo
     buscado, que es lo que dice la comprobación de la línea siguiente */
  await page
    .waitForFunction(
      () => {
        const filas = [...document.querySelectorAll(".pa-live-chan")];
        return filas.length > 0 && filas.every((f) => /deporte/i.test(f.innerText));
      },
      { timeout: 15000 }
    )
    .catch(() => {});
  const filtered = await page.locator(".pa-live-chan").allInnerTexts();
  check("Búsqueda filtra", filtered.length >= 1 && filtered.every((t) => t.toLowerCase().includes("deporte")), filtered.join("|"));
  await page.fill(".pa-busca input", "");
  await page.keyboard.press("Escape"); // salir del campo de búsqueda

  // Zapping con teclado
  await page.keyboard.press("ArrowDown");
  /* Cambiar de canal pide el enlace al panel: son milisegundos aquí y pueden
     ser segundos en una máquina cargada. Se espera al cambio, no a un tiempo */
  await page
    .waitForFunction(
      () => (document.querySelector(".pa-live-titulo h2")?.innerText || "") !== "Canal Test WebM",
      { timeout: 15000 }
    )
    .catch(() => {});
  const nowTitle = await page.locator(".pa-live-titulo h2").innerText();
  check("Zapping ↓ cambia de canal", nowTitle !== "Canal Test WebM", nowTitle);

  // Persistencia tras recargar (invitado)
  await page.reload({ waitUntil: "networkidle" });
  // Al volver a entrar se pregunta qué ver, porque ya hay favoritos que ofrecer
  await page.waitForSelector(".section-gate", { timeout: 15000 });
  check("Al volver a entrar vuelve a preguntar qué ver", true);
  await page.locator(".section-card:has-text('TV en directo')").click();
  await page.waitForSelector(".pa-live-cat:not(.pa-live-reciente)", { timeout: 15000 });
  check("Lista persiste tras recargar (localStorage)", true);

  // ---------- Xtream ----------
  await page.locator('[aria-label="Listas"]:visible').click();
  await page.locator('[aria-label="Añadir lista"]:visible').click();
  await page.waitForSelector(".modal");
  await page.fill("#pl-name", "Xtream Test");
  await page.fill("#pl-host", "127.0.0.1:8090");
  await page.fill("#pl-user", "demo");
  await page.fill("#pl-pass", "demo123");
  await page.click(".modal button[type=submit]");

  // Al cambiar de lista se vuelve a preguntar qué se quiere ver
  await page.waitForSelector(".section-gate", { timeout: 20000 });
  const destinos = await page.locator(".section-card-title").allInnerTexts();
  check(
    "Una lista Xtream ofrece directo, cine y series",
    ["TV en directo", "Películas", "Series"].every((d) => destinos.includes(d)),
    destinos.join(" | ")
  );
  await page.locator(".section-card:has-text('TV en directo')").click();

  await page.waitForSelector('.pa-rail-item:has-text(\"Cine\")', { timeout: 15000 });
  check("Xtream conectado (handshake OK)", true);

  /* El carril es toda la navegación del escritorio: si le falta un destino,
     no hay otra forma de llegar a esa sección */
  const carril = await page.locator(".pa-rail-item .pa-rail-txt").allInnerTexts();
  check("El carril lleva las secciones y las herramientas",
    ["Directo", "Guía", "Cine", "Series", "Favoritos", "Buscar", "Recargar", "Listas"].every((t) => carril.includes(t)),
    carril.join(" | "));

  await page.waitForSelector(".pa-live-cat:not(.pa-live-reciente)", { timeout: 15000 });
  const xg = await page.locator(".pa-live-cat:not(.pa-live-reciente)").allInnerTexts();
  check("Categorías directo Xtream", xg.some((g) => g.includes("Generalistas")) && xg.some((g) => g.includes("Deportes")), xg.join(" | "));

  // Credenciales inválidas → error claro
  // (comprobamos después; primero VOD y series)

  // Cine
  await page.click('.pa-rail-item:has-text(\"Cine\")');
  await page.waitForSelector(".pa-card", { timeout: 15000 });
  check("Catálogo VOD carga", true);
  await page.locator(".pa-card", { hasText: "Película Demo" }).click();
  await page.waitForSelector(".ficha button:has-text('Reproducir')", { timeout: 15000 });
  check("La película abre su ficha antes de reproducir", true);
  await page.locator(".ficha button:has-text('Reproducir')").click();
  await page.waitForFunction(
    () => {
      const v = document.querySelector(".pa-video-zone video");
      return v && v.currentTime > 0.3 && !v.paused;
    },
    { timeout: 20000 }
  );
  check("▶ VÍDEO REPRODUCIENDO (Xtream VOD)", true);
  await page.screenshot({ path: __dirname + "/08-playing-vod.png" });

  // Series
  await page.click('.pa-rail-item:has-text(\"Series\")');
  await page.waitForSelector(".pa-card", { timeout: 15000 });
  await page.locator(".pa-card", { hasText: "Serie Demo" }).click();
  await page.waitForSelector(".pa-episode", { timeout: 15000 });
  const eps = await page.locator(".pa-episode").allInnerTexts();
  /* Cuántos hay lo decide el catálogo, no la prueba: clavar el número la
     rompía cada vez que el catálogo simulado crecía, sin que nada del
     producto hubiera cambiado */
  check("Detalle de serie con episodios", eps.length >= 2 && eps[0].includes("Piloto"), eps.join(" | "));
  await page.locator(".pa-episode").first().click();
  await page.waitForFunction(
    () => {
      const v = document.querySelector(".pa-video-zone video");
      return v && v.currentTime > 0.3 && !v.paused;
    },
    { timeout: 20000 }
  );
  check("▶ VÍDEO REPRODUCIENDO (episodio serie)", true);
  await page.screenshot({ path: __dirname + "/09-playing-episode.png" });

  // Directo Xtream: EPG (el stream HLS fallará con segmentos dummy, pero la EPG debe llegar)
  await page.click('.pa-rail-item:has-text(\"Directo\")');
  await page.waitForSelector(".pa-live-cat:not(.pa-live-reciente)", { timeout: 15000 });
  await page.locator(".pa-live-cat", { hasText: "Generalistas" }).click();
  await page.locator(".pa-live-chan", { hasText: "La Uno Test" }).click();
  await page.waitForSelector(".pa-live-titulo p", { timeout: 15000 });
  /*
   * La ficha del canal sale al pulsar y la guía llega después, en su propia
   * petición: desde que la ficha dejó de esperar al vídeo para pintarse, leer
   * el texto en el instante en que aparece pilla el «En directo» de relleno.
   * Se espera a la guía, que es lo que esta comprobación mira.
   */
  await page
    .waitForFunction(
      () => !/^En directo\s*$/.test(document.querySelector(".pa-live-titulo p")?.innerText || ""),
      { timeout: 15000 }
    )
    .catch(() => {});
  const epgText = await page.locator(".pa-live-titulo p").innerText();
  /*
   * «Ahora» es el que está en antena, no el primero que manda el panel.
   *
   * El servidor simulado empieza la tira una hora antes, como hacen muchos
   * paneles de verdad: el primero de la lista es «Telediario de prueba», que
   * YA TERMINÓ, y lo que se está emitiendo es «El programa siguiente». Esto
   * daba por buena la lectura ingenua —el primero— y por eso el fallo llevaba
   * ahí desde el principio sin que nadie lo viera.
   */
  check("El «ahora» es el que está en antena, no el que ya terminó",
    epgText.includes("El programa siguiente") && !epgText.includes("Telediario de prueba"), epgText);
  check("Y detrás, el de después", epgText.includes("Cine de sobremesa"), epgText);

  /* Qué echan ahora, en la propia lista y no solo dentro del canal: es lo
     que evita entrar en veinte para descubrir qué dan. El dato ya se pedía */
  await page.waitForSelector(".pa-live-chan .pa-live-ahora", { timeout: 20000 });
  const enLista = await page.locator(".pa-live-chan .pa-live-ahora").first().innerText();
  check("La lista de canales dice qué echan ahora, y es lo de ahora",
    enLista.includes("El programa siguiente") && !enLista.includes("Telediario"), enLista);
  check("Y cada carpeta lleva su icono", (await page.locator(".pa-live-cat .pa-cat-icono").count()) >= 2);

  // La otra forma de mirar la misma carpeta: el logotipo grande
  await page.locator('[aria-label="Ver en rejilla"]').click();
  await page.waitForSelector(".pa-canal-tarjeta", { timeout: 15000 });
  check("Los canales se pueden ver en rejilla", (await page.locator(".pa-canal-tarjeta").count()) >= 1);
  await page.locator('[aria-label="Ver en lista"]').click();
  await page.waitForSelector(".pa-live-chan", { timeout: 15000 });

  // Credenciales malas
  await page.locator('[aria-label="Listas"]:visible').click();
  await page.locator('[aria-label="Añadir lista"]:visible').click();
  await page.waitForSelector(".modal");
  await page.fill("#pl-host", "127.0.0.1:8090");
  await page.fill("#pl-user", "demo");
  await page.fill("#pl-pass", "MAL");
  await page.click(".modal button[type=submit]");
  await page.waitForSelector(".modal .error-box", { timeout: 15000 });
  check("Credenciales inválidas → error claro en modal", true, await page.locator(".modal .error-box").innerText());
  await page.click(".modal .btn-ghost");

  // Borrar lista
  page.on("dialog", (d) => d.accept());
  await page.locator('[aria-label="Listas"]:visible').click();
  const before = await page.locator(".pa-listas-item").count();
  await page.locator('[aria-label="Eliminar esta lista"]:visible').click();
  /* Al quedarse con otra lista, el reproductor vuelve a preguntar qué ver:
     lo que ofrece cada lista no tiene por qué ser lo mismo. Se elige, y ya
     desde dentro se mira cuántas quedan */
  await page.waitForSelector(".section-gate", { timeout: 15000 });
  await page.locator(".section-card").first().click();
  await page.locator('[aria-label="Listas"]:visible').click();
  const after = await page.locator(".pa-listas-item").count();
  check("Eliminar lista funciona", after === before - 1, `${before} → ${after}`);

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} pruebas E2E OK`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
