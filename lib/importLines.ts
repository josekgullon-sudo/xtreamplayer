/**
 * Importación masiva de clientes.
 *
 * Los paneles Xtream no ofrecen un modo estándar de listar sus usuarios
 * (cada panel lo resuelve a su manera y no está documentado), así que la vía
 * que funciona con todos es que el proveedor pegue o suba sus credenciales.
 * Aceptamos los formatos habituales de exportación.
 */

export interface ParsedLine {
  line: number;
  raw: string;
  username?: string;
  password?: string;
  /** Base del servidor si la línea traía una URL get.php propia */
  base?: string;
  label?: string;
  error?: string;
}

const SEPARATORS = /[:;,|\t]| {2,}/;

export function parseImportLines(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);

  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;

    const entry: ParsedLine = { line: index + 1, raw: line };

    // 1) URL get.php completa
    if (/^https?:\/\//i.test(line)) {
      try {
        const url = new URL(line);
        const u = url.searchParams.get("username");
        const p = url.searchParams.get("password");
        if (u && p) {
          entry.username = u;
          entry.password = p;
          entry.base = `${url.protocol}//${url.host}`;
        } else {
          entry.error = "La URL no lleva usuario y contraseña";
        }
      } catch {
        entry.error = "URL no válida";
      }
      out.push(entry);
      return;
    }

    // 2) usuario:contraseña (admite ; , | tabulador o dos espacios), con nombre opcional
    const parts = line.split(SEPARATORS).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      entry.username = parts[0];
      entry.password = parts[1];
      if (parts.length >= 3) entry.label = parts.slice(2).join(" ").slice(0, 120);
    } else {
      entry.error = "Se esperaba usuario y contraseña";
    }
    out.push(entry);
  });

  return out;
}

/** Sugiere un usuario de acceso libre a partir del usuario IPTV. */
export function suggestAccessName(base: string, taken: Set<string>): string {
  const clean =
    base
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "")
      .slice(0, 28) || "cliente";
  if (!taken.has(clean)) return clean;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${clean}${i}`.slice(0, 32);
    if (!taken.has(candidate)) return candidate;
  }
  return `${clean}${Date.now().toString(36).slice(-4)}`.slice(0, 32);
}
