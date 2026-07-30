// Los precios de Stripe de cada plan, puestos desde administración.
//
// Antes solo se podían poner editando la base de datos por SSH: la clase de
// tarea que no se hace nunca y deja el cobro sin arrancar, con los proveedores
// activados a mano uno por uno.
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

  // --- Quién puede tocar los precios ---
  let r = await call("/api/admin/planes");
  check("Sin sesión no se ven los planes", r.status === 403, String(r.status));

  r = await call("/api/provider/auth", { method: "POST", body: JSON.stringify({ action: "register", email: `pla${RUN}@t.com`, password: "supersecreta1", company: `Pla ${RUN}` }) });
  const prov = ck(r.setCookie, "xp_provider");
  r = await call("/api/admin/planes", {}, prov);
  check("Un proveedor no cambia lo que se le cobra", r.status === 403, String(r.status));

  r = await call("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@totalplayer.app", password: "admin12345" }) });
  const admin = ck(r.setCookie, "xp_session");
  if (!admin) { console.log("FATAL: sin administrador sembrado (node scripts/seed-demo.mjs)"); process.exit(1); }

  r = await call("/api/admin/planes", {}, admin);
  const planes = r.body.planes || [];
  check("El administrador ve todos los tramos", planes.length >= 4, `${planes.length} planes`);
  check("Con su precio y su cupo", planes[0]?.precioCents > 0 && planes[0]?.maxClientes > 0,
    `${planes[0]?.nombre}: ${planes[0]?.precioCents / 100} € / ${planes[0]?.maxClientes}`);
  check("Y dice si Stripe está conectado", typeof r.body.stripeListo === "boolean", String(r.body.stripeListo));

  const plan = planes[0];

  // --- Lo que no se traga ---
  r = await call("/api/admin/planes", { method: "PATCH", body: JSON.stringify({ id: plan.id, stripePriceId: "esto-no-es-un-precio" }) }, admin);
  check("Un identificador inventado se rechaza", r.status === 400, r.body.error);
  /* Descubrir el error cuando un cliente intenta pagar es el peor momento
     posible: por eso se valida al escribirlo */
  r = await call("/api/admin/planes", { method: "PATCH", body: JSON.stringify({ id: "no-existe", stripePriceId: "price_abc123" }) }, admin);
  check("Y un plan que no existe, también", r.status === 404);

  // --- Ponerlo ---
  const precio = `price_QA${RUN}xyz`;
  r = await call("/api/admin/planes", { method: "PATCH", body: JSON.stringify({ id: plan.id, stripePriceId: precio }) }, admin);
  check("Se guarda un precio válido", r.status === 200);

  r = await call("/api/admin/planes", {}, admin);
  const guardado = (r.body.planes || []).find((p) => p.id === plan.id);
  check("Y queda guardado", guardado?.stripePriceId === precio, guardado?.stripePriceId);

  // --- Y sirve para lo que sirve: que el proveedor pueda contratar ---
  r = await call("/api/provider/subscribe", { method: "POST", body: JSON.stringify({ planId: plan.id }) }, prov);
  /* Sin claves de Stripe configuradas contesta 503 «pagos no activados»; con
     ellas, intentaría crear la sesión de pago. Lo que se comprueba aquí es que
     ya no falla por no tener precio, que era el bloqueo de verdad */
  check("El plan ya no se queda sin cobro por falta de precio",
    r.status !== 400, `${r.status} · ${r.body.error || "sesión de pago"}`);

  // Vaciarlo lo deja otra vez sin cobro, y se puede
  r = await call("/api/admin/planes", { method: "PATCH", body: JSON.stringify({ id: plan.id, stripePriceId: "" }) }, admin);
  r = await call("/api/admin/planes", {}, admin);
  check("Se puede quitar el precio de un plan",
    (r.body.planes || []).find((p) => p.id === plan.id)?.stripePriceId === "");

  // --- Queda anotado ---
  r = await call("/api/admin/registro?auditoria=1", {}, admin);
  check("Cambiar un precio queda en el registro",
    (r.body.auditoria || []).some((a) => a.accion === "plan.precio"),
    (r.body.auditoria || [])[0]?.accion);

  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas de planes y cobro OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
