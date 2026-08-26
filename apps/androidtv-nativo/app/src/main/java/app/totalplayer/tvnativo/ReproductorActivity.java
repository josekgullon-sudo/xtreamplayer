package app.totalplayer.tvnativo;

import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.util.Locale;

import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Pantalla completa.
 *
 * Solo para películas y episodios. El directo no pasa por aquí: se expande
 * en su propia pantalla para que el canal no tenga que arrancar de cero.
 *
 * El cartel con el título sale al empezar y se va solo: tener información
 * encima de la imagen todo el rato es lo que hace que la gente cierre la
 * aplicación.
 */
public class ReproductorActivity extends Activity {

    private ExoPlayer reproductor;
    private PlayerView vista;
    private View cartelito;
    private TextView nombre, ahora, reloj, error;
    private ImageView logo, teclaPausa;
    private ProgressBar girando, avance;
    private View mandos;
    private TextView vaPor, dura;

    /** Refresca la barra de una película mientras los mandos están a la vista. */
    private final Runnable contar = new Runnable() {
        @Override public void run() {
            if (reproductor != null && reproductor.getDuration() > 0) {
                long total = reproductor.getDuration();
                long va = Math.max(0, reproductor.getCurrentPosition());
                avance.setProgress((int) (va * 1000 / total));
                avance.setSecondaryProgress((int) (reproductor.getBufferedPosition() * 1000 / total));
                vaPor.setText(reloj(va));
                dura.setText(reloj(total));
            }
            Hilos.enPantallaDentroDe(this, 500);
        }
    };

    private final Runnable esconder = new Runnable() {
        @Override public void run() {
            cartelito.animate().alpha(0f).setDuration(300).start();
            /* Los mandos de una película también se van: tapan la imagen.
               Y se van de verdad, no solo transparentes: con un botón
               invisible pero enfocado, el primer OK dispararía la pausa en
               vez de sacar los mandos, que es lo que espera cualquiera */
            if (!Traspaso.esDirecto && mandos != null) mandos.setVisibility(View.INVISIBLE);
        }
    };

    @Override protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        // El vídeo se ve apaisado, también en el teléfono
        Pantalla.apaisado(this);
        /* Y sin barras del sistema encima. En la tele el tema ya es de
           pantalla completa; en el teléfono no lo es —taparlas todo el rato
           dejaba las cabeceras por debajo del reloj—, así que se piden aquí,
           que es donde de verdad hacen falta */
        Pantalla.pantallaCompleta(this, true);
        Tipos.poner(this);
        setContentView(R.layout.reproductor);
        // Ver la tele con el salvapantallas saltando a los dos minutos
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        vista = findViewById(R.id.vista);
        cartelito = findViewById(R.id.cartelito);
        nombre = findViewById(R.id.nombre);
        ahora = findViewById(R.id.ahora);
        reloj = findViewById(R.id.reloj);
        logo = findViewById(R.id.logo);
        error = findViewById(R.id.error);
        girando = findViewById(R.id.girando);
        mandos = findViewById(R.id.mandos);
        avance = findViewById(R.id.avance);
        vaPor = findViewById(R.id.vaPor);
        dura = findViewById(R.id.dura);
        teclaPausa = findViewById(R.id.teclaPausa);

        reproductor = Reproduccion.nuevo(this);
        vista.setPlayer(reproductor);
        /*
         * Nunca los mandos de serie de ExoPlayer: se pintan con el foco del
         * sistema, un recuadro verde chillón en mitad de la pantalla, que es
         * lo que salía al abrir un episodio. Los de una película son los
         * nuestros; el directo no lleva ninguno, porque no hay nada que
         * rebobinar.
         */
        vista.setUseController(false);
        if (!Traspaso.esDirecto) prepararMandos();
        reproductor.addListener(new Player.Listener() {
            @Override public void onPlaybackStateChanged(int estado) {
                girando.setVisibility(estado == Player.STATE_BUFFERING ? View.VISIBLE : View.GONE);
                if (estado == Player.STATE_READY) error.setVisibility(View.GONE);
            }
            @Override public void onPlayerError(PlaybackException fallo) {
                girando.setVisibility(View.GONE);
                /* Dicho para lo que se está intentando poner: «este canal» en
                   una película se lee como que ni sabemos qué estamos abriendo */
                error.setText(Reproduccion.porQue(fallo, queEs()));
                error.setVisibility(View.VISIBLE);
            }
        });

