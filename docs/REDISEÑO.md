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

### Y las de la misma aplicación en un televisor

Las de arriba eran de un teléfono. Estas son de la referencia corriendo en
un Fire Stick, que es donde se juega el partido: es el aparato con el que
el cliente ve la tele, y es la única de nuestras aplicaciones cuyo diseño
viaja dentro y no se arregla desplegando la web.

- **El carril de la tele no lleva etiquetas.** Solo iconos, en una columna
  estrechísima —cabe de sobra en 70 px—, y la sección abierta se marca con
  una línea corta debajo del icono. Nada de pastillas ni de texto: a tres
  metros el icono ya se reconoce, y las palabras solo roban ancho a lo que
  se ha venido a ver. Abajo del todo, separado, el avatar del perfil.
  **Esto se probó y no funcionó**: en nuestra tele, el icono de cine y el de
  series son los dos un rectángulo con algo dentro, y desde el sofá no hay
  quien los distinga. Llevan etiqueta de 11 puntos debajo y el carril pasa
  de 70 a 78 px. Es lo único de la referencia que se ha copiado y devuelto.
- **Cine y series no son una lista de carpetas.** Son una portada: un héroe
  a pantalla casi completa con el fondo del título, la nota en estrellas y
  en número, los géneros, el reparto, la duración, el año, la edad
  recomendada en una esquina, dos líneas de sinopsis, el botón grande de
  reproducir, el círculo del porcentaje y los puntos del carrusel. Debajo,
  las filas.
- **La fila «En tendencia» va numerada del 1 al 10**, con el número enorme
  ocupando media carátula y saliéndose del marco por abajo. La carátula con
  el foco lleva el borde de color y el título aparece debajo; las demás van
  sin título. La nota va en un chip de color en la esquina de arriba.
- **La cabecera de la fila destacada es una pastilla sólida** con el texto
  en oscuro —«EN TENDENCIA!»—, y las demás filas llevan su nombre en blanco
  y a secas. No todas las filas pesan lo mismo. *(Probado y descartado: ver
  más abajo. En nuestra portada quedaban dos manchas rojas seguidas.)*
- **El arranque es su propia pantalla, con el carril ya puesto**, y cuenta
  por dónde va con nombres de verdad: «Step 3: 2/2 · HBO». No es una barra
  girando: es el catálogo cargándose y diciéndolo.
- **La ficha de un título** es una pantalla entera, no una ventana: el
  cartel vertical a la izquierda, el título en grande, y debajo una fila de
  chips con la nota, el año, la edad, los géneros y la calidad. Luego dos
  líneas de sinopsis y dos bloques etiquetados en color —«Elenco» y
  «Géneros»— con los nombres separados por puntos. La fila de acciones lleva
  «Reproducir desde el inicio», el corazón en un círculo aparte y el círculo
  del porcentaje. En una serie, debajo va el selector de temporada en una
  píldora y la lista de episodios con su miniatura, su número, su título, su
  sinopsis y su duración. De fondo, la imagen del título difuminada.
- **Los perfiles**: «¿Quién está viendo ahora?», avatar redondo con anillo
  de color y halo cuando tiene el foco, «Agregar perfil» en un círculo con
  el borde punteado, y en las dos esquinas de arriba «Cerrar sesión» y
  «Editar» en píldoras.

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
- **El destacado no se elige, se busca.** Poner arriba «el primero que tenga
  carátula» no basta: una parte del catálogo de cualquier proveedor apunta a
  imágenes que ya no existen, y cuando le toca a la de arriba la portada abre
  con media pantalla en negro y un título flotando. Se prueban hasta ocho
  candidatos, ordenados por lo que tienen que contar —sinopsis, nota, año—, y
  el bloque no aparece hasta que una imagen ha llegado de verdad. Si no llega
  ninguna, no hay destacado y la portada empieza por las filas.
- **Y la carátula va dos veces.** Lo que manda un panel Xtream es una imagen
  vertical, no un fondo apaisado: estirada a lo ancho de la tele sale
  gigante y blanda, y eso fue lo primero que el cliente llamó feo. El banner
  se monta con cuatro capas y todas salen de la misma carátula: **reducida a
  24 puntos y vuelta a estirar**, que al ampliarla tanto queda una mancha
  suave de sus propios colores —el desenfoque de toda la vida, sin librería
  ni RenderScript, que está retirado—; la carátula de verdad a la derecha,
  200×300, que es 2:3 exacto y no le corta la cabeza a nadie; un velo sobre
  su canto izquierdo para que no se vea el corte; y dos velos más sobre todo
  el banner, uno de lado para leer encima y otro de abajo que lo funde con
  el fondo.
- **El banner va dentro del scroll, no detrás.** Fijo al fondo, con el texto
  yéndose al bajar, quedaba una imagen quieta y unas letras deslizándose por
  encima. Es un bloque más: sube y desaparece.
- **Y ocupa 300 de los 540 puntos, no más.** A pantalla completa solo cabía
  una fila debajo y no había manera de saber que existieran más. Con 300
  entra la primera entera y asoma el rótulo de la segunda, que es lo que
  hace bajar. Los carteles de la portada, por lo mismo, miden 132 y no 150.
