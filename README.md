# XtreamPlayer

Reproductor IPTV web para **Xtream Codes** y **listas M3U/M3U8**. Sin instalaciones: el usuario pega su URL o credenciales y reproduce TV en directo, películas y series en el navegador.

## Características

- **Xtream Codes completo**: TV en directo, VOD (cine) y series con temporadas/episodios, categorías, carátulas y EPG (ahora/después).
- **Listas M3U/M3U8** con parser tolerante (grupos, logos, tvg-id) — también detecta URLs `get.php` y las convierte en conexión Xtream automáticamente.
- **Motor de compatibilidad anti-CORS**: intenta reproducción directa (HLS/MPEG-TS/MP4) y, si el proveedor bloquea el navegador, reintenta automáticamente a través del proxy propio (`/api/proxy`) con reescritura de manifiestos HLS.
- **Modo invitado**: listas, favoritos e historial en `localStorage` — nada se guarda en el servidor.
- **Cuentas gratuitas**: registro/login con cookie de sesión firmada (HMAC) y contraseñas bcrypt; hasta 5 listas sincronizadas en la nube (SQLite).
- **UX**: búsqueda instantánea (`/`), zapping con flechas, `F` pantalla completa, `M` silencio, favoritos, historial "visto recientemente", diseño oscuro responsive.
- **SEO**: metadata completa, Open Graph, JSON-LD (WebApplication + FAQPage), sitemap.xml, robots.txt, landing con contenido indexable en español.
- **Monetización**: componente `AdSlot` para AdSense (se activa con `NEXT_PUBLIC_ADSENSE_CLIENT`) y página de planes con Premium "próximamente".

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · hls.js · mpegts.js · better-sqlite3 · bcryptjs. CSS propio (sin frameworks).

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # build de producción
npm start        # servidor de producción
```

## Variables de entorno

| Variable | Descripción |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | URL pública (para SEO/sitemap). Ej: `https://xtreamplayer.app` |
| `NEXT_PUBLIC_ADSENSE_CLIENT` | ID de cliente AdSense (`ca-pub-…`). Sin él no se cargan anuncios. |
| `SESSION_SECRET` | Secreto para firmar sesiones. Si falta, se genera y persiste en `data/.session-secret`. |
| `DATA_DIR` | Carpeta de datos SQLite (por defecto `./data`). |
| `DISABLE_STREAM_PROXY` | `1` para desactivar el proxy de streams (ahorro de ancho de banda). |

## Despliegue

Necesita un runtime **Node persistente** (VPS, Railway, Fly.io, Render…) por SQLite y el proxy de streams. En Vercel/serverless: migrar `lib/db.ts` a Postgres (esquema mínimo: `users`, `playlists`) y valorar desactivar el proxy de streams.

```bash
npm run build && npm start   # detrás de un reverse proxy con HTTPS
```

## Notas legales

XtreamPlayer es solo un reproductor (como VLC): no aloja, distribuye ni recomienda contenido ni proveedores. Los términos de uso y la política de privacidad están en `/legal/terminos` y `/legal/privacidad`.

## Hoja de ruta

- Premium (Stripe): sin anuncios, listas ilimitadas, EPG XMLTV de 7 días, multipantalla (hasta 4), perfiles y control parental.
- Internacionalización (EN) con hreflang.
- PWA instalable + modo offline de interfaz.
- Recordar posición de reproducción en VOD/series.
