// La factura en PDF: la que se le reenvía al gestor.
//
// Se comprueba lo que importa de un documento fiscal: que lo baje quien debe
// y nadie más, que sea un PDF de verdad y no una página, y que lleve dentro
// el emisor, el receptor, el desglose del IVA y el total. El texto va sin
// comprimir a propósito, así que se puede leer del propio archivo.
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

  // Un proveedor con sus datos fiscales puestos, y otro que no pinta nada aquí
  let r = await call("/api/provider/auth", { method: "POST", body: JSON.stringify({ action: "register", email: `pdf${RUN}@t.com`, password: "supersecreta1", company: `PDF ${RUN}` }) });
  const prov = ck(r.setCookie, "xp_provider");
  await call("/api/provider/invoices", { method: "PUT", body: JSON.stringify({ taxName: "Gestoría Añil S.L.", taxId: "B98765432", taxAddress: "Calle Mayor 3, 28013 Madrid" }) }, prov);

  r = await call("/api/provider/auth", { method: "POST", body: JSON.stringify({ action: "register", email: `otro${RUN}@t.com`, password: "supersecreta1", company: `Otro ${RUN}` }) });
  const otro = ck(r.setCookie, "xp_provider");

  // El administrador le emite una factura a mano
  r = await call("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@totalplayer.app", password: "admin12345" }) });
  const admin = ck(r.setCookie, "xp_session");
  if (!admin) { console.log("FATAL: sin administrador sembrado (node scripts/seed-demo.mjs)"); process.exit(1); }

  const proveedores = (await call("/api/admin/proveedores?buscar=" + encodeURIComponent(`pdf${RUN}`), {}, admin)).body;
  const mio = (proveedores.proveedores || []).find((p) => p.email === `pdf${RUN}@t.com`);
  check("El proveedor recién creado aparece en administración", Boolean(mio), mio ? `id ${mio.id}` : "no aparece");

  await call("/api/admin/facturas", { method: "POST", body: JSON.stringify({ proveedorId: mio.id, concepto: "Plan Basic — julio de 2026", importe: 45, estado: "pagada" }) }, admin);
  const suyas = (await call("/api/provider/invoices", {}, prov)).body.invoices;
  const factura = suyas[0];
  check("Y la factura le llega a su apartado", Boolean(factura), factura?.number);

  // --- Quién puede bajarla ---
  const bajar = (cookie) => fetch(`${BASE}/api/facturas/${factura.id}/pdf`, { headers: cookie ? { Cookie: cookie } : {} });

  let res = await bajar(prov);
  const pdf = Buffer.from(await res.arrayBuffer());
  const texto = pdf.toString("latin1");
  check("El proveedor se baja la suya", res.status === 200);
  check("Y baja como PDF, no como página",
    res.headers.get("content-type") === "application/pdf" && pdf.subarray(0, 5).toString() === "%PDF-",
    res.headers.get("content-type"));
  check("Con nombre de archivo, para que no se llame «pdf»",
    /filename="factura-[\w.-]+\.pdf"/.test(res.headers.get("content-disposition") || ""),
    res.headers.get("content-disposition"));

  check("Sin sesión no se baja nada", (await bajar("")).status === 401);
  check("Y otro proveedor tampoco ve la ajena", (await bajar(otro)).status === 401);
  check("El administrador sí, que es quien la emitió", (await bajar(admin)).status === 200);

  // --- Lo que tiene que poner dentro ---
  check("Lleva el emisor con su NIF", texto.includes("TOTALplayer SL") && texto.includes("B00000000"));
  check("Y el receptor con el suyo", texto.includes("Gestor") && texto.includes("B98765432"));
  check("El número de factura", texto.includes(factura.number), factura.number);
  check("El concepto", texto.includes("Plan Basic"));
  /* Sin base ni tipo, la factura no le sirve al gestor: es media hora suya
     rehaciéndola y una llamada de vuelta */
  /* Dentro de un PDF el paréntesis va escapado: forma parte del formato */
  check("El desglose del IVA", texto.includes("Base imponible") && /IVA \\\(21%/.test(texto));
  check("Y el total, con su euro bien puesto", texto.includes("TOTAL") && /45,00/.test(texto));

  // --- Una anulada tiene que cantar ---
  await call("/api/admin/facturas", { method: "PATCH", body: JSON.stringify({ id: factura.id, estado: "anulada" }) }, admin);
  const anulada = Buffer.from(await (await bajar(admin)).arrayBuffer()).toString("latin1");
  check("Una factura anulada lo dice en grande",
    anulada.includes("FACTURA ANULADA"),
    "si no, acaba contabilizada y el descuadre aparece meses después");

  console.log(`\n${results.filter(Boolean).length}/${results.length} pruebas de la factura en PDF OK`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log("FATAL", String(e).slice(0, 400)); process.exit(1); });
