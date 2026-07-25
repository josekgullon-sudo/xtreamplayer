"use client";

/**
 * Identificador estable del dispositivo.
 * En TV lo ideal es la MAC (Tizen/webOS la exponen); en web usamos un UUID
 * persistente en localStorage, que es el equivalente práctico.
 */

const KEY = "xp.deviceId.v1";

export function getDeviceKey(): string {
  if (typeof window === "undefined") return "";

  // Samsung Tizen y LG webOS exponen identificadores del aparato
  try {
    const w = window as unknown as {
      tizen?: { systeminfo?: { getPropertyValue?: unknown } };
      webOS?: { deviceInfo?: (cb: (info: { modelName?: string }) => void) => void };
    };
    if (w.tizen?.systeminfo) {
      const stored = localStorage.getItem(KEY);
      if (stored) return stored;
    }
  } catch {
    /* sin permisos: seguimos con UUID */
  }

  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `web-${Math.random().toString(36).slice(2)}${Date.now()}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function getPlatform(): string {
  if (typeof navigator === "undefined") return "web";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("tizen")) return "samsung";
  if (ua.includes("web0s") || ua.includes("webos")) return "lg";
  if (ua.includes("aft")) return "firetv";
  if (ua.includes("android")) return "android";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  return "web";
}
