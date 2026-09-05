#!/usr/bin/env bash
# Levanta el escenario de pruebas y lo deja en pie, sin lanzar ninguna suite.
#
# `qa/todo.sh` monta todo esto y luego corre las 39 suites; para mirar una
# pantalla a ojo —o medirla con un guion suelto— eso son cinco minutos de
# espera para algo que ya está compilado. Esto monta y se va, y después se
# usa `SIN_MONTAR=1 bash qa/todo.sh <suite>` o el guion que sea contra
# http://localhost:3101.
#
#   bash qa/en-pie.sh          # compila, siembra y arranca
#   bash qa/en-pie.sh --rapido # sin compilar: reutiliza el .next de antes
#
# Para tirarlo:  pkill -f 'qa/mock-' ; pkill -f next-server
set -euo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$AQUI/.."

DATOS="${DATA_DIR:-/tmp/qa-datos}"
DATOS2="${DATOS}2"
PUERTO="${PUERTO:-3101}"
PUERTO2="${PUERTO2:-3102}"
RAPIDO=0
[ "${1:-}" = "--rapido" ] && RAPIDO=1

# Las mismas que en qa/todo.sh: si se tocan allí, aquí también
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
  "TMDB_API_KEY=clave-de-pruebas"
  "TMDB_API_URL=http://127.0.0.1:8095"
  "TMDB_IMG_URL=http://127.0.0.1:8095/t/p"
)
MOCKS=(iptv webhook resend colgado lento cors cuelga tardon tmdb)

echo "· Levantando los servidores simulados"
pkill -9 -f "qa/mock-" 2> /dev/null || true
pkill -9 -f "next-serve[r]" 2> /dev/null || true
sleep 1
for m in "${MOCKS[@]}"; do
  (setsid node "$AQUI/mock-$m.js" > "/tmp/qa-mock-$m.log" 2>&1 &)
done

if [ "$RAPIDO" = "0" ]; then
  echo "· Compilando"
  rm -rf .next/standalone/.next/static
  npm run build > /tmp/qa-build.log 2>&1 || { echo "❌ La compilación falla:"; tail -25 /tmp/qa-build.log; exit 1; }
  (cd .next/standalone && cp -r ../static .next/ && cp -r ../../public .)

  echo "· Sembrando los datos de ejemplo"
  rm -rf "$DATOS" "$DATOS2"
  DATA_DIR="$DATOS" node scripts/seed-demo.mjs > /tmp/qa-seed.log 2>&1 \
    || { echo "❌ La siembra falla:"; tail -20 /tmp/qa-seed.log; exit 1; }
  DATA_DIR="$DATOS2" node scripts/seed-demo.mjs > /tmp/qa-seed2.log 2>&1
fi

echo "· Arrancando la aplicación"
(cd .next/standalone && setsid env "${COMUNES[@]}" DATA_DIR="$DATOS" PORT="$PUERTO" \
  node server.js > /tmp/qa-app.log 2>&1 &)
(cd .next/standalone && setsid env "${COMUNES[@]}" DATA_DIR="$DATOS2" PORT="$PUERTO2" \
  REDIRECT_TO_CANONICAL=1 NEXT_PUBLIC_SITE_URL=https://totalplayer.app \
  node server.js > /tmp/qa-app2.log 2>&1 &)

for intento in $(seq 1 40); do
  if curl -s -o /dev/null --noproxy '*' "http://localhost:$PUERTO/" 2> /dev/null; then break; fi
  sleep 1
done
echo "✅ En pie: http://localhost:$PUERTO  (y http://localhost:$PUERTO2 para el dominio único)"
