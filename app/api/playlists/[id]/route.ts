import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const result = getDb().prepare("DELETE FROM playlists WHERE id = ? AND user_id = ?").run(Number(id), user.id);
  if (result.changes === 0) {
    return NextResponse.json({ error: "Lista no encontrada" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
