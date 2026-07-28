# Las aplicaciones de televisor

Cuatro cajas alrededor de la misma cosa: `/tv`, la aplicación de televisión
que ya funciona en el navegador de cualquier tele. Ninguna de ellas lleva
lógica de reproductor dentro, y es a propósito: **lo que se arregla en la web
queda arreglado en todos los televisores esa misma noche**, sin publicar una
versión nueva ni esperar a que nadie actualice. En estas tiendas, eso son
semanas.

| Carpeta | Aparatos | Empaquetado |
| --- | --- | --- |
| `androidtv/` | Android TV, Google TV, Fire TV | `.apk` con Gradle |
| `tizen/` | Televisores Samsung | `.wgt` con Tizen Studio |
| `webos/` | Televisores LG | `.ipk` con `ares-package` |
| — | iPhone, iPad y Android | Ninguno: se instala desde el navegador ([/apps/movil](../app/apps/movil/page.tsx)) |

Cada carpeta tiene su README con lo suyo: cómo compilarla, cómo instalarla en
una tele con el modo desarrollador y qué pide su tienda.

## Lo que es nativo, y por qué solo eso

Las tres aplicaciones hacen exactamente lo mismo, que es lo único que una web
no puede hacer desde dentro de un televisor:

- **Pantalla completa de verdad**, sin barras del sistema.
- **Que la tele no se apague** mientras se ve algo. Una película son dos
  horas sin tocar el mando, y para el televisor eso es que no hay nadie
  delante.
- **Reintentar al arrancar sin red**: una tele enciende antes que el router.
- **Las teclas del mando** que cada sistema se reserva salvo que se las pidas.

El botón ATRÁS lo gestiona la web, que sabe deshacer un paso cada vez: vídeo
→ episodios → carpeta → portada. Cada fabricante lo manda con un código
distinto —Samsung el 10009, LG el 461— y la web los traduce.

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
node qa/envoltorios.js
```

Abre los envoltorios de Samsung y de LG tal y como se ejecutan en la tele
—desde `file://`—, pero contra el servidor de pruebas, y comprueba que la web
se abra, que sin red esperen en vez de dar un error, y que el ATRÁS de cada
mando llegue a la aplicación. La de Android TV se prueba con el agente y la
pantalla de un Fire TV.

Con televisor, cada README explica cómo instalarla con el modo desarrollador:
es media hora la primera vez y luego es un comando.

## Publicar

Los textos de las cuatro fichas, ya escritos, están en
[`FICHAS-TIENDAS.md`](FICHAS-TIENDAS.md). Lo que más rechazos provoca no es la
aplicación: es no decir en la ficha que **no incluye canales**.
