#!/usr/bin/env bash
#
# Todas las pruebas, de una vez.
#
# Antes había que levantar a mano ocho servidores simulados, sembrar los datos,
# arrancar dos copias de la aplicación y lanzar treinta y cinco suites una por
# una leyendo el README. En la práctica eso significa que nadie las lanzaba
# todas: se probaba lo que uno acababa de tocar y el resto se enteraba días
# después. Esto lo hace entero y dice al final qué ha fallado.
#
#   bash qa/todo.sh              # todo
#   bash qa/todo.sh movil e2e    # solo esas
#   SIN_MONTAR=1 bash qa/todo.sh # con los servidores ya levantados
#
# Sale con código 1 si falla alguna, así que vale tal cual para un CI.

set -uo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(dirname "$AQUI")"
cd "$RAIZ"

DATOS="${DATA_DIR:-/tmp/qa-datos}"
DATOS2="${DATOS}2"
PUERTO="${PUERTO:-3101}"
PUERTO2="${PUERTO2:-3102}"

# `ALLOW_PRIVATE_NETWORKS=1` es SOLO para esto: desactiva la protección que
# impide que el proxy hable con direcciones internas. En producción, nunca.
COMUNES=(
  "ALLOW_PRIVATE_NETWORKS=1"
  "ADMIN_WEBHOOK_URL=http://127.0.0.1:8099/aviso"
  "BILLING_NAME=TOTALplayer SL"
  "BILLING_TAX_ID=B00000000"
  "BILLING_ADDRESS=Calle Mayor 1, Madrid"
  "BILLING_VAT_PERCENT=21"
  "RESEND_API_KEY=clave-de-pruebas"
  "RESEND_API_URL=http://127.0.0.1:8097"
  "MAIL_FROM=TOTALplayer <hola@pruebas.test>"
  "SESSION_SECRET=cualquier-cadena-larga-solo-para-pruebas"
  # TMDB simulado: sin estas tres, la portada se queda con lo que manda el
  # panel —que es como se comporta una instalación sin clave— y la mitad de
  # lo que hay que probar no llegaría a ejecutarse nunca
  "TMDB_API_KEY=clave-de-pruebas"
  "TMDB_API_URL=http://127.0.0.1:8095"
  "TMDB_IMG_URL=http://127.0.0.1:8095/t/p"
)

MOCKS=(iptv webhook resend colgado lento cors cuelga tardon tmdb)

# `dominio.js` necesita su propio servidor, con el dominio único encendido:
# comprueba justamente el redirigir, y con eso puesto fallarían las demás
APARTE=(dominio)

TODAS=(
  episodios
  e2e movil portada busqueda busqueda-global novedades listas-enormes atras
  parrilla-epg catchup tv tv-app descargas perfiles-tv envoltorios
  cliente-ux acceso sesiones-mezcladas recuperar alta-simple entrega-acceso
  b2b panel-ui panel-importa apps-proveedor
  soporte-api-facturas facturas-fiscales factura-pdf admin-facturas admin-panel
  avisos copias planes-cobro cuenta-de-la-casa
  web-publica qa-diseno panel-movil
  dominio
)

