package app.totalplayer.tvnativo;

import android.app.Activity;
import android.content.Context;
import android.graphics.Typeface;
import android.util.AttributeSet;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

/**
 * La letra de la casa, también aquí.
 *
 * La web está escrita entera en Outfit —geométrica, redonda, con una
 * personalidad que se reconoce— y esta aplicación usaba la del sistema, que
 * en un Fire TV es la de Amazon. Con los mismos colores y los mismos
 * tamaños, dos textos en dos tipografías distintas siguen leyéndose como dos
 * productos distintos: la letra es lo primero que dice de quién es una
 * pantalla, antes que el color.
 *
 * Las dos variantes —normal y negrita— van en `assets/tipos`, sacadas del
 * mismo fichero que sirve la web, así que no hay dos sitios que puedan
 * decir cosas distintas. Su licencia (SIL Open Font License) va al lado.
 *
 * Se pone con una fábrica del inflador y no recorriendo la pantalla después:
 * así la coge también lo que nace más tarde —las filas de una lista de ocho
 * mil canales, los chips de una ficha— sin tener que acordarse en cada
 * sitio. Lo poco que se construye a mano con `new TextView` se pide aparte,
 * con `aplicar`.
 *
 * Los glifos que la letra no trae —la estrella de favoritos, las flechas de
 * las pistas del mando— los pinta el sistema por su cuenta:
 * `createFromAsset` deja detrás la cadena de reserva de Android. Es lo mismo
 * que hace el navegador con esos mismos caracteres en la web, así que las
 * dos pantallas se ven igual también ahí.
 */
public final class Tipos {

    private Tipos() {}

    private static Typeface normal, negrita;

    private static void cargar(Context c) {
        if (normal != null) return;
        try {
            normal = Typeface.createFromAsset(c.getAssets(), "tipos/Outfit-Regular.ttf");
            negrita = Typeface.createFromAsset(c.getAssets(), "tipos/Outfit-Bold.ttf");
        } catch (Exception e) {
            /* Sin la letra no se rompe nada: se queda la del sistema, que es
               lo que había hasta ahora */
            normal = Typeface.DEFAULT;
            negrita = Typeface.DEFAULT_BOLD;
        }
    }

    /**
     * Se llama en `onCreate`, ANTES de `setContentView`: una fábrica puesta
     * después no ve nada de lo que ya se ha inflado.
     */
    public static void poner(Activity a) {
        cargar(a);
        final LayoutInflater inflador = a.getLayoutInflater();
        // Volver a ponerla lanzaría IllegalStateException: solo se admite una
        if (inflador.getFactory2() != null) return;
        inflador.setFactory2(new LayoutInflater.Factory2() {
            @Override public View onCreateView(View padre, String nombre, Context c, AttributeSet atributos) {
                return onCreateView(nombre, c, atributos);
            }
            @Override public View onCreateView(String nombre, Context c, AttributeSet atributos) {
                View v = construir(c, nombre, atributos);
                if (v instanceof TextView) enTexto((TextView) v);
                /* Null significa «hazlo tú»: si algo no se ha podido
                   construir aquí, el inflador sigue como siempre */
                return v;
            }
        });
    }

    /**
     * Crear el widget nosotros para poder tocarlo antes de devolverlo.
     *
     * Un nombre sin puntos es del propio Android —«TextView»— y hay que
     * probarle los dos paquetes donde viven; uno con puntos ya trae su
     * paquete escrito. `createView` no vuelve a preguntar a la fábrica, así
     * que esto no se llama a sí mismo.
     */
    private static View construir(Context c, String nombre, AttributeSet atributos) {
        LayoutInflater de = LayoutInflater.from(c);
        if (nombre.indexOf('.') < 0) {
            for (String paquete : new String[]{"android.widget.", "android.view.", "android.webkit."}) {
                try {
                    return de.createView(nombre, paquete, atributos);
                } catch (Exception e) {
                    /* No es de ese paquete: se prueba el siguiente */
                }
            }
            return null;
        }
        try {
            return de.createView(nombre, null, atributos);
        } catch (Exception e) {
            return null;
        }
    }

    /** La negrita es la letra negrita de verdad, no la normal engordada. */
    public static void enTexto(TextView t) {
        cargar(t.getContext());
        Typeface tenia = t.getTypeface();
        boolean gorda = tenia != null && tenia.isBold();
        t.setTypeface(gorda ? negrita : normal);
    }

    /** Para lo que no pasa por el inflador: diálogos y vistas hechas a mano. */
    public static void aplicar(View v) {
        if (v instanceof TextView) {
            enTexto((TextView) v);
            return;
        }
        if (v instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) v;
            for (int i = 0; i < g.getChildCount(); i++) aplicar(g.getChildAt(i));
        }
    }
}
