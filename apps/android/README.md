# TOTALplayer para móviles y tabletas Android

El APK que un proveedor le pasa a su cliente. Dentro va el mismo reproductor
que en el navegador, así que **lo que se arregla en la web queda arreglado en
el teléfono** sin publicar una versión ni esperar a que nadie actualice.

Existe porque en IPTV el cliente espera un APK. La web se puede instalar desde
el navegador —y funciona igual—, pero «añade esto a la pantalla de inicio» no
lo hace casi nadie.

## Lo que sí es nativo aquí

Lo que un navegador dentro de una aplicación no da solo:

- **El vídeo a pantalla completa.** Un WebView se queda con el vídeo dentro de
  su recuadro: al pulsar pantalla completa no pasa nada. Es la mitad del
  código de `MainActivity`.
- **Girar el teléfono sin recargar**, que si no se pierde el minuto por el que
  iba la película.
- **El botón atrás**: cierra el vídeo, luego deshace un paso dentro de la web,
  y solo entonces sale.
- **Las descargas** —una factura en PDF— que un WebView ignora calladamente si
  nadie las recoge.
- **La sesión**, que sobrevive a cerrar la aplicación.

## El APK, sin instalar nada

Cada cambio en esta carpeta lo compila GitHub y deja el archivo descargable:

> Pestaña **Actions** → «Aplicaciones Android» → la última ejecución →
> **Artifacts** → `totalplayer-movil`.

Es un APK firmado de depuración: sirve para instalarlo en un teléfono y para
dárselo a un cliente a probar. Para Google Play hace falta la clave propia.

## Compilarlo tú

```bash
cd apps/android
./gradlew assembleDebug        # o: gradle assembleDebug
```

Sale en `app/build/outputs/apk/debug/`. Hace falta el SDK de Android
(Android Studio lo instala solo).

## Antes de publicarlo en Google Play

1. **El paquete.** `applicationId` en `app/build.gradle`. No se puede cambiar
   después de publicar.
2. **La dirección.** `INICIO` en `MainActivity.java`, o de una vez para las
   tres aplicaciones:
   ```bash
   bash apps/poner-dominio.sh https://totalplayer.app
   ```
3. **La clave de firma.** Se genera una vez y se guarda como oro: si se
   pierde, la aplicación no se puede volver a actualizar nunca.
   ```bash
   keytool -genkey -v -keystore totalplayer.jks -alias totalplayer \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
   Después, cambia `signingConfig signingConfigs.debug` por la tuya.
4. **La ficha**, con los textos ya escritos en
   [`../FICHAS-TIENDAS.md`](../FICHAS-TIENDAS.md). Y la frase de siempre: la
   aplicación **no incluye canales**.

## Para un proveedor con su marca

Tres cosas: el nombre en `res/values/strings.xml`, la dirección en
`MainActivity.java` y los iconos con `preparar-graficos.sh`. Su enlace de
marca (`/m/loquesea`) vale como dirección de inicio: sus clientes no ven
TOTALplayer por ningún lado.
