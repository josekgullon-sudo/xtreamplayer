// E2E completo: añadir lista M3U y Xtream por UI, navegar y reproducir vídeo real.
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));

  // ---------- M3U como invitado ----------
  await page.goto(BASE + "/player", { waitUntil: "networkidle" });
  await page.locator(".pa-welcome .btn-primary").click();
  await page.waitForSelector(".modal");
  await page.click(".modal .pa-tab:has-text('URL M3U')");
  await page.fill("#pl-name", "Lista Test");
  await page.fill("#pl-m3u", "http://127.0.0.1:8090/lista.m3u");
  await page.click(".modal button[type=submit]");
  await page.waitForSelector(".pa-live-cat:not(.pa-live-reciente)", { timeout: 15000 });
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
  await page.click('.pa-nav-item:has-text("Favoritos")');
  await page.waitForTimeout(400);
  const favVisible = await page.locator(".pa-live-chan", { hasText: "Canal Test WebM" }).count();
  check("Favoritos funciona", favVisible >= 1);
  await page.click('.pa-nav-item:has-text(\"Canales\")');

  // Búsqueda. El campo vive plegado tras una lupa: primero se abre
  await page.locator(".pa-nav-busca .pa-icon-btn").click();
  await page.fill(".pa-nav-busca input", "Deporte");
  await page.waitForTimeout(400);
  const filtered = await page.locator(".pa-live-chan").allInnerTexts();
  check("Búsqueda filtra", filtered.length >= 1 && filtered.every((t) => t.toLowerCase().includes("deporte")), filtered.join("|"));
  await page.fill(".pa-nav-busca input", "");
  await page.keyboard.press("Escape"); // salir del campo de búsqueda

  // Zapping con teclado
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(800);
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
  await page.locator('.pa-nav .pa-icon-btn[aria-label="Añadir lista"]').click();
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

  await page.waitForSelector('.pa-nav-item:has-text(\"Películas\")', { timeout: 15000 });
  check("Xtream conectado (handshake OK)", true);

  await page.waitForSelector(".pa-live-cat:not(.pa-live-reciente)", { timeout: 15000 });
  const xg = await page.locator(".pa-live-cat:not(.pa-live-reciente)").allInnerTexts();
  check("Categorías directo Xtream", xg.some((g) => g.includes("Generalistas")) && xg.some((g) => g.includes("Deportes")), xg.join(" | "));

  // Credenciales inválidas → error claro
  // (comprobamos después; primero VOD y series)

  // Cine
  await page.click('.pa-nav-item:has-text(\"Películas\")');
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
  await page.click('.pa-nav-item:has-text(\"Series\")');
  await page.waitForSelector(".pa-card", { timeout: 15000 });
  await page.locator(".pa-card", { hasText: "Serie Demo" }).click();
  await page.waitForSelector(".pa-episode", { timeout: 15000 });
  const eps = await page.locator(".pa-episode").allInnerTexts();
  check("Detalle de serie con episodios", eps.length === 2 && eps[0].includes("Piloto"), eps.join(" | "));
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
  await page.click('.pa-nav-item:has-text(\"TV en directo\")');
  await page.waitForSelector(".pa-live-cat:not(.pa-live-reciente)", { timeout: 15000 });
  await page.locator(".pa-live-cat", { hasText: "Generalistas" }).click();
  await page.locator(".pa-live-chan", { hasText: "La Uno Test" }).click();
  await page.waitForSelector(".pa-live-titulo p", { timeout: 15000 });
  const epgText = await page.locator(".pa-live-titulo p").innerText();
  check("EPG ahora/después decodificada", epgText.includes("Telediario de prueba") && epgText.includes("El programa siguiente"), epgText);

  // Credenciales malas
  await page.locator('.pa-nav .pa-icon-btn[aria-label="Añadir lista"]').click();
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
  const before = await page.locator(".pa-nav-lista option").count();
  await page.locator(".pa-nav .pa-icon-btn-danger").click();
  await page.waitForTimeout(500);
  const after = await page.locator(".pa-nav-lista option").count();
  check("Eliminar lista funciona", after === before - 1, `${before} → ${after}`);

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} pruebas E2E OK`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
