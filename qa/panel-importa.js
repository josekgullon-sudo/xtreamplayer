// Conexión con el panel XUI e importación directa de sus clientes.
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

  let r = await call("/api/provider/auth", {
    method: "POST",
    body: JSON.stringify({ action: "register", email: `xui${RUN}@t.com`, password: "supersecreta1" }),
  });
  const prov = ck(r.setCookie, "xp_provider");
  const dom = await call("/api/provider/domains", { method: "POST", body: JSON.stringify({ host: "127.0.0.1", port: 8090 }) }, prov);
  const domainId = dom.body.domain?.id;
  check("Proveedor y dominio de pruebas listos", Boolean(prov && domainId));

  // --- Conexión con código incorrecto: guarda pero avisa con el motivo ---
  r = await call(
    "/api/provider/panel",
    { method: "PUT", body: JSON.stringify({ url: "http://127.0.0.1:8090", apiKey: "CODIGO-MALO" }) },
    prov
  );
  check("Código de API incorrecto: no se da por verificado", r.status === 200 && r.body.verificado === false);
  check("Y explica qué contestó el panel a cada intento", Boolean(r.body.detalle && r.body.detalle.includes("·")), r.body.detalle);

  // --- Importar con la conexión sin verificar debe fallar con detalle ---
  r = await call("/api/provider/panel/import", { method: "POST", body: JSON.stringify({ domainId }) }, prov);
  check("Importar con un código malo falla explicando por qué", r.status === 502 && Boolean(r.body.detalle));

  // --- Conexión correcta ---
  r = await call(
    "/api/provider/panel",
    { method: "PUT", body: JSON.stringify({ url: "http://127.0.0.1:8090", apiKey: "XUIKEY123" }) },
    prov
  );
  check("Con el código bueno queda conectado y verificado", r.body.verificado === true && r.body.usuarios === 4, JSON.stringify(r.body));

  r = await call("/api/provider/panel", {}, prov);
  check("El estado refleja la clave sin revelarla", r.body.panel?.connected === true && r.body.panel?.hasApiKey === true);

  // --- Importación ---
  r = await call("/api/provider/panel/import", { method: "POST", body: JSON.stringify({ domainId, maxProfiles: 2 }) }, prov);
  const motivos = Object.fromEntries((r.body.omitidos || []).map((o) => [o.username, o.motivo]));
  check("Importa los usuarios activos del panel", r.status === 200 && r.body.creados === 2, JSON.stringify(r.body));
  check("El desactivado en el panel se omite y se dice", (motivos.paneloff || "").includes("desactivado"));
  check("El que viene sin contraseña se omite y se dice", (motivos.panelsinpass || "").includes("contraseña"));

  // --- El cliente importado puede entrar con sus credenciales del panel ---
  r = await call("/api/customer/login", {
    method: "POST",
    body: JSON.stringify({ username: "panelu1", password: "clavepanel1", deviceKey: "dev-panel", platform: "web" }),
  });
  check("El cliente importado entra con su usuario del panel", r.status === 200);
  const cli = ck(r.setCookie, "xp_customer");
  r = await call("/api/customer/me", {}, cli);
  check(
    "Y su lista apunta al dominio elegido con sus credenciales IPTV",
    r.body.playlist?.username === "panelu1" && (r.body.playlist?.url || "").includes("127.0.0.1"),
    JSON.stringify(r.body.playlist)
  );

  // --- Repetir la importación no duplica ---
  r = await call("/api/provider/panel/import", { method: "POST", body: JSON.stringify({ domainId }) }, prov);
  check("Reimportar no duplica: los existentes se omiten", r.status === 200 && r.body.creados === 0 && r.body.omitidosTotal === 4, JSON.stringify(r.body.omitidos));

  // --- Sin dominio no hay importación ---
  r = await call("/api/provider/panel/import", { method: "POST", body: JSON.stringify({}) }, prov);
  check("Sin dominio elegido se rechaza con aviso claro", r.status === 400);

  // --- Desconectar limpia también la clave ---
  r = await call("/api/provider/panel", { method: "PUT", body: JSON.stringify({}) }, prov);
  r = await call("/api/provider/panel", {}, prov);
  check("Desconectar borra la conexión y la clave", r.body.panel?.connected === false && r.body.panel?.hasApiKey === false);

  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas pasan`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => {
  console.log("FATAL", String(e).slice(0, 300));
  process.exit(1);
});
