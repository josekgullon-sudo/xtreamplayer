import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentCustomer } from "@/lib/provider";
import { ProfileOwner, listProfiles, ownsProfile, isValidProfileName } from "@/lib/profiles";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

async function currentOwner(): Promise<ProfileOwner | null> {
  const customer = await getCurrentCustomer();
  if (customer) return { kind: "customer", customer };
  const user = await getCurrentUser();
  if (user) return { kind: "user", user };
  return null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const profile = ownsProfile(owner, Number(id));
  if (!profile) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });

  let body: { name?: string; avatar?: string; kids?: boolean; pin?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const db = getDb();
  if (body.name !== undefined) {
    if (!isValidProfileName(body.name)) {
      return NextResponse.json({ error: "El nombre debe tener entre 1 y 30 caracteres" }, { status: 400 });
    }
    db.prepare("UPDATE profiles SET name = ? WHERE id = ?").run(body.name.trim().slice(0, 30), profile.id);
  }
  if (body.avatar !== undefined) {
    db.prepare("UPDATE profiles SET avatar = ? WHERE id = ?").run(body.avatar.slice(0, 20), profile.id);
  }
  if (typeof body.kids === "boolean") {
    db.prepare("UPDATE profiles SET kids = ? WHERE id = ?").run(body.kids ? 1 : 0, profile.id);
  }
  /*
   * El PIN: cuatro cifras, o vacío para quitarlo.
   *
   * Cuatro y no más porque se teclea con el mando de una tele, y de cifras
   * porque ahí no hay teclado. No es una contraseña —protege de un niño,
   * no de un ladrón— y por eso se guarda tal cual: cifrarlo daría una
   * sensación de seguridad que no tiene, y aquí lo que hay al otro lado ya
   * es la cuenta entera de quien lo pone.
   */
  if (typeof body.pin === "string") {
    const pin = body.pin.trim();
    if (pin && !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: "El PIN son cuatro cifras" }, { status: 400 });
    }
    db.prepare("UPDATE profiles SET pin = ? WHERE id = ?").run(pin, profile.id);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const profile = ownsProfile(owner, Number(id));
  if (!profile) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });

  // Siempre debe quedar uno: sin perfiles no habría dónde guardar favoritos
  if (listProfiles(owner).length <= 1) {
    return NextResponse.json({ error: "Debe quedar al menos un perfil" }, { status: 400 });
  }

  getDb().prepare("DELETE FROM profiles WHERE id = ?").run(profile.id);
  return NextResponse.json({ ok: true });
}
