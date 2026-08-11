package app.totalplayer.tvnativo;

import android.os.Handler;
import android.os.Looper;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Sacar el trabajo del hilo de la interfaz y volver a él para pintar.
 *
 * Cuatro hilos: uno solo hacía cola cuando la pantalla pide a la vez las
 * categorías, los canales y media docena de carátulas.
 */
public final class Hilos {

    public interface Trabajo<T> { T hacer() throws Exception; }

    public interface Luego<T> {
        void listo(T resultado);
        void falla(Exception e);
    }

    private static final ExecutorService PISCINA = Executors.newFixedThreadPool(3);

    /*
     * Las carátulas y los logotipos van por su cuenta.
     *
     * Compartían hilos con las peticiones de datos, y bajando deprisa por
     * las carpetas de una lista grande se encolaban decenas de imágenes por
     * delante de la petición de canales: la pantalla se quedaba en blanco
     * esperando a unos logotipos que ya no le importaban a nadie.
     */
    private static final ExecutorService PARA_IMAGENES = Executors.newFixedThreadPool(2);
    private static final Handler PANTALLA = new Handler(Looper.getMainLooper());

    private Hilos() {}

    public static <T> void fuera(Trabajo<T> trabajo, Luego<T> luego) {
        lanzar(PISCINA, trabajo, luego);
    }

    /** Lo mismo, pero en la cola de las imágenes. */
    public static <T> void fueraLento(Trabajo<T> trabajo, Luego<T> luego) {
        lanzar(PARA_IMAGENES, trabajo, luego);
    }

    private static <T> void lanzar(ExecutorService donde, final Trabajo<T> trabajo, final Luego<T> luego) {
        donde.execute(new Runnable() {
            @Override public void run() {
                try {
                    final T r = trabajo.hacer();
                    PANTALLA.post(new Runnable() {
                        @Override public void run() { luego.listo(r); }
                    });
                } catch (final Exception e) {
                    PANTALLA.post(new Runnable() {
                        @Override public void run() { luego.falla(e); }
                    });
                }
            }
        });
    }

    public static void enPantalla(Runnable r) { PANTALLA.post(r); }

    public static void enPantallaDentroDe(Runnable r, long ms) { PANTALLA.postDelayed(r, ms); }

    public static void olvidar(Runnable r) { PANTALLA.removeCallbacks(r); }

    /**
     * Un mensaje entendible para el que mira la tele, no el de la excepción.
     *
     * Y distinto según lo que haya pasado de verdad. Antes esto devolvía
     * «comprueba tu conexión» para todo: para un servidor que tarda, para un
     * panel caducado que contesta una página de aviso en vez de una lista y
     * para un fallo nuestro. El cliente miraba su router —que funcionaba— y
     * nosotros nos quedábamos sin saber qué había pasado.
     */
    public static String enCristiano(Exception e) {
        if (e instanceof Acceso.NoEntra && e.getMessage() != null) return e.getMessage();

        if (e instanceof java.net.UnknownHostException) {
            return "No se encuentra el servidor de tu proveedor.\nComprueba la conexión de la tele, o que la dirección sea la que te dieron.";
        }
        if (e instanceof java.net.SocketTimeoutException) {
            return "El servidor de tu proveedor tarda demasiado en contestar.\nSuele ser cosa de un rato: vuelve a intentarlo.";
        }
        if (e instanceof org.json.JSONException) {
            /* Un panel caducado o mal configurado contesta 200 con una página
               de aviso en HTML. Para nosotros es «no es una lista», y decir
               «comprueba tu conexión» ahí manda al cliente al sitio
               equivocado: el que tiene que mirarlo es su proveedor */
            return "Tu proveedor ha contestado algo que no es una lista de canales.\nSuele pasar cuando la suscripción ha caducado: pregúntale a quien te la dio.";
        }
        if (e instanceof javax.net.ssl.SSLException) {
            return "No hemos podido establecer una conexión segura con tu proveedor.";
        }
        if (e instanceof java.io.IOException) {
            String detalle = e.getMessage() == null ? "" : "\n(" + e.getMessage() + ")";
            return "Se ha cortado la conexión con tu proveedor." + detalle;
        }
        /* Lo que no sabemos explicar se dice tal cual: un mensaje raro que se
           puede leer por teléfono al soporte vale más que uno bonito que no
           dice nada */
        String detalle = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        return "Algo ha fallado al cargar.\n" + detalle;
    }
}
