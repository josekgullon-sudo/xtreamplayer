// QA visual de lo que ve el cliente: que nada desborde, que se lea, que los
// objetivos táctiles sean alcanzables y que el menú de cuenta funcione.
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
const check = (n, ok, d = "") => {
  results.push({ n, ok });
  console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`);
};

const ANCHOS = [360, 390, 414, 560, 768, 900, 1024, 1280, 1440, 1920];
const PAGINAS = ["/", "/precios", "/acceso", "/faq", "/player", "/proveedores"];

async function call(path, opts = {}, cookie = "") {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers || {}) },
  });
  return { status: res.status, body: await res.json().catch(() => ({})), setCookie: res.headers.get("set-cookie") };
}
const ck = (sc, n) => {
  const m = sc?.match(new RegExp(`${n}=([^;]+)`));
  return m ? m[1] : "";
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e).slice(0, 160)));

  // ---------- Nada desborda a lo ancho ----------
  const desbordes = [];
  for (const ancho of ANCHOS) {
    await page.setViewportSize({ width: ancho, height: 900 });
    for (const ruta of PAGINAS) {
      await page.goto(BASE + ruta, { waitUntil: "networkidle" });
      const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (sobra > 1) desbordes.push(`${ruta}@${ancho}px:+${sobra}`);
    }
  }
  check("Ninguna página del cliente desborda a lo ancho", desbordes.length === 0, desbordes.join(" | ") || `${ANCHOS.length}×${PAGINAS.length} combinaciones`);

  // ---------- La cabecera no se pisa consigo misma ----------
  const choques = [];
  for (const ancho of ANCHOS) {
    await page.setViewportSize({ width: ancho, height: 900 });
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    const r = await page.evaluate(() => {
      const logo = document.querySelector(".logo")?.getBoundingClientRect();
      const acc = document.querySelector(".header-actions")?.getBoundingClientRect();
      if (!logo || !acc) return null;
      return { solapa: logo.right > acc.left + 1, fuera: acc.right > window.innerWidth + 1 };
    });
    if (r?.solapa || r?.fuera) choques.push(`${ancho}px`);
  }
  check("La cabecera nunca se solapa ni se sale", choques.length === 0, choques.join(", ") || "de 360 a 1920");

  // ---------- Contraste del texto secundario ----------
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  const contraste = await page.evaluate(() => {
    const lum = (c) => {
      const [r, g, b] = c.match(/\d+/g).slice(0, 3).map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const fondo = lum(getComputedStyle(document.body).backgroundColor);
    const peor = [".section-sub", ".feature-card p", ".hero p.sub", ".hero-note"].map((sel) => {
      const el = document.querySelector(sel);
      if (!el) return 21;
      const l = lum(getComputedStyle(el).color);
      return (Math.max(l, fondo) + 0.05) / (Math.min(l, fondo) + 0.05);
    });
    return Math.min(...peor);
  });
  check("El texto secundario cumple contraste AA (4.5:1)", contraste >= 4.5, `${contraste.toFixed(2)}:1`);

  // ---------- Objetivos táctiles en móvil ----------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  const pequenos = await page.evaluate(() =>
    [...document.querySelectorAll("header a, header button")]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({ t: el.textContent.trim().slice(0, 18), h: Math.round(el.getBoundingClientRect().height) }))
      .filter((x) => x.h < 32)
  );
  check("Los controles de la cabecera son pulsables en móvil", pequenos.length === 0, JSON.stringify(pequenos));

  // ---------- Menú de cuenta ----------
  const RUN = Date.now().toString(36).slice(-5);
  const r = await call("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: `qa${RUN}@t.com`, password: "supersecreta1" }),
  });
  await ctx.addCookies([{ name: "xp_session", value: ck(r.setCookie, "xp_session"), domain: "localhost", path: "/" }]);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForSelector(".account-avatar", { timeout: 10000 });
  check("Con sesión, la cabecera muestra un avatar y nada más", (await page.locator(".header-actions .btn").count()) === 0);
  check("El correo no queda a la vista de quien pase por delante", !(await page.locator(".header-actions").innerText()).includes("@"));

  await page.locator(".account-avatar").click();
  await page.waitForSelector(".account-pop");
  const opciones = await page.locator(".account-pop-item").allInnerTexts();
  // Cuenta, reproductor, cambiar de perfil, ver en la tele y salir
  check("El menú reúne todo lo de la sesión en un sitio", opciones.length === 5, opciones.join(" | ").replace(/\n/g, " "));
  check("Y ahí sí se ve de quién es la sesión", (await page.locator(".account-pop-mail").innerText()).includes("@"));

  await page.keyboard.press("Escape");
  check("Se cierra con Escape", (await page.locator(".account-pop").count()) === 0);

  await page.locator(".account-avatar").click();
  await page.waitForSelector(".account-pop");
  await page.mouse.click(200, 500);
  await page.waitForTimeout(200);
  check("Y al pulsar fuera", (await page.locator(".account-pop").count()) === 0);

  // ---------- Dentro del reproductor la cabecera se calla ----------
  await page.goto(BASE + "/player", { waitUntil: "networkidle" });
  const gate = page.locator(".profile-item");
  if (await gate.count()) await gate.first().click();
  await page.waitForTimeout(600);
  check("En el reproductor no hay navegación de marketing", (await page.locator(".nav-links a").count()) === 0);
  check("Ni botón para abrir lo que ya está abierto", !(await page.locator(".header-actions").innerText()).includes("Abrir reproductor"));

  check("Sin errores de JavaScript", errores.length === 0, errores.join(" | "));

  const ok = results.filter((x) => x.ok).length;
  console.log(`\n${ok}/${results.length} pruebas de diseño y accesibilidad OK`);
  await browser.close();
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => {
  console.log("FATAL", e);
  process.exit(1);
});
