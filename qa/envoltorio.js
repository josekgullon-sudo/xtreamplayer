// Quién ve la tele y quién ve el cartel de «instálate la aplicación».
//
// Es la puerta más cara de equivocar del producto: a un lado está el cliente
// de un proveedor viendo sus canales, y al otro el mismo cliente mirando un
// cartel. Estuvo mal durante semanas —el APK del móvil es un envoltorio de
// `/player`, así que el cartel le salía DENTRO de la aplicación que el
// cartel le pedía instalar— y ninguna prueba lo miraba. Ahora sí.
//
// Lo que decide es `lib/envoltorio.ts`: `?app=1` o la marca del agente.
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

/* Los tres agentes que importan */
const MOVIL = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36";
const APK = `${MOVIL} TOTALplayerApp/1.0`;
const FIRE_TV = "Mozilla/5.0 (Linux; Android 9; AFTKA) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const ESCRITORIO = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

(async () => {
  const RUN = Date.now().toString(36).slice(-5);

  // Un proveedor con su marca, su dominio y un cliente
  let r = await call("/api/provider/auth", { method: "POST", body: JSON.stringify({ action: "register", email: `env${RUN}@t.com`, password: "supersecreta1", company: "TotalFLIX" }) });
  const prov = ck(r.setCookie, "xp_provider");
  await call("/api/provider/branding", { method: "PUT", body: JSON.stringify({ name: "TotalFLIX", slug: `env${RUN}` }) }, prov);
  const dom = await call("/api/provider/domains", { method: "POST", body: JSON.stringify({ host: "127.0.0.1", port: 8090 }) }, prov);
  const U = `env${RUN}`;
  await call("/api/provider/customers", {
    method: "POST",
    body: JSON.stringify({ username: U, password: "clave1234", domainId: dom.body.domain.id, playlistUsername: "demo", playlistPassword: "demo123", maxDevices: 5 }),
  }, prov);
  r = await call("/api/customer/login", { method: "POST", body: JSON.stringify({ username: U, password: "clave1234", deviceKey: `env-${RUN}` }) });
  const cli = ck(r.setCookie, "xp_customer").split("=")[1];

  const b = await chromium.launch({ ...ejecutable });

  /**
   * ¿Qué le sale a este aparato en esta dirección: el cartel o la aplicación?
   *
   * Se mira la clase del cartel y no su texto: el texto cambia y lo que se
   * comprueba aquí es de qué lado de la puerta ha caído.
   */
  async function queVe(ruta, agente, conSesion = true) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, userAgent: agente });
    if (conSesion) await ctx.addCookies([{ name: "xp_customer", value: cli, domain: "localhost", path: "/" }]);
    const p = await ctx.newPage();
    await p.goto(BASE + ruta, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(900);
    const cartel = (await p.locator(".solo-apps").count()) > 0;
    await ctx.close();
    return cartel ? "cartel" : "aplicación";
  }

  // --- El reproductor: es lo que envuelve el APK del móvil ---
  check("El APK del móvil entra: lo dice con ?app=1",
    (await queVe("/player?app=1", MOVIL)) === "aplicación");
  check("Y también por la marca de su agente, que es lo que traen los ya instalados",
    (await queVe("/player", APK)) === "aplicación");
  check("En un navegador de a pie, el cliente de un proveedor ve el cartel",
    (await queVe("/player", MOVIL)) === "cartel");
  check("También en el ordenador",
    (await queVe("/player", ESCRITORIO)) === "cartel");

  // --- La tele ---
  check("La aplicación de tele entra con ?app=1",
    (await queVe("/tv?app=1", ESCRITORIO)) === "aplicación");
  check("Un Fire TV entra por su agente, sin envoltorio",
    (await queVe("/tv", FIRE_TV)) === "aplicación");
  check("Y en un ordenador, /tv le enseña el cartel al cliente de un proveedor",
    (await queVe("/tv", ESCRITORIO)) === "cartel");

  /*
   * Y quien se pega su propia lista no ve el cartel nunca.
   *
   * El motivo del cartel es que la dirección de un canal de Xtream lleva
   * dentro el servidor, el usuario y la contraseña del proveedor. La lista
   * que uno se pega la ha escrito él: no hay nada que esconderle.
   */
  check("Quien trae su propia lista reproduce en el navegador, como siempre",
    (await queVe("/player", ESCRITORIO, false)) === "aplicación");

  /*
   * Y entrar no es lo mismo que poder ver algo.
   *
   * Esto es lo que faltaba comprobar: el cliente pasaba la puerta —el
   * cartel no le salía— y se encontraba la pantalla de bienvenida
   * pidiéndole que pegara una lista M3U, que es exactamente lo que un
   * cliente de proveedor no tiene ni tiene por qué saber qué es. Su lista
   * se la da el servidor con la galleta: ver `/api/customer/me` y la carga
   * inicial de components/player/PlayerApp.tsx.
   */
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, userAgent: MOVIL });
    await ctx.addCookies([{ name: "xp_customer", value: cli, domain: "localhost", path: "/" }]);
    const p = await ctx.newPage();
    await p.goto(BASE + "/player?app=1", { waitUntil: "networkidle" });
    await p.waitForSelector(".profile-item, .pa-rail, .section-gate, .pa-welcome", { timeout: 30000 });
    if (await p.locator(".profile-item").count()) {
      await p.locator(".profile-item").first().click();
    }
    await p.waitForSelector(".pa-rail, .section-gate", { timeout: 30000 }).catch(() => {});
    check("Dentro de la aplicación, el cliente encuentra SU lista puesta",
      (await p.locator(".pa-welcome").count()) === 0);
    check("Y con ella, sus secciones",
      (await p.locator(".pa-rail, .section-gate").count()) > 0);
    await ctx.close();
  }

  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas de los envoltorios OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
