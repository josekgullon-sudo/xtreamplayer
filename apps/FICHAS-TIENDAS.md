# Las fichas de las cuatro tiendas

Los textos, ya escritos, para publicar la aplicación en Google Play, Amazon,
Samsung y LG. Están aquí y no en la cabeza de nadie porque se piden cuatro
veces —una por tienda—, hay que repetirlos en cada actualización, y porque
**el motivo de rechazo más habitual en un reproductor IPTV es la ficha, no la
aplicación**: si no deja claro que no incluye canales, la retiran.

Copiar, pegar y cambiar la marca si es para un proveedor.

---

## Lo que hay que decir sí o sí

En las cuatro tiendas, y en la descripción larga, no en una nota al pie:

> TOTALplayer es únicamente un reproductor multimedia. **No incluye, no
> proporciona y no vende ningún canal, película, serie ni lista de
> reproducción.** Para usarlo hace falta una lista propia (M3U o Xtream
> Codes), que aporta el usuario o su proveedor. El usuario es responsable del
> contenido al que accede y de contar con los derechos necesarios.

Y en el enlace de política de privacidad: `https://<tu-dominio>/legal/privacidad`

---

## Nombre y frase corta

| Campo | Texto |
| --- | --- |
| Nombre (30 car.) | `TOTALplayer` |
| Frase corta (80 car.) | `Tu lista IPTV en la tele: directo, cine y series, con el mando de siempre.` |
| Frase corta (EN) | `Your own IPTV playlist on TV: live, movies and series, with your remote.` |

## Descripción larga (español)

```
TOTALplayer es un reproductor para la lista IPTV que ya tienes.

Pon tu lista M3U o los datos de tu servidor Xtream Codes y verás TV en
directo, películas y series en la pantalla grande, manejándolo todo con el
mando: flechas para moverte, OK para entrar, ATRÁS para volver.

QUÉ HACE
· TV en directo por carpetas, en el orden que le da tu proveedor.
· Películas y series con sus carátulas grandes, como en cualquier tele.
· Guía de programación y, en los canales que lo permiten, volver a ver lo ya
  emitido.
· Recuerda el último canal: enciendes y sigues donde lo dejaste.
· Arranca aunque el wifi tarde en levantarse, que en una tele pasa siempre.

CÓMO SE ACTIVA
La primera pantalla enseña la MAC de tu televisor y un código de seis letras.
Pásale la MAC a tu proveedor, o entra desde el móvil y escribe el código. Si
ya tienes usuario y contraseña, puedes entrar directamente en la tele.

QUÉ NO HACE
TOTALplayer es únicamente un reproductor multimedia. No incluye, no
proporciona y no vende ningún canal, película, serie ni lista de
reproducción. Para usarlo hace falta una lista propia, que aporta el usuario
o su proveedor. El usuario es responsable del contenido al que accede y de
contar con los derechos necesarios.
```

## Descripción larga (inglés)

```
TOTALplayer is a player for the IPTV playlist you already have.

Enter your M3U playlist or your Xtream Codes server details and watch live
TV, movies and series on the big screen, all with your remote: arrows to
move, OK to open, BACK to go back.

WHAT IT DOES
· Live TV in folders, in the order your provider sets.
· Movies and series with large cover art, like any TV app.
· Programme guide and, on channels that allow it, catch-up.
· Remembers the last channel: turn the TV on and carry on.
· Starts even if Wi-Fi is still coming up, which on a TV always happens.

HOW TO ACTIVATE
The first screen shows your TV's MAC address and a six-letter code. Give the
MAC to your provider, or enter the code from your phone. If you already have
a username and password, you can sign in on the TV itself.

WHAT IT DOES NOT DO
TOTALplayer is a media player only. It does not include, provide or sell any
channel, film, series or playlist. A playlist of your own is required,
supplied by you or by your provider. You are responsible for the content you
access and for holding the necessary rights.
```

---

## Ficha por tienda

### Google Play (Android TV y Fire TV por separado)

| Campo | Valor |
| --- | --- |
| Cuenta | 25 $ una sola vez |
| Categoría | Entretenimiento (Apps de TV) |
| Clasificación | PEGI 3 / Everyone — es un reproductor, no aporta contenido |
| Capturas | Mínimo 3, apaisadas 1920×1080, hechas en la tele |
| Banner de TV | 1280×720, obligatorio para la sección de televisores |
| Icono | 512×512 |
| Anuncios | No |
| Compras | No |
| Datos que recoge | Correo o usuario para identificar la cuenta; nada más |

Aviso: Google exige que **todo** se maneje sin puntero. Revisan con mando.

### Amazon Appstore (Fire TV)

| Campo | Valor |
| --- | --- |
| Cuenta | Gratuita |
| APK | El mismo de Android TV |
| Capturas | 1920×1080 |
| Icono | 1280×720 (imagen destacada) y 512×512 |
| Prueban | Con el mando de Fire TV, botón a botón |

### Samsung (Tizen) — Samsung Apps TV Seller Office

| Campo | Valor |
| --- | --- |
| Cuenta | Gratuita, con datos fiscales de la empresa |
| Paquete | `.wgt` firmado con el certificado de distribuidor |
| Icono | 512×423 (el que pide su ficha) |
| Capturas | 1920×1080, de la propia tele |
| Revisión | Semanas; prueban el ATRÁS del mando (código 10009) |

### LG (webOS) — LG Content Store

| Campo | Valor |
| --- | --- |
| Cuenta | Gratuita |
| Paquete | `.ipk` generado con `ares-package` |
| Iconos | 80×80, 130×130 y 400×400 para la ficha |
| Capturas | 1920×1080 |
| Revisión | Prueban el ATRÁS del mando (código 461) |

---

## Para un proveedor que la quiere con su marca

Cambia tres cosas y es su aplicación: el nombre, la dirección de su
instalación y los gráficos (`bash apps/preparar-graficos-tele.sh "SuMarca"`).
En la ficha, lo mismo de arriba con su nombre — y **la misma frase sobre los
canales**, que es de lo que depende que la aprueben.
