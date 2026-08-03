package app.totalplayer.tvnativo;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import java.util.List;

/**
 * TV en directo: carpetas, canales y una ventana con lo que suena.
 *
 * El primer OK pone el canal en la ventana; el segundo, sobre el mismo
 * canal, lo lleva a pantalla completa. Así se puede ir mirando qué dan sin
 * perder la lista, que es lo que se hace de verdad al zapear.
 */
public class DirectoActivity extends Activity {

    private RecyclerView listaCarpetas, listaCanales;
    private AdaptadorCarpetas carpetas;
    private AdaptadorCanales canales;
    private TextView tituloCarpeta, nombreCanal, ahora, luego, pista, comoAmpliar, vacio;
    private ProgressBar girando;
    private PlayerView vista;
    private ExoPlayer reproductor;

    private String sonando = "";
    private Runnable pendiente;

    @Override protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        setContentView(R.layout.directo);

        listaCarpetas = findViewById(R.id.listaCarpetas);
        listaCanales = findViewById(R.id.listaCanales);
        tituloCarpeta = findViewById(R.id.tituloCarpeta);
        nombreCanal = findViewById(R.id.nombreCanal);
        ahora = findViewById(R.id.ahora);
        luego = findViewById(R.id.luego);
        pista = findViewById(R.id.pista);
        comoAmpliar = findViewById(R.id.comoAmpliar);
        vacio = findViewById(R.id.vacio);
        girando = findViewById(R.id.girando);
        vista = findViewById(R.id.vista);
        vista.setUseController(false);

        listaCarpetas.setLayoutManager(new LinearLayoutManager(this));
        listaCanales.setLayoutManager(new LinearLayoutManager(this));
        listaCarpetas.setItemAnimator(null);
        listaCanales.setItemAnimator(null);

        carpetas = new AdaptadorCarpetas(new AdaptadorCarpetas.AlPosarse() {
            @Override public void en(int posicion) { abrirCarpeta(posicion); }
        });
        canales = new AdaptadorCanales(new AdaptadorCanales.AlElegir() {
            @Override public void canal(int posicion) { elegir(posicion); }
        });
        listaCarpetas.setAdapter(carpetas);
        listaCanales.setAdapter(canales);

