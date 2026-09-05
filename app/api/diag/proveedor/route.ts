import { NextRequest, NextResponse } from "next/server";
import { origenPedido } from "@/lib/origen";
import { assertPublicUrl } from "@/lib/safeFetch";

/** Los servidores IPTV filtran por User-Agent; VLC lo admiten todos. */
const PLAYER_UA = "VLC/3.0.20 LibVLC/3.0.20";

export const dynamic = "force-dynamic";

/**
 * «¿Quién falla, mi proveedor o yo?», contestado desde el servidor.
 *
 * Es el punto 7 de `docs/REDISEÑO.md`. `/api/diag` ya sabía distinguir «el
 * proveedor no contesta a nuestro servidor» de «este aparato no puede con
 * este vídeo», pero hacía falta un vídeo delante y solo se llegaba desde el
 * botón de un error. Esto pregunta por la cuenta entera y se puede pulsar
 * antes de que nada falle, que es cuando el cliente quiere saberlo.
 *
 * Lo que sale de aquí es una frase, nunca la dirección del proveedor: un
 * «getaddrinfo ENOTFOUND cdn.loquesea.com» dice el servidor con todas las
 * letras, y eso es justo lo que no puede salir. Ver `/api/xtream`.
 */
interface Cuenta {
  auth?: number;
  status?: string;
  exp_date?: string | number | null;
  max_connections?: string | number;
  active_cons?: string | number;
}

function numero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Lo que se le dice al cliente, en su idioma y sin nombres de máquinas. */
function veredictoXtream(info: Cuenta | undefined, tarda: number): { veredicto: string; bien: boolean } {
  if (!info || info.auth === 0) {
    return {
      bien: false,
      veredicto:
        "Tu proveedor contesta, pero dice que este usuario y esta contraseña ya no valen. Suele ser una suscripción caducada o unas credenciales cambiadas: pídeselas otra vez a tu proveedor.",
    };
  }
  const estado = (info.status || "").toLowerCase();
  if (estado && estado !== "active") {
    return {
      bien: false,
      veredicto: `Tu proveedor contesta y dice que tu línea está «${info.status}». Mientras siga así no vas a poder ver nada: habla con él.`,
    };
  }

  const tope = numero(info.max_connections);
  const usadas = numero(info.active_cons);
  /*
   * Las conexiones son la explicación de la mitad de los «no se ve nada» que
   * acaban en una llamada. No es un fallo de la aplicación ni del aparato:
   * es que la línea tiene dos y hay dos teles encendidas.
   */
  if (tope > 0 && usadas >= tope) {
    return {
      bien: false,
      veredicto: `Tu proveedor contesta bien (${tarda} ms), pero tu línea permite ${tope} ${
        tope === 1 ? "conexión" : "conexiones"
      } a la vez y ahora mismo están todas en uso. Apaga otro aparato o pídele más conexiones.`,
    };
  }

  const cuantas = tope > 0 ? ` Tu línea permite ${tope} ${tope === 1 ? "conexión" : "conexiones"} a la vez y hay ${usadas} en uso.` : "";
  return {
    bien: true,
    veredicto: `Todo bien por nuestro lado: tu proveedor contesta en ${tarda} ms y tu línea está activa.${cuantas} Si un canal concreto no se ve, es de ese canal o de este aparato, no de la conexión.`,
  };
}

export async function POST(req: NextRequest) {
  const cuerpo = (await req.json().catch(() => ({}))) as {
    lista?: string;
    base?: string;
    username?: string;
    password?: string;
    mac?: string;
  };

  const origen = await origenPedido(
    cuerpo.lista,
    { base: cuerpo.base, usuario: cuerpo.username, clave: cuerpo.password },
    cuerpo.mac
  );
  if (!origen) {
    return NextResponse.json({ error: "Entra en tu cuenta para comprobar esto" }, { status: 401 });
  }

  /* Con Xtream se pregunta por la cuenta, que además dice cuántas conexiones
     quedan; con una M3U no hay a quién preguntar más que por el fichero */
  const destino =
    origen.tipo === "xtream"
      ? (() => {
          const u = new URL(`${origen.base.replace(/\/+$/, "")}/player_api.php`);
          u.searchParams.set("username", origen.usuario);
          u.searchParams.set("password", origen.clave);
          return u.toString();
        })()
      : origen.base;

  const empezo = Date.now();
  try {
    await assertPublicUrl(destino);
    const arriba = await fetch(destino, {
      headers: { "User-Agent": PLAYER_UA, ...(origen.tipo === "xtream" ? {} : { Range: "bytes=0-2048" }) },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
      redirect: "follow",
    });
    const tarda = Date.now() - empezo;

    if (!arriba.ok && arriba.status !== 206) {
      return NextResponse.json({
        bien: false,
        veredicto: `Tu proveedor respondió ${arriba.status} a nuestro servidor: le está rechazando la conexión. Suele ser un bloqueo de las direcciones de centros de datos, o una línea sin conexiones libres.`,
      });
    }

    if (origen.tipo !== "xtream") {
      return NextResponse.json({
        bien: true,
        veredicto: `Todo bien por nuestro lado: tu lista responde en ${tarda} ms. Si algo no se ve, es de ese canal o de este aparato.`,
      });
    }

    const texto = await arriba.text();
    let info: Cuenta | undefined;
    try {
      info = (JSON.parse(texto) as { user_info?: Cuenta }).user_info;
    } catch {
      return NextResponse.json({
        bien: false,
        veredicto:
          "Tu proveedor contesta, pero no con datos que podamos entender. Suele pasar cuando el servidor está en mantenimiento o han cambiado de dirección.",
      });
    }
    return NextResponse.json(veredictoXtream(info, tarda));
  } catch {
    /* Ni el motivo ni la máquina: solo qué significa para el cliente */
    return NextResponse.json({
      bien: false,
      veredicto:
        "Tu proveedor no responde a nuestro servidor, aunque puede que sí responda a tu casa. Lo normal es que bloquee las direcciones de centros de datos: díselo, es cosa suya y se arregla en un minuto.",
    });
  }
}
