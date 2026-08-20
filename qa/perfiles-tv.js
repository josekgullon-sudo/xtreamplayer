/**
 * ¿Quién está viendo?, en la televisión.
 *
 * El reproductor web preguntaba por el perfil desde el principio y la
 * interfaz de televisión no, que es justo donde más falta hace: la tele del
 * salón la usan cuatro personas y lo que has dejado a medias, lo que tienes
 * en tu lista y lo que te suena de haber visto no es lo mismo para todas.
 *
 * Lo que se comprueba aquí es lo que decide si molesta o si ayuda: que con un
 * solo perfil no aparezca —a quien vive solo no se le mete un paso de más—,
 * que con varios se pregunte al encender, que el mando la recorra, y que
 * después se pueda cambiar sin apagar la tele.
 */
const { chromium, ejecutable } = require("./navegador");

const BASE = process.env.QA_BASE || "http://localhost:3101";
let bien = 0;
let mal = 0;
function check(que, pasa, detalle) {
  if (pasa) { bien++; console.log(`✅ ${que}${detalle ? ` — ${detalle}` : ""}`); }
  else { mal++; console.log(`❌ ${que}${detalle ? ` — ${detalle}` : ""}`); }
}
async function call(path, opts = {}, cookie = "") {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers || {}) },
  });
  return { body: await res.json().catch(() => ({})), setCookie: res.headers.get("set-cookie"), status: res.status };
}
const ck = (sc, n) => { const m = sc?.match(new RegExp(`${n}=([^;]+)`)); return m ? m[0] : ""; };

async function entrar(ctx, U) {
  const tv = await ctx.newPage();
  tv.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));
  await tv.goto(BASE + "/tv?app=1", { waitUntil: "networkidle" });
  await tv.locator(".tv-boton:has-text('Entrar con usuario')").click();
  await tv.fill("input[name=usuario]", U);
  await tv.fill("input[name=password]", "clave1234");
  await tv.locator(".tv-boton:has-text('Entrar')").first().click();
  return tv;
}

