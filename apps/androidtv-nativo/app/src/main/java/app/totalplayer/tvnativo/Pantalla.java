package app.totalplayer.tvnativo;

import android.app.Activity;
import android.app.UiModeManager;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.view.View;

/**
 * Dónde se está viendo esto: una tele o un teléfono.
 *
 * La misma aplicación sirve para las dos porque lo que las diferencia son
 * las pantallas, no el motor: el acceso, el catálogo, los favoritos y el
 * reproductor son idénticos. Lo que cambia es que en una tele hay tres
 * columnas y un mando, y en un teléfono hay una columna y un dedo.
 *
 * Los diseños de tele viven en res/layout-sw540dp —una tele de 1080p mide
 * 540 puntos por su lado corto— y los de teléfono en res/layout, que es
 * donde cae cualquier pantalla más estrecha. Aquí solo se decide lo que no
 * se puede decir con carpetas: la orientación y el modo de navegar.
 */
public final class Pantalla {

    private Pantalla() {}

    /** Una tele: modo televisión, o simplemente una pantalla ancha sin dedos. */
    public static boolean esTele(Context c) {
        UiModeManager modo = (UiModeManager) c.getSystemService(Context.UI_MODE_SERVICE);
        if (modo != null && modo.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION) return true;
        // Un aparato sin pantalla táctil y ancho es una tele aunque no lo diga
        return !c.getPackageManager().hasSystemFeature("android.hardware.touchscreen")
                && c.getResources().getConfiguration().smallestScreenWidthDp >= 540;
    }

    /** Un teléfono: pantalla estrecha, se maneja con el dedo. */
    public static boolean esMovil(Context c) {
        return c.getResources().getConfiguration().smallestScreenWidthDp < 540;
    }

    /**
     * En la tele, apaisado siempre; en el teléfono, lo que quiera el que
     * mira. Antes estaba clavado en apaisado en el manifiesto, que en un
     * teléfono obliga a girarlo para leer una lista de canales.
     */
    public static void colocar(Activity a) {
        a.setRequestedOrientation(esMovil(a)
                ? ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                : ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
    }

    /** El vídeo se ve apaisado, también en el teléfono. */
    public static void apaisado(Activity a) {
        a.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
    }

    /**
     * Esconder o devolver las barras del sistema mientras dura el vídeo.
     *
     * En la tele el tema ya es de pantalla completa y esto no hace nada.
     * En el teléfono no lo es a propósito: taparlas todo el rato dejaba la
     * aplicación dibujando por debajo de la hora y del agujero de la cámara.
     * Pero un canal a pantalla completa con la barra de estado encima no es
     * pantalla completa, así que se quitan aquí y se devuelven al salir.
     */
    public static void pantallaCompleta(Activity a, boolean si) {
        View decorado = a.getWindow().getDecorView();
        if (!si) {
            decorado.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
            return;
        }
        decorado.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }
}
