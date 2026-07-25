import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb, CustomerRow, ProviderRow } from "@/lib/db";
import { setCustomerCookie, registerDevice, getProviderStatus, recordLogin, clientIp } from "@/lib/provider";

export const dynamic = "force-dynamic";

/**
 * Entrada del cliente final con las credenciales que le dio su proveedor.
 * Vincula el dispositivo (MAC en TV, UUID en web) respetando su cupo.
 */
export async function POST(req: NextRequest) {
  let body: { username?: string; password?: string; deviceKey?: string; platform?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const username = (body.username || "").trim().toLowerCase();
  const password = body.password || "";
  const db = getDb();

  // El usuario solo es único por proveedor, así que puede haber homónimos con la
  // misma contraseña en proveedores distintos. Recogemos TODAS las coincidencias y
  // damos prioridad a la cuenta utilizable, para no rechazar a un cliente activo
  // por culpa del homónimo desactivado de otro proveedor.
  const candidates = db.prepare("SELECT * FROM customers WHERE username = ?").all(username) as CustomerRow[];

  const matches: CustomerRow[] = [];
  for (const row of candidates) {
    if (await bcrypt.compare(password, row.password_hash)) matches.push(row);
  }
  if (!matches.length) {
    // Coste constante aproximado aunque no exista el usuario
    if (!candidates.length) await bcrypt.compare(password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
    return NextResponse.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });
  }

  const now = Date.now();
  const providerOf = db.prepare("SELECT * FROM providers WHERE id = ?");
  const usable = (row: CustomerRow) => {
    if (row.status !== "active") return false;
    if (row.expires_at > 0 && row.expires_at < now) return false;
    const p = providerOf.get(row.provider_id) as ProviderRow | undefined;
    return Boolean(p && p.status === "active" && getProviderStatus(p, now).active);
  };

  const customer = matches.find(usable) ?? matches[0];
  const provider = providerOf.get(customer.provider_id) as ProviderRow | undefined;

  if (customer.status !== "active") {
    return NextResponse.json({ error: "Tu acceso está desactivado. Contacta con tu proveedor." }, { status: 403 });
  }
  if (customer.expires_at > 0 && customer.expires_at < now) {
    return NextResponse.json({ error: "Tu acceso ha caducado. Contacta con tu proveedor." }, { status: 403 });
  }
  // Si el proveedor se queda sin plan, sus clientes dejan de entrar
  if (!provider || provider.status !== "active" || !getProviderStatus(provider, now).active) {
    return NextResponse.json(
      { error: "El servicio de tu proveedor no está activo en este momento." },
      { status: 403 }
    );
  }

  const deviceKey = (body.deviceKey || "").trim().slice(0, 128);
  if (!deviceKey) return NextResponse.json({ error: "Falta el identificador del dispositivo" }, { status: 400 });

  const platform = (body.platform || "web").slice(0, 40);
  const ip = clientIp(req.headers);

  const check = registerDevice(customer, deviceKey, platform, ip);
  if (!check.allowed) {
    recordLogin(customer.id, deviceKey, platform, ip, false);
    return NextResponse.json({ error: check.reason, devicesUsed: check.used, devicesMax: check.max }, { status: 403 });
  }
  recordLogin(customer.id, deviceKey, platform, ip, true);

  await setCustomerCookie(customer.id);
  return NextResponse.json({
    ok: true,
    customer: { username: customer.username, label: customer.label },
    devices: { used: check.used, max: check.max },
    brand: provider.brand_name || "",
  });
}
