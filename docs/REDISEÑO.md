# Rediseño de lo que ve el cliente

Lo que sigue es el encargo de rediseñar **el reproductor web y la aplicación**
—lo que usa el cliente final, no el panel del proveedor— tomando como
referencia una aplicación de la competencia que el dueño del producto ve
mejor que la nuestra.

Este documento existe para que no haya que volver a explicarlo. Si abres una
sesión nueva: léelo, mira el orden del final y empieza por donde toque.

## La línea que no se cruza

La referencia se llama VIVA PLAYER. Lo que se coge de ahí son **patrones**, y
casi ninguno es suyo: barra inferior flotante, carril lateral de iconos, chips
de categoría, héroe con fondo y sinopsis, carruseles con «ver más», corazón en
la carátula, historial con progreso. Eso es el vocabulario de Netflix y Prime,
lo usa el sector entero y no hay nada que reclamar.

Lo que **no** se toca, porque sí es suyo y porque el encargo fue explícito
—«parecida, que no puedan decir que es una réplica»—:

- Su verde lima como color de identidad. El nuestro es el rojo de la marca.
- Su nombre, su logotipo y sus ilustraciones de perfil.
- Cualquier recurso gráfico suyo. Todo lo que se dibuje, se dibuja aquí.

El parecido tiene que ser de familia, no de calco.

## Lo que ya tenemos y no se está usando

Tres cosas se pueden enseñar mañana porque el dato ya está pedido y se tira:

- **Qué echan ahora en cada canal.** Se pide a `get_short_epg` y solo se pinta
  en la ficha del canal que suena. En la referencia va debajo de cada logotipo
  de la rejilla, y es lo que hace que se elija canal sin entrar a probar.
- **Nota, géneros, reparto y sinopsis** de películas y series. Vienen en
  `get_vod_info` y `get_series_info` y se usan a medias.
- **Cuántos hay en cada carpeta.** Ya se cuenta y se pinta en una pastilla al
  lado del título; en la referencia va en la columna de categorías, que es
  donde se mira antes de entrar.

## El sistema

| Pieza | Cómo es en la referencia | Cómo lo hacemos |
|---|---|---|
| Arranque | Pantalla propia con la marca, «Preparando categorías», cinco puntos de etapa y un porcentaje que sube | Nuevo: hoy hay mensajes que rotan solos y una barra que no mide nada |
| Navegación en móvil | Cápsula flotante abajo, 5 destinos, icono en pastilla + etiqueta en color | Igual, en rojo de marca |
| Navegación en tele y escritorio | Carril vertical de iconos a la izquierda: directo, cine, series, favoritos, historial, ajustes, buscar, recargar | Igual. Sustituye a las tres columnas de hoy |
| Categorías | Fila alta con icono en cuadro, nombre y «N Canales» debajo, flecha a la derecha. En escritorio, columna | Igual |
| Icono de categoría | Uno distinto según de qué va: silbato en deportes, guante en UFC, casco en F1, balón en fútbol, calendario en eventos, bebé en infantiles | Igual, deducido del nombre de la carpeta |
| Chips | Fila arrastrable, activo sólido con texto oscuro | Igual |
| Rejilla de canales | Logotipo grande sobre su color, nombre y **qué echan ahora** con punto rojo | Igual |
| Ver como lista o como rejilla | Un botón al lado del buscador, dentro de la sección | Igual |
| Reproductor de directo | Vídeo arriba sin comerse la pantalla, y debajo dos pestañas: **Canales** y **EPG**. Chip de calidad, «● LIVE» con la hora, PiP y AirPlay sobre el vídeo | Casi: hoy la lista está debajo, pero sin pestañas, sin EPG y sin chip de calidad |
| Héroe de cine y series | Fondo del título, nota en chip, géneros, reparto, sinopsis de dos líneas, botón grande, porcentaje en círculo, puntos de carrusel | Igual |
| Filas | Cabecera con icono en cuadro de color + «ver más» en píldora, corazón arriba a la izquierda, nota arriba a la derecha | Igual |
| En tendencia | Las tres primeras con un número gigante encima de la carátula, medio salido del marco | Igual |
| Historial | Dos columnas, barra de progreso, «continuar» | Nuevo: hoy solo hay «recientes» sin progreso |
| Perfiles | Círculo con avatar, anillo de color, candado en el infantil, «editar» y «cerrar sesión» en las esquinas | Hoy es un cuadrado con la inicial |
| Ajustes | Interruptores agrupados, con icono en cuadro de color | No existe |
| Descargas | Barra de almacenamiento y estado por título | No existe |

### Lo que enseñaron las capturas del reproductor

Tres cosas que no estaban en la lista de arriba y que salieron al ver la
aplicación funcionando, no en pantallas sueltas:

