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
        alPulsar(donde, R.id.navBuscar, new Runnable() {
            @Override public void run() {
                donde.startActivity(new Intent(donde, BuscarActivity.class));
            }
        });
        seccion(donde, R.id.navDirecto, Catalogo.DIRECTO, "TV en directo", seccionActual);
        seccion(donde, R.id.navCine, Catalogo.PELIS, "Películas", seccionActual);
        seccion(donde, R.id.navSeries, Catalogo.SERIES, "Series", seccionActual);
        caminos(donde, seccionActual);
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
        View carpetas = donde.findViewById(R.id.listaCarpetas);
        if (carpetas == null) return;
        int actual = Catalogo.PELIS.equals(seccionActual) ? R.id.navCine
                : Catalogo.SERIES.equals(seccionActual) ? R.id.navSeries
                : R.id.navDirecto;
        carpetas.setNextFocusLeftId(actual);
        for (int id : new int[]{R.id.navInicio, R.id.navDirecto, R.id.navCine, R.id.navSeries, R.id.navBuscar}) {
            View v = donde.findViewById(id);
            if (v != null) v.setNextFocusRightId(R.id.listaCarpetas);
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

    /** Enciende o apaga un destino: la pastilla, el icono y la etiqueta. */
    private static void pinta(Activity donde, int id, int idPastilla, int idIcono, int idTexto, boolean activo) {
        View v = donde.findViewById(id);
        if (v == null) return;
        View pastilla = donde.findViewById(idPastilla);
        ImageView icono = donde.findViewById(idIcono);
        TextView texto = donde.findViewById(idTexto);
        int color = donde.getResources().getColor(activo ? R.color.marca_viva : R.color.apagado);
        if (pastilla != null) pastilla.setActivated(activo);
        if (icono != null) icono.setColorFilter(color);
        if (texto != null) texto.setTextColor(color);
    }
}
