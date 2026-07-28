# La aplicación para televisores LG (webOS)

La tercera caja alrededor de la misma `/tv`, como las de Android TV y Samsung.
Dentro va la aplicación de televisión que ya funciona en el navegador, así que
**lo que se arregla en la web queda arreglado en el televisor** sin publicar
una versión ni esperar a que nadie actualice.

Lo nativo, que es poco a propósito:

- El salvapantallas apagado mientras la aplicación está delante.
- Reintento cuando la tele enciende antes que el router.
- El ATRÁS del mando (código 461) lo recibe la web, que sabe deshacer un paso
  cada vez; solo cuando ya no queda nada que deshacer se cierra la aplicación.

## Preparar el entorno

```bash
npm install -g @webos-tools/cli     # antes se llamaba @webosose/ares-cli
ares-setup-device                   # la IP de la tele, con «Developer Mode» puesto
```

El **Developer Mode** se instala desde la propia tienda de la tele y hay que
tener cuenta de [LG Developer](https://webostv.developer.lg.com). Caduca cada
50 horas y se renueva desde la misma aplicación: es lo normal y no afecta a la
aplicación publicada.

## Antes de empaquetar

1. **El identificador.** `id` en `appinfo.json` — en dominio invertido, y no
   se puede cambiar una vez publicada.
2. **La dirección.** `INICIO` en `index.html`, lo único que cambia un
   proveedor que la quiera con su marca.
3. **Los iconos.** `icon.png` de 80×80 y `icon-large.png` de 130×130. Para la
   ficha de la tienda piden además uno de 400×400.

## Empaquetar, instalar y probar

```bash
ares-package .
ares-install --device <tu-tele> app.totalplayer.tv_1.0.0_all.ipk
ares-launch --device <tu-tele> app.totalplayer.tv
ares-inspect --device <tu-tele> app.totalplayer.tv   # consola, si algo falla
```

## Publicar

En el **LG Content Store**, desde el portal de LG Developer. La cuenta es
gratuita. Piden capturas de 1920×1080 y, como Google, Amazon y Samsung, que la
ficha diga que **la aplicación no incluye canales**: es un reproductor para la
lista que el cliente ya tiene.
