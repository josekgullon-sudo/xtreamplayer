package app.totalplayer.tvnativo;

import android.app.Activity;
import android.content.Intent;
import android.view.View;
import android.widget.ImageView;
import android.widget.TextView;

/**
 * El carril de secciones, enganchado a la pantalla que sea.
 *
 * La misma pieza sirve en el televisor —una columna de iconos a la
 * izquierda— y en el teléfono —una cápsula flotando abajo—: cambian las
 * medidas y la dirección, no los identificadores ni lo que hace cada botón,
 * así que engancharlos es esto y no dos versiones de esto.
 *
 * Existe porque antes moverse entre directo, cine y series obligaba a
 * volver al menú: ATRÁS, buscar la tarjeta con las flechas y OK. Tres pasos
 * para algo que se hace veinte veces por sesión.
 */
public final class Navegacion {

    private Navegacion() {}

    /** Los cinco destinos del carril, en el orden en que se recorren. */
    private static final int[] DESTINOS = {
        R.id.navInicio, R.id.navDirecto, R.id.navCine, R.id.navSeries,
        R.id.navBajadas, R.id.navBuscar
    };
    private static final int[] ETIQUETAS = {
        R.id.navInicioTexto, R.id.navDirectoTexto, R.id.navCineTexto,
        R.id.navSeriesTexto, R.id.navBajadasTexto, R.id.navBuscarTexto
    };

    /**
     * Deja el carril listo en esta pantalla.
     *
     * `seccionActual` es la que se marca encendida —`Catalogo.DIRECTO`,
     * `PELIS`, `SERIES`, o vacío en el menú—. Ir a la sección en la que ya
     * estás no hace nada: recargar el catálogo entero por pulsar sin querer
     * el botón en el que estabas es de las cosas que más molestan con un
     * mando.
     */
    public static void montar(final Activity donde, final String seccionActual) {
        pinta(donde, R.id.navDirecto, R.id.navDirectoPastilla, R.id.navDirectoIcono, R.id.navDirectoTexto,
                Catalogo.DIRECTO.equals(seccionActual));
        pinta(donde, R.id.navCine, R.id.navCinePastilla, R.id.navCineIcono, R.id.navCineTexto,
                Catalogo.PELIS.equals(seccionActual));
        pinta(donde, R.id.navSeries, R.id.navSeriesPastilla, R.id.navSeriesIcono, R.id.navSeriesTexto,
                Catalogo.SERIES.equals(seccionActual));
        pinta(donde, R.id.navInicio, R.id.navInicioPastilla, R.id.navInicioIcono, R.id.navInicioTexto, false);
        pinta(donde, R.id.navBajadas, R.id.navBajadasPastilla, R.id.navBajadasIcono, R.id.navBajadasTexto,
                donde instanceof DescargasActivity);
        pinta(donde, R.id.navBuscar, R.id.navBuscarPastilla, R.id.navBuscarIcono, R.id.navBuscarTexto, false);

        alPulsar(donde, R.id.navInicio, new Runnable() {
            @Override public void run() {
                /* Al menú se vuelve, no se apila: si no, cada vuelta deja
                   otra copia detrás y ATRÁS tarda diez pulsaciones en salir */
                Intent i = new Intent(donde, InicioActivity.class);
                i.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                donde.startActivity(i);
                donde.finish();
            }
        });
        /* Lo guardado en el aparato. No pide nada a nadie, así que esta
           pantalla funciona con la tele sin red — que es para lo que existe */
        alPulsar(donde, R.id.navBajadas, new Runnable() {
            @Override public void run() {
                if (donde instanceof DescargasActivity) return;
                donde.startActivity(new Intent(donde, DescargasActivity.class));
            }
        });
        alPulsar(donde, R.id.navBuscar, new Runnable() {
            @Override public void run() {
                donde.startActivity(new Intent(donde, BuscarActivity.class));
            }
        });
        seccion(donde, R.id.navDirecto, Catalogo.DIRECTO, "TV en directo", seccionActual);
        seccion(donde, R.id.navCine, Catalogo.PELIS, "Películas", seccionActual);
        seccion(donde, R.id.navSeries, Catalogo.SERIES, "Series", seccionActual);
        caminos(donde, seccionActual);
        abreYCierra(donde);
    }

    /**
     * Cerrado son cinco iconos; abierto, sus nombres.
     *
     * Es lo que hace YouTube en la tele, y es lo que se pidió: la columna
     * ocupa 78 puntos que le está quitando al contenido para enseñar cinco
     * palabras que solo hacen falta en el momento de cambiar de sección. En
     * cuanto el mando entra en el carril con ◀ se abre, y al salir se cierra.
     *
     * Se mira si el foco sigue en ALGUNO de los cinco y no solo en el que
     * acaba de perderlo: moviéndose de «Cine» a «Series» hay un instante en
     * que ninguno lo tiene, y comprobándolo en ese instante el carril se
     * cerraba y se volvía a abrir en cada pulsación. Por eso la comprobación
     * va en un `post`, cuando el foco ya ha llegado a su sitio.
     *
     * En un teléfono el carril no es una columna sino la cápsula de abajo, y
     * ahí no hay nada que abrir: `carril_en_columna` lo dice.
     */
    private static void abreYCierra(final Activity donde) {
        if (!donde.getResources().getBoolean(R.bool.carril_en_columna)) return;
        final View carril = donde.findViewById(R.id.carril);
        if (carril == null) return;
        View.OnFocusChangeListener oreja = new View.OnFocusChangeListener() {
            @Override public void onFocusChange(View v, boolean tiene) {
                carril.post(new Runnable() {
                    @Override public void run() { pintaCarril(donde, carril); }
                });
            }
        };
        for (int id : DESTINOS) {
            View v = donde.findViewById(id);
            if (v != null) v.setOnFocusChangeListener(oreja);
        }
        pintaCarril(donde, carril);
    }

