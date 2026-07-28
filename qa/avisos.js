// Que un ticket nuevo no se quede esperando a que alguien se asome a /admin.
//
// Necesita el receptor de avisos (node qa/mock-webhook.js) y el servidor
// arrancado con ADMIN_WEBHOOK_URL=http://127.0.0.1:8099/aviso
const BASE = process.env.QA_BASE || "http://localhost:3101";
const RECEPTOR = process.env.QA_WEBHOOK || "http://127.0.0.1:8099";
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
const avisos = () => fetch(RECEPTOR).then((r) => r.json()).catch(() => []);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const RUN = Date.now().toString(36).slice(-5);
  const antes = (await avisos()).length;

  let r = await call("/api/provider/auth", { method: "POST", body: JSON.stringify({ action: "register", email: `avi${RUN}@t.com`, password: "supersecreta1", company: `Avisos ${RUN}` }) });
  const prov = ck(r.setCookie, "xp_provider");

  // --- Ticket nuevo ---
  const t0 = Date.now();
  r = await call("/api/provider/tickets", { method: "POST", body: JSON.stringify({ subject: `No entra un cliente ${RUN}`, message: "Dice que le da error desde ayer." }) }, prov);
  const tardo = Date.now() - t0;
  check("El ticket se abre", r.status === 200);
  check("Y el aviso no hace esperar a quien lo abrió", tardo < 3000, `${tardo} ms`);

  await esperar(1500);
  let recibidos = (await avisos()).slice(antes);
  check("Llega un aviso al abrirlo", recibidos.length === 1, `${recibidos.length} avisos`);

  const a = recibidos[0] || {};
  check("Con el tipo, para poder filtrarlo", a.tipo === "ticket-nuevo", a.tipo);
  check("Dice de quién es", (a.titulo || "").includes(`Avisos ${RUN}`), a.titulo);
  check("Y qué le pasa, sin abrir nada", (a.detalle || "").includes(`No entra un cliente ${RUN}`), (a.detalle || "").split("\n")[0]);
  check("Con el enlace para atenderlo", (a.enlace || "").endsWith("/admin"), a.enlace);
  check("En el campo que esperan Slack y Discord", typeof a.text === "string" && typeof a.content === "string");

  // --- Respuesta del proveedor ---
  const id = r.body.id;
  await call(`/api/provider/tickets/${id}`, { method: "POST", body: JSON.stringify({ message: "Sigue igual esta mañana." }) }, prov);
  await esperar(1500);
  recibidos = (await avisos()).slice(antes);
  check("Una respuesta también avisa", recibidos.length === 2, `${recibidos.length} avisos`);
  check("Y se distingue de un ticket nuevo", recibidos[1]?.tipo === "ticket-respuesta", recibidos[1]?.tipo);

  // --- Lo que no debe avisar ---
  await call("/api/provider/tickets", { method: "POST", body: JSON.stringify({ subject: "", message: "" }) }, prov);
  await esperar(1200);
  check("Un ticket rechazado no avisa de nada", ((await avisos()).slice(antes)).length === 2);

  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas de avisos OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
