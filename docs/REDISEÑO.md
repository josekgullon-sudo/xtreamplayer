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
| Navegación en móvil | Cápsula flotante abajo, 5 destinos, icono en pastilla + etiqueta en color | Igual, en rojo de marca |
| Navegación en tele y escritorio | Carril vertical de iconos a la izquierda: directo, cine, series, favoritos, historial, ajustes, buscar, recargar | Igual. Sustituye a las tres columnas de hoy |
| Categorías | Columna con nombre y recuento | Igual |
| Chips | Fila arrastrable, activo sólido con texto oscuro | Igual |
| Rejilla de canales | Logotipo grande sobre su color, nombre y **qué echan ahora** con punto rojo | Igual |
| Héroe de cine y series | Fondo del título, nota en chip, géneros, reparto, sinopsis de dos líneas, botón grande, porcentaje en círculo, puntos de carrusel | Igual |
| Filas | Cabecera + «ver más», corazón arriba a la izquierda, nota arriba a la derecha | Igual |
| Historial | Dos columnas, barra de progreso, «continuar» | Nuevo: hoy solo hay «recientes» sin progreso |
| Perfiles | Círculo con avatar, anillo de color, candado en el infantil, «editar» y «cerrar sesión» en las esquinas | Hoy es un cuadrado con la inicial |
| Ajustes | Interruptores agrupados, con icono en cuadro de color | No existe |
| Descargas | Barra de almacenamiento y estado por título | No existe |

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
