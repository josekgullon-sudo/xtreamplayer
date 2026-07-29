#!/usr/bin/env bash
# La dirección de tu instalación, puesta de una vez en las tres aplicaciones
# de televisor.
#
#   bash apps/poner-dominio.sh https://totalplayer.app
#
# Existe porque esa dirección está escrita en tres sitios —el WebView de
# Android, y los arranques de Samsung y de LG—, y es exactamente el tipo de
# dato que se queda viejo en uno de ellos. Una aplicación ya publicada
# apuntando al dominio anterior no se arregla con un despliegue: hay que
# subir una versión nueva a la tienda y esperar la revisión.
set -euo pipefail

SITIO="${1:-}"
if [ -z "$SITIO" ]; then
  echo "Uso: bash apps/poner-dominio.sh https://tudominio.com"
  echo "     (sin barra al final; se le añade /tv)"
  exit 1
fi
# Se admite con o sin barra final, que es el despiste de siempre
SITIO="${SITIO%/}"
case "$SITIO" in
  https://*) ;;
  http://*)
    echo "Aviso: http:// sin cifrar. Un televisor guarda ahí la contraseña del cliente."
    ;;
  *)
    echo "La dirección tiene que empezar por https://"
    exit 1
    ;;
esac

AQUI="$(cd "$(dirname "$0")" && pwd)"
DESTINO="$SITIO/tv"

# Android TV: la constante de MainActivity
ANDROID="$AQUI/androidtv/app/src/main/java/app/totalplayer/tv/MainActivity.java"
sed -i.bak -E "s|(private static final String INICIO = \")[^\"]*(\";)|\1${DESTINO}\2|" "$ANDROID"

# Samsung y LG: la variable del arranque
for ENVOLTORIO in "$AQUI/tizen/index.html" "$AQUI/webos/index.html"; do
  sed -i.bak -E "s|(var INICIO = \")[^\"]*(\";)|\1${DESTINO}\2|" "$ENVOLTORIO"
done

rm -f "$ANDROID.bak" "$AQUI/tizen/index.html.bak" "$AQUI/webos/index.html.bak"

echo "Puesto en las tres:"
grep -h "INICIO" "$ANDROID" "$AQUI/tizen/index.html" "$AQUI/webos/index.html" | grep -o "https\?://[^\"]*"
echo
echo "Recuerda que la web también tiene la suya, en las variables de Railway:"
echo "  NEXT_PUBLIC_SITE_URL=$SITIO"
echo "Y que una aplicación ya publicada no se entera de esto hasta que subas"
echo "una versión nueva a su tienda."
