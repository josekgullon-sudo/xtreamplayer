// Tickets, API pública y facturas: las tres piezas nuevas del panel.
const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
const check = (n, ok, d = "") => {
  results.push(ok);
  console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`);
};

async function call(path, opts = {}, cookie = "") {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers || {}) },
  });
  return { status: res.status, body: await res.json().catch(() => ({})), setCookie: res.headers.get("set-cookie") };
}
const ck = (sc, n) => {
  const m = sc?.match(new RegExp(`${n}=([^;]+)`));
  return m ? `${n}=${m[1]}` : "";
};

(async () => {
  const RUN = Date.now().toString(36).slice(-5);

  // Proveedor de pruebas con dominio
  let r = await call("/api/provider/auth", {
    method: "POST",
    body: JSON.stringify({ action: "register", email: `saf${RUN}@t.com`, password: "supersecreta1" }),
  });
  const prov = ck(r.setCookie, "xp_provider");
  const dom = await call("/api/provider/domains", { method: "POST", body: JSON.stringify({ host: "127.0.0.1", port: 8090 }) }, prov);
  const domainId = dom.body.domain.id;

  // ============ TICKETS ============
  r = await call("/api/provider/tickets", { method: "POST", body: JSON.stringify({ subject: "No carga un canal", message: "El canal X falla desde ayer" }) }, prov);
  check("El proveedor abre un ticket", r.status === 200 && r.body.id > 0);
  const ticketId = r.body.id;

  r = await call("/api/provider/tickets", {}, prov);
  check("Y lo ve en su lista como abierto", r.body.tickets?.[0]?.status === "abierto");

  r = await call("/api/provider/tickets", { method: "POST", body: JSON.stringify({ subject: "", message: "" }) }, prov);
  check("Sin asunto o mensaje se rechaza", r.status === 400);

  // Admin: usuario normal NO entra
  r = await call("/api/auth/register", { method: "POST", body: JSON.stringify({ email: `normal${RUN}@t.com`, password: "supersecreta1" }) });
  const normal = ck(r.setCookie, "xp_session");
  r = await call("/api/admin/tickets", {}, normal);
  check("Un usuario normal no ve la bandeja de admin", r.status === 403);

  // Admin del seed sí entra
  r = await call("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@totalplayer.app", password: "admin12345" }) });
  const admin = ck(r.setCookie, "xp_session");
  r = await call("/api/admin/tickets", {}, admin);
  check("El administrador ve todos los tickets", r.status === 200 && r.body.tickets.length >= 1, `${r.body.tickets?.length} tickets`);
  check("Con el proveedor identificado en cada uno", Boolean(r.body.tickets[0].providerEmail));

  r = await call(`/api/admin/tickets/${ticketId}`, { method: "POST", body: JSON.stringify({ message: "Lo estamos revisando" }) }, admin);
  check("El admin responde", r.status === 200);

  r = await call(`/api/provider/tickets/${ticketId}`, {}, prov);
  check("El proveedor ve la respuesta en el hilo", r.body.messages?.length === 2 && r.body.messages[1].author === "admin");
  check("Y el ticket pasa a «respondido»", r.body.ticket?.status === "respondido");

  r = await call(`/api/provider/tickets/${ticketId}`, { method: "PATCH" }, prov);
  r = await call(`/api/provider/tickets/${ticketId}`, {}, prov);
  check("El proveedor lo da por resuelto", r.body.ticket?.status === "cerrado");

  r = await call(`/api/provider/tickets/${ticketId}`, { method: "POST", body: JSON.stringify({ message: "otra cosa" }) }, prov);
  check("Un ticket cerrado no admite más mensajes", r.status === 400);

  // Aislamiento: otro proveedor no ve este ticket
  r = await call("/api/provider/auth", { method: "POST", body: JSON.stringify({ action: "register", email: `otro${RUN}@t.com`, password: "supersecreta1" }) });
  const otro = ck(r.setCookie, "xp_provider");
  r = await call(`/api/provider/tickets/${ticketId}`, {}, otro);
  check("Otro proveedor no puede leer el ticket ajeno", r.status === 404);

  // ============ API PÚBLICA ============
  r = await call("/api/provider/apikey", {}, prov);
  check("Sin clave generada, la API figura inactiva", r.body.active === false);

  r = await call("/api/provider/apikey", { method: "POST" }, prov);
  const key = r.body.key;
  check("Se genera una clave tp_…", /^tp_[a-f0-9]{48}$/.test(key || ""), r.body.prefix);

  const bearer = (k) => ({ headers: { Authorization: `Bearer ${k}` } });
  r = await call("/api/v1/me", bearer(key));
  check("La clave autentica en /v1/me", r.status === 200 && r.body.provider?.customers?.max > 0, `plan ${r.body.provider?.plan}`);

  r = await call("/api/v1/me", bearer("tp_" + "0".repeat(48)));
  check("Una clave falsa se rechaza", r.status === 401);

  r = await call("/api/v1/domains", bearer(key));
  check("Lista los dominios con su id", r.status === 200 && r.body.data[0]?.id === domainId);

  r = await call("/api/v1/customers", { method: "POST", ...bearer(key), body: JSON.stringify({ username: `api${RUN}`, password: "clave1234", domainId, playlistUsername: "demo", playlistPassword: "demo123", maxProfiles: 2 }) });
  check("Alta de cliente por la API", r.status === 201 && r.body.data?.username === `api${RUN}`);
  const apiCliente = r.body.data?.id;

  r = await call("/api/v1/customers", { method: "POST", ...bearer(key), body: JSON.stringify({ username: `api${RUN}`, password: "clave1234", domainId, playlistUsername: "demo", playlistPassword: "demo123" }) });
  check("Duplicado rechazado con las mismas reglas del panel", r.status === 409);

  // El cliente creado por la API entra de verdad en el reproductor
  r = await call("/api/customer/login", { method: "POST", body: JSON.stringify({ username: `api${RUN}`, password: "clave1234", deviceKey: "d-api" }) });
  check("▶ Ese cliente puede iniciar sesión de verdad", r.status === 200);

  r = await call(`/api/v1/customers/${apiCliente}`, { method: "PATCH", ...bearer(key), body: JSON.stringify({ status: "disabled", expiresAt: 1234567890000 }) });
  check("Renovación/suspensión por la API", r.status === 200 && r.body.data.status === "disabled");

  r = await call("/api/v1/customers?status=disabled", bearer(key));
  check("El filtro por estado funciona", r.body.total === 1 && r.body.data[0].id === apiCliente);

  // Aislamiento entre claves
  r = await call("/api/provider/apikey", { method: "POST" }, otro);
  const keyOtro = r.body.key;
  r = await call(`/api/v1/customers/${apiCliente}`, bearer(keyOtro));
  check("La clave de otro proveedor no ve clientes ajenos", r.status === 404);

  // Rotar invalida la anterior
  r = await call("/api/provider/apikey", { method: "POST" }, prov);
  const key2 = r.body.key;
  r = await call("/api/v1/me", bearer(key));
  check("Rotar la clave invalida la anterior al momento", r.status === 401);

  r = await call(`/api/v1/customers/${apiCliente}`, { method: "DELETE", ...bearer(key2) });
  check("Baja de cliente por la API", r.status === 200);

  r = await call("/api/provider/apikey", { method: "DELETE" }, prov);
  r = await call("/api/v1/me", bearer(key2));
  check("Revocar apaga la API por completo", r.status === 401);

  // ============ FACTURAS ============
  // El proveedor demo del seed tiene 3 facturas
  r = await call("/api/provider/auth", { method: "POST", body: JSON.stringify({ action: "login", email: "demo@totalplayer.app", password: "demo12345" }) });
  const demo = ck(r.setCookie, "xp_provider");
  r = await call("/api/provider/invoices", {}, demo);
  check("El proveedor ve sus facturas", r.status === 200 && r.body.invoices.length === 3, `${r.body.invoices?.length} facturas`);
  const f = r.body.invoices[0];
  check("Con numeración formal TP-año-número", /^TP-\d{4}-\d+$/.test(f.number), f.number);
  check("Importe y periodo correctos", f.amountCents === 9000 && f.periodStart > 0, `${f.amountCents / 100} EUR`);
  check("Y los datos del receptor para imprimirla", Boolean(r.body.billing?.company));

  r = await call("/api/provider/invoices", {}, prov);
  check("Un proveedor sin cobros ve la lista vacía, no un error", r.status === 200 && r.body.invoices.length === 0);

  const ok = results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} pruebas de soporte, API y facturas OK`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => {
  console.log("FATAL", e);
  process.exit(1);
});
