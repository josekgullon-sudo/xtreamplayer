import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb, PlaylistRow } from "@/lib/db";
import { getPlanInfo } from "@/lib/plan";

function serialize(row: PlaylistRow) {
  return {
    id: String(row.id),
    name: row.name,
    type: row.type,
    url: row.url,
    username: row.username,
    password: row.password,
    createdAt: row.created_at,
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const rows = getDb()
    .prepare("SELECT * FROM playlists WHERE user_id = ? ORDER BY created_at ASC")
    .all(user.id) as PlaylistRow[];
  return NextResponse.json({ playlists: rows.map(serialize) });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: { name?: string; type?: string; url?: string; username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const name = (body.name || "").trim().slice(0, 100);
  const type = body.type === "xtream" ? "xtream" : body.type === "m3u" ? "m3u" : null;
  if (!name || !type) {
    return NextResponse.json({ error: "Faltan datos de la lista" }, { status: 400 });
  }

  const db = getDb();
  const plan = getPlanInfo(user);
  const count = db.prepare("SELECT COUNT(*) AS c FROM playlists WHERE user_id = ?").get(user.id) as { c: number };
  if (count.c >= plan.maxCloudPlaylists) {
    return NextResponse.json(
      {
        error:
          plan.plan === "free"
            ? `El plan Gratis permite ${plan.maxCloudPlaylists} lista en la nube. Pásate a Premium para tener hasta 20.`
            : `Has alcanzado el máximo de ${plan.maxCloudPlaylists} listas en la nube`,
        upgrade: plan.plan === "free",
      },
      { status: 403 }
    );
  }

  const result = db
    .prepare(
      "INSERT INTO playlists (user_id, name, type, url, username, password, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(user.id, name, type, (body.url || "").trim(), (body.username || "").trim(), body.password || "", Date.now());

  const row = db.prepare("SELECT * FROM playlists WHERE id = ?").get(result.lastInsertRowid) as PlaylistRow;
  return NextResponse.json({ playlist: serialize(row) });
}
