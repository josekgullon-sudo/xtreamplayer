package app.totalplayer.tvnativo;

import android.app.Activity;
import android.content.Intent;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.OvershootInterpolator;
import android.widget.TextView;

/**
 * El arranque.
 *
 * Entre que se abre la aplicación y que están las listas pasan unos
 * segundos, y hasta ahora en esos segundos no había nada. Aquí entra el
 * nombre —que es el logotipo—, se abre la línea de la marca y suena un
 * acorde: es lo que separa una aplicación de una pantalla de formulario.
 *
 * Dura lo que dura el acorde y se salta con cualquier tecla, porque a la
 * décima vez que enciendes la tele ya lo has visto.
 */
public class ArranqueActivity extends Activity {

    /* Tres segundos y pico: lo que dura el acorde. Cortar la presentación
       antes de que acabe la música es peor que no tener presentación. */
    private static final long DURACION = 3400;

    private MediaPlayer acorde;
    private boolean yaVoy = false;

    private final Runnable seguir = new Runnable() {
        @Override public void run() { pasar(); }
    };

    @Override protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        setContentView(R.layout.arranque);

        final View halo = findViewById(R.id.halo);
        final TextView nombre = findViewById(R.id.nombre);
        final View linea = findViewById(R.id.linea);
        final View lema = findViewById(R.id.lema);

        // El nombre es el logotipo: «TOTAL» blanco y «player» rojo
        Marca.nombre(nombre);

        // Estado de partida: todo fuera, para que la entrada se vea
        nombre.setAlpha(0f);
        nombre.setScaleX(0.86f);
        nombre.setScaleY(0.86f);

        halo.setAlpha(0f);
        halo.setScaleX(0.7f);
        halo.setScaleY(0.7f);

        nombre.animate().alpha(1f).scaleX(1f).scaleY(1f)
                .setInterpolator(new OvershootInterpolator(1.3f))
                .setDuration(680).start();

        halo.animate().alpha(1f).scaleX(1f).scaleY(1f)
                .setInterpolator(new DecelerateInterpolator())
                .setDuration(900).start();

        /* El resplandor respira durante la espera: tres segundos de imagen
           congelada parecen la aplicación colgada, no una presentación */
        halo.postDelayed(new Runnable() {
            @Override public void run() {
                if (yaVoy) return;
                halo.animate().scaleX(1.14f).scaleY(1.14f).alpha(0.75f).setDuration(1050).start();
                halo.postDelayed(new Runnable() {
                    @Override public void run() {
                        if (yaVoy) return;
                        halo.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(1050).start();
                    }
                }, 1050);
            }
        }, 900);

        linea.animate().scaleX(1f)
                .setInterpolator(new DecelerateInterpolator())
                .setStartDelay(540).setDuration(760).start();

        lema.animate().alpha(1f)
                .setStartDelay(880).setDuration(600).start();

        sonar();
        Hilos.enPantallaDentroDe(seguir, DURACION);
    }

    private void sonar() {
        try {
            acorde = MediaPlayer.create(this, R.raw.arranque);
            if (acorde == null) return;
            acorde.setAudioStreamType(AudioManager.STREAM_MUSIC);
            /* Por debajo de la voz del sistema: es una firma, no un aviso */
            acorde.setVolume(0.55f, 0.55f);
            acorde.start();
        } catch (Throwable e) {
            // Una tele sin sonido disponible no es motivo para no arrancar
        }
    }

    private void pasar() {
        if (yaVoy) return;
        yaVoy = true;
        Hilos.olvidar(seguir);
        startActivity(new Intent(this, AccesoActivity.class));
        // Sin animación de sistema: el corte seco se nota menos que un cruce
        overridePendingTransition(0, 0);
        finish();
    }

    /** Cualquier tecla se lo salta. */
    @Override public boolean onKeyDown(int tecla, KeyEvent evento) {
        pasar();
        return true;
    }

    @Override protected void onDestroy() {
        super.onDestroy();
        Hilos.olvidar(seguir);
        if (acorde != null) {
            acorde.release();
            acorde = null;
        }
    }
}
