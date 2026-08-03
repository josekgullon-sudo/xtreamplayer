// La cuenta de quien lleva la plataforma no caduca.
//
// Era un inquilino más: siete días de prueba, diez clientes y a la calle. El
// octavo día el dueño del producto se quedaba fuera de su propio producto, y
// además por la puerta de atrás: sus clientes veían «el servicio de tu
// proveedor no está activo en este momento» sin ninguna pista de qué pasaba.
//
// La siembra deja la cuenta de la casa en ese estado exacto —sin plan y con la
// prueba caducada hace tres días— para que esto se compruebe de verdad.
const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`); };

const ck = (sc, n) => { const m = sc?.match(new RegExp(`${n}=([^;]+)`)); return m ? `${n}=${m[1]}` : ""; };
async function call(ruta, opts = {}, cookie = "") {
  const res = await fetch(BASE + ruta, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers || {}) },
  });
  return { status: res.status, body: await res.json().catch(() => ({})), setCookie: res.headers.get("set-cookie") };
}

(async () => {
  const RUN = Date.now().toString(36).slice(-5);

  // --- El panel de la casa ---
  let r = await call("/api/provider/auth", {
    method: "POST",
    body: JSON.stringify({ action: "login", email: "admin@totalplayer.app", password: "admin12345" }),
  });
  const casa = ck(r.setCookie, "xp_provider");
  if (!casa) { console.log("FATAL: sin cuenta de la casa sembrada (node scripts/seed-demo.mjs)"); process.exit(1); }

  r = await call("/api/provider/auth", {}, casa);
  const suyo = r.body.status || {};
  check("La casa no está de prueba", suyo.onTrial === false, `onTrial=${suyo.onTrial}`);
  check("Su plan se llama Plataforma", suyo.planName === "Plataforma", suyo.planName);
  check("Y sigue activa con la prueba caducada", suyo.active === true, `active=${suyo.active}`);
  check("Sin cupo de clientes", suyo.maxCustomers >= 1_000_000, String(suyo.maxCustomers));
  check("Ni fecha de renovación que vigilar", suyo.expiresAt === 0, String(suyo.expiresAt));
  check("Pero cuenta los clientes que tiene", suyo.usedCustomers >= 1, String(suyo.usedCustomers));

  // --- Lo que de verdad se rompía: sus clientes ---
  r = await call("/api/customer/login", {
    method: "POST",
    body: JSON.stringify({ username: "casa", password: "casa12345", deviceKey: `qa-casa-${RUN}`, platform: "web" }),
  });
  check("Su cliente entra en el reproductor", r.status === 200, r.body.error || "");

  // --- Y el cupo de verdad se sigue aplicando a los demás ---
  r = await call("/api/provider/auth", {
    method: "POST",
    body: JSON.stringify({ action: "register", email: `casa${RUN}@t.com`, password: "supersecreta1", company: `Casa ${RUN}` }),
  });
  const inquilino = ck(r.setCookie, "xp_provider");
  r = await call("/api/provider/auth", {}, inquilino);
  const otro = r.body.status || {};
  check("Un proveedor cualquiera sigue con su prueba", otro.onTrial === true && otro.planName === "Prueba", otro.planName);
  check("Y con su cupo de diez", otro.maxCustomers === 10, String(otro.maxCustomers));

  const fallos = results.filter((x) => !x).length;
  console.log(`\n${results.length - fallos}/${results.length} comprobaciones`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
