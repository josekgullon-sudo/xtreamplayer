package app.totalplayer.tvnativo;

import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
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
    private TextView etiquetaAhora, etiquetaLuego, cuantos;
    private View bloqueVacio, columnaCarpetas, columnaCanales, columnaVideo, bloqueInfo;
    /** A pantalla completa se esconde todo menos el vídeo. */
    private boolean aPantallaCompleta = false;
    private View caja;
    private ProgressBar girando;
    private PlayerView vista;
    private ExoPlayer reproductor;

    private String sonando = "";
    private Runnable pendiente;

    @Override protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        setContentView(R.layout.directo);
        if (!Guardia.haySesion(this)) return;

        listaCarpetas = findViewById(R.id.listaCarpetas);
        listaCanales = findViewById(R.id.listaCanales);
        tituloCarpeta = findViewById(R.id.tituloCarpeta);
        nombreCanal = findViewById(R.id.nombreCanal);
        ahora = findViewById(R.id.ahora);
        luego = findViewById(R.id.luego);
        pista = findViewById(R.id.pista);
        comoAmpliar = findViewById(R.id.comoAmpliar);
        vacio = findViewById(R.id.vacio);
        bloqueVacio = findViewById(R.id.bloqueVacio);
        columnaCarpetas = findViewById(R.id.columnaCarpetas);
        columnaCanales = findViewById(R.id.columnaCanales);
        columnaVideo = findViewById(R.id.columnaVideo);
        bloqueInfo = findViewById(R.id.bloqueInfo);
        findViewById(R.id.botonReintentar).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                // Tirar lo guardado y empezar de cero: si el fallo fue del
                // servidor, lo que hay en memoria puede estar a medias
                Catalogo.olvidarSeccion(Catalogo.DIRECTO);
                bloqueVacio.setVisibility(View.GONE);
                cargarCarpetas();
            }
        });
        girando = findViewById(R.id.girando);
        cuantos = findViewById(R.id.cuantos);
        etiquetaAhora = findViewById(R.id.etiquetaAhora);
        etiquetaLuego = findViewById(R.id.etiquetaLuego);
        caja = findViewById(R.id.caja);
        vista = findViewById(R.id.vista);
        vista.setUseController(false);

        /* El vídeo es 16:9 y la caja tiene que serlo también. Dejándola
           estirarse hasta abajo, salía con dos franjas negras enormes que
           parecían un fallo de la imagen */
        caja.post(new Runnable() {
            @Override public void run() {
                ViewGroup.LayoutParams medidas = caja.getLayoutParams();
                medidas.height = caja.getWidth() * 9 / 16;
                caja.setLayoutParams(medidas);
            }
        });

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
                    pista.setVisibility(View.VISIBLE);
                    return;
                }
                pista.setVisibility(View.VISIBLE);
                carpetas.poner(lista);
                pista.setText("Elige un canal de la lista");
                abrirCarpeta(0);
                listaCarpetas.requestFocus();
            }
            @Override public void falla(Exception e) {
                girando.setVisibility(View.GONE);
                pista.setText(Hilos.enCristiano(e));
                pista.setVisibility(View.VISIBLE);
                // Con las carpetas caídas no hay nada que enfocar salvo esto
                vacio.setText(Hilos.enCristiano(e));
                bloqueVacio.setVisibility(View.VISIBLE);
                findViewById(R.id.botonReintentar).requestFocus();
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
        cuantos.setText("");

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
                        canales.sonando(listaCanales, sonando, null);
                        cuantos.setText(String.valueOf(lista.size()));
                        vacio.setText("Esta carpeta no tiene canales.");
                        listaCanales.scrollToPosition(0);
                        bloqueVacio.setVisibility(lista.isEmpty() ? View.VISIBLE : View.GONE);
                    }
                    @Override public void falla(Exception e) {
                        /* Sin tocar lo que ya estuviera puesto: vaciar la
                           lista por un corte de un segundo deja al que mira
                           peor que antes de pulsar */
                        vacio.setText(Hilos.enCristiano(e));
                        bloqueVacio.setVisibility(View.VISIBLE);
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
            expandir();
            return;
        }

        sonando = canal.id;
        canales.sonando(listaCanales, sonando, "");
        nombreCanal.setText(canal.nombre);
        ahora.setText("");
        luego.setText("");
        etiquetaAhora.setVisibility(View.GONE);
        etiquetaLuego.setVisibility(View.GONE);
        pista.setVisibility(View.GONE);
        comoAmpliar.setVisibility(View.VISIBLE);
        girando.setVisibility(View.VISIBLE);
        ponerEnLaVentana(canal);
        pedirGuia(canal);
    }

    /**
     * A pantalla completa sin volver a cargar nada.
     *
     * Antes esto abría otra pantalla con otro reproductor, así que el canal
     * arrancaba de cero: unos segundos de negro y a empezar otra vez, como
     * si hubieras cambiado de canal. Lo que se espera es que el vídeo se
     * abra, no que se reinicie. Como el reproductor y su vista no se tocan
     * —solo se esconde lo que hay alrededor y la caja pasa a ocuparlo
     * todo—, la imagen no se corta ni un fotograma.
     */
    private void expandir() {
        aPantallaCompleta = true;
        columnaCarpetas.setVisibility(View.GONE);
        columnaCanales.setVisibility(View.GONE);
        bloqueInfo.setVisibility(View.GONE);
        columnaVideo.setPadding(0, 0, 0, 0);

        ViewGroup.LayoutParams medidas = caja.getLayoutParams();
        medidas.height = ViewGroup.LayoutParams.MATCH_PARENT;
        caja.setLayoutParams(medidas);

        // Que el mando no se quede sin sitio donde estar
        columnaVideo.setFocusable(true);
        columnaVideo.requestFocus();
    }

    private void encoger() {
        aPantallaCompleta = false;
        columnaCarpetas.setVisibility(View.VISIBLE);
        columnaCanales.setVisibility(View.VISIBLE);
        bloqueInfo.setVisibility(View.VISIBLE);
        int p = (int) (22 * getResources().getDisplayMetrics().density);
        columnaVideo.setPadding(p, p, p, p);
        columnaVideo.setFocusable(false);

        caja.post(new Runnable() {
            @Override public void run() {
                ViewGroup.LayoutParams medidas = caja.getLayoutParams();
                medidas.height = caja.getWidth() * 9 / 16;
                caja.setLayoutParams(medidas);
                listaCanales.requestFocus();
            }
        });
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
                if (!par[0].isEmpty()) {
                    etiquetaAhora.setVisibility(View.VISIBLE);
                    ahora.setText(par[0]);
                }
                if (!par[1].isEmpty()) {
                    etiquetaLuego.setVisibility(View.VISIBLE);
                    luego.setText(par[1]);
                }
                // Y en la lista, debajo del nombre del canal que suena
                canales.sonando(listaCanales, sonando, par[0]);
            }
            @Override public void falla(Exception e) { /* la guía es un extra */ }
        });
    }

    /** Arriba y abajo zapean cuando se está a pantalla completa. */
    @Override public boolean onKeyDown(int tecla, KeyEvent evento) {
        if (aPantallaCompleta) {
            switch (tecla) {
                case KeyEvent.KEYCODE_DPAD_UP:
                case KeyEvent.KEYCODE_CHANNEL_UP:
                    zapear(-1);
                    return true;
                case KeyEvent.KEYCODE_DPAD_DOWN:
                case KeyEvent.KEYCODE_CHANNEL_DOWN:
                    zapear(1);
                    return true;
                default:
                    break;
            }
        }
        return super.onKeyDown(tecla, evento);
    }

    /** El siguiente o el anterior de la carpeta abierta, dando la vuelta. */
    private void zapear(int aDonde) {
        List<Catalogo.Item> lista = canales.datos();
        if (lista.isEmpty()) return;
        int donde = -1;
        for (int i = 0; i < lista.size(); i++) {
            if (lista.get(i).id.equals(sonando)) { donde = i; break; }
        }
        if (donde < 0) return;
        int cuantos = lista.size();
        Catalogo.Item siguiente = lista.get(((donde + aDonde) % cuantos + cuantos) % cuantos);

        sonando = siguiente.id;
        canales.sonando(listaCanales, sonando, "");
        nombreCanal.setText(siguiente.nombre);
        girando.setVisibility(View.VISIBLE);
        ponerEnLaVentana(siguiente);
        pedirGuia(siguiente);
    }

    /** Atrás: de pantalla completa a la lista, de los canales a las carpetas. */
    @Override public void onBackPressed() {
        if (aPantallaCompleta) {
            encoger();
            return;
        }
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

    /** Al volver de la pantalla completa, la ventana sigue viva. */
    @Override protected void onResume() {
        super.onResume();
        if (reproductor != null && !sonando.isEmpty()) reproductor.play();
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
