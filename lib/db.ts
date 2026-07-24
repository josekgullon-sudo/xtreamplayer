import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

/**
 * Base de datos SQLite (better-sqlite3). Los datos viven en ./data/xtreamplayer.db.
 * Para producción con varios nodos, migrar a Postgres es directo: el esquema es mínimo.
 */

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  _db = new Database(path.join(DATA_DIR, "xtreamplayer.db"));
  _db.pragma("journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('xtream', 'm3u')),
      url TEXT NOT NULL DEFAULT '',
      username TEXT NOT NULL DEFAULT '',
      password TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id);
  `);
  migrate(_db);
  return _db;
}

/** Migraciones aditivas: añade columnas nuevas a bases de datos ya existentes. */
function migrate(db: Database.Database) {
  const cols = new Set(
    (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name)
  );
  const add = (name: string, ddl: string) => {
    if (!cols.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${ddl}`);
  };
  add("trial_ends_at", "trial_ends_at INTEGER NOT NULL DEFAULT 0");
  add("premium_until", "premium_until INTEGER NOT NULL DEFAULT 0");
  add("stripe_customer_id", "stripe_customer_id TEXT NOT NULL DEFAULT ''");
  add("stripe_subscription_id", "stripe_subscription_id TEXT NOT NULL DEFAULT ''");
}

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  created_at: number;
  trial_ends_at: number;
  premium_until: number;
  stripe_customer_id: string;
  stripe_subscription_id: string;
}

export interface PlaylistRow {
  id: number;
  user_id: number;
  name: string;
  type: "xtream" | "m3u";
  url: string;
  username: string;
  password: string;
  created_at: number;
}