        cargarCarpetas();
    }

    private void cargarCarpetas() {
        girando.setVisibility(View.VISIBLE);
        pista.setText("Cargando tus canales…");
        Hilos.fuera(new Hilos.Trabajo<List<Catalogo.Carpeta>>() {
            @Override public List<Catalogo.Carpeta> hacer() throws Exception {
                return Catalogo.carpetas(Catalogo.DIRECTO);
            }
        }, new Hilos.Luego<List<Catalogo.Carpeta>>() {
            @Override public void listo(List<Catalogo.Carpeta> lista) {
                girando.setVisibility(View.GONE);
                if (lista.isEmpty()) {
                    pista.setText("Tu lista no trae canales en directo.");
                    return;
                }
                carpetas.poner(lista);
                pista.setText("Elige un canal de la lista");
                abrirCarpeta(0);
                listaCarpetas.requestFocus();
            }
            @Override public void falla(Exception e) {
                girando.setVisibility(View.GONE);
                pista.setText(Hilos.enCristiano(e));
            }
        });
    }

    /**
     * Cambiar de carpeta al mover el foco, pero no en el acto: bajando
     * deprisa por veinte carpetas se dispararían veinte peticiones y solo
     * importa la última.
     */
    private void abrirCarpeta(final int cual) {
        final Catalogo.Carpeta carpeta = carpetas.cual(cual);
        if (carpeta == null) return;
        carpetas.marcar(cual);
        tituloCarpeta.setText(carpeta.nombre);

        if (pendiente != null) Hilos.olvidar(pendiente);
        pendiente = new Runnable() {
            @Override public void run() {
                Hilos.fuera(new Hilos.Trabajo<List<Catalogo.Item>>() {
                    @Override public List<Catalogo.Item> hacer() throws Exception {
                        return Catalogo.contenido(Catalogo.DIRECTO, carpeta.id);
                    }
                }, new Hilos.Luego<List<Catalogo.Item>>() {
                    @Override public void listo(List<Catalogo.Item> lista) {
                        // Se puede haber cambiado de carpeta mientras llegaba
                        if (!carpeta.nombre.contentEquals(tituloCarpeta.getText())) return;
                        canales.poner(lista);
                        canales.sonando(sonando);
                        listaCanales.scrollToPosition(0);
                        vacio.setVisibility(lista.isEmpty() ? View.VISIBLE : View.GONE);
                    }
                    @Override public void falla(Exception e) {
                        canales.poner(new java.util.ArrayList<Catalogo.Item>());
                        vacio.setText(Hilos.enCristiano(e));
                        vacio.setVisibility(View.VISIBLE);
                    }
                });
            }
        };
        Hilos.enPantallaDentroDe(pendiente, 220);
    }

    private void elegir(int posicion) {
        List<Catalogo.Item> lista = canales.datos();
        if (posicion < 0 || posicion >= lista.size()) return;
        Catalogo.Item canal = lista.get(posicion);

        // Segundo OK sobre el que ya suena: a pantalla completa
        if (canal.id.equals(sonando)) {
            Traspaso.reproducir(lista, posicion);
            startActivity(new Intent(this, ReproductorActivity.class));
            return;
        }

        sonando = canal.id;
        canales.sonando(sonando);
        nombreCanal.setText(canal.nombre);
        ahora.setText("");
        luego.setText("");
        pista.setVisibility(View.GONE);
        comoAmpliar.setVisibility(View.VISIBLE);
        girando.setVisibility(View.VISIBLE);
        ponerEnLaVentana(canal);
        pedirGuia(canal);
    }

    private void ponerEnLaVentana(Catalogo.Item canal) {
        if (reproductor == null) {
            reproductor = Reproduccion.nuevo(this);
            vista.setPlayer(reproductor);
            reproductor.addListener(new Player.Listener() {
                @Override public void onPlaybackStateChanged(int estado) {
                    girando.setVisibility(estado == Player.STATE_BUFFERING ? View.VISIBLE : View.GONE);
                }
                @Override public void onPlayerError(PlaybackException error) {
                    girando.setVisibility(View.GONE);
                    pista.setText(Reproduccion.porQue(error));
                    pista.setVisibility(View.VISIBLE);
                }
            });
        }
        reproductor.setMediaItem(MediaItem.fromUri(canal.url));
        reproductor.prepare();
        reproductor.play();
    }

    private void pedirGuia(final Catalogo.Item canal) {
        Hilos.fuera(new Hilos.Trabajo<String[]>() {
            @Override public String[] hacer() { return Catalogo.guia(canal.id); }
        }, new Hilos.Luego<String[]>() {
            @Override public void listo(String[] par) {
                if (par == null || !canal.id.equals(sonando)) return;
                ahora.setText(par[0].isEmpty() ? "" : par[0]);
                luego.setText(par[1].isEmpty() ? "" : "Después: " + par[1]);
            }
            @Override public void falla(Exception e) { /* la guía es un extra */ }
        });
    }

    /** Atrás: de los canales a las carpetas, y solo entonces al menú. */
    @Override public void onBackPressed() {
        if (listaCanales.hasFocus()) {
            listaCarpetas.requestFocus();
            return;
        }
        super.onBackPressed();
    }

    @Override protected void onStop() {
        super.onStop();
        if (reproductor != null) reproductor.pause();
    }

    @Override protected void onDestroy() {
        super.onDestroy();
        if (pendiente != null) Hilos.olvidar(pendiente);
        if (reproductor != null) {
            reproductor.release();
            reproductor = null;
        }
    }
}
