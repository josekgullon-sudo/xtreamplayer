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
    ];
  },
};

export default nextConfig;