- **Lo que se destaca tiene que ser de ahora.** Ordenando solo por la nota,
  arriba salía una comedia de 1928 con un 10 puesto a mano por el proveedor:
  técnicamente la mejor valorada del catálogo y ninguna razón para abrir la
  aplicación. Tanto el destacado como la fila «Mejor valoradas» se acotan a
  los últimos tres años, y solo se afloja si con ese filtro no quedan ni
  ocho títulos —un catálogo viejo o sin años es peor con una fila vacía—.
- **La fila de escaparate se repasa después de pintarla.** «Mejor valoradas»
  se elige de todo el catálogo, así que hay treinta candidatos para diez
  puestos: se prueban las carátulas una a una y los que no contestan se
  cambian por el siguiente. En la fila de una carpeta **no** se hace: ahí
  están los títulos que hay, y esconder la mitad porque el proveedor no les
  puso imagen es quitarle al cliente películas que sí puede ver.
- **El número del ranking va encima de la carátula, no fuera.** Medio salido
  por el lado izquierdo es como lo hacen las aplicaciones grandes, y en la
  tele no se veía ninguno: ese hueco es justo por donde pasa el carril de
  secciones.
- **Los rótulos de fila, todos en blanco.** La pastilla roja sólida del
  primero —que es lo que hace la referencia— dejaba dos manchas rojas
  seguidas con el botón de «Reproducir» del banner justo encima. Lo único de
  color en la pantalla tiene que ser lo que se puede pulsar.
- **Y el relleno del foco de una carátula, gris.** Era un tinte rojo, y en un
  televisor —que satura— la tarjeta enfocada se volvía un bloque fucsia con
  el título de debajo ilegible. Quien marca el foco es el borde.
- **El mismo título no puede salir dos veces en una fila.** La misma película
  está en «ESTRENOS» y en «ACCIÓN», y a veces la segunda copia lleva un «4K»
  detrás. En las capturas del cliente, «30 (2007)» salía en los puestos 1 y 4.
  Se comparan los títulos sin tildes, sin signos y sin las etiquetas de
  calidad; el año **no** se quita, porque «Alien (1979)» y «Alien (2017)» no
  son la misma película.
- **Un cartel que no carga tiene que seguir diciendo qué es.** El dibujo de
  reserva era el icono de cine estirado a 150×225: cuatrocientos cuadrados
  grises idénticos con un triángulo dentro. Detrás de cada carátula va ahora
  el título en pequeño, y se ve mientras la imagen no esté.
- **Su barra inferior no lleva las mismas cinco cosas que la nuestra.** Ellos
  ponen abajo *TV en vivo, Películas, Serie, Historial y Almacén*, y se llevan
  favoritos y buscar a la cabecera. Nosotros llevamos *Directo, Guía, Cine,
  Series y Favoritos*. Cuando lleguen el historial (4) y las descargas (8),
  esa barra hay que rehacerla: no caben nueve destinos en una cápsula.

### Lo que el proveedor no manda, y de dónde sale

Un panel Xtream manda el nombre, una carátula vertical y, con suerte, el año
y una nota. **No manda fondos apaisados** —y sin fondo apaisado no hay banner
que valga: lo que hay es una carátula estirada—, ni sinopsis en español, ni
géneros de verdad. La nota la trae medio catálogo puesta a 10 a mano.

Eso lo pone **TMDB**, y así se paga:

- Se pregunta **una vez por título y para toda la plataforma**. «Dune (2024)»
  la tienen todos los proveedores: se consulta una vez, no una por proveedor
  y desde luego no una por cliente. El resultado vive en `tmdb_cache`.
- Se pregunta **solo por lo que se enseña**: los ciento y pico títulos de una
  portada, nunca el catálogo entero. Recorrer treinta mil películas por
  adelantado sería la manera de convertir esto en un problema.
- **Las imágenes no pasan por nuestro servidor.** Las sirve el CDN de TMDB
  directamente al cliente. Al contrario que las carátulas del proveedor —que
  sí van por `/api/img`, porque su dirección no puede salir—, estas son
  públicas y no hay nada que esconder. Para el ancho de banda es una rebaja,
  no un gasto.
- La portada se pinta **antes** de que llegue nada de TMDB, con lo del panel,
  y se refresca sola cuando llega. Si TMDB tarda o se cae, no se nota.
- Sin `TMDB_API_KEY`, todo esto queda apagado y la aplicación se comporta
  como antes.
- Y sale el aviso que exige TMDB en sus condiciones, al final de la portada.

Lo que **no** arregla: la tendencia. TMDB sabe qué es tendencia *en el
mundo*, no qué están viendo *tus clientes*. Eso llega con el historial
(punto 4), y hasta entonces esa fila se llama «Mejor valoradas», que es lo
que de verdad es.

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

Y los puntos **1 y 3 están hechos en los tres sitios**: el reproductor web, la
aplicación de televisión —la que se empaqueta para Samsung, LG y Windows— y la
nativa de Android. Las tres comparten criterio: `lib/portada.ts` y
`Catalogo.java` son la misma idea escrita dos veces, y si se cambia una hay
que cambiar la otra.

En el reproductor web la portada sale **solo sin categoría elegida y sin
búsqueda**: en cuanto el cliente filtra por un género o escribe algo, lo que
quiere es la rejilla entera de eso y no un escaparate de diez. La rejilla de
siempre está a un botón, «Ver todo el catálogo».

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
