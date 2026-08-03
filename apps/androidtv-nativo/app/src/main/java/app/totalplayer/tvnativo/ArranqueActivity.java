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

/**
 * El arranque.
 *
 * Entre que se abre la aplicación y que están las listas pasan unos
 * segundos, y hasta ahora en esos segundos no había nada. Aquí entra el
 * logotipo, se abre la línea de la marca y suena un acorde: es lo que
 * separa una aplicación de una pantalla de formulario.
 *
 * Dura poco menos de dos segundos y se salta con cualquier tecla, porque a
 * la décima vez que enciendes la tele ya lo has visto.
 */
public class ArranqueActivity extends Activity {

    private static final long DURACION = 1900;

    private MediaPlayer acorde;
    private boolean yaVoy = false;

    private final Runnable seguir = new Runnable() {
        @Override public void run() { pasar(); }
    };

    @Override protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        setContentView(R.layout.arranque);

        final View sello = findViewById(R.id.sello);
        final View nombre = findViewById(R.id.nombre);
        final View linea = findViewById(R.id.linea);
        final View lema = findViewById(R.id.lema);

        // Estado de partida: todo fuera, para que la entrada se vea
        sello.setAlpha(0f);
        sello.setScaleX(0.6f);
        sello.setScaleY(0.6f);
        nombre.setAlpha(0f);
        nombre.setTranslationX(-40f);

        sello.animate().alpha(1f).scaleX(1f).scaleY(1f)
                .setInterpolator(new OvershootInterpolator(1.6f))
                .setDuration(560).start();

        nombre.animate().alpha(1f).translationX(0f)
                .setInterpolator(new DecelerateInterpolator())
                .setStartDelay(230).setDuration(520).start();

        linea.animate().scaleX(1f)
                .setInterpolator(new DecelerateInterpolator())
                .setStartDelay(480).setDuration(620).start();

        lema.animate().alpha(1f)
                .setStartDelay(760).setDuration(520).start();

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