        poner();
    }

    private void prepararMandos() {
        mandos.setVisibility(View.VISIBLE);
        findViewById(R.id.teclaAtras).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { saltar(-10_000); }
        });
        findViewById(R.id.teclaAlante).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { saltar(30_000); }
        });
        teclaPausa.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { pausarOSeguir(); }
        });
        teclaPausa.requestFocus();
        contar.run();
    }

    /** Adelantar o retroceder sin pasarse de los extremos. */
    private void saltar(long cuanto) {
        if (reproductor == null) return;
        long donde = reproductor.getCurrentPosition() + cuanto;
        long total = reproductor.getDuration();
        if (donde < 0) donde = 0;
        if (total > 0 && donde > total - 1000) donde = total - 1000;
        reproductor.seekTo(donde);
        asomar();
    }

    private void pausarOSeguir() {
        if (reproductor == null) return;
        boolean sonando = reproductor.isPlaying();
        if (sonando) reproductor.pause(); else reproductor.play();
        teclaPausa.setImageResource(sonando ? R.drawable.ic_play : R.drawable.ic_pausa);
        asomar();
    }

    /** mm:ss, o h:mm:ss cuando la película pasa de la hora. */
    private static String reloj(long ms) {
        long s = ms / 1000;
        long h = s / 3600, m = (s % 3600) / 60, seg = s % 60;
        return h > 0
                ? String.format(Locale.getDefault(), "%d:%02d:%02d", h, m, seg)
                : String.format(Locale.getDefault(), "%d:%02d", m, seg);
    }

    private void sacarMandos() {
        mandos.setVisibility(View.VISIBLE);
        teclaPausa.requestFocus();
    }

    /** Vuelve a enseñar el cartel y lo esconde a los cinco segundos. */
    private void asomar() {
        cartelito.animate().cancel();
        cartelito.setAlpha(1f);
        Hilos.olvidar(esconder);
        Hilos.enPantallaDentroDe(esconder, 5000);
    }

    private void poner() {
        error.setVisibility(View.GONE);
        girando.setVisibility(View.VISIBLE);
        nombre.setText(Traspaso.titulo);
        ahora.setText("");
        reloj.setText(new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date()));
        Imagenes.cargar(logo, Traspaso.logo, R.drawable.ic_tv);

        asomar();
        if (!Traspaso.esDirecto) sacarMandos();

        /* La dirección se pide ahora, no cuando se pintó la lista: con lista
           de la plataforma no baja al aparato con el catálogo */
        Hilos.fuera(new Hilos.Trabajo<String>() {
            @Override public String hacer() throws Exception {
                return Enlaces.paraVer(Traspaso.clase, Traspaso.id, Traspaso.extension, Traspaso.url);
            }
        }, new Hilos.Luego<String>() {
            @Override public void listo(String direccion) {
                if (reproductor == null) return;
                reproductor.setMediaItem(MediaItem.fromUri(direccion));
                reproductor.prepare();
                reproductor.play();
            }
            @Override public void falla(Exception e) {
                girando.setVisibility(View.GONE);
                error.setText(Hilos.enCristiano(e));
                error.setVisibility(View.VISIBLE);
            }
        });

        if (Traspaso.esDirecto && Traspaso.cola != null) pedirGuia();
    }

    /** Cómo se llama lo que se está intentando poner. Ver `Reproduccion.porQue`. */
    private String queEs() {
        if (Traspaso.esDirecto) return "canal";
        return Enlaces.EPISODIO.equals(Traspaso.clase) ? "episodio" : "película";
    }

    private void pedirGuia() {
        final Catalogo.Item canal = Traspaso.cola.get(Traspaso.posicion);
        Hilos.fuera(new Hilos.Trabajo<String>() {
            @Override public String hacer() { return Catalogo.enAntena(canal.id); }
        }, new Hilos.Luego<String>() {
            @Override public void listo(String enAntena) {
                if (enAntena == null || enAntena.isEmpty()) return;
                // Se puede haber zapeado mientras llegaba
                if (Traspaso.cola == null || !canal.id.equals(Traspaso.cola.get(Traspaso.posicion).id)) return;
                ahora.setText(enAntena);
            }
            @Override public void falla(Exception e) { /* la guía es un extra */ }
        });
    }

    /** Zapear: arriba y abajo cambian de canal dentro de la carpeta abierta. */
    private void zapear(int aDonde) {
        if (Traspaso.cola == null || Traspaso.cola.isEmpty()) return;
        int cuantos = Traspaso.cola.size();
        // Da la vuelta: al final de la lista, el siguiente es el primero
        Traspaso.posicion = ((Traspaso.posicion + aDonde) % cuantos + cuantos) % cuantos;
        Traspaso.reproducir(Traspaso.cola, Traspaso.posicion);
        poner();
    }

    @Override public boolean onKeyDown(int tecla, KeyEvent evento) {
        if (!Traspaso.esDirecto) {
            // Con la imagen tapada, lo primero que hace cualquiera es sacar
            // los mandos: cualquier tecla los devuelve
            if (mandos.getVisibility() != View.VISIBLE) {
                sacarMandos();
                asomar();
                return true;
            }
            switch (tecla) {
                case KeyEvent.KEYCODE_MEDIA_REWIND:
                    saltar(-10_000);
                    return true;
                case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                    saltar(30_000);
                    return true;
                case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                case KeyEvent.KEYCODE_MEDIA_PLAY:
                case KeyEvent.KEYCODE_MEDIA_PAUSE:
                    pausarOSeguir();
                    return true;
                default:
                    break;
            }
        }
        if (Traspaso.esDirecto) {
            switch (tecla) {
                case KeyEvent.KEYCODE_DPAD_UP:
                case KeyEvent.KEYCODE_CHANNEL_UP:
                    zapear(-1);
                    return true;
                case KeyEvent.KEYCODE_DPAD_DOWN:
                case KeyEvent.KEYCODE_CHANNEL_DOWN:
                    zapear(1);
                    return true;
                case KeyEvent.KEYCODE_DPAD_CENTER:
                case KeyEvent.KEYCODE_ENTER:
                    // OK enseña otra vez qué se está viendo
                    asomar();
                    return true;
                default:
                    break;
            }
        }
        return super.onKeyDown(tecla, evento);
    }

    @Override protected void onStop() {
        super.onStop();
        if (reproductor != null) reproductor.pause();
    }

    @Override protected void onDestroy() {
        super.onDestroy();
        Hilos.olvidar(esconder);
        Hilos.olvidar(contar);
        if (reproductor != null) {
            reproductor.release();
            reproductor = null;
        }
    }
}
