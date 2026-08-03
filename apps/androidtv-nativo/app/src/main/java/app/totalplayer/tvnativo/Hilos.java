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

    /** Un mensaje entendible para el que mira la tele, no el de la excepción. */
    public static String enCristiano(Exception e) {
        if (e instanceof Acceso.NoEntra && e.getMessage() != null) return e.getMessage();
        return "No hemos podido conectar. Comprueba tu conexión y vuelve a intentarlo.";
    }
}
