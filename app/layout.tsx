import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { SITE_NAME, SITE_URL, SITE_DESCRIPTION, ADSENSE_CLIENT } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Reproductor IPTV online para Xtream Codes y M3U`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "reproductor iptv online",
    "iptv web player",
    "xtream codes player",
    "reproductor m3u online",
    "ver iptv en el navegador",
    "iptv player gratis",
    "m3u8 player online",
    "lista m3u reproductor",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Reproductor IPTV online para Xtream Codes y M3U`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: "es_ES",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Reproductor IPTV online`,
    description: SITE_DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0a0c12",
  width: "device-width",
  initialScale: 1,
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Web",
  description: SITE_DESCRIPTION,
  offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
  featureList: [
    "Reproducción de listas M3U y M3U8",
    "Compatible con Xtream Codes API",
    "TV en directo, películas y series",
    "EPG (guía de programación)",
    "Favoritos y búsqueda instantánea",
    "Sin instalación, funciona en el navegador",
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
        {ADSENSE_CLIENT ? (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        ) : null}
        {children}
      </body>
    </html>
  );
}
