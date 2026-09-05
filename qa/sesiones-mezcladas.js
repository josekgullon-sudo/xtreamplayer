// Estar dentro de varias formas a la vez sin que la cabecera se confunda.
//
// Cada rol tiene su cookie y nadie obliga a cerrar las otras, así que un
// proveedor puede tener abierta una sesión de cliente de cuando probó algo.
// Manda dónde estás, no el orden en que se miran las cookies.
const { chromium, ejecutable } = require("./navegador");
const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`); };

async function call(path, opts = {}, cookie = "") {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers || {}) },
  });
  return { status: res.status, body: await res.json().catch(() => ({})), setCookie: res.headers.get("set-cookie") };
}
const ck = (sc, n) => { const m = sc?.match(new RegExp(`${n}=([^;]+)`)); return m ? `${n}=${m[1]}` : ""; };

(async () => {
  const RUN = Date.now().toString(36).slice(-5);

  // Proveedor, su revendedor y un cliente
  let r = await call("/api/provider/auth", { method: "POST", body: JSON.stringify({ action: "register", email: `mix${RUN}@t.com`, password: "supersecreta1", company: `Mezcla ${RUN}` }) });
  const prov = ck(r.setCookie, "xp_provider");
  const dom = await call("/api/provider/domains", { method: "POST", body: JSON.stringify({ host: "127.0.0.1", port: 8090 }) }, prov);
  await call("/api/provider/customers", { method: "POST", body: JSON.stringify({ username: `cli${RUN}`, password: "clave1234", domainId: dom.body.domain.id }) }, prov);
  await call("/api/provider/resellers", { method: "POST", body: JSON.stringify({ email: `rev${RUN}@t.com`, password: "revendedor123", name: `Revende ${RUN}` }) }, prov);

  const b = await chromium.launch({ ...ejecutable });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();

  // 1) Primero entra como cliente, como quien prueba el reproductor
  await p.goto(BASE + "/acceso", { waitUntil: "networkidle" });
  await p.fill("#cu-user", `cli${RUN}`);
  await p.fill("#cu-pass", "clave1234");
  await p.locator("form button.btn-primary").click();
  await p.waitForURL(/\/player/, { timeout: 20000 });
  check("Se entra como cliente", true);

  // 2) Y luego, sin cerrar esa, como revendedor
  await p.goto(BASE + "/acceso?rol=proveedor", { waitUntil: "networkidle" });
  await p.locator(".access-tab:has-text('Soy proveedor')").click();
  await p.fill("#p-email", `rev${RUN}@t.com`);
  await p.fill("#p-pass", "revendedor123");
  await p.locator("form button.btn-primary").click();
  await p.waitForSelector(".panel-nav", { timeout: 20000 });

  const cookies = await ctx.cookies();
  check("Quedan las dos sesiones abiertas a la vez",
    cookies.some((c) => c.name === "xp_customer") && cookies.some((c) => c.name === "xp_reseller"),
    cookies.map((c) => c.name).join(", "));

  // Aquí estaba el fallo: el panel salía con el nombre del cliente arriba
  await p.locator(".account-avatar").click();
  await p.waitForSelector(".account-pop");
  const quien = await p.locator(".account-pop-mail").innerText();
  check("En el panel manda el revendedor, no el cliente", quien.includes(`rev${RUN}`), quien);

  const opciones = (await p.locator(".account-pop-item").allInnerTexts()).join(" | ").replace(/\n/g, " ");
  check("Y su menú es el suyo: «Mi panel»", opciones.includes("Mi panel"), opciones);
  check("Sin «Mi cuenta» de cliente ni «Cambiar de perfil»",
    !opciones.includes("Cambiar de perfil"), opciones);
  await p.screenshot({ path: __dirname + "/88-sesiones.png" });
  await p.keyboard.press("Escape");

  // 3) En el reproductor sigue mandando el cliente, que es de quien es la lista
  await p.goto(BASE + "/player", { waitUntil: "networkidle" });
  /* Aquí, en un navegador de a pie, al cliente de un proveedor le sale el
     cartel que le manda a las aplicaciones —ver `lib/envoltorio.ts`—, y lo
     que se comprueba es que arriba manda él y no el revendedor con el que
     también hay sesión abierta. Dentro de una aplicación esta misma
     dirección abre el reproductor, con las dos pantallas de perfil y
     «¿qué quieres ver?» encima, que se contestan primero */
  await p.waitForSelector(".account-avatar", { timeout: 15000 });
  if (await p.locator(".profile-item").first().isVisible().catch(() => false)) {
    await p.locator(".profile-item").first().click();
    await p.waitForTimeout(800);
  }
  if (await p.locator(".section-gate").isVisible().catch(() => false)) {
    await p.locator(".section-card").first().click();
    await p.waitForSelector(".section-gate", { state: "detached", timeout: 15000 }).catch(() => {});
  }
  await p.waitForTimeout(500);
  await p.locator(".account-avatar").click();
  await p.waitForSelector(".account-pop");
  const enPlayer = await p.locator(".account-pop-mail").innerText();
  check("En el reproductor manda el cliente", enPlayer.includes(`cli${RUN}`), enPlayer);

  // 4) Cerrar sesión las cierra todas: quedarse a medias es peor que salir
  await p.locator(".account-pop-item:has-text('Cerrar sesión')").click();
  await p.waitForURL(BASE + "/", { timeout: 15000 });
  const despues = await ctx.cookies();
  check("Al salir no queda ninguna sesión suelta",
    !despues.some((c) => ["xp_customer", "xp_reseller", "xp_provider"].includes(c.name) && c.value),
    despues.map((c) => c.name).join(", ") || "ninguna");

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas de sesiones mezcladas OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
