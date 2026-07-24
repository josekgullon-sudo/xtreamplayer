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
  return _db;
}

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  created_at: number;
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
