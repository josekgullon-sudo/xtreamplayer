import { ProviderRow } from "@/lib/db";
import { assertPublicUrl } from "@/lib/safeFetch";

const PLAYER_UA = "VLC/3.0.20 LibVLC/3.0.20";

/**
 * Conexión con la API de administración del panel del proveedor (XUI y
 * compatibles), para importar sus clientes directamente en vez de pedirle
 * que pegue listas que su panel no le deja exportar.
 *
 * No existe UNA API de panel: cada instalación la expone a su manera. Se
 * prueban las formas conocidas en orden y, si ninguna responde, se devuelve
 * exactamente qué contestó el panel a cada una — el mismo principio que el
 * resto del sistema: cuando algo falla, que diga por qué.
 */

export interface UsuarioPanel {
  username: string;
  password: string;
  expiresAt: number;
  enabled: boolean;
}

interface Resultado {
  ok: true;
  users: UsuarioPanel[];
  via: string;
}

interface Fallo {
  ok: false;
  error: string;
  detalle: string;
}

function normalizarUsuarios(data: unknown): UsuarioPanel[] | null {
  // Las APIs de panel envuelven la lista de maneras distintas
  const candidatos = [data, (data as { data?: unknown })?.data, (data as { users?: unknown })?.users,
    (data as { data?: { users?: unknown } })?.data && (data as { data: { users?: unknown } }).data.users];
  for (const c of candidatos) {
    if (!Array.isArray(c) || !c.length) continue;
    const filas = c as Record<string, unknown>[];
    if (!filas.some((f) => typeof f?.username === "string" && f.username)) continue;
    return filas
      .filter((f) => typeof f.username === "string" && f.username)
      .map((f) => ({
        username: String(f.username),
        password: String(f.password ?? ""),
        // exp_date llega en segundos Unix (o null = sin caducidad)
        expiresAt: f.exp_date && Number(f.exp_date) > 0 ? Number(f.exp_date) * 1000 : 0,
        enabled: f.enabled === undefined || f.enabled === 1 || f.enabled === "1" || f.enabled === true,
      }));
  }
  return null;
}

export async function listarUsuariosPanel(provider: ProviderRow): Promise<Resultado | Fallo> {
  const base = provider.panel_url.replace(/\/+$/, "");
  if (!base) return { ok: false, error: "No hay panel conectado", detalle: "" };

  const key = provider.panel_api_key;
  const intentos: { via: string; url: string }[] = [];
  if (key) {
    // XUI.one: el código de acceso de la API forma parte de la ruta
    intentos.push({ via: "XUI (código en ruta)", url: `${base}/${encodeURIComponent(key)}/api.php?action=user&sub=list` });
    intentos.push({ via: "XUI (api_key)", url: `${base}/api.php?api_key=${encodeURIComponent(key)}&action=user&sub=list` });
  }
  if (provider.panel_user && provider.panel_pass) {
    intentos.push({
      via: "api.php con usuario y contraseña",
      url: `${base}/api.php?username=${encodeURIComponent(provider.panel_user)}&password=${encodeURIComponent(provider.panel_pass)}&action=user&sub=list`,
    });
  }
  if (!intentos.length) {
    return { ok: false, error: "Falta el código de la API del panel o su usuario y contraseña", detalle: "" };
  }

  const respuestas: string[] = [];
  for (const intento of intentos) {
    try {
      await assertPublicUrl(intento.url);
      const res = await fetch(intento.url, {
        headers: { "User-Agent": PLAYER_UA },
        signal: AbortSignal.timeout(20000),
        cache: "no-store",
      });
      const texto = await res.text();
      if (!res.ok) {
        respuestas.push(`${intento.via}: HTTP ${res.status}`);
        continue;
      }
      let data: unknown;
      try {
        data = JSON.parse(texto);
      } catch {
        respuestas.push(`${intento.via}: no devolvió JSON (${texto.slice(0, 60).replace(/\s+/g, " ")}…)`);
        continue;
      }
      const users = normalizarUsuarios(data);
      if (users) return { ok: true, users, via: intento.via };
      respuestas.push(`${intento.via}: JSON sin lista de usuarios reconocible`);
    } catch (e) {
      respuestas.push(`${intento.via}: ${e instanceof Error && e.name === "TimeoutError" ? "sin respuesta" : "error de conexión"}`);
    }
  }

  return {
    ok: false,
    error: "El panel no expone la lista de usuarios con las credenciales dadas",
    detalle: respuestas.join(" · "),
  };
}
