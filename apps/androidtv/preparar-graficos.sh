#!/usr/bin/env bash
# Genera el icono y el banner que piden las tiendas de televisores.
#
# No se guardan en el repositorio: son imágenes que se regeneran en un
# segundo y que cada proveedor cambia por las suyas. Con la marca por
# parámetro salen ya con su nombre:
#
#   bash apps/androidtv/preparar-graficos.sh "MiMarca" "#e5192b"
#
# Android TV pide dos cosas distintas: el icono cuadrado (mipmap) y el
# «banner» de 320x180 que es lo que de verdad se ve en la fila de
# aplicaciones del televisor. Sin banner, Google Play rechaza la subida.
set -euo pipefail

MARCA="${1:-TOTALplayer}"
COLOR="${2:-#e5192b}"
FONDO="#201f28"
AQUI="$(cd "$(dirname "$0")" && pwd)"
RES="$AQUI/app/src/main/res"
FUENTE="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

mkdir -p "$RES/mipmap-xhdpi" "$RES/drawable"

# Icono: 192x192, la inicial de la marca sobre el fondo de la aplicación
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "color=c=${FONDO}:s=192x192" \
  -vf "drawtext=fontfile=${FUENTE}:text='${MARCA:0:1}':fontcolor=${COLOR}:fontsize=118:x=(w-text_w)/2:y=(h-text_h)/2-6" \
  -frames:v 1 "$RES/mipmap-xhdpi/ic_launcher.png"

# Banner: 320x180 con el nombre completo, que es lo que lee el cliente
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "color=c=${FONDO}:s=320x180" \
  -vf "drawtext=fontfile=${FUENTE}:text='${MARCA}':fontcolor=white:fontsize=34:x=(w-text_w)/2:y=(h-text_h)/2-10,\
drawtext=fontfile=${FUENTE}:text='TV':fontcolor=${COLOR}:fontsize=20:x=(w-text_w)/2:y=(h-text_h)/2+30" \
  -frames:v 1 "$RES/drawable/banner.png"

ls -lh "$RES/mipmap-xhdpi/ic_launcher.png" "$RES/drawable/banner.png"
echo "Listos. Para otra marca, vuelve a lanzarlo con su nombre y su color."
