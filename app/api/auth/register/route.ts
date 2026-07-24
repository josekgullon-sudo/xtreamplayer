import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb, UserRow } from "@/lib/db";
import { isValidEmail, setSessionCookie } from "@/lib/auth";
import { trialEndTimestamp, TRIAL_DAYS } from "@/lib/plan";

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Introduce un email válido" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
  }

  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as UserRow | undefined;
  if (existing) {
    return NextResponse.json({ error: "Ya existe una cuenta con este email" }, { status: 409 });
  }

  const hash = await bcrypt.hash(password, 12);
  const result = db
    .prepare("INSERT INTO users (email, password_hash, created_at, trial_ends_at) VALUES (?, ?, ?, ?)")
    .run(email, hash, Date.now(), trialEndTimestamp());

  await setSessionCookie(Number(result.lastInsertRowid));
  return NextResponse.json({ ok: true, user: { email }, trialDays: TRIAL_DAYS });
}
