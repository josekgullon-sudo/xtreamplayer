import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentProvider } from "@/lib/provider";
import { generarApiKey } from "@/lib/apiKey";

export const dynamic = "force-dynamic";

/** Estado de la clave: si hay una activa y su prefijo, nunca la clave entera. */
export async function GET() {
  const provider = await getCurrentProvider();
  if (!provider) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  return NextResponse.json({
    active: Boolean(provider.api_key_hash),
    prefix: provider.api_key_prefix || null,
  });
}

/**
 * Genera (o rota) la clave. Se devuelve completa una única vez: aquí.
 * Rotar invalida la anterior en el acto — es la vía de escape si se filtra.
 */
export async function POST() {
  const provider = await getCurrentProvider();
  if (!provider) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { key, hash, prefix } = generarApiKey();
  getDb().prepare("UPDATE providers SET api_key_hash = ?, api_key_prefix = ? WHERE id = ?").run(hash, prefix, provider.id);
  return NextResponse.json({ ok: true, key, prefix });
}

/** Revoca la clave: la API pública queda desactivada para este proveedor. */
export async function DELETE() {
  const provider = await getCurrentProvider();
  if (!provider) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  getDb().prepare("UPDATE providers SET api_key_hash = '', api_key_prefix = '' WHERE id = ?").run(provider.id);
  return NextResponse.json({ ok: true });
}
