import crypto from "crypto";
import fs from "fs";
import path from "path";
import { cookies } from "next/headers";
import { getDb, UserRow } from "./db";

/**
 * Sesiones sin estado: cookie firmada HMAC `userId.expiry.firma`.
 * El secreto viene de SESSION_SECRET o se genera y persiste en ./data/.session-secret.
 */

const COOKIE_NAME = "xp_session";
const SESSION_DAYS = 30;

let _secret: string | null = null;

function getSecret(): string {
  if (_secret) return _secret;
  if (process.env.SESSION_SECRET) {
    _secret = process.env.SESSION_SECRET;
    return _secret;
  }
  const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  const file = path.join(dir, ".session-secret");
  try {
    _secret = fs.readFileSync(file, "utf8").trim();
    if (_secret) return _secret;
  } catch {
    /* no existe todavía */
  }
  fs.mkdirSync(dir, { recursive: true });
  _secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(file, _secret, { mode: 0o600 });
  return _secret;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

/**
 * Ámbito de la sesión. Va dentro de la firma para que un token de cliente
 * final nunca pueda usarse como token de proveedor ni de usuario.
 */
export type SessionScope = "user" | "provider" | "customer";

export function createSessionToken(id: number, scope: SessionScope = "user"): string {
  const expiry = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${scope}.${id}.${expiry}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string, scope: SessionScope = "user"): number | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [tokenScope, id, expiry, signature] = parts;
  if (tokenScope !== scope) return null;
  const payload = `${tokenScope}.${id}.${expiry}`;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(expiry) < Date.now()) return null;
  return Number(id);
}

export async function setSessionCookie(userId: number): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getCurrentUser(): Promise<UserRow | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const userId = verifySessionToken(token);
  if (userId === null) return null;
  const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow | undefined;
  return row ?? null;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}