    /**
     * Enseña los nombres cuando el mando está en la barra, y solo entonces.
     *
     * Ya no cambia el tamaño de nada: con la barra arriba el nombre va al
     * lado del icono, así que lo que crece es cada botón hacia la derecha y
     * la altura se queda igual. Cuando era una columna había que ensancharla
     * a mano, y ese ensanchado por encima del contenido es lo que se ha ido
     * con el carril.
     *
     * GONE y no INVISIBLE, al revés que antes: en columna el hueco tenía que
     * estar reservado para que el icono no saltara de sitio; en fila lo que
     * se quiere es justo lo contrario — cerrada la barra son seis dibujos
     * juntos, y con seis huecos de texto vacíos quedarían desperdigados de
     * lado a lado de la pantalla.
     */
    private static void pintaCarril(Activity donde, View carril) {
        boolean dentro = false;
        for (int id : DESTINOS) {
            View v = donde.findViewById(id);
            if (v != null && v.hasFocus()) { dentro = true; break; }
        }
        for (int id : ETIQUETAS) {
            View t = donde.findViewById(id);
            if (t != null) t.setVisibility(dentro ? View.VISIBLE : View.GONE);
        }
    }

    /**
     * Por dónde entra y sale el foco del carril.
     *
     * Escrito a mano y no dejado a la geometría. Un RecyclerView atiende él
     * mismo la búsqueda de foco y, al pulsar ◀ desde la primera columna, se
     * lo quedaba: el carril se veía, se entendía y no había manera de llegar
     * a él con el mando. Con la aplicación en la tele eso significaba que
     * desde el directo no se podía ir a cine ni a series de ninguna forma.
     *
     * Al entrar se cae en la sección donde estás —no en la primera—, que es
     * de donde se sale con ▶ sin haber tocado nada.
     */
    private static void caminos(Activity donde, String seccionActual) {
        /*
         * A qué se baja desde la barra: a lo primero que hay debajo de ella.
         *
         * En el directo eso son los canales —las carpetas se han ido a una
         * tira debajo del vídeo, al otro lado de la pantalla— y en cine y
         * series sigue siendo la lista de carpetas. Se pregunta por la de
         * canales primero y se cae a la otra: así una pantalla no necesita
         * saber en cuál de las dos está.
         */
        View abajo = donde.findViewById(R.id.listaCanales);
        if (abajo == null) abajo = donde.findViewById(R.id.listaCarpetas);
        if (abajo == null) return;
        int actual = Catalogo.PELIS.equals(seccionActual) ? R.id.navCine
                : Catalogo.SERIES.equals(seccionActual) ? R.id.navSeries
                : R.id.navDirecto;
        /* Con la barra arriba se entra con ▲ y se sale con ▼. Cuando era una
           columna era ◀ y ▶; el gesto cambia con el sitio, que es lo que
           espera cualquiera */
        abajo.setNextFocusUpId(actual);
        int aDonde = abajo.getId();
        for (int id : DESTINOS) {
            View v = donde.findViewById(id);
            if (v != null) v.setNextFocusDownId(aDonde);
        }
    }

    private static void seccion(final Activity donde, int id, final String seccion,
                                final String titulo, final String actual) {
        if (seccion.equals(actual)) {
            // Ya estás aquí: el botón se queda de adorno, marcando dónde estás
            View v = donde.findViewById(id);
            if (v != null) v.setOnClickListener(null);
            return;
        }
        alPulsar(donde, id, new Runnable() {
            @Override public void run() {
                /* Cine y series entran por su portada, no por la lista de
                   carpetas: las carpetas siguen a un OK de cada rótulo */
                Intent i = new Intent(donde,
                        Catalogo.DIRECTO.equals(seccion) ? DirectoActivity.class : PortadaActivity.class);
                i.putExtra("seccion", seccion);
                i.putExtra("titulo", titulo);
                donde.startActivity(i);
                donde.finish();
            }
        });
    }

    private static void alPulsar(Activity donde, int id, final Runnable que) {
        View v = donde.findViewById(id);
        if (v == null) return;
        v.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View x) { que.run(); }
        });
    }

    /**
     * Marca en qué sección estás. Con la raya, no con el color.
     *
     * El icono y el nombre de la sección abierta iban en rojo, y eso son dos
     * cosas distintas dichas con el mismo color: el rojo de «estás aquí» y el
     * rojo de «esto se pulsa». Ahora lo dice la raya de al lado del icono, y
     * el color se queda donde significa algo. Es la misma decisión que se
     * tomó en el web.
     */
    private static void pinta(Activity donde, int id, int idPastilla, int idIcono, int idTexto, boolean activo) {
        View v = donde.findViewById(id);
        if (v == null) return;
        View pastilla = donde.findViewById(idPastilla);
        ImageView icono = donde.findViewById(idIcono);
        TextView texto = donde.findViewById(idTexto);
        int color = donde.getResources().getColor(activo ? R.color.texto : R.color.apagado);
        if (pastilla != null) pastilla.setActivated(activo);
        if (icono != null) icono.setColorFilter(color);
        if (texto != null) texto.setTextColor(color);
    }
}