- **El arranque es una pantalla, no un rato en blanco.** La referencia tarda
  lo mismo que nosotros en bajar un catálogo grande, pero lo cuenta: dice en
  qué está («Preparando categorías»), enseña cinco etapas y sube un
  porcentaje. Nosotros tenemos frases que se van sucediendo solas y una barra
  que se mueve sin medir nada — que es exactamente lo que hace pensar que se
  ha colgado. Las etapas ya las sabemos: categorías, canales, cine, series.
- **La categoría se reconoce por su icono antes que por su nombre.** En una
  lista de sesenta carpetas, «DAZN - MOTO GP» y «DAZN | EVENTOS» son la misma
  mancha de texto; con un casco y un calendario delante, no. El icono sale del
  nombre de la carpeta, así que no hay que pedirle nada a nadie.
- **Su barra inferior no lleva las mismas cinco cosas que la nuestra.** Ellos
  ponen abajo *TV en vivo, Películas, Serie, Historial y Almacén*, y se llevan
  favoritos y buscar a la cabecera. Nosotros llevamos *Directo, Guía, Cine,
  Series y Favoritos*. Cuando lleguen el historial (4) y las descargas (8),
  esa barra hay que rehacerla: no caben nueve destinos en una cápsula.

## El orden, y por qué

1. **Tokens, barra flotante y carril lateral.** Es el 70% de la sensación de
   «aplicación nueva» y no toca lógica: se puede hacer entero sin romper nada.
2. **Chips y rejilla de canales con «qué echan ahora».** El dato ya está.
3. **Héroe completo de cine y series.** El dato ya está.
4. **Historial con progreso.** Hay que guardar por dónde se iba, que hoy no se
   guarda.
5. **Perfiles con avatar, anillo y PIN infantil.** El PIN es lógica nueva.
6. **«Perfil ocupado».** Cuando el cliente se pasa del cupo de aparatos, hoy se
   le suelta un error y se le deja tirado; la referencia le ofrece cerrar la
   sesión del otro aparato y entrar aquí. El cupo y el control de dispositivos
   ya existen —`max_devices`—, así que es un diálogo y una ruta.
   **De toda la lista, es lo que más llamadas al proveedor ahorra.**
7. **Ajustes**, con el aviso de canales bloqueados por el operador. `/api/diag`
   ya sabe distinguir «el proveedor no contesta a nuestro servidor» de «este
   aparato no sabe el formato»; hoy eso vive escondido detrás de un botón de
   error y ahí es donde tiene valor.
8. **Descargas.** La más grande, y en la aplicación hay que decidir dónde se
   guarda el fichero y qué pasa cuando caduca la suscripción.
9. **Idiomas.** *Proyecto aparte, no un retoque.* La referencia arranca
   preguntando idioma —español, inglés, alemán, francés, italiano, portugués—
   y aquí los textos están escritos a pelo dentro de cada pantalla, en la web y
   en Android. Sacarlos todos a un sitio es lo que abre la puerta a vender a
   proveedores de fuera.

Lo que salió de las capturas nuevas no reordena esto, se reparte dentro:
el icono de categoría y el conmutador lista/rejilla van con el 2, que es
cuando se toca esa pantalla; las pestañas Canales/EPG del reproductor de
directo también. El arranque con porcentaje es lo único suelto —no
pertenece a ninguno de los nueve— y es media tarde: se puede colar donde
convenga.

Y el punto 1 está hecho en el reproductor web y en la aplicación de
televisión. **Falta en la aplicación nativa** (`apps/androidtv-nativo`), que
sigue con la navegación de antes.

## Dónde se toca cada cosa

- Reproductor web: `components/player/PlayerApp.tsx`, `VideoPlayer.tsx`,
  `SectionGate.tsx`, `ProfileGate.tsx` y `app/globals.css`.
- Aplicación de televisión y Smart TV: `components/tv/TvApp.tsx`. Es también lo
  que se empaqueta para Samsung y LG (`apps/tizen`, `apps/webos`).
- Aplicación nativa: `apps/androidtv-nativo`, un diseño por carpeta —
  `res/layout` para el teléfono y `res/layout-sw540dp` para la tele—. Antes de
  empujar, `python3 apps/androidtv-nativo/comprobar.py`, que caza el XML roto y
  los identificadores que faltan en una de las dos.

## Cómo se mira lo que se hace

Hay dos guiones de capturas, y no son pruebas: retratan y ya.

    bash qa/todo.sh qa-diseno     # levanta el entorno y deja la app en pie
    node qa/fotos-revision.js     # portada, precios, acceso, panel, en dos anchos
    node qa/fotos-scroll.js       # la portada entera por tramos

Salen en `/tmp/rev`. Existen porque revisar diseño leyendo JSX no funciona: en
la primera pasada se dieron por fallos tres cosas que no lo eran.

Y antes de empujar nada, las 36 suites:

    bash qa/todo.sh
