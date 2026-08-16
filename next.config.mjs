/** @type {import('next').NextConfig} */
const nextConfig = {
  // Salida autocontenida para la imagen Docker (server.js + deps mínimas)
  output: "standalone",
  env: {
    // El commit queda grabado en el bundle del navegador: el veredicto del
    // diagnóstico lo enseña junto al del servidor, y cualquier captura
    // delata al momento un móvil con código viejo en caché
    NEXT_PUBLIC_BUILD: (process.env.RAILWAY_GIT_COMMIT_SHA || "dev").slice(0, 7),
  },
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
      {
        /*
         * Las dos pantallas que viven dentro de un envoltorio, sin caché.
         *
         * El .exe, el APK de Samsung y el de LG no son navegadores: no tienen
         * barra de direcciones ni botón de recargar, así que si su WebView se
         * guarda la página, el cliente se queda con la versión del día que la
         * abrió y no hay manera humana de sacarlo de ahí —«no veo los
         * cambios» aunque el servidor lleve días con lo nuevo—.
         *
         * Solo el documento: los ficheros de JavaScript y de estilo llevan el
         * resumen en el nombre y cambian solos con cada versión, así que esos
         * sí se cachean y es lo que hace que arranque rápido.
         */
        source: "/:ruta(tv|player)",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
