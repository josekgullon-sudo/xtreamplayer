# La aplicación para televisores Samsung (Tizen)

Un envoltorio alrededor de `/tv`, igual que el de Android TV: dentro va la
misma aplicación de televisión que ya funciona en el navegador, así que **lo
que se arregla en la web queda arreglado en el televisor** sin volver a pasar
por la tienda de Samsung, que tarda semanas en revisar cada versión.

Lo que sí es nativo, porque no puede no serlo:

- El salvapantallas apagado mientras se ve algo. Una película son dos horas
  sin tocar el mando, y para la tele eso es que no hay nadie delante.
- Las teclas de reproducción del mando, que Tizen se queda salvo que se las
  pidas una por una.
- Reintento cuando la tele enciende antes que el router.

El ATRÁS del mando (código 10009) lo recibe la web directamente y allí ya
sabe deshacer un paso cada vez: vídeo → episodios → carpeta → portada.

## Preparar el entorno

Hace falta el **Tizen Studio** con la extensión de TV, y una cuenta de
[Samsung Developers](https://developer.samsung.com/smarttv). El certificado se
crea desde el propio Tizen Studio (*Certificate Manager*): uno de autor y uno
de distribuidor, que es lo que firma el paquete.

## Antes de compilar

1. **El identificador.** En `config.xml`, `tizen:application id` empieza por
   diez caracteres que asigna Samsung al crear el proyecto en su portal.
   Sustituye los ceros por los tuyos, y `package` por lo mismo.
2. **La dirección.** En `index.html`, `INICIO` apunta a
   `https://xtreamplayer-production.up.railway.app/tv`. Es lo único que cambia
   un proveedor que quiera esta aplicación con su marca.
3. **El nombre y el icono.** `<name>` en `config.xml`, e `icon.png` de
   512×423 (el tamaño que pide Samsung para la ficha de la tienda).

## Compilar e instalar

```bash
tizen build-web -- .
tizen package -t wgt -s <tu-perfil-de-certificado> -- .buildResult
# La tele, en la misma red y con «Modo desarrollador» activado (Apps → 12345)
tizen install -n TOTALplayer.wgt -t <nombre-del-televisor>
```

Para probarlo sin televisor vale el emulador de TV del Tizen Studio; el mando
se maneja con las flechas y el Enter del teclado.

## Publicar

En el **Samsung Apps TV Seller Office**. La cuenta es gratuita. Piden capturas
apaisadas de 1920×1080 hechas en la propia tele y, como en todas, que la ficha
diga que **la aplicación no incluye canales**: es un reproductor para la lista
que el cliente ya tiene. Es el motivo de rechazo más habitual.
