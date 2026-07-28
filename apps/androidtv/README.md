# La aplicación para Android TV y Fire TV

Un envoltorio alrededor de `/tv`. Dentro va la misma aplicación de televisión
que ya funciona en el navegador de cualquier tele, así que **lo que se
arregla en la web queda arreglado en el televisor** sin publicar una versión
ni esperar a que nadie actualice — que en estas tiendas son semanas.

Lo que sí es nativo, porque no puede no serlo:

- Pantalla completa de verdad, sin barras del sistema.
- Que la tele no se apague mientras se ve algo (dos horas sin tocar el mando).
- El botón ATRÁS del mando, que lo gestiona la web: cierra el vídeo, sale de
  la carpeta o vuelve a la portada, y solo entonces sale de la aplicación.
- Reintento al arrancar sin wifi: una tele enciende antes de tener red.

## Compilarla

Necesitas Android Studio o el SDK con Gradle. No hace falta tocar código:

```bash
# 1. El icono y el banner, con la marca que sea
bash apps/androidtv/preparar-graficos.sh "MiMarca" "#e5192b"

# 2. La dirección de tu instalación, en MainActivity.java
#    private static final String INICIO = "https://lo-que-sea/tv";

# 3. El nombre bajo el icono, en app/src/main/res/values/strings.xml

# 4. A compilar
cd apps/androidtv && ./gradlew assembleRelease
```

El `.apk` sale en `app/build/outputs/apk/release/`.

> Para publicar hay que firmarlo con tu propia clave. `build.gradle` usa la de
> depuración a propósito, para que se pueda compilar y probar sin tener nada
> configurado; no subas eso a ninguna tienda.

## Probarla sin televisor

```bash
adb install -r app/build/outputs/apk/release/app-release.apk
```

Vale un emulador de Android TV, o un Fire TV Stick con la depuración por USB
activada. El mando del emulador son las flechas del teclado y Enter.

## Publicar

| Tienda | Cuenta | Lo que piden de más |
| --- | --- | --- |
| **Google Play** (Android TV) | 25 $, una vez | El banner de 320x180, capturas apaisadas y que todo se maneje sin puntero |
| **Amazon Appstore** (Fire TV) | Gratis | Capturas 1920x1080 y probar con el mando de Fire TV |

En las dos, la ficha tiene que dejar claro que **la aplicación no incluye
canales**: es un reproductor para la lista que el cliente ya tiene. Es el
motivo de rechazo más habitual en aplicaciones de este tipo.

## Para un proveedor con su marca

Cambiando tres cosas —el nombre en `strings.xml`, la dirección en
`MainActivity.java` y los gráficos con el guion de arriba— sale su
aplicación. La dirección puede ser su enlace de marca (`/m/loquesea`) o
directamente `/tv`, que ya reconoce al cliente por su MAC o su código.
