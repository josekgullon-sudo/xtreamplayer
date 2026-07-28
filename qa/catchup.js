// Catch Up: volver a ver lo que ya se emitió.
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`); };

async function enLaGuia(p) {
  await p.goto(BASE + "/player", { waitUntil: "networkidle" });
  await p.waitForSelector(".pa-welcome", { timeout: 20000 });
  await p.click(".pa-welcome .btn-primary");
  await p.waitForSelector(".modal");
  await p.fill("#pl-name", "CatchUp");
  await p.fill("#pl-host", "127.0.0.1:8090");
  await p.fill("#pl-user", "demo");
  await p.fill("#pl-pass", "demo123");
  await p.click(".modal button[type=submit]");
  await p.waitForSelector(".section-gate", { timeout: 25000 });
  await p.locator(".section-card:has-text('TV en directo')").click();
  await p.waitForSelector(".pa-live-cat:not(.pa-live-reciente)", { timeout: 20000 });
  await p.locator('.pa-nav-item:has-text("Guía")').click();
  await p.waitForSelector(".pa-guia-prog", { timeout: 25000 });
}

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
  p.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));

  // La petición al panel se mira por dentro: es lo único que demuestra que
  // se pide la grabación y no el directo
  const pedidas = [];
  p.on("request", (req) => {
    if (req.url().includes("timeshift.php")) pedidas.push(req.url());
  });

  await enLaGuia(p);

  check("El canal con archivo va marcado", (await p.locator(".pa-guia-marca").count()) >= 1);

  // Retrocedemos para tener programas ya emitidos a la vista
  await p.locator(".pa-guia-barra button[aria-label='Una hora antes']").click();
  await p.waitForTimeout(600);
  const recuperables = await p.locator(".pa-guia-prog.recuperable").count();
  check("Lo ya emitido se puede recuperar", recuperables >= 1, `${recuperables} programas`);
  check("Y lo que se emite ahora no se marca como grabación",
    (await p.locator(".pa-guia-prog.emitiendo.recuperable").count()) === 0);
  await p.screenshot({ path: __dirname + "/82-catchup.png" });

  const titulo = (await p.locator(".pa-guia-prog.recuperable .pa-guia-prog-titulo").first().innerText()).trim();
  await p.locator(".pa-guia-prog.recuperable").first().click();
  await p.waitForSelector(".pa-video-zone video", { timeout: 20000 });
  check("Pulsarlo abre el reproductor", true);

  await p.waitForFunction(() => window.__nada === undefined, {}, { timeout: 100 }).catch(() => {});
  await p.waitForTimeout(2500);
  check("Y pide la grabación al panel, no el directo", pedidas.length >= 1, pedidas[0] ? pedidas[0].split("?")[0] : "ninguna petición");

  if (pedidas.length) {
    const q = new URL(pedidas[0]).searchParams;
    check("Con la hora de inicio en el formato del panel", /^\d{4}-\d{2}-\d{2}:\d{2}-\d{2}$/.test(q.get("start") || ""), q.get("start"));
    check("Y la duración en minutos", Number(q.get("duration")) > 0, q.get("duration"));
    check("Del canal que se pulsó", q.get("stream") === "1", q.get("stream"));
  }

  check("El título que se ve es el del programa, no el del canal",
    (await p.locator(".pa-live-titulo h2").innerText()).trim() === titulo,
    titulo);

  // Un canal sin archivo no ofrece nada que recuperar
  await p.locator('.pa-nav-item:has-text("Guía")').click();
  await p.waitForSelector(".pa-guia-fila", { timeout: 20000 });
  await p.locator(".pa-guia .pa-live-cat").nth(1).click();
  await p.waitForTimeout(1200);
  check("Un canal sin archivo no se marca", (await p.locator(".pa-guia-marca").count()) === 0);

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas de Catch Up OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
