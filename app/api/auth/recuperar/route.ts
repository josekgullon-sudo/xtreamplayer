import { NextRequest, NextResponse } from "next/server";
import { pedirRecuperacion, tokenValido, restablecer, Ambito, limpiarCaducados } from "@/lib/recuperar";
import { clientIp } from "@/lib/provider";

export const dynamic = "force-dynamic";

const ambitoDe = (v: unknown): Ambito => (v === "provider" ? "provider" : "user");

/**
 * Pedir el correo para cambiar la contraseña.
 *
 * Contesta lo mismo exista la cuenta o no. Decir «ese correo no está
 * registrado» convierte este formulario en una forma cómoda de averiguar
 * quién tiene cuenta aquí, y de paso le confirma a quien prueba correos
 * robados cuáles ha acertado.
 */
export async function POST(req: NextRequest) {
  let body: { email?: string; tipo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Escribe tu correo" }, { status: 400 });
  }

  limpiarCaducados();
  const r = await pedirRecuperacion(ambitoDe(body.tipo), email, clientIp(req.headers));

  if (r.sinCorreo) {
    /* Esto sí se dice: no es información sobre nadie, y a quien administra la
       plataforma le ahorra media hora buscando por qué no llega el correo */
    return NextResponse.json(
      { error: "El envío de correo no está configurado todavía. Escríbenos y te ayudamos a entrar." },
      { status: 503 }
    );
  }
  return NextResponse.json({ ok: true });
}

/** ¿Sigue valiendo este enlace? Para no pintar un formulario que no va a servir */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const tipo = ambitoDe(req.nextUrl.searchParams.get("tipo"));
  return NextResponse.json({ valido: token ? tokenValido(token, tipo) : false });
}

/** Guardar la contraseña nueva */
export async function PUT(req: NextRequest) {
  let body: { token?: string; tipo?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const r = await restablecer(body.token || "", ambitoDe(body.tipo), body.password || "");
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, email: r.email });
}
