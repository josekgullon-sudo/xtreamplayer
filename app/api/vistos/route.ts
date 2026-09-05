import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { jsonComprimido } from "@/lib/comprimir";
import { getCurrentCustomer } from "@/lib/provider";
import { ProfileOwner, ensureDefaultProfile, getActiveProfileId, ownsProfile } from "@/lib/profiles";
import { apuntar, olvidar, todos } from "@/lib/vistos";

export const dynamic = "force-dynamic";

/**
 * Por dónde iba cada uno, guardado en la cuenta.
 *
 * Ver `lib/vistos.ts` para el porqué de que esto no viva en el aparato.
 *
 * GET     devuelve todo lo apuntado del perfil abierto.
 * POST    apunta por dónde va algo. Lo llama el reproductor cada quince
 *         segundos y al salir del vídeo.
 * DELETE  lo quita de «seguir viendo».
 */
async function quien(): Promise<{ owner: ProfileOwner; profileId: number } | null> {
  const customer = await getCurrentCustomer();
  const user = customer ? null : await getCurrentUser();
  if (!customer && !user) return null;
  const owner: ProfileOwner = customer
    ? { kind: "customer", customer }
    : { kind: "user", user: user! };

  /*
   * De qué perfil.
   *
   * Cada uno de la casa tiene el suyo y no se mezclan: el historial del
   * padre en el perfil del niño es exactamente lo que los perfiles existen
   * para evitar. Si no hay ninguno elegido —o el elegido no es de este
   * dueño— se usa el de siempre, que es el que se crea solo.
   */
  const activo = await getActiveProfileId();
  const suyo = activo !== null ? ownsProfile(owner, activo) : null;
  return { owner, profileId: suyo ? suyo.id : ensureDefaultProfile(owner).id };
}

export async function GET(req: NextRequest) {
  const yo = await quien();
  if (!yo) return NextResponse.json({ vistos: [] });
  return await jsonComprimido(req, { vistos: todos(yo.owner, yo.profileId) });
}

export async function POST(req: NextRequest) {
  const yo = await quien();
  if (!yo) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.llave !== "string") {
    return NextResponse.json({ error: "Falta la llave" }, { status: 400 });
  }
  const texto = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  const numero = (k: string) => (typeof body[k] === "number" ? (body[k] as number) : 0);

  const guardado = apuntar(yo.owner, yo.profileId, {
    llave: body.llave,
    titulo: texto("titulo"),
    cartel: texto("cartel"),
    clase: texto("clase"),
    idStream: texto("idStream"),
    extension: texto("extension"),
    serieId: texto("serieId"),
    temporada: numero("temporada"),
    episodio: numero("episodio"),
    segundo: numero("segundo"),
    duracion: numero("duracion"),
  });
  /* `guardado: false` no es un error: es «todavía no cuenta como empezado».
     Ver EMPEZADO en lib/vistos.ts */
  return NextResponse.json({ ok: true, guardado });
}

export async function DELETE(req: NextRequest) {
  const yo = await quien();
  if (!yo) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  const llave = new URL(req.url).searchParams.get("llave") || "";
  if (!llave) return NextResponse.json({ error: "Falta la llave" }, { status: 400 });
  olvidar(yo.owner, yo.profileId, llave);
  return NextResponse.json({ ok: true });
}
