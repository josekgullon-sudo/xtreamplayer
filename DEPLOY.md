# Guía de despliegue y publicación en tiendas

Esta guía cubre dos cosas: poner TOTALplayer en internet con dominio propio y, a partir de ahí, llevarlo a las tiendas de TV, móvil y escritorio.

---

## Parte 1 — Poner la web en internet

### 1. Comprar el dominio

Cualquier registrador sirve (Namecheap, Porkbun, Cloudflare, Dinahosting). Ideas: `totalplayer.app`, `.tv`, `.es`. Coste orientativo: 10–20 €/año.

### 2. Desplegar en Railway (recomendado)

El repositorio ya incluye `Dockerfile` y `railway.json`, así que Railway lo detecta solo.

1. Entra en [railway.app](https://railway.app) y regístrate con GitHub.
2. **New Project → Deploy from GitHub repo →** elige `xtreamplayer`.
3. **Añade un volumen persistente** (importante: sin él se pierden usuarios y listas en cada despliegue):
   - Pestaña **Variables → + Volume**
   - Mount path: `/data`
4. Configura las variables de entorno (pestaña **Variables**):

   | Variable | Valor |
   | --- | --- |
   | `NEXT_PUBLIC_SITE_URL` | `https://tudominio.com` |
   | `SESSION_SECRET` | Cadena aleatoria larga — genérala con `openssl rand -hex 32` |
   | `DATA_DIR` | `/data` |

5. **Settings → Networking → Custom Domain**: añade tu dominio y copia el registro CNAME que te da Railway en el panel DNS de tu registrador. El HTTPS se configura solo.

Alternativas equivalentes: Render, Fly.io o un VPS (Hetzner ~4 €/mes) con `docker build` + `docker run -v xp-data:/data -p 3000:3000`.

> **No uses Vercel** para esta app tal cual: es serverless, y SQLite y el proxy de streams necesitan un servidor persistente.

### 3. Activar los cobros (Stripe)

1. Crea la cuenta en [stripe.com](https://stripe.com) (requiere datos fiscales y cuenta bancaria).
2. **Productos →** crea "TOTALplayer Premium" con precio **recurrente mensual de 2,99 €**. Copia el `price_…`.
3. **Desarrolladores → Webhooks →** añade endpoint `https://tudominio.com/api/billing/webhook` con los eventos:
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`. Copia el `whsec_…`.
4. Añade las variables en Railway: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`.

Mientras no configures esto, la app funciona igual: la prueba de 15 días opera con normalidad y el botón de pago indica que estará disponible pronto.

### 4. SEO: dar de alta el sitio en Google

1. [Google Search Console](https://search.google.com/search-console) → añade la propiedad de dominio y verifica con el registro TXT del DNS.
2. Envía el sitemap: `https://tudominio.com/sitemap.xml`.
3. Analítica: [Plausible](https://plausible.io) (de pago, sin cookies, sin banner) o Google Analytics 4 (gratis, exige banner de consentimiento).

### 5. AdSense

Solicítalo cuando el sitio lleve unas semanas online con tráfico real. Una vez aprobado, basta con añadir `NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-XXXXXXXX`: los huecos ya están integrados. Recuerda que en la UE necesitas banner de consentimiento antes de servir anuncios personalizados.

---

## Parte 2 — Tiendas de TV, móvil y escritorio

La base ya está lista: el **modo TV** (interfaz grande + navegación por mando) se activa automáticamente al detectar Samsung Tizen, LG webOS, Android TV, Fire TV y navegadores de televisores. Es el mismo código para todas las plataformas; solo cambia el empaquetado.

### Samsung (Tizen) y LG (webOS)

Ambas tiendas ejecutan aplicaciones web, así que se empaqueta la app tal cual apuntando a tu dominio.

- **Samsung**: instala [Tizen Studio](https://developer.tizen.org), crea un proyecto "TV Web Application", registra la cuenta en [Samsung Seller Office](https://seller.samsungapps.com) (gratis) y sube el `.wgt`.
- **LG**: instala el [webOS TV SDK](https://webostv.developer.lge.com), genera el `.ipk` con `ares-package` y publica desde [LG Seller Lounge](https://seller.lgappstv.com) (gratis).

Requisitos comunes: icono y capturas en varias resoluciones, política de privacidad pública (ya existe en `/legal/privacidad`) y descripción que deje claro que es un reproductor sin contenido incluido.

### Android, Android TV y Amazon Fire TV

Se empaqueta con [Capacitor](https://capacitorjs.com) reutilizando el mismo código:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init TOTALplayer com.totalplayer.app
npx cap add android
npx cap open android   # compila el APK/AAB en Android Studio
```

- **Google Play**: cuenta de desarrollador 25 $ (pago único). Sube el AAB. Para Android TV hay que declarar el `LEANBACK_LAUNCHER` en el manifiesto y aportar el banner de TV.
- **Amazon Appstore (Fire TV Stick)**: cuenta gratuita en [developer.amazon.com](https://developer.amazon.com). Acepta prácticamente el mismo APK que Google Play.

### Apple (iOS/iPadOS y Apple TV)

```bash
npm install @capacitor/ios
npx cap add ios
npx cap open ios   # requiere un Mac con Xcode
```

Cuenta de desarrollador: 99 $/año. Es la revisión más estricta con aplicaciones IPTV, así que conviene llegar con la app ya publicada en otras tiendas.

### Windows y macOS (escritorio)

Con [Tauri](https://tauri.app) se genera un `.exe` y un `.dmg` desde el mismo código. Ventaja añadida: la app de escritorio no sufre las restricciones CORS del navegador, así que la reproducción es aún más compatible que en la web.

### Reglas que cumplir en todas las tiendas

Las plataformas rechazan aplicaciones que parezcan facilitar contenido pirata. La app está diseñada para superar ese filtro, pero mantén siempre estas normas en las fichas de tienda:

1. Descríbela como **reproductor multimedia genérico** — la comparación con VLC es la correcta.
2. **Nunca** menciones canales, servicios o proveedores concretos, ni incluyas listas de ejemplo con contenido protegido.
3. Las capturas deben mostrar contenido neutro o material propio.
4. Enlaza siempre la política de privacidad y los términos de uso.
5. Las suscripciones dentro de las apps de Apple y Google deben usar sus pagos in-app (15–30 % de comisión). Lo habitual es que las apps sean gratuitas y el Premium se contrate en la web con Stripe.
