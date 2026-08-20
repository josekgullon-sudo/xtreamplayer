# Las aplicaciones

Cajas alrededor de la misma cosa: `/tv`, la aplicación de televisión que ya
funciona en el navegador de cualquier tele. Ninguna de ellas lleva lógica de
reproductor dentro, y es a propósito: **lo que se arregla en la web queda
arreglado en todos los aparatos esa misma noche**, sin publicar una versión
nueva ni esperar a que nadie actualice. En estas tiendas, eso son semanas.

| Carpeta | Aparatos | Empaquetado | Qué lleva dentro |
| --- | --- | --- | --- |
| `androidtv-nativo/` | Android TV, Google TV, **Fire TV** | `.apk` con Gradle | Nativo: ExoPlayer y pantallas propias |
| `androidtv/` | Los mismos, para comparar | `.apk` con Gradle | Envoltorio de `/tv` |
| `android/` | Móviles y tabletas Android | `.apk` con Gradle | Envoltorio de `/player` |
| `tizen/` | Televisores Samsung | `.wgt` con Tizen Studio | Envoltorio de `/tv` |
| `webos/` | Televisores LG | `.ipk` con `ares-package` | Envoltorio de `/tv` |
| `escritorio/` | Windows 10 y 11 | `.exe` y `.msi` con Tauri | Envoltorio de `/tv` |
| `comun/` | — | — | El motor de descargas, compartido por las tres de Android |
| — | iPhone y iPad | Ninguno: se instala desde el navegador ([/apps/movil](../app/apps/movil/page.tsx)) | — |

La de Fire TV que se reparte es **`androidtv-nativo`**: es la que sirve
`totalplayer.app/apk/tv` y la que hay que probar. `androidtv/` es el mismo
producto envuelto en un WebView, y está para poder comparar.

### Las direcciones cortas

Instalar en un Fire TV se hace con Downloader, y ahí la dirección se escribe
letra a letra con el mando. Por eso son cortas, y por eso existen:

| Dirección | Qué baja |
| --- | --- |
| `totalplayer.app/apk/tv` | La aplicación nativa de televisión |
| `totalplayer.app/apk/movil` | La misma, para el teléfono |
| `totalplayer.app/apk/web` | El envoltorio de WebView |
| `totalplayer.app/exe` | El instalador de Windows |
| `totalplayer.app/exe?msi` | El mismo, en MSI para empresas |

Cada carpeta tiene su README con lo suyo: cómo compilarla, cómo instalarla en
una tele con el modo desarrollador y qué pide su tienda.

## Lo que es nativo, y por qué solo eso

Todas hacen exactamente lo mismo, que es lo único que una web no puede hacer
desde dentro de un televisor:

- **Pantalla completa de verdad**, sin barras del sistema.
- **Que la tele no se apague** mientras se ve algo. Una película son dos
  horas sin tocar el mando, y para el televisor eso es que no hay nadie
  delante.
- **Reintentar al arrancar sin red**: una tele enciende antes que el router.
- **Las teclas del mando** que cada sistema se reserva salvo que se las pidas.

El botón ATRÁS lo gestiona la web, que sabe deshacer un paso cada vez: vídeo
→ episodios → carpeta → portada. Cada fabricante lo manda con un código
distinto —Samsung el 10009, LG el 461— y la web los traduce.

## Descargas: dónde sí y dónde no

Guardar una película para verla sin conexión es lo otro que una web no puede
hacer sola. Lo que hay en un navegador es almacenamiento del sitio, y el
navegador lo borra cuando le hace falta espacio: prometer «lo tienes
guardado» para que desaparezca solo es peor que no ofrecerlo.

| Aplicación | Descargas |
| --- | --- |
| `androidtv-nativo/` | Sí. Se llama al motor desde Java y el reproductor abre el fichero por su ruta |
| `androidtv/` y `android/` | Sí, por el puente `TPDescargas` que ve la web |
| `escritorio/` | Sí, por `invoke` contra el programa (ver `src-tauri/src/descargas.rs`) |
| `tizen/` y `webos/` | No. En un televisor Samsung o LG no hay dónde |
| Navegador | No |

Donde no se puede, el acceso y el botón **no aparecen**. Sin mensajes de «tu
dispositivo no es compatible», que es una forma cara de no hacer nada.

El contrato entre la web y el envoltorio son tres funciones que reciben y
devuelven texto —`bajar`, `quitar`, `lista`—, y es así de tonto por una razón
que manda: el puente de Android no sabe pasar objetos. Está escrito en
[`components/tv/descargas.ts`](../components/tv/descargas.ts) y la parte de
Android en [`comun/java`](comun/java/app/totalplayer/comun/Descargas.java).

## La dirección de tu instalación

Está escrita en las tres aplicaciones. Para cambiarla de una vez:

```bash
bash apps/poner-dominio.sh https://totalplayer.app
```

Hacerlo a mano en cinco ficheros es como acaba una aplicación publicada
apuntando al dominio viejo — y eso no se arregla con un despliegue: hay que
subir una versión nueva a la tienda y esperar la revisión.

## Los gráficos

```bash
bash apps/androidtv/preparar-graficos.sh "MiMarca" "#e5192b"   # icono y banner de Android
bash apps/preparar-graficos-tele.sh      "MiMarca" "#e5192b"   # iconos de Samsung y LG
```

No se guardan en el repositorio: se regeneran en un segundo y cada proveedor
tiene los suyos.

## Probarlas antes de subirlas

Sin televisor y sin compilar nada:

```bash
node qa/envoltorios.js   # los envoltorios de Samsung y de LG
node qa/descargas.js     # el contrato de descargas, con un envoltorio de mentira
```

Abre los envoltorios de Samsung y de LG tal y como se ejecutan en la tele
—desde `file://`—, pero contra el servidor de pruebas, y comprueba que la web
se abra, que sin red esperen en vez de dar un error, y que el ATRÁS de cada
mando llegue a la aplicación. La de Android TV se prueba con el agente y la
pantalla de un Fire TV.

Con televisor, cada README explica cómo instalarla con el modo desarrollador:
es media hora la primera vez y luego es un comando.

La de Windows no necesita nada de eso: se compila sola en GitHub y sale un
instalador que se descarga y se ejecuta. Lo suyo está en
[`escritorio/README.md`](escritorio/README.md).

## Publicar

Los textos de las cuatro fichas, ya escritos, están en
[`FICHAS-TIENDAS.md`](FICHAS-TIENDAS.md). Lo que más rechazos provoca no es la
aplicación: es no decir en la ficha que **no incluye canales**.
