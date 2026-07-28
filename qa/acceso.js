// Las tres puertas de entrada, y la vuelta a donde ibas.
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`); };

(async () => {
  const RUN = Date.now().toString(36).slice(-5);
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

  // --- Cuenta propia: registrarse y volver a entrar ---
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(BASE + "/registro", { waitUntil: "networkidle" });
  await p.fill("#email", `propia${RUN}@t.com`);
  await p.fill("#password", "supersecreta1");
  await p.click("button:has-text('Crear cuenta')");
  await p.waitForURL(/\/player/, { timeout: 20000 });
  check("Se crea una cuenta propia y entra al reproductor", true);

  await ctx.clearCookies();

  /*
   * Aquí estaba el agujero: /login redirigía a /acceso, donde solo se entra
   * como cliente de un proveedor o como proveedor. La cuenta propia no tenía
   * puerta de vuelta: se creaba y, al caducar la sesión, fuera para siempre.
   */
  await p.goto(BASE + "/login", { waitUntil: "networkidle" });
  check("/login enseña el acceso de cuenta propia", await p.locator("#email").isVisible());
  check("Y no rebota a /acceso", new URL(p.url()).pathname === "/login", p.url());

  await p.fill("#email", `propia${RUN}@t.com`);
  await p.fill("#password", "supersecreta1");
  await p.click("button:has-text('Entrar')");
  await p.waitForURL(/\/player/, { timeout: 20000 });
  check("Se vuelve a entrar con la cuenta creada", true);

  // --- La administración ---
  await p.goto(BASE + "/admin", { waitUntil: "networkidle" });
  await p.waitForSelector(".auth-card", { timeout: 15000 });
  check("Una cuenta normal no ve el panel", (await p.locator("h1").innerText()).includes("Solo administración"));

  // El botón del portero promete devolverte a /admin: que lo cumpla
  await p.click(".auth-card a:has-text('Iniciar sesión')");
  await p.waitForSelector("#email", { timeout: 15000 });
  check("Y su botón lleva al acceso, no a la home", new URL(p.url()).pathname === "/login", p.url());
  check("Recordando a dónde ibas", new URL(p.url()).searchParams.get("next") === "/admin");

  await p.fill("#email", "admin@totalplayer.app");
  await p.fill("#password", "admin12345");
  await p.click("button:has-text('Entrar')");
  await p.waitForURL(/\/admin/, { timeout: 20000 });
  check("Tras entrar te devuelve a /admin", true);
  await p.waitForSelector(".panel-nav", { timeout: 20000 });
  check("Y el administrador sí ve el panel", !(await p.locator("h1:has-text('Solo administración')").isVisible().catch(() => false)));

  // --- Desde «Entrar» se llega a la cuenta propia ---
  const p2 = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await p2.goto(BASE + "/acceso", { waitUntil: "networkidle" });
  const puertas = await p2.locator(".access-tab strong").allInnerTexts();
  check("«Entrar» sigue ofreciendo cliente y proveedor", puertas.length === 2, puertas.join(" | "));
  check("Y un enlace para la cuenta propia", await p2.locator("a[href='/login']").isVisible());
  await p2.click("a[href='/login']");
  await p2.waitForSelector("#email", { timeout: 15000 });
  check("Que abre su acceso", true);

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas de acceso OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
