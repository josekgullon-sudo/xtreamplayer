package app.totalplayer.tvnativo;

import android.app.Activity;
import android.content.Intent;

/**
 * La red de seguridad de cada pantalla.
 *
 * Android mata el proceso de una aplicación que lleva un rato en segundo
 * plano si necesita la memoria, pero al volver rehace la pila de pantallas
 * tal cual estaba. Es decir: reaparece el menú, pero la sesión y el
 * catálogo —que viven en memoria— ya no están. Eso es lo que dejaba la
 * aplicación con el nombre en blanco y «no se ha podido consultar» en las
 * tres secciones, sin más salida que reinstalar.
 *
 * Con esto, cada pantalla se rehace sola desde lo guardado en disco, y si
 * ahí tampoco hay nada, vuelve a la entrada en lugar de quedarse muerta.
 */
public final class Guardia {

    private Guardia() {}

    /**
     * Llamar al principio de onCreate. Si devuelve false, la pantalla debe
     * cortar lo que estuviera haciendo: ya se está yendo a otro sitio.
     */
    public static boolean haySesion(Activity donde) {
        if (Sesion.recuperar(donde)) return true;

        Intent i = new Intent(donde, AccesoActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        donde.startActivity(i);
        donde.finish();
        return false;
    }
}
