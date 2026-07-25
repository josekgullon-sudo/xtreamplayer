# XtreamPlayer

Reproductor IPTV web para **Xtream Codes** y **listas M3U/M3U8**. Sin instalaciones: el usuario pega su URL o credenciales y reproduce TV en directo, películas y series en el navegador.

## Características

- **Xtream Codes completo**: TV en directo, VOD (cine) y series con temporadas/episodios, categorías, carátulas y EPG (ahora/después).
- **Listas M3U/M3U8** con parser tolerante (grupos, logos, tvg-id) — también detecta URLs `get.php` y las convierte en conexión Xtream automáticamente.
- **Motor de compatibilidad anti-CORS**: intenta reproducción directa (HLS/MPEG-TS/MP4) y, si el proveedor bloquea el navegador, reintenta automáticamente a través del proxy propio (`/api/proxy`) con reescritura de manifiestos HLS.
- **Modo invitado**: listas, favoritos e historial en `localStorage` — nada se guarda en el servidor.
- **Cuentas gratuitas**: registro/login con cookie de sesión firmada (HMAC) y contraseñas bcrypt; hasta 5 listas sincronizadas en la nube (SQLite).
- **UX**: búsqueda instantánea (`/`), zapping con flechas, `F` pantalla completa, `M` silencio, favoritos, historial "visto recientemente", diseño oscuro responsive.
- **Modo TV (10-foot UI)**: se activa solo en Samsung Tizen, LG webOS, Android TV, Fire TV y navegadores de televisor. Interfaz grande, foco visible y navegación completa con mando (flechas, OK, Atrás, Play/Pausa). También se puede forzar desde el botón «📺 Modo TV».
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
| `ALLOW_PRIVATE_NETWORKS` | `1` para permitir servidores IPTV en redes privadas (solo self-hosted). |
| `STRIPE_SECRET_KEY` | Clave secreta de Stripe (`sk_live_…` / `sk_test_…`). Sin ella, los pagos quedan desactivados pero la prueba gratuita funciona. |
| `STRIPE_PRICE_ID` | ID del precio recurrente de Premium (`price_…`, 2,99 €/mes). |
| `STRIPE_WEBHOOK_SECRET` | Secreto del webhook (`whsec_…`) apuntando a `/api/billing/webhook`. |

## Modelo de negocio (híbrido)

- **Registro** → 15 días de Premium de prueba, sin tarjeta (`trial_ends_at`).
- **Al expirar** → plan Gratis para siempre: 1 lista en la nube, con anuncios (cuando se active AdSense). Nunca se bloquea el servicio.
- **Premium (2,99 €/mes, Stripe)** → hasta 20 listas en la nube, sin anuncios y acceso prioritario a funciones nuevas.
- Configuración en Stripe: crear producto "XtreamPlayer Premium" con precio recurrente mensual, copiar `price_…` a `STRIPE_PRICE_ID`, y crear un webhook hacia `https://TU-DOMINIO/api/billing/webhook` con los eventos `checkout.session.completed`, `customer.subscription.*` e `invoice.paid`/`invoice.payment_failed`.

## Despliegue

Necesita un runtime **Node persistente** (VPS, Railway, Fly.io, Render…) por SQLite y el proxy de streams. En Vercel/serverless: migrar `lib/db.ts` a Postgres (esquema mínimo: `users`, `playlists`) y valorar desactivar el proxy de streams.

```bash
npm run build && npm start   # detrás de un reverse proxy con HTTPS
```

Con Docker (incluye `Dockerfile` y `railway.json` listos):

```bash
docker build -t xtreamplayer .
docker run -p 3000:3000 -v xp-data:/data xtreamplayer
```

📘 **[DEPLOY.md](DEPLOY.md)** — guía paso a paso: dominio, Railway, Stripe, Search Console, AdSense y publicación en las tiendas de Samsung, LG, Google Play, Amazon Fire TV, App Store, Windows y macOS.

## Notas legales

XtreamPlayer es solo un reproductor (como VLC): no aloja, distribuye ni recomienda contenido ni proveedores. Los términos de uso y la política de privacidad están en `/legal/terminos` y `/legal/privacidad`.

## Hoja de ruta

- Premium (Stripe): sin anuncios, listas ilimitadas, EPG XMLTV de 7 días, multipantalla (hasta 4), perfiles y control parental.
- Internacionalización (EN) con hreflang.
- PWA instalable + modo offline de interfaz.
- Recordar posición de reproducción en VOD/series.
