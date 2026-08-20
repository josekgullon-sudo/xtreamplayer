package app.totalplayer.tvnativo;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.util.List;

import app.totalplayer.comun.Descargas;

/**
 * Lo que está guardado en el aparato, para verlo sin conexión.
 *
 * Aquí no se pide nada a nadie: todo lo que se enseña está en disco o
 * bajando hacia él. Por eso esta pantalla funciona con la tele sin red, que
 * es justo para lo que existe la función.
 *
 * Se repinta sola cada segundo y medio mientras algo baje, y deja de hacerlo
 * en cuanto no queda nada bajando: sin eso, la única forma de saber en qué va
 * una descarga sería salir y volver a entrar.
 */
public class DescargasActivity extends Activity {

    /** Cada cuánto se vuelve a mirar, mientras algo baje. */
    private static final long CADA = 1500;

    private LinearLayout filas;
    private TextView vacio;
    private Descargas guardadas;
    private final Handler reloj = new Handler();
    private final Runnable repasar = new Runnable() {
        @Override public void run() { pintar(); }
    };

    @Override protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        Pantalla.colocar(this);
        setContentView(R.layout.descargas);
        if (!Guardia.haySesion(this)) return;

        filas = findViewById(R.id.filas);
        vacio = findViewById(R.id.vacio);
        guardadas = new Descargas(this);
        Navegacion.montar(this, "");
    }

    @Override protected void onResume() {
        super.onResume();
        pintar();
    }

    @Override protected void onPause() {
        super.onPause();
        reloj.removeCallbacks(repasar);
    }

    private void pintar() {
        reloj.removeCallbacks(repasar);
        List<Descargas.Cosa> cosas = guardadas.cosas();
        filas.removeAllViews();

        if (cosas.isEmpty()) {
            vacio.setText("Todavía no has guardado nada.\n\n"
                    + "En la ficha de una película, o al lado de cada episodio de una serie, "
                    + "tienes el botón de descargar. Lo que guardes se ve aquí aunque la tele "
                    + "se quede sin internet.");
            vacio.setVisibility(View.VISIBLE);
            return;
        }
        vacio.setVisibility(View.GONE);

        LayoutInflater de = LayoutInflater.from(this);
        boolean algoBajando = false;
        boolean primera = true;
        for (final Descargas.Cosa c : cosas) {
            View fila = de.inflate(R.layout.pieza_bajada, filas, false);
            ((TextView) fila.findViewById(R.id.nombre)).setText(c.nombre);
            Imagenes.cargar((ImageView) fila.findViewById(R.id.cartel), c.cartel, R.drawable.ic_cine);

            TextView estado = fila.findViewById(R.id.estado);
            ProgressBar barra = fila.findViewById(R.id.barra);
            View pulsable = fila.findViewById(R.id.fila);
            View otraVez = fila.findViewById(R.id.reintentar);

            if ("bajando".equals(c.estado)) {
                algoBajando = true;
                estado.setText("Bajando · " + c.parte + "%");
                barra.setProgress(c.parte);
                barra.setVisibility(View.VISIBLE);
                /* A medio bajar no se puede ver: media película se abre y se
                   corta a la mitad, que parece un fallo del reproductor */
                pulsable.setOnClickListener(null);
            } else if ("fallo".equals(c.estado)) {
                /* Un fallo se dice y se deja a la vista con su papelera al
                   lado: media descarga ocupando disco sin que nadie sepa que
                   está ahí es peor que el propio fallo.
                   Y se dice POR QUÉ, si se sabe: «no se ha podido terminar»
                   a secas es exactamente lo que ya se ve mirando la pantalla,
                   y no distingue el disco lleno de un corte de red */
                estado.setText(c.motivo == null || c.motivo.isEmpty()
                        ? "No se ha podido terminar"
                        : "No se ha podido terminar · " + c.motivo);
                pulsable.setOnClickListener(null);
                otraVez.setVisibility(View.VISIBLE);
                otraVez.setOnClickListener(new View.OnClickListener() {
                    @Override public void onClick(View v) {
                        guardadas.reintentar(c.id);
                        pintar();
                    }
                });
            } else {
                String cuanto = Descargas.tamano(c.bytes);
                estado.setText(cuanto.isEmpty() ? "En este aparato" : "En este aparato · " + cuanto);
                pulsable.setOnClickListener(new View.OnClickListener() {
                    @Override public void onClick(View v) {
                        /*
                         * Por su ruta y no por una dirección: está en el disco
                         * de esta tele, y el reproductor es nativo.
                         *
                         * Con `file://` delante a propósito: sin esquema,
                         * `Enlaces.completar` ve una ruta que empieza por barra,
                         * la toma por una ruta nuestra y le pega el dominio
                         * delante — y entonces se pide por internet un fichero
                         * que está aquí al lado.
                         */
                        Traspaso.reproducirSuelto("file://" + c.ruta, c.nombre, c.cartel,
                                Enlaces.PELICULA, "", "");
                        startActivity(new Intent(DescargasActivity.this, ReproductorActivity.class));
                    }
                });
            }

            fila.findViewById(R.id.quitar).setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) {
                    guardadas.quitar(c.id);
                    pintar();
                }
            });
            filas.addView(fila);
            if (primera) { pulsable.requestFocus(); primera = false; }
        }

        if (algoBajando) reloj.postDelayed(repasar, CADA);
    }
}
