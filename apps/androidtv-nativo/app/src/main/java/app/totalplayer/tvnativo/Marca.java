package app.totalplayer.tvnativo;

import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.widget.TextView;

/**
 * El nombre de la marca, escrito siempre igual.
 *
 * «TOTAL» en blanco y «player» en rojo: eso es el logotipo, y no un cuadrado
 * con un triángulo dentro. El anterior lo era, y era el de YouTube. Escrito
 * aquí una vez, la presentación, el acceso y el buscador no pueden separarse
 * cada uno por su lado.
 */
public final class Marca {

    private Marca() {}

    public static final String NOMBRE = "TOTALplayer";
    /** Dónde acaba la parte blanca. */
    private static final int CORTE = 5;

    public static void nombre(TextView donde) {
        SpannableString texto = new SpannableString(NOMBRE);
        texto.setSpan(new ForegroundColorSpan(donde.getResources().getColor(R.color.texto)),
                0, CORTE, Spanned.SPAN_INCLUSIVE_EXCLUSIVE);
        texto.setSpan(new ForegroundColorSpan(donde.getResources().getColor(R.color.marca_viva)),
                CORTE, NOMBRE.length(), Spanned.SPAN_INCLUSIVE_EXCLUSIVE);
        donde.setText(texto);
    }
}
