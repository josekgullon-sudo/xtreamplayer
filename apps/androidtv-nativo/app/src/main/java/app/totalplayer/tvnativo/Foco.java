package app.totalplayer.tvnativo;

import android.view.View;

/**
 * Que se vea dónde estás.
 *
 * En una tele no hay ratón ni dedo: lo único que dice al que mira en qué
 * elemento está es el foco. Un borde de color no basta a tres metros —se
 * pierde entre veinte carteles—, así que lo enfocado además crece un poco y
 * se pone por encima de sus vecinos.
 */
public final class Foco {

    private Foco() {}

    public static void agrandar(final View v, final float cuanto) {
        v.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override public void onFocusChange(View vista, boolean tiene) {
                vista.animate().cancel();
                vista.animate()
                        .scaleX(tiene ? cuanto : 1f)
                        .scaleY(tiene ? cuanto : 1f)
                        .setDuration(140)
                        .start();
                /*
                 * Lo enfocado crece y hay que subirlo de capa, o los vecinos
                 * lo recortan. Pero NO con bringToFront(): eso no cambia el
                 * orden de pintado, cambia el orden de los hijos de verdad.
                 * En una fila, la tarjeta enfocada se iba al último sitio y
                 * el menú se recolocaba solo —«TV en directo» acababa a la
                 * derecha del todo— y con él se perdía el camino del mando.
                 *
                 * La Z sube la capa sin tocar el orden ni la colocación.
                 */
                vista.setTranslationZ(tiene ? 8f : 0f);
            }
        });
    }

    public static void agrandar(View v) { agrandar(v, 1.06f); }
}
