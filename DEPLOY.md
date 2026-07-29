# Guía de despliegue y publicación en tiendas

Esta guía cubre dos cosas: poner TOTALplayer en internet con dominio propio y, a partir de ahí, llevarlo a las tiendas de TV, móvil y escritorio.

---

## Parte 1 — Poner la web en internet

**Tiempo total: unos 20 minutos.** Necesitas una cuenta de Railway (gratis para empezar) y un dominio.

### 1. Comprar el dominio

Cualquier registrador sirve (Namecheap, Porkbun, Cloudflare, Dinahosting). Ideas: `totalplayer.app`, `.tv`, `.es`. Coste orientativo: 10–20 €/año.

Puedes saltarte este paso al principio: Railway te da una URL propia (`algo.up.railway.app`) con la que ya puedes enseñárselo a tus proveedores.

### 2. Desplegar en Railway (recomendado)

El repositorio ya incluye `Dockerfile` y `railway.json`, así que Railway lo detecta solo.

1. Entra en [railway.app](https://railway.app) y regístrate **con tu cuenta de GitHub**.
2. **New Project → Deploy from GitHub repo →** elige el repositorio `xtreamplayer`.
   - En **Settings → Source**, selecciona la rama `claude/xtream-m3u-web-player-pnl9pn`, que es donde está todo el desarrollo (la rama `main` está anticuada). Si más adelante la fusionas en `main`, cambia aquí la rama.
3. **Añade un volumen persistente.** Es el paso más importante: sin él se borran proveedores, clientes y listas en cada despliegue.
   - **Settings → Volumes → + New Volume**
   - Mount path: `/data`
4. Configura las variables de entorno (pestaña **Variables**):

   | Variable | Valor |
   | --- | --- |
   | `DATA_DIR` | `/data` |
   | `SESSION_SECRET` | Una cadena aleatoria larga: `openssl rand -hex 32` |
   | `NEXT_PUBLIC_SITE_URL` | `https://tudominio.com` (o la URL que te dé Railway) |
   | `ADMIN_EMAILS` | Tu correo (varios separados por comas). Da acceso al panel de administración en `/admin` con tu cuenta de usuario normal |
   | `BILLING_NAME`, `BILLING_TAX_ID`, `BILLING_ADDRESS` | *(recomendadas)* Tus datos fiscales: salen como emisor en las facturas de tus proveedores. Sin ellos la factura va sin NIF y no le sirve a un gestor |
   | `BILLING_VAT_PERCENT` | *(opcional)* Tipo de IVA para el desglose, 21 por defecto. Con `0` no se desglosa nada |
   | `ADMIN_WEBHOOK_URL` | *(opcional)* Dirección a la que avisar cuando un proveedor abre un ticket o responde. Vale un bot de Telegram, un canal de Discord o Slack, o tu propia automatización: recibe un POST con JSON |
   | `RAILWAY_RUN_UID` | `0` — Railway monta los volúmenes como root y sin esto la aplicación no puede escribir la base de datos en `/data` (el registro falla con «No se pudo conectar») |
   | `HOSTNAME` | `0.0.0.0` — ya viene fijado en la imagen; añádelo solo si usas una imagen anterior |

   > `SESSION_SECRET` firma las sesiones **y cifra las contraseñas que el proveedor puede consultar**: si la cambias más adelante, las sesiones caducan y esas contraseñas guardadas dejan de poder mostrarse. Genérala una vez y guárdala en un sitio seguro.

5. Railway construye y despliega solo. Cuando termine, **Settings → Networking → Generate Domain** te da una URL pública para probar.
6. Cuando tengas dominio propio: **Custom Domain**, y copia el registro CNAME que te indique en el panel DNS de tu registrador. El certificado HTTPS se emite solo en unos minutos.

**Comprobación rápida tras el despliegue** — abre en el navegador:

- `/` — debe cargar la portada
- `/proveedores/registro` — crea tu cuenta de proveedor y verás el panel con la prueba de 7 días
- Crea un cliente de prueba y entra con sus datos en `/acceso` desde una ventana privada
- Regístrate como usuario en `/registro` con el correo de `ADMIN_EMAILS` y entra en `/admin`: el panel de la plataforma —resumen, proveedores, revendedores, clientes, dominios, registro de accesos, facturación y tickets—. Si la sesión caduca, se vuelve por `/login`

> En producción **no** definas `ALLOW_PRIVATE_NETWORKS`: es solo para instalaciones caseras y desactiva la protección del proxy frente a redes internas.

Alternativas equivalentes: Render, Fly.io o un VPS (Hetzner ~4 €/mes) con `docker build` + `docker run -v tp-data:/data -p 3000:3000`.

> **No uses Vercel** para esta app tal cual: es serverless, y SQLite y el proxy de streams necesitan un servidor persistente con disco.

### 2b. Copias de seguridad

Toda la información (proveedores, clientes, listas) vive en un único fichero: `/data/xtreamplayer.db`. Descárgalo periódicamente:

```bash
railway run cat /data/xtreamplayer.db > backup-$(date +%F).db
```

### 3. Activar los cobros (Stripe)

1. Crea la cuenta en [stripe.com](https://stripe.com) (requiere datos fiscales y cuenta bancaria).
2. **Productos →** crea un producto por cada plan de proveedor, todos con precio **recurrente mensual**:

   | Producto | Precio/mes | Plan en la base de datos |
   | --- | --- | --- |
   | TOTALplayer Starter | 20 € | `starter` |
   | TOTALplayer Basic | 45 € | `basic` |
   | TOTALplayer Premium | 90 € | `premium` |
   | TOTALplayer Enterprise | 180 € | `enterprise` |
   | TOTALplayer Large | 270 € | `large` |
   | TOTALplayer Mega | 450 € | `mega` |

3. Copia cada `price_…` a su fila de la tabla `provider_plans`. Con el contenedor en marcha:

   ```bash
   sqlite3 /data/xtreamplayer.db \
     "UPDATE provider_plans SET stripe_price_id='price_XXXX' WHERE id='starter';"
   ```

   Los precios y tramos también se editan ahí (`price_month` va en céntimos, `max_customers` en número de clientes), sin tocar código.

4. **Desarrolladores → Webhooks →** añade endpoint `https://tudominio.com/api/billing/webhook` con los eventos:
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`. Copia el `whsec_…`.
5. Añade las variables en Railway: `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` (`STRIPE_PRICE_ID` es solo para el Premium del usuario final).

Mientras no configures esto, la plataforma funciona igual: los proveedores usan su prueba de 7 días y, si quieres activarles un plan a mano mientras tanto, basta con:

```bash
# Plan Premium (600 clientes) durante 30 días para el proveedor con ese email
sqlite3 /data/xtreamplayer.db \
  "UPDATE providers SET plan_id='premium', plan_expires_at=$(( ($(date +%s) + 2592000) * 1000 )) WHERE email='proveedor@ejemplo.com';"
```

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


### Correo (Resend)

Sin esto no sale ningún correo, y **quien olvide su contraseña no puede
recuperarla**: el formulario se lo dice claramente en vez de fingir que la ha
mandado.

| Variable | Para qué |
| --- | --- |
| `RESEND_API_KEY` | La clave de tu cuenta de Resend |
| `MAIL_FROM` | Remitente, con un dominio verificado en Resend: `TOTALplayer <hola@tudominio.com>` |
| `MAIL_REPLY_TO` | Opcional: a dónde contesta quien le da a Responder |

Una misma cuenta de Resend sirve para varios dominios: basta con verificar el
nuevo y usarlo en `MAIL_FROM`.
