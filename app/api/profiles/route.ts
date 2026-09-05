import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentCustomer } from "@/lib/provider";
import {
  ProfileOwner,
  listProfiles,
  maxProfilesFor,
  ensureDefaultProfile,
  isValidProfileName,
  setActiveProfile,
  getActiveProfileId,
} from "@/lib/profiles";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Quién es el dueño de los perfiles: un cliente de proveedor o una cuenta propia. */
async function currentOwner(): Promise<ProfileOwner | null> {
  const customer = await getCurrentCustomer();
  if (customer) return { kind: "customer", customer };
  const user = await getCurrentUser();
  if (user) return { kind: "user", user };
  return null;
}

export async function GET() {
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ profiles: [], max: 0, owner: null });

  ensureDefaultProfile(owner);
  const profiles = listProfiles(owner);
  const max = maxProfilesFor(owner);
  const activeId = await getActiveProfileId();

  return NextResponse.json({
    owner: owner.kind,
    max,
    canAddMore: profiles.length < max,
    activeId: profiles.some((p) => p.id === activeId) ? activeId : null,
    profiles: profiles.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      kids: p.kids === 1,
      /* Si tiene PIN, no cuál es: eso no sale de aquí */
      conPin: Boolean(p.pin),
    })),
  });
}

/** Crear un perfil, respetando el tope del plan. */
export async function POST(req: NextRequest) {
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: { name?: string; avatar?: string; kids?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const name = (body.name || "").trim();
  if (!isValidProfileName(name)) {
    return NextResponse.json({ error: "El nombre debe tener entre 1 y 30 caracteres" }, { status: 400 });
  }

  const max = maxProfilesFor(owner);
  if (listProfiles(owner).length >= max) {
    return NextResponse.json(
      {
        error:
          owner.kind === "customer"
            ? `Tu proveedor te permite ${max} perfil${max === 1 ? "" : "es"}. Pídele ampliación.`
            : `Tu plan incluye ${max} perfil${max === 1 ? "" : "es"}. Pásate a Premium para tener hasta 5.`,
        needsUpgrade: owner.kind === "user",
      },
      { status: 403 }
    );
  }

  const result = getDb()
    .prepare("INSERT INTO profiles (customer_id, user_id, name, avatar, kids, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(
      owner.kind === "customer" ? owner.customer.id : 0,
      owner.kind === "user" ? owner.user.id : 0,
      name.slice(0, 30),
      (body.avatar || "").slice(0, 20),
      body.kids ? 1 : 0,
      Date.now()
    );

  return NextResponse.json({ profile: { id: Number(result.lastInsertRowid), name } });
}

/** Elegir el perfil con el que se navega. */
export async function PUT(req: NextRequest) {
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: { profileId?: number; pin?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const chosen = listProfiles(owner).find((p) => p.id === Number(body.profileId));
  if (!chosen) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });

  /*
   * El perfil con PIN pide su PIN.
   *
   * Lo que protege a un niño no es un candado en SU perfil —ese tiene que
   * poder abrirlo él—, sino uno en los de los mayores: sin esto, salirse
   * del perfil infantil es elegir otro en la misma pantalla. Se comprueba
   * aquí y no en el navegador porque en el navegador no protege de nada.
   */
  if (chosen.pin && chosen.pin !== String(body.pin || "")) {
    return NextResponse.json(
      { error: body.pin ? "Ese PIN no es" : "Este perfil pide PIN", pide: "pin" },
      { status: 403 }
    );
  }

  await setActiveProfile(chosen.id);
  return NextResponse.json({ ok: true, profile: { id: chosen.id, name: chosen.name } });
}
