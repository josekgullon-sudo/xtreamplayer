# TOTALplayer TV — reproductor nativo

El de Android TV y Fire TV que **no** es un WebView.

## Por qué existe

`apps/androidtv` mete la web dentro de un WebView. Eso funciona, pero para
IPTV en un aparato de televisión tiene cuatro techos que no se pueden
levantar desde JavaScript:

- **El directo suele ser MPEG-TS**, y un navegador no sabe reproducirlo:
  `mpegts.js` lo desmonta en JavaScript, por software, en el hilo principal.
- **H.265/HEVC**, que hoy trae media lista de proveedor, no va por `<video>`
  de forma fiable en el WebView de Android TV.
- **AC3/E-AC3**, el audio habitual en IPTV, Chromium no lo lleva.
- Sin control del **decodificador por hardware** ni del *tunneled playback*.

ExoPlayer (Media3) resuelve las cuatro con el decodificador del aparato.

Y hay un motivo de negocio: hoy tapamos parte de esto con el conversor del
servidor. Con veinte clientes se aguanta; con dos mil, la CPU la pagamos
nosotros en cada reproducción.

## Qué hace hoy, y qué no

Es **a propósito** lo mínimo para medir si la tesis se cumple:

- Pide servidor, usuario y contraseña de Xtream, y los recuerda.
- Lista los canales de directo.
- Reproduce con ExoPlayer.

No tiene guía, ni favoritos, ni cine, ni series, ni perfiles, ni la marca del
proveedor. Nada de eso se construye hasta saber si el vídeo va bien.

## Cómo probarlo

El APK sale de GitHub → Actions → «Aplicaciones Android» → artefacto
`totalplayer-tele-nativo`. Se instala en un Fire TV Stick con
`adb install`, o con Downloader.

**Lo que hay que mirar**, con los dos instalados a la vez (los
identificadores son distintos justo para eso):

1. Un canal en **H.265**. En el WebView no debería arrancar; aquí sí.
2. Un canal con audio **AC3**. En el WebView, imagen sin sonido.
3. Zapear diez canales seguidos: cuánto tarda cada uno en dar imagen.
4. Que el aparato no se caliente ni el audio se desincronice a los diez
   minutos.

Si eso sale mejor que el envoltorio, se sigue construyendo aquí. Si no, se
ha perdido una tarde y nos quedamos con lo que hay.
