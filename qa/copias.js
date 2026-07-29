// Copias de seguridad de la base de datos.
//
// Todo —proveedores, clientes, contraseñas cifradas, facturas emitidas— vive
// en un solo archivo. Sin copia, un disco que falla se lo lleva entero: los
// clientes de cada proveedor habría que darlos de alta uno a uno y las
// facturas ya emitidas simplemente no existirían.
//
// Aquí se comprueba lo que de verdad importa de una copia: que se pueda hacer,
// que la que sale sea una base de datos abrible —no un archivo a medias— y que
// no se la pueda bajar cualquiera.
const fs = require("fs");
const path = require("path");
const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`); };

const ck = (sc, n) => { const m = sc?.match(new RegExp(`${n}=([^;]+)`)); return m ? `${n}=${m[1]}` : ""; };
async function call(path, opts = {}, cookie = "") {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers || {}) },
  });
  return { status: res.status, body: await res.json().catch(() => ({})), setCookie: res.headers.get("set-cookie") };
}

(async () => {
  const RUN = Date.now().toString(36).slice(-5);

  // --- Quién puede tocar esto ---
  let r = await call("/api/admin/copias");
  check("Sin sesión no se ven las copias", r.status === 403, String(r.status));

  r = await call("/api/provider/auth", { method: "POST", body: JSON.stringify({ action: "register", email: `cop${RUN}@t.com`, password: "supersecreta1", company: `Cop ${RUN}` }) });
  const prov = ck(r.setCookie, "xp_provider");
  r = await call("/api/admin/copias", {}, prov);
  check("Un proveedor tampoco: es la base de datos de todos", r.status === 403, String(r.status));

  r = await call("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@totalplayer.app", password: "admin12345" }) });
  const admin = ck(r.setCookie, "xp_session");
  if (!admin) { console.log("FATAL: sin administrador sembrado (node scripts/seed-demo.mjs)"); process.exit(1); }

  // --- Hacer una ---
  r = await call("/api/admin/copias", { method: "POST" }, admin);
  check("El administrador puede hacer una copia ahora", r.status === 200 && Boolean(r.body.copia?.nombre), r.body.copia?.nombre);
  const copia = r.body.copia;
  check("Y pesa algo, no es un archivo vacío", copia?.bytes > 10000, `${Math.round((copia?.bytes || 0) / 1024)} kB`);

  r = await call("/api/admin/copias", {}, admin);
  check("Sale en la lista", r.body.copias?.some((c) => c.nombre === copia.nombre), `${r.body.copias?.length} copias`);

  // --- Que sea una base de datos de verdad ---
  const res = await fetch(`${BASE}/api/admin/copias?bajar=${encodeURIComponent(copia.nombre)}`, { headers: { Cookie: admin } });
  const bytes = Buffer.from(await res.arrayBuffer());
  check("Se descarga", res.status === 200 && bytes.length === copia.bytes, `${bytes.length} bytes`);
  /* La cabecera de un fichero SQLite. Sin esto, una copia a medias pasa por
     buena hasta el día que hace falta restaurarla */
  check("Y es un SQLite abrible, no un archivo a medias",
    bytes.subarray(0, 15).toString() === "SQLite format 3", bytes.subarray(0, 15).toString());

  const tmp = path.join(require("os").tmpdir(), `qa-copia-${RUN}.db`);
  fs.writeFileSync(tmp, bytes);
  const db = require("better-sqlite3")(tmp, { readonly: true });
  const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
  check("Con las tablas dentro", tablas.includes("providers") && tablas.includes("customers") && tablas.includes("invoices"), `${tablas.length} tablas`);
  const cuantos = db.prepare("SELECT COUNT(*) AS n FROM providers").get().n;
  check("Y los datos, no solo el esqueleto", cuantos > 0, `${cuantos} proveedores`);
  /* La prueba de fuego: el proveedor creado hace dos segundos tiene que estar
     dentro. Una copia que no incluye lo último escrito no sirve de nada */
  const reciente = db.prepare("SELECT COUNT(*) AS n FROM providers WHERE email = ?").get(`cop${RUN}@t.com`).n;
  check("Incluida la última escritura, de hace dos segundos", reciente === 1);
  db.close();
  fs.unlinkSync(tmp);

  // --- Lo que no se puede consentir ---
  for (const truco of ["../xtreamplayer.db", "../../etc/passwd", "/etc/passwd", "copia-x.db", "..%2Fxtreamplayer.db"]) {
    const r2 = await fetch(`${BASE}/api/admin/copias?bajar=${encodeURIComponent(truco)}`, { headers: { Cookie: admin } });
    check(`No se baja «${truco}»`, r2.status === 404, String(r2.status));
  }

  const sinSesion = await fetch(`${BASE}/api/admin/copias?bajar=${encodeURIComponent(copia.nombre)}`);
  check("Ni la copia buena sin ser administrador", sinSesion.status === 403, String(sinSesion.status));

  // --- Queda anotado quién se la llevó ---
  r = await call("/api/admin/registro?auditoria=1", {}, admin);
  const apuntes = (r.body.auditoria || []).map((a) => a.accion);
  check("Hacer y descargar una copia queda en el registro",
    apuntes.includes("copia.creada") && apuntes.includes("copia.descargada"),
    apuntes.slice(0, 3).join(", "));

  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas de copias de seguridad OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