(async () => {
  const RUN = Date.now().toString(36).slice(-5);

  // Un proveedor con dos clientes: uno de un perfil y otro de tres
  let r = await call("/api/provider/auth", { method: "POST", body: JSON.stringify({ action: "register", email: `pf${RUN}@t.com`, password: "supersecreta1" }) });
  const prov = ck(r.setCookie, "xp_provider");
  const dom = await call("/api/provider/domains", { method: "POST", body: JSON.stringify({ host: "127.0.0.1", port: 8090 }) }, prov);

  const solo = `solo${RUN}`;
  const casa = `casa${RUN}`;
  const uno = await call("/api/provider/customers", { method: "POST", body: JSON.stringify({ username: solo, password: "clave1234", domainId: dom.body.domain.id, playlistUsername: "demo", playlistPassword: "demo123", maxDevices: 5 }) }, prov);
  const varios = await call("/api/provider/customers", { method: "POST", body: JSON.stringify({ username: casa, password: "clave1234", domainId: dom.body.domain.id, playlistUsername: "demo", playlistPassword: "demo123", maxDevices: 5 }) }, prov);
  const idVarios = varios.body.customer?.id;
  await call(`/api/provider/customers/${idVarios}`, { method: "PATCH", body: JSON.stringify({ maxProfiles: 6 }) }, prov);
  check("El proveedor decide cuántos perfiles tiene cada cliente", Boolean(idVarios), `cliente ${idVarios}`);

  const b = await chromium.launch({ ...ejecutable });

  // --- Con un solo perfil no se pregunta nada ---
  {
    const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
    const tv = await entrar(ctx, solo);
    await tv.waitForSelector(".tv-pestanas", { timeout: 25000 });
    check("Con un solo perfil se entra directo, sin preguntar quién eres",
      (await tv.locator(".tv-perfiles").count()) === 0);
    check("Y la barra no enseña un selector que no tiene nada que elegir",
      (await tv.locator(".tv-nav-perfil").count()) === 0);
    await ctx.close();
  }

  // --- Con varios, la pregunta de siempre ---
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await entrar(ctx, casa);
  // Los perfiles se crean con la sesión ya puesta, como haría el cliente
  await tv.waitForSelector(".tv-pestanas, .tv-perfiles", { timeout: 25000 });
  for (const nombre of ["Ana", "Luis", "Peques"]) {
    await tv.evaluate(async (n) => {
      await fetch("/api/profiles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n, kids: n === "Peques" }) });
    }, nombre);
  }
  await tv.reload({ waitUntil: "networkidle" });

  await tv.waitForSelector(".tv-perfiles", { timeout: 25000 });
  const caras = await tv.locator(".tv-perfil-nombre").allInnerTexts();
  check("Con varios perfiles, la tele pregunta quién está viendo",
    caras.length >= 3, caras.join(" | "));
  check("Con su título, que es la pregunta y no un rótulo",
    (await tv.locator(".tv-perfiles h1").innerText()).includes("Quién está viendo"));

  /* Y de aquí no se sale hacia atrás: no hay nada detrás, y salir dejaría la
     aplicación sin saber de quién es lo que va a enseñar */
  await tv.keyboard.press("Escape");
  await tv.waitForTimeout(600);
  check("Y ATRÁS no se la salta: no hay nada detrás",
    (await tv.locator(".tv-perfiles").count()) === 1);

  // El mando: una fila, y se recorre de lado
  await tv.locator(".tv-perfil").first().hover();
  await tv.mouse.move(2, 2);
  await tv.keyboard.press("ArrowRight");
  const segundo = await tv.locator(".tv-perfil.foco .tv-perfil-nombre").innerText();
  check("▶ mueve el foco al perfil de al lado", segundo.trim().length > 0, segundo);

  await tv.keyboard.press("Enter");
  await tv.waitForSelector(".tv-pestanas", { timeout: 25000 });
  check("Y con OK se entra a ver la tele", true);

  /* Que se pregunte al encender no basta: la tele del salón cambia de manos a
     media tarde y nadie va a apagarla y encenderla para decirlo */
  await tv.locator(".tv-pestana:has-text('TV en directo')").click();
  await tv.waitForSelector(".tv-nav", { timeout: 25000 });
  check("El perfil está siempre a la vista, en la barra de arriba",
    (await tv.locator(".tv-nav-perfil").count()) === 1,
    (await tv.locator(".tv-nav-perfil").innerText()).replace(/\n/g, " "));
  check("Y dice cuál es, no «perfil» a secas",
    (await tv.locator(".tv-nav-perfil").innerText()).includes(segundo.trim()),
    (await tv.locator(".tv-nav-perfil").innerText()).replace(/\n/g, " "));

  await tv.locator(".tv-nav-perfil").click();
  await tv.waitForSelector(".tv-perfiles", { timeout: 15000 });
  check("Y desde ahí se cambia sin apagar la tele", true);

  /* --- Y crear uno nuevo, desde la propia tele ---
     Solo se podía desde el reproductor web, así que quien entra por la
     televisión —el caso normal en el salón— veía su perfil y ahí se acababa:
     no había manera de añadir a nadie. */
  const cuantosHabia = await tv.locator(".tv-perfil:not(.tv-perfil-nuevo)").count();
  check("La pantalla ofrece crear uno nuevo",
    (await tv.locator(".tv-perfil-nuevo").count()) === 1);
  await tv.locator(".tv-perfil-nuevo").click();
  await tv.waitForSelector(".tv-perfil-form input", { timeout: 10000 });
  await tv.fill(".tv-perfil-form input", "Abuela");
  await tv.locator(".tv-perfil-form .tv-boton:has-text('Crear')").click();
  await tv.waitForFunction(
    (n) => document.querySelectorAll(".tv-perfil:not(.tv-perfil-nuevo)").length > n,
    cuantosHabia,
    { timeout: 15000 }
  );
  check("Y al crearlo aparece con los demás",
    (await tv.locator(".tv-perfil-nombre").allInnerTexts()).some((t) => t.trim() === "Abuela"),
    (await tv.locator(".tv-perfil-nombre").allInnerTexts()).join(" | "));

  /* Y el servidor se entera de quién ve: es quien guarda lo que va viendo
     cada uno, y sin decírselo la próxima vez se abriría con lo del otro */
  await tv.locator(".tv-perfil").first().click();
  await tv.waitForSelector(".tv-pestanas", { timeout: 25000 });
  await tv.waitForTimeout(800);
  const guardado = await tv.evaluate(async () => {
    const r = await fetch("/api/profiles", { cache: "no-store" });
    return r.json();
  });
  const activo = (guardado.profiles || []).find((p) => p.id === guardado.activeId);
  check("Y el servidor sabe quién está viendo", Boolean(activo), activo?.name || "ninguno");

  await b.close();

  console.log(`\n${bien}/${bien + mal} pruebas de perfiles en la tele OK`);
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.log("FATAL", e); process.exit(1); });
