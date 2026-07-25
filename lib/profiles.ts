import { cookies } from "next/headers";
import { createSessionToken, verifySessionToken } from "./auth";
import { getDb, CustomerRow, UserRow } from "./db";
import { getPlanInfo } from "./plan";

/**
 * Perfiles dentro de una misma cuenta (como los de una plataforma de vídeo):
 * cada uno con sus favoritos y su historial.
 *
 * Cuántos se permiten:
 * - Cliente de un proveedor → lo fija el proveedor en su ficha (max_profiles).
 * - Cuenta propia → 1 con el plan Gratis y 5 con Premium. Se eligió un tope
 *   por plan en vez de cobrar por perfil suelto: es más fácil de entender y
 *   encaja con los planes que ya existen.
 */

export const FREE_PROFILES = 1;
export const PREMIUM_PROFILES = 5;

const PROFILE_COOKIE = "xp_profile";

export interface ProfileRow {
  id: number;
  customer_id: number;
  user_id: number;
  name: string;
  avatar: string;
  pin: string;
  kids: number;
  created_at: number;
}

export type ProfileOwner =
  | { kind: "customer"; customer: CustomerRow }
  | { kind: "user"; user: UserRow };

export function maxProfilesFor(owner: ProfileOwner): number {
  if (owner.kind === "customer") return Math.max(1, owner.customer.max_profiles || 1);
  return getPlanInfo(owner.user).plan === "premium" ? PREMIUM_PROFILES : FREE_PROFILES;
}

export function listProfiles(owner: ProfileOwner): ProfileRow[] {
  const db = getDb();
  return owner.kind === "customer"
    ? (db
        .prepare("SELECT * FROM profiles WHERE customer_id = ? ORDER BY created_at ASC")
        .all(owner.customer.id) as ProfileRow[])
    : (db
        .prepare("SELECT * FROM profiles WHERE user_id = ? ORDER BY created_at ASC")
        .all(owner.user.id) as ProfileRow[]);
}

/** Todo el mundo tiene al menos un perfil: si no existe, se crea al vuelo. */
export function ensureDefaultProfile(owner: ProfileOwner): ProfileRow {
  const existing = listProfiles(owner);
  if (existing.length) return existing[0];

  const name = owner.kind === "customer" ? owner.customer.username : owner.user.email.split("@")[0];
  const db = getDb();
  const result = db
    .prepare("INSERT INTO profiles (customer_id, user_id, name, created_at) VALUES (?, ?, ?, ?)")
    .run(
      owner.kind === "customer" ? owner.customer.id : 0,
      owner.kind === "user" ? owner.user.id : 0,
      name.slice(0, 30),
      Date.now()
    );
  return db.prepare("SELECT * FROM profiles WHERE id = ?").get(result.lastInsertRowid) as ProfileRow;
}

export function ownsProfile(owner: ProfileOwner, profileId: number): ProfileRow | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM profiles WHERE id = ?").get(profileId) as ProfileRow | undefined;
  if (!row) return null;
  if (owner.kind === "customer" && row.customer_id !== owner.customer.id) return null;
  if (owner.kind === "user" && row.user_id !== owner.user.id) return null;
  return row;
}

export function isValidProfileName(name: string): boolean {
  return name.trim().length >= 1 && name.trim().length <= 30;
}

/* ---------------- Perfil activo (cookie) ---------------- */

export async function setActiveProfile(profileId: number) {
  const store = await cookies();
  store.set(PROFILE_COOKIE, createSessionToken(profileId, "profile"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 86_400,
    path: "/",
  });
}

export async function clearActiveProfile() {
  (await cookies()).delete(PROFILE_COOKIE);
}

export async function getActiveProfileId(): Promise<number | null> {
  const token = (await cookies()).get(PROFILE_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token, "profile");
}
