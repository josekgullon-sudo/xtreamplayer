// QA del flujo B2B completo: proveedor → cliente → reproducción.
const BASE = process.env.QA_BASE || "http://localhost:3101";
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

let providerCookie = "";
let customerCookie = "";

async function call(path, opts = {}, cookie = "") {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers || {}) },
  });
  const setCookie = res.headers.get("set-cookie");
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, setCookie };
}

function extractCookie(setCookie, name) {
  if (!setCookie) return "";
  const m = setCookie.match(new RegExp(`${name}=([^;]+)`));
  return m ? `${name}=${m[1]}` : "";
}

(async () => {
  const RUN = Date.now().toString(36).slice(-5);
  const U = (n) => `c${RUN}-${n}`;
  const email = `prov-${Date.now()}@test.com`;

  // --- Alta de proveedor ---
  let r = await call("/api/provider/auth", {
    method: "POST",
    body: JSON.stringify({ action: "register", email, password: "supersecreta1", company: "IPTV Demo" }),
  });
  check("Alta de proveedor", r.status === 200 && r.body.ok, `prueba: ${r.body.trialCustomers} clientes`);
  providerCookie = extractCookie(r.setCookie, "xp_provider");

  r = await call("/api/provider/auth", {}, providerCookie);
  check("Sesión de proveedor con plan de prueba", r.body.status?.onTrial === true && r.body.status?.maxCustomers === 10);

  // --- Aislamiento de sesiones (seguridad) ---
  const userCookieAsProvider = providerCookie.replace("xp_provider=", "xp_session=");
  r = await call("/api/auth/me", {}, userCookieAsProvider);
  check("Token de proveedor NO vale como usuario", r.body.user === null);

  // --- Alta de cliente ---
  r = await call(
    "/api/provider/customers",
    {
      method: "POST",
      body: JSON.stringify({
        username: U("01"),
        password: "clave1234",
        label: "Juan Pérez",
        playlistType: "xtream",
        playlistUrl: "127.0.0.1:8090",
        playlistUsername: "demo",
        playlistPassword: "demo123",
        maxDevices: 2,
      }),
    },
    providerCookie
  );
  check("Alta de cliente final", r.status === 200 && r.body.customer?.username === U("01"));

  // Autodetección get.php al crear cliente
  r = await call(
    "/api/provider/customers",
    {
      method: "POST",
      body: JSON.stringify({
        username: U("02"),
        password: "clave1234",
        playlistType: "xtream",
        playlistUrl: "http://127.0.0.1:8090/get.php?username=demo&password=demo123&type=m3u_plus",
      }),
    },
    providerCookie
  );
  check(
    "Autodetecta credenciales de un get.php",
    r.status === 200 && r.body.customer?.playlistUsername === "demo",
    r.body.customer?.playlistUrl
  );

  // Usuario duplicado
  r = await call(
    "/api/provider/customers",
    { method: "POST", body: JSON.stringify({ username: U("01"), password: "x1234", playlistUrl: "127.0.0.1:8090", playlistUsername: "a", playlistPassword: "b" }) },
    providerCookie
  );
  check("Rechaza usuario duplicado", r.status === 409);

  // --- Límite del plan de prueba (10 clientes) ---
  for (let i = 3; i <= 10; i++) {
    await call(
      "/api/provider/customers",
      {
        method: "POST",
        body: JSON.stringify({
          username: U(String(i).padStart(2, "0")),
          password: "clave1234",
          playlistUrl: "127.0.0.1:8090",
          playlistUsername: "demo",
          playlistPassword: "demo123",
        }),
      },
      providerCookie
    );
  }
  r = await call(
    "/api/provider/customers",
    {
      method: "POST",
      body: JSON.stringify({
        username: U("11"),
        password: "clave1234",
        playlistUrl: "127.0.0.1:8090",
        playlistUsername: "demo",
        playlistPassword: "demo123",
      }),
    },
    providerCookie
  );
  check("Bloquea al superar el cupo del plan", r.status === 403 && r.body.needsUpgrade === true, r.body.error);

  // --- Login del cliente final ---
  r = await call("/api/customer/login", {
    method: "POST",
    body: JSON.stringify({ username: U("01"), password: "clave1234", deviceKey: "device-A", platform: "web" }),
  });
  check("Login de cliente + registro de dispositivo", r.status === 200 && r.body.devices?.used === 1);
  customerCookie = extractCookie(r.setCookie, "xp_customer");

  r = await call("/api/customer/login", {
    method: "POST",
    body: JSON.stringify({ username: U("01"), password: "MAL", deviceKey: "device-A" }),
  });
  check("Rechaza contraseña incorrecta", r.status === 401);

  // --- La lista llega cargada ---
  r = await call("/api/customer/me", {}, customerCookie);
  check(
    "El cliente recibe su lista lista para reproducir",
    r.body.playlist?.type === "xtream" && r.body.playlist?.username === "demo" && r.body.playlist?.managed === true
  );

  // --- Límite de dispositivos ---
  await call("/api/customer/login", {
    method: "POST",
    body: JSON.stringify({ username: U("01"), password: "clave1234", deviceKey: "device-B" }),
  });
  r = await call("/api/customer/login", {
    method: "POST",
    body: JSON.stringify({ username: U("01"), password: "clave1234", deviceKey: "device-C" }),
  });
  check("Bloquea el 3er dispositivo (límite 2)", r.status === 403, r.body.error);

  // Mismo dispositivo repetido no consume cupo
  r = await call("/api/customer/login", {
    method: "POST",
    body: JSON.stringify({ username: U("01"), password: "clave1234", deviceKey: "device-A" }),
  });
  check("Reentrar en un dispositivo ya vinculado funciona", r.status === 200 && r.body.devices.used === 2);

  // --- El proveedor libera dispositivos ---
  const list = await call(`/api/provider/customers?q=${U("01")}`, {}, providerCookie);
  const id = list.body.customers[0].id;
  check("El panel muestra los dispositivos usados", list.body.customers[0].devices === 2);

  await call(`/api/provider/customers/${id}`, { method: "PATCH", body: JSON.stringify({ resetDevices: true }) }, providerCookie);
  r = await call("/api/customer/login", {
    method: "POST",
    body: JSON.stringify({ username: U("01"), password: "clave1234", deviceKey: "device-C" }),
  });
  check("Tras liberar, entra un dispositivo nuevo", r.status === 200);

  // --- Desactivar cliente ---
  await call(`/api/provider/customers/${id}`, { method: "PATCH", body: JSON.stringify({ status: "disabled" }) }, providerCookie);
  r = await call("/api/customer/login", {
    method: "POST",
    body: JSON.stringify({ username: U("01"), password: "clave1234", deviceKey: "device-C" }),
  });
  check("Cliente desactivado no puede entrar", r.status === 403, r.body.error);

  // --- Aislamiento entre proveedores ---
  const other = await call("/api/provider/auth", {
    method: "POST",
    body: JSON.stringify({ action: "register", email: `otro-${Date.now()}@test.com`, password: "supersecreta1" }),
  });
  const otherCookie = extractCookie(other.setCookie, "xp_provider");
  r = await call(`/api/provider/customers/${id}`, { method: "DELETE" }, otherCookie);
  check("Un proveedor NO puede tocar clientes de otro", r.status === 404);

  r = await call("/api/provider/customers", {}, otherCookie);
  check("Cada proveedor solo ve sus clientes", r.body.customers.length === 0);

  // --- Homónimos entre proveedores: mismo usuario y contraseña ---
  // El primer proveedor tiene U("01") DESACTIVADO; el segundo lo crea activo.
  // El cliente activo debe poder entrar pese al homónimo bloqueado.
  r = await call(
    "/api/provider/customers",
    {
      method: "POST",
      body: JSON.stringify({
        username: U("01"),
        password: "clave1234",
        playlistUrl: "127.0.0.1:8090",
        playlistUsername: "otro",
        playlistPassword: "otro123",
      }),
    },
    otherCookie
  );
  check("Otro proveedor puede reutilizar el mismo usuario", r.status === 200);

  r = await call("/api/customer/login", {
    method: "POST",
    body: JSON.stringify({ username: U("01"), password: "clave1234", deviceKey: "device-Z" }),
  });
  check("Homónimo activo entra pese al desactivado de otro proveedor", r.status === 200);

  const homCookie = extractCookie(r.setCookie, "xp_customer");
  r = await call("/api/customer/me", {}, homCookie);
  check("Y recibe la lista de SU proveedor, no la del homónimo", r.body.playlist?.username === "otro", r.body.playlist?.username);

  // --- Sin sesión ---
  r = await call("/api/provider/customers", {});
  check("Panel protegido sin sesión", r.status === 401);

  // --- Planes públicos ---
  r = await call("/api/provider/plans", {});
  check("Catálogo de planes disponible", r.body.plans?.length === 6, r.body.plans?.map((p) => `${p.name} ${p.priceMonth}€/${p.maxCustomers}`).join(", "));

  const failed = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - failed}/${results.length} pruebas B2B OK`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
