"use client";

import { useEffect, useRef } from "react";

const CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * Hueco publicitario de AdSense. Solo renderiza el anuncio real cuando
 * NEXT_PUBLIC_ADSENSE_CLIENT está configurado; en desarrollo muestra un placeholder.
 */
export default function AdSlot({ slot, className }: { slot?: string; className?: string }) {
  const pushed = useRef(false);

  useEffect(() => {
    if (!CLIENT || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* bloqueadores de anuncios */
    }
  }, []);

  if (!CLIENT) {
    if (process.env.NODE_ENV === "production") return null;
    return (
      <div className={`ad-slot ${className || ""}`}>
        <div className="ad-slot-placeholder">Espacio publicitario (configura NEXT_PUBLIC_ADSENSE_CLIENT)</div>
      </div>
    );
  }

  return (
    <div className={`ad-slot ${className || ""}`}>
      <ins
        className="adsbygoogle"
        style={{ display: "block", width: "100%", maxWidth: 728 }}
        data-ad-client={CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
