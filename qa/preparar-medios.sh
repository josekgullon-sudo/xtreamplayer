#!/usr/bin/env bash
# Genera los vídeos de prueba que sirve el servidor IPTV simulado.
#
# No se guardan en el repositorio: son binarios que se regeneran en diez
# segundos y que cambiarían de bytes con cada versión de ffmpeg. Ejecuta esto
# una vez antes de lanzar las suites que reproducen vídeo.
#
#   bash qa/preparar-medios.sh
#
# Chromium no trae H.264 ni AAC, así que todo va en formatos libres: VP8/VP9
# para imagen y AC3 para sonido. El de HEVC existe justo para lo contrario:
# comprobar que el conversor lo detecta y lo recodifica.
set -euo pipefail

DESTINO="${1:-$(dirname "$0")}"
mkdir -p "$DESTINO"
cd "$DESTINO"

comun=(-hide_banner -loglevel error -y)
fuente=(-f lavfi -i "testsrc=size=320x240:rate=15:duration=6")
sonido=(-f lavfi -i "sine=frequency=440:duration=6")

echo "Generando en $PWD…"

# Canal en directo y contenido corriente: VP8 en WebM, que Chromium sí puede
ffmpeg "${comun[@]}" "${fuente[@]}" -c:v libvpx -b:v 200k test.webm

# Película en MKV: el formato que traía de cabeza al iPhone
ffmpeg "${comun[@]}" "${fuente[@]}" "${sonido[@]}" \
  -c:v libvpx-vp9 -b:v 200k -c:a ac3 -shortest pelicula.mkv

# La misma con dos pistas de audio y subtítulos, como las de verdad
printf '1\n00:00:00,000 --> 00:00:03,000\nSubtítulo de prueba\n\n' > .subs.srt
ffmpeg "${comun[@]}" "${fuente[@]}" "${sonido[@]}" "${sonido[@]}" -i .subs.srt \
  -map 0:v -map 1:a -map 2:a -map 3 \
  -c:v libvpx-vp9 -b:v 200k -c:a ac3 -c:s srt -shortest pelicula-real.mkv

# Con carátula incrustada: una pista de vídeo que NO es la película, y que
# hacía que el conversor eligiera la portada en vez de la imagen
ffmpeg "${comun[@]}" -f lavfi -i "color=c=red:size=120x180:duration=1" \
  -frames:v 1 .cover.jpg
ffmpeg "${comun[@]}" -i pelicula-real.mkv -i .cover.jpg \
  -map 0 -map 1 -c copy -c:v:1 mjpeg -disposition:v:1 attached_pic pelicula-cover.mkv

# HEVC: el que hay que etiquetar hvc1 o recodificar para que Apple lo acepte
ffmpeg "${comun[@]}" "${fuente[@]}" "${sonido[@]}" \
  -c:v libx265 -b:v 200k -c:a ac3 -shortest pelicula-hevc.mkv

rm -f .subs.srt .cover.jpg
ls -lh test.webm pelicula*.mkv
