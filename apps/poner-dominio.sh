#!/usr/bin/env bash
# La dirección de tu instalación, puesta de una vez en las cuatro
# aplicaciones: las tres de televisor y la de Windows.
#
#   bash apps/poner-dominio.sh https://totalplayer.app
#
# Existe porque esa dirección está escrita en varios sitios —el WebView de
# Android, los arranques de Samsung y de LG, y el ejecutable de Windows—, y
# es exactamente el tipo de
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
# Con «?app=1» detrás, y no es un adorno: es la señal de que se entra desde
# un paquete y no desde una pestaña. Sin ella, /tv le enseña a un cliente de
# proveedor la pantalla de «descárgate la aplicación» —que es justo lo que
# está haciendo—. El envoltorio de Samsung y el de LG ya la llevaban escrita
# y este guion se la quitaba al pasar por encima: la primera vez que alguien
# cambiara de dominio, las dos aplicaciones dejaban de servir.
DESTINO="$SITIO/tv?app=1"

# Android TV: la constante de MainActivity
ANDROID="$AQUI/androidtv/app/src/main/java/app/totalplayer/tv/MainActivity.java"
sed -i.bak -E "s|(private static final String INICIO = \")[^\"]*(\";)|\1${DESTINO}\2|" "$ANDROID"

# Android móvil: la misma constante, pero apuntando al reproductor y no a /tv
MOVIL="$AQUI/android/app/src/main/java/app/totalplayer/movil/MainActivity.java"
sed -i.bak -E "s|(private static final String INICIO = \")[^\"]*(\";)|\1${SITIO}/player\2|" "$MOVIL"

# Samsung y LG: la variable del arranque
for ENVOLTORIO in "$AQUI/tizen/index.html" "$AQUI/webos/index.html"; do
  sed -i.bak -E "s|(var INICIO = \")[^\"]*(\";)|\1${DESTINO}\2|" "$ENVOLTORIO"
done

# Windows: la constante del envoltorio de Tauri. Aquí va solo el servidor,
# sin «/tv»: eso lo pega el programa, que también lo usa para preguntar si
# el servidor está ahí antes de abrir la ventana
ESCRITORIO="$AQUI/escritorio/src-tauri/src/main.rs"
sed -i.bak -E "s|(const CASA: &str = \")[^\"]*(\";)|\1${SITIO}\2|" "$ESCRITORIO"

rm -f "$ESCRITORIO.bak" "$ANDROID.bak" "$MOVIL.bak" "$AQUI/tizen/index.html.bak" "$AQUI/webos/index.html.bak"

echo "Puesto en las cuatro:"
grep -h "INICIO\|const CASA" "$ANDROID" "$MOVIL" "$AQUI/tizen/index.html" "$AQUI/webos/index.html" "$ESCRITORIO" | grep -o "https\?://[^\"]*"
echo
echo "Recuerda que la web también tiene la suya, en las variables de Railway:"
echo "  NEXT_PUBLIC_SITE_URL=$SITIO"
echo "Y que una aplicación ya publicada no se entera de esto hasta que subas"
echo "una versión nueva a su tienda."
