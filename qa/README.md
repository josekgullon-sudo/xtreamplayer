# Pruebas de extremo a extremo

Suites de Playwright que abren la aplicación de verdad en un navegador y
comprueban lo que ve el cliente: que un canal suena, que la parrilla se pinta
a su hora, que un revendedor no ve lo que no debe.

Viven aquí, en el repositorio, y no en un directorio temporal: escribirlas
cuesta más que el código que prueban, y un contenedor que se reinicia se las
llevaba por delante.

## Preparar el entorno

```bash
# 1. Vídeos de prueba (una vez; necesita ffmpeg)
bash qa/preparar-medios.sh

# 2. Servidor IPTV simulado (8090) y receptor de avisos (8099)
node qa/mock-iptv.js &
node qa/mock-webhook.js &

# 3. La aplicación compilada, con datos de ejemplo
npm run build
DATA_DIR=/tmp/qa-datos node scripts/seed-demo.mjs
cd .next/standalone && cp -r ../static .next/ && cp -r ../../public .
DATA_DIR=/tmp/qa-datos PORT=3101 ALLOW_PRIVATE_NETWORKS=1 \
  ADMIN_WEBHOOK_URL=http://127.0.0.1:8099/aviso \
  BILLING_NAME="TOTALplayer SL" BILLING_TAX_ID="B00000000" \
  BILLING_ADDRESS="Calle Mayor 1, Madrid" BILLING_VAT_PERCENT=21 \
  SESSION_SECRET=cualquier-cadena-larga-para-pruebas node server.js &
```

`ALLOW_PRIVATE_NETWORKS=1` es **solo para esto**: desactiva la protección que
impide que el proxy hable con direcciones internas, y en producción no se pone
nunca.

## Lanzarlas

```bash
node qa/e2e.js          # el recorrido completo del reproductor
node qa/parrilla-epg.js # la guía de programación
node qa/movil.js        # todo lo anterior en un móvil
...
```

Cada suite imprime una línea por comprobación y sale con código 1 si alguna
falla, así que valen tal cual para un CI.

`QA_BASE` cambia la dirección contra la que se prueba (por defecto
`http://localhost:3101`).

## Las suites

| Fichero | Qué vigila |
| --- | --- |
| `e2e.js` | Añadir listas, zapear, cine y series, favoritos, EPG del canal |
| `parrilla-epg.js` | La guía: horas, programa en emisión, moverse en el tiempo |
| `catchup.js` | Volver a ver lo ya emitido en los canales que lo guardan |
| `movil.js` | El reproductor en un teléfono: barra inferior, nada que desborde |
| `portada.js` | La pantalla de «¿qué quieres ver?» y sus carátulas |
| `busqueda.js` | Listas con datos sucios: títulos sin nombre, carátulas rotas |
| `tv.js` | Detección de televisores y navegación con mando |
| `cliente-ux.js` | Lo que ve el cliente de un proveedor, de principio a fin |
| `b2b.js` | Proveedores, revendedores, cupos y permisos |
| `panel-ui.js`, `panel-importa.js` | El panel del proveedor y la importación desde XUI |
| `soporte-api-facturas.js` | Tickets, API pública y facturas |
| `avisos.js` | Que un ticket nuevo avise, sin hacer esperar a quien lo abre |
| `qa-diseno.js` | Accesibilidad, contraste y que la cabecera no se rompa |
| `web-publica.js` | Precios, proveedores y ayuda: lo que ve quien aún no es cliente |
| `busqueda-global.js` | Buscar una vez y encontrar canales, cine y series |
| `novedades.js` | Lo recién subido por el proveedor, con su ventana de tiempo |
| `admin-panel.js` | El panel de la plataforma y quién puede entrar en él |
| `admin-facturas.js` | Emitir y anular facturas, y abrir el panel de un proveedor |
| `facturas-fiscales.js` | Que la factura lleve emisor, receptor e IVA y le sirva a un gestor |
| `acceso.js` | Las tres puertas de entrada y la vuelta a donde ibas |
| `alta-simple.js` | Que el alta de un cliente pida un solo usuario y contraseña |