PEDIDAS=("$@")
[ ${#PEDIDAS[@]} -eq 0 ] && PEDIDAS=("${TODAS[@]}")

# ---------- Montar el escenario ----------
if [ "${SIN_MONTAR:-0}" != "1" ]; then
  # Los vídeos de prueba no se guardan en el repositorio —son binarios que
  # cambian de bytes con cada versión de ffmpeg— así que en una máquina
  # recién clonada no están, y el servidor simulado no arranca sin ellos
  if [ ! -f "$AQUI/test.webm" ]; then
    command -v ffmpeg > /dev/null || { echo "❌ Falta ffmpeg: hace falta para generar los vídeos de prueba"; exit 1; }
    echo "· Generando los vídeos de prueba"
    bash "$AQUI/preparar-medios.sh" > /tmp/qa-medios.log 2>&1 \
      || { echo "❌ No se han podido generar:"; tail -15 /tmp/qa-medios.log; exit 1; }
  fi

  echo "· Levantando los servidores simulados"
  pkill -9 -f "qa/mock-" 2>/dev/null
  pkill -9 -f "next-serve[r]" 2>/dev/null
  sleep 1
  for m in "${MOCKS[@]}"; do
    (setsid node "$AQUI/mock-$m.js" > "/tmp/qa-mock-$m.log" 2>&1 &)
  done

  echo "· Compilando"
  rm -rf .next/standalone/.next/static
  npm run build > /tmp/qa-build.log 2>&1 || { echo "❌ La compilación falla:"; tail -25 /tmp/qa-build.log; exit 1; }
  # El `public` hay que volver a copiarlo en cada compilación: si no, los
  # iconos de la aplicación instalable dan 404 y parece que se han perdido
  (cd .next/standalone && cp -r ../static .next/ && cp -r ../../public .)

  echo "· Sembrando los datos de ejemplo"
  rm -rf "$DATOS" "$DATOS2"
  DATA_DIR="$DATOS" node scripts/seed-demo.mjs > /tmp/qa-seed.log 2>&1 \
    || { echo "❌ La siembra falla:"; tail -20 /tmp/qa-seed.log; exit 1; }
  DATA_DIR="$DATOS2" node scripts/seed-demo.mjs > /tmp/qa-seed2.log 2>&1

  echo "· Arrancando la aplicación"
  (cd .next/standalone && setsid env "${COMUNES[@]}" DATA_DIR="$DATOS" PORT="$PUERTO" \
    node server.js > /tmp/qa-app.log 2>&1 &)
  (cd .next/standalone && setsid env "${COMUNES[@]}" DATA_DIR="$DATOS2" PORT="$PUERTO2" \
    REDIRECT_TO_CANONICAL=1 NEXT_PUBLIC_SITE_URL=https://totalplayer.app \
    node server.js > /tmp/qa-app2.log 2>&1 &)

  for intento in $(seq 1 40); do
    if curl -s -o /dev/null --noproxy '*' "http://localhost:$PUERTO/" 2>/dev/null; then break; fi
    sleep 1
  done
  echo
fi

# ---------- Lanzarlas ----------
FALLAN=()
BIEN=0
INICIO=$(date +%s)

for suite in "${PEDIDAS[@]}"; do
  [ -f "$AQUI/$suite.js" ] || { echo "⚠  No existe qa/$suite.js"; continue; }

  base="http://localhost:$PUERTO"
  for a in "${APARTE[@]}"; do [ "$suite" = "$a" ] && base="http://localhost:$PUERTO2"; done

  printf "%-22s " "$suite"
  # `--experimental-strip-types` para las suites que importan un módulo de
  # TypeScript directamente. A las demás no les cambia nada.
  salida=$(QA_BASE="$base" node --experimental-strip-types --no-warnings "$AQUI/$suite.js" 2>&1)
  if [ $? -eq 0 ]; then
    BIEN=$((BIEN + 1))
    echo "$(echo "$salida" | tail -1)"
  else
    FALLAN+=("$suite")
    echo "❌ FALLA"
    # Solo las líneas que fallan: el resto es ruido cuando buscas qué se rompió.
    # Y con ellas, las dos del registro de Playwright que dicen QUÉ estaba
    # esperando y en qué línea: sin eso, un «Timeout 30000ms exceeded» obliga
    # a adivinar entre los cuarenta clics de una suite, que es exactamente lo
    # que pasó con `movil` fallando solo en el CI.
    echo "$salida" | grep -E "^❌|^FATAL|^PAGEERROR|waiting for|\.js:[0-9]+" | sed 's/^ *//; s/^/      /' | head -16
  fi
done

# ---------- El resumen ----------
echo
echo "─────────────────────────────────────────────"
printf "%d de %d suites en verde, en %d s\n" "$BIEN" "$((BIEN + ${#FALLAN[@]}))" "$(( $(date +%s) - INICIO ))"
if [ ${#FALLAN[@]} -gt 0 ]; then
  echo "Fallan: ${FALLAN[*]}"
  echo "Para repetir solo esas:  bash qa/todo.sh ${FALLAN[*]}"
  exit 1
fi
echo "Todo en verde."
