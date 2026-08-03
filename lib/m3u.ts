/**
 * Parser de listas M3U / M3U8 con atributos EXTINF (tvg-id, tvg-logo, group-title...).
 * Tolerante a listas mal formadas: líneas sueltas, atributos sin comillas, BOM, CRLF.
 */

export interface M3UChannel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group?: string;
  tvgId?: string;
}

export interface M3UPlaylist {
  channels: M3UChannel[];
  groups: string[];
}

const ATTR_RE = /([a-zA-Z0-9-]+)=("([^"]*)"|([^\s]+))/g;

export function parseM3U(text: string): M3UPlaylist {
  const channels: M3UChannel[] = [];
  const groupSet = new Set<string>();

  // Normaliza BOM y saltos de línea
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);

  let pending: Partial<M3UChannel> | null = null;
  let counter = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF")) {
      pending = {};
      const comma = line.lastIndexOf(",");
      const attrPart = comma >= 0 ? line.slice(0, comma) : line;
      const namePart = comma >= 0 ? line.slice(comma + 1).trim() : "";

      let match: RegExpExecArray | null;
      ATTR_RE.lastIndex = 0;
      while ((match = ATTR_RE.exec(attrPart)) !== null) {
        const key = match[1].toLowerCase();
        const value = (match[3] ?? match[4] ?? "").trim();
        if (!value) continue;
        if (key === "tvg-logo") pending.logo = value;
        else if (key === "group-title") pending.group = value;
        else if (key === "tvg-id") pending.tvgId = value;
        else if (key === "tvg-name" && !namePart) pending.name = value;
      }
      if (namePart) pending.name = namePart;
    } else if (line.startsWith("#EXTGRP:")) {
      if (pending) pending.group = line.slice(8).trim();
    } else if (!line.startsWith("#")) {
      // Es una URL. Si no hubo EXTINF previo, crea un canal sin metadatos.
      const ch: M3UChannel = {
        id: `m3u-${counter++}`,
        name: pending?.name || guessNameFromUrl(line),
        url: line,
        logo: pending?.logo,
        group: pending?.group || "Sin categoría",
        tvgId: pending?.tvgId,
      };
      channels.push(ch);
      if (ch.group) groupSet.add(ch.group);
      pending = null;
    }
  }

  return { channels, groups: Array.from(groupSet).sort((a, b) => a.localeCompare(b)) };
}

function guessNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() || u.hostname;
    /* Un canal sin nombre acaba enseñando el final de su dirección, y con
       la extensión puesta sale «canal1.webm» en la lista, como si el nombre
       del canal fuera un fichero. Van todas las que se ven de verdad. */
    return decodeURIComponent(last.replace(/\.(m3u8?|ts|mp4|mkv|avi|webm|flv|mov|m4v|mpd)$/i, ""));
  } catch {
    return url.slice(0, 60);
  }
}
