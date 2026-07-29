// Recuperar la contraseña, de punta a punta: el correo que sale, el enlace
// que llega y la contraseña nueva funcionando.
//
// Antes de esto, quien olvidaba su contraseña perdía la cuenta. En un
// proveedor, eso son sus clientes, sus dominios y sus facturas dentro.
//
// Necesita el receptor de correo de mentira: node qa/mock-resend.js
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const BASE = process.env.QA_BASE || "http://localhost:3101";
const CORREOS = process.env.QA_CORREOS || "http://127.0.0.1:8097";
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
const buzon = async () => (await fetch(CORREOS + "/recibidos")).json();
const vaciar = () => fetch(CORREOS, { method: "DELETE" });

(async () => {
  const RUN = Date.now().toString(36).slice(-5);
  const correoProv = `rec${RUN}@t.com`;
  await vaciar();

  // Un proveedor con su cuenta, que es el caso caro: dentro tiene su negocio
  let r = await call("/api/provider/auth", { method: "POST", body: JSON.stringify({ action: "register", email: correoProv, password: "laVieja12345", company: `Rec ${RUN}` }) });
  check("Alta de proveedor para la prueba", r.status === 200);

  // --- Pedir el enlace ---
  r = await call("/api/auth/recuperar", { method: "POST", body: JSON.stringify({ email: correoProv, tipo: "provider" }) });
  check("Se puede pedir el enlace", r.status === 200 && r.body.ok === true);

  let recibidos = await buzon();
  check("Y sale un correo de verdad", recibidos.length === 1, recibidos[0]?.subject);
  check("Al dueño de la cuenta, a nadie más", recibidos[0]?.to?.[0] === correoProv, String(recibidos[0]?.to));

  const enlace = (recibidos[0]?.text || "").match(/https?:\/\/\S*\/restablecer\S*/)?.[0] || "";
  check("Con un enlace para cambiarla", enlace.includes("/restablecer?token="), enlace.slice(0, 60) + "…");
  check("Y en versión HTML, que es como se lee", (recibidos[0]?.html || "").includes("restablecer?token="));

  // --- Lo que no puede pasar ---
  await vaciar();
  r = await call("/api/auth/recuperar", { method: "POST", body: JSON.stringify({ email: `noexiste${RUN}@t.com`, tipo: "provider" }) });
  check("Un correo que no existe contesta igual que uno que sí", r.status === 200 && r.body.ok === true);
  check("Pero no manda nada a nadie", (await buzon()).length === 0);
  /* Si dijera «esa cuenta no existe», este formulario sería la forma más
     cómoda de averiguar quién está registrado aquí */

  await vaciar();
  for (let i = 0; i < 5; i++) {
    await call("/api/auth/recuperar", { method: "POST", body: JSON.stringify({ email: correoProv, tipo: "provider" }) });
  }
  const cuantos = (await buzon()).length;
  check("Pedirlo cinco veces seguidas no manda cinco correos", cuantos <= 2, `${cuantos} correos`);

  // El token de un proveedor no vale para una cuenta propia
  const token = new URL(enlace).searchParams.get("token");
  r = await call(`/api/auth/recuperar?token=${encodeURIComponent(token)}&tipo=user`);
  check("Un enlace de proveedor no abre una cuenta normal", r.body.valido === false);
  r = await call(`/api/auth/recuperar?token=${encodeURIComponent(token)}&tipo=provider`);
  check("Y el suyo sí vale", r.body.valido === true);

  r = await call("/api/auth/recuperar", { method: "PUT", body: JSON.stringify({ token, tipo: "provider", password: "corta" }) });
  check("Una contraseña corta se rechaza", r.status === 400, r.body.error);

  // --- Cambiarla desde el navegador, como lo haría un cliente ---
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

  await p.goto(BASE + "/acceso?rol=proveedor", { waitUntil: "networkidle" });
  await p.locator(".access-tab:has-text('Soy proveedor')").click();
  check("Desde el acceso de proveedor se llega a recuperarla",
    (await p.locator("a[href='/recuperar?rol=proveedor']").count()) === 1);
  /* Al cliente de un proveedor no se le ofrece: su contraseña la tiene su
     proveedor, y un correo que nunca le llega es peor que no ofrecer nada */
  await p.locator(".access-tab:has-text('Soy cliente')").click();
  check("Y al cliente se le manda a su proveedor, que es quien la tiene",
    (await p.locator(".auth-wrap").innerText()).includes("Te los da tu proveedor"));

  /* Cuenta aparte para el recorrido por el navegador: la de arriba ya gastó
     su cupo de correos en la prueba de los cinco seguidos */
  const correoProv2 = `web${RUN}@t.com`;
  await call("/api/provider/auth", { method: "POST", body: JSON.stringify({ action: "register", email: correoProv2, password: "laVieja12345", company: `Web ${RUN}` }) });

  await vaciar();
  await p.goto(BASE + "/recuperar?rol=proveedor", { waitUntil: "networkidle" });
  await p.fill("#rec-email", correoProv2);
  await p.locator("button:has-text('Mandarme el enlace')").click();
  await p.waitForSelector(".activar-ok", { timeout: 15000 });
  check("El formulario dice que mire su correo", (await p.locator("h1").innerText()).includes("Mira tu correo"));

  recibidos = await buzon();
  check("Y el correo sale de camino", recibidos.length === 1, recibidos[0]?.subject);
  const enlace2 = (recibidos[0]?.text || "").match(/https?:\/\/\S*\/restablecer\S*/)?.[0] || "";
  await p.goto(enlace2.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "networkidle" });
  await p.waitForSelector("#res-pass", { timeout: 15000 });
  await p.fill("#res-pass", "laNuevaSegura99");
  await p.locator("button:has-text('Guardar y entrar')").click();
  await p.waitForSelector(".activar-ok", { timeout: 15000 });
  check("Se cambia la contraseña desde el enlace del correo", true);

  // Y avisa de que ha cambiado: es como se entera alguien de que le han entrado
  const aviso = (await buzon()).find((c) => (c.subject || "").includes("ha cambiado"));
  check("Y avisa por correo de que ha cambiado", Boolean(aviso), aviso?.subject);

  // --- Lo que importa: que la nueva entre y la vieja no ---
  r = await call("/api/provider/auth", { method: "POST", body: JSON.stringify({ action: "login", email: correoProv2, password: "laVieja12345" }) });
  check("La contraseña vieja ya no vale", r.status === 401);
  r = await call("/api/provider/auth", { method: "POST", body: JSON.stringify({ action: "login", email: correoProv2, password: "laNuevaSegura99" }) });
  check("Y con la nueva se entra", r.status === 200 && Boolean(ck(r.setCookie, "xp_provider")));

  // El mismo enlace, otra vez, no
  r = await call("/api/auth/recuperar", { method: "PUT", body: JSON.stringify({ token: new URL(enlace2).searchParams.get("token"), tipo: "provider", password: "otraMas12345" }) });
  check("Un enlace usado no sirve dos veces", r.status === 400, r.body.error);
  r = await call("/api/provider/auth", { method: "POST", body: JSON.stringify({ action: "login", email: correoProv2, password: "otraMas12345" }) });
  check("Y no ha cambiado nada por intentarlo", r.status === 401);

  await p.screenshot({ path: __dirname + "/93-recuperar.png" });
  await b.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas de recuperar contraseña OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
