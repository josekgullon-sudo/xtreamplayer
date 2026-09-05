import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb, CustomerRow, ProviderRow } from "@/lib/db";
import {
  setCustomerCookie,
  registerDevice,
  getProviderStatus,
  recordLogin,
  clientIp,
  liberarDispositivo,
} from "@/lib/provider";

export const dynamic = "force-dynamic";

/**
 * Entrada del cliente final con las credenciales que le dio su proveedor.
 * Vincula el dispositivo (MAC en TV, UUID en web) respetando su cupo.
 */
export async function POST(req: NextRequest) {
  let body: {
    username?: string;
    password?: string;
    deviceKey?: string;
    platform?: string;
    /**
     * La llave del aparato que se quiere cerrar para poder entrar aquí.
     *
     * Va en el propio inicio de sesión y no en una ruta aparte porque el
     * cliente todavía no ha entrado —justo eso es lo que no le dejan—, así
     * que lo único con lo que se puede identificar es su contraseña, que ya
     * se comprueba aquí. Una ruta propia tendría que volver a pedirla.
     */
    liberar?: string;
  };
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
    /*
     * Contraseña fallada contra un usuario que sí existe: es el intento que
     * de verdad interesa ver luego en el registro —alguien probando claves
     * contra una cuenta real—, y hasta ahora no se anotaba en ninguna parte.
     * Si el usuario ni existe no hay a quién atribuirlo, y tampoco importa.
     */
    if (candidates.length) {
      recordLogin(candidates[0].id, (body.deviceKey || "").trim(), body.platform || "web", clientIp(req.headers), false);
    } else {
      // Coste constante aproximado aunque no exista el usuario
      await bcrypt.compare(password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
    }
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

  /*
   * Cerrar el aparato que sobra, si lo ha pedido.
   *
   * Se hace después de comprobar la contraseña —arriba— y antes de contar
   * el cupo, que es lo que hace que la misma llamada sirva para cerrar uno
   * y entrar. La llave se comprueba contra los aparatos de ESTE cliente.
   */
  const suelta = (body.liberar || "").trim().slice(0, 128);
  if (suelta && suelta !== deviceKey) liberarDispositivo(customer.id, suelta);

  const check = registerDevice(customer, deviceKey, platform, ip);
  if (!check.allowed) {
    recordLogin(customer.id, deviceKey, platform, ip, false);
    return NextResponse.json(
      {
        error: check.reason,
        devicesUsed: check.used,
        devicesMax: check.max,
        /* Cuáles hay, para que pueda cerrar uno él mismo en vez de llamar
           a su proveedor. Ver `listarDispositivos` */
        dispositivos: check.dispositivos || [],
      },
      { status: 403 }
    );
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
