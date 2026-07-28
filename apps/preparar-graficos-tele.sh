#!/usr/bin/env bash
# Los iconos que piden Samsung y LG, en los tamaños exactos de cada tienda.
#
# Mismo criterio que en Android TV: no se guardan en el repositorio —se
# regeneran en un segundo y cada proveedor los cambia por los suyos— y salen
# ya con la marca que se les pase:
#
#   bash apps/preparar-graficos-tele.sh "MiMarca" "#e5192b"
#
set -euo pipefail

MARCA="${1:-TOTALplayer}"
COLOR="${2:-#e5192b}"
FONDO="#201f28"
AQUI="$(cd "$(dirname "$0")" && pwd)"
FUENTE="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

icono() { # tamaño destino
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "color=c=${FONDO}:s=${1}x${1}" \
    -vf "drawtext=fontfile=${FUENTE}:text='${MARCA:0:1}':fontcolor=${COLOR}:fontsize=$((${1} * 62 / 100)):x=(w-text_w)/2:y=(h-text_h)/2-$((${1} / 32))" \
    -frames:v 1 "$2"
}

# Samsung: un solo icono, apaisado, para la fila de aplicaciones de la tele
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "color=c=${FONDO}:s=512x423" \
  -vf "drawtext=fontfile=${FUENTE}:text='${MARCA}':fontcolor=white:fontsize=54:x=(w-text_w)/2:y=(h-text_h)/2-16,\
drawtext=fontfile=${FUENTE}:text='TV':fontcolor=${COLOR}:fontsize=32:x=(w-text_w)/2:y=(h-text_h)/2+48" \
  -frames:v 1 "$AQUI/tizen/icon.png"

# LG: el de la fila, el grande y el de la ficha de la tienda
icono 80 "$AQUI/webos/icon.png"
icono 130 "$AQUI/webos/icon-large.png"
icono 400 "$AQUI/webos/icon-tienda.png"

ls -lh "$AQUI/tizen/icon.png" "$AQUI/webos/icon.png" "$AQUI/webos/icon-large.png" "$AQUI/webos/icon-tienda.png"
echo "Listos. Las capturas de la ficha se hacen en la propia tele, a 1920x1080."
