package app.totalplayer.tvnativo;

import android.app.Activity;
import android.content.res.Configuration;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
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
    private TextView tituloCarpeta, nombreCanal, ahora, pista, comoAmpliar, vacio;
    private android.widget.LinearLayout luegoLista;
    private TextView etiquetaAhora, etiquetaLuego, cuantos;
    private View bloqueVacio, columnaCarpetas, columnaCanales, columnaVideo, bloqueInfo;
    /** A pantalla completa se esconde todo menos el vídeo. */
    private boolean aPantallaCompleta = false;
    /** En el teléfono las tres partes están apiladas y se enseña una. */
    private boolean enMovil = false;
    /** Qué parte se ve en el teléfono: 0 carpetas, 1 canales, 2 vídeo. */
    private int paso = 0;
    private View caja;
    private ProgressBar girando;
    private PlayerView vista;
    private ExoPlayer reproductor;

    private String sonando = "";
    private Runnable pendiente;
    /** Cuántas veces se ha vuelto a pedir el canal que suena tras cortarse. */
    private int reintentos = 0;
    private Runnable reenganche;
    private Catalogo.Carpeta carpetaAbierta;
    /** La primera carpeta se abre sola al cargar: esa no cuenta como pulsar. */
    private boolean yaHuboUnaCarpeta = false;
    /** Cuál está pintada ya en la columna de canales. */
    private String carpetaPintada = "";

    @Override protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        Pantalla.colocar(this);
        setContentView(R.layout.directo);
        if (!Guardia.haySesion(this)) return;

        /* El carril de secciones: cine y series a un OK de aquí, sin volver
           al menú a buscarlos con las flechas */
        Navegacion.montar(this, Catalogo.DIRECTO);

        listaCarpetas = findViewById(R.id.listaCarpetas);
        listaCanales = findViewById(R.id.listaCanales);
        tituloCarpeta = findViewById(R.id.tituloCarpeta);
        nombreCanal = findViewById(R.id.nombreCanal);
        ahora = findViewById(R.id.ahora);
        luegoLista = findViewById(R.id.luegoLista);
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
        enMovil = Pantalla.esMovil(this);

        // Ver la tele con la pantalla apagándose a los treinta segundos
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        caja.post(new Runnable() {
            @Override public void run() { medirCaja(); }
        });

        /* Las carpetas van en fila en la tele y en columna en el teléfono: en
           la tele son una tira de pastillas debajo del vídeo —ver el layout—
           y en el teléfono, la lista por la que se entra */
        listaCarpetas.setLayoutManager(new LinearLayoutManager(this,
                enMovil ? LinearLayoutManager.VERTICAL : LinearLayoutManager.HORIZONTAL, false));
        listaCanales.setLayoutManager(new LinearLayoutManager(this));
        listaCarpetas.setItemAnimator(null);
        listaCanales.setItemAnimator(null);

        carpetas = new AdaptadorCarpetas(new AdaptadorCarpetas.AlPosarse() {
            @Override public void en(int posicion) { abrirCarpeta(posicion); }
        });
        canales = new AdaptadorCanales(new AdaptadorCanales.AlElegir() {
            @Override public void canal(int posicion) { elegir(posicion); }
        });
        canales.alMarcar(new AdaptadorCanales.AlMarcar() {
            @Override public void favorito(int posicion) { marcarFavorito(posicion); }
        });
        canales.favoritos(Favoritos.marcados(this));
        listaCarpetas.setAdapter(carpetas);
        listaCanales.setAdapter(canales);

        if (enMovil) {
            irAlPaso(0);
            /* En el teléfono no hay un «segundo OK»: se toca la imagen, que
               es lo que hace todo el mundo con un vídeo pequeño. Y estando
               ya a pantalla completa, tocarla vuelve a encogerla */
            View.OnClickListener tocar = new View.OnClickListener() {
                @Override public void onClick(View v) {
                    if (sonando.isEmpty()) return;
                    if (aPantallaCompleta) encoger(); else expandir();
                }
            };
            // En la caja y en la vista: según el aparato, el toque lo recoge
            // una o la otra, y si solo se escucha en una no pasa nada
            caja.setOnClickListener(tocar);
            vista.setOnClickListener(tocar);
        }

        cargarCarpetas();
    }

    /**
     * La caja del vídeo mide 16:9.
     *
     * Dejándola estirarse hasta abajo, un canal salía con dos franjas negras
     * enormes que parecían un fallo de la imagen. Se mide con lo que ocupa
     * la caja, y mientras está escondida —en el teléfono, hasta que se elige
     * canal— con el ancho de la pantalla, que es el que va a tener.
     */
    private void medirCaja() {
        if (aPantallaCompleta) return;
        int ancho = caja.getWidth() > 0
                ? caja.getWidth()
                : getResources().getDisplayMetrics().widthPixels;
        ViewGroup.LayoutParams medidas = caja.getLayoutParams();
        medidas.height = ancho * 9 / 16;
        caja.setLayoutParams(medidas);
    }

    /**
     * En el teléfono se navega hacia dentro: carpetas, canales y vídeo.
     *
     * Las tres partes están una encima de otra en el mismo sitio, así que
     * enseñar una es esconder las otras dos. En la tele no se toca nada:
     * allí las tres se ven a la vez y por eso existen las tres columnas.
     *
     * Y salir del vídeo apaga el vídeo. Antes solo lo escondía: el canal
     * seguía sonando mientras se paseaba uno por las carpetas y por la lista,
     * sin imagen a la que asociar el sonido y sin manera de callarlo salvo
     * salir de la pantalla entera.
     */
    private void irAlPaso(int cual) {
        if (paso == 2 && cual != 2) apagarVideo();
        paso = cual;
        columnaCarpetas.setVisibility(cual == 0 ? View.VISIBLE : View.GONE);
        columnaCanales.setVisibility(cual == 1 ? View.VISIBLE : View.GONE);
        columnaVideo.setVisibility(cual == 2 ? View.VISIBLE : View.GONE);
        if (cual == 2) {
            caja.post(new Runnable() {
                @Override public void run() { medirCaja(); }
            });
        }
    }

    /** Callar y soltar el canal: ni suena ni sigue tirando de la red. */
    private void apagarVideo() {
        if (reproductor != null) {
            reproductor.stop();
            reproductor.clearMediaItems();
        }
        sonando = "";
        reintentos = 0;
        canales.sonando(listaCanales, "", null);
        nombreCanal.setText("");
        ahora.setText("");
        luegoLista.removeAllViews();
        etiquetaAhora.setVisibility(View.GONE);
        etiquetaLuego.setVisibility(View.GONE);
        comoAmpliar.setVisibility(View.GONE);
        girando.setVisibility(View.GONE);
        pista.setText("Elige un canal de la lista");
        pista.setVisibility(View.VISIBLE);
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
                /* Favoritos, siempre la primera: es la carpeta a la que se
                   va cuando no apetece buscar.
                   Y detrás «Los que más ves», que es la misma idea sin tener
                   que mantenerla —se llena sola con ver la tele—, pero solo
                   cuando ya hay algo que contar: una carpeta de dos canales
                   no dice lo que ves, dice que acabas de instalar esto */
                List<Catalogo.Carpeta> conFavoritos = new java.util.ArrayList<>();
                conFavoritos.add(new Catalogo.Carpeta(Favoritos.CARPETA, "★  Favoritos"));
                if (MasVistos.cuantos(DirectoActivity.this) >= MasVistos.MINIMO) {
                    conFavoritos.add(new Catalogo.Carpeta(MasVistos.CARPETA, "Los que más ves"));
                }
                conFavoritos.addAll(lista);
                carpetas.poner(conFavoritos);
                pista.setText("Elige un canal de la lista");
                /*
                 * Y se abre la primera que tenga algo dentro.
                 *
                 * Favoritos va la primera de la tira porque es a donde se va
                 * cuando no apetece buscar. Pero recién instalada está vacía,
                 * y abrirla dejaba la aplicación estrenada enseñando «aún no
                 * has marcado ningún canal» y ni un solo canal a la vista,
                 * con los ocho mil del proveedor a una carpeta de distancia.
                 * Quien acaba de instalar esto no lee eso como «esta carpeta
                 * está vacía»: lo lee como «esto no funciona».
                 *
                 * Solo se saltan las carpetas de casa —favoritos y los que
                 * más ves—, que se pueden contar aquí mismo. Las del
                 * proveedor no: saber si traen canales cuesta una petición,
                 * y para eso ya está el «esta carpeta no tiene canales».
                 */
                int primera = 0;
                while (primera < conFavoritos.size() && deCasaYVacia(conFavoritos.get(primera).id)) primera++;
                if (primera >= conFavoritos.size()) primera = 0;
                abrirCarpeta(primera);
                /* El foco arranca en los canales, no en las carpetas: se
                   entra a ver la tele, y la carpeta es un filtro que se pone
                   encima. Antes las carpetas eran la columna por la que había
                   que pasar; ahora están al otro lado de la pantalla */
                if (!enMovil) listaCanales.requestFocus();
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

    /** ¿Es una de las carpetas de casa y está vacía? Ver `cargarCarpetas`. */
    private boolean deCasaYVacia(String id) {
        if (Favoritos.CARPETA.equals(id)) return Favoritos.lista(this).isEmpty();
        if (MasVistos.CARPETA.equals(id)) return MasVistos.lista(this).isEmpty();
        return false;
    }

    /**
     * Cambiar de carpeta al mover el foco, pero no en el acto: bajando
     * deprisa por veinte carpetas se dispararían veinte peticiones y solo
     * importa la última.
     */
    private void abrirCarpeta(final int cual) {
        final Catalogo.Carpeta carpeta = carpetas.cual(cual);
        if (carpeta == null) return;
        carpetas.marcar(listaCarpetas, cual);
        carpetaAbierta = carpeta;
        tituloCarpeta.setText(carpeta.nombre);

        // En el teléfono, elegir carpeta es entrar en ella. Va antes de lo de
        // abajo: volver a una carpeta ya cargada también tiene que entrar
        if (enMovil && yaHuboUnaCarpeta) irAlPaso(1);
        yaHuboUnaCarpeta = true;

        /*
         * Si ya está pintada, no se toca nada.
         *
         * Volver a poner la misma lista rehace todas sus filas, y si el foco
         * estaba en una de ellas se pierde: Android lo manda entonces a lo
         * primero que encuentra, que es el principio de la columna de
         * carpetas, y la lista «se va arriba» sola. Pasaba al ir y volver
         * entre columnas, que es lo que se hace todo el rato.
         */
        if (carpeta.id.equals(carpetaPintada)) {
            if (pendiente != null) Hilos.olvidar(pendiente);
            return;
        }
        cuantos.setText("");

        /*
         * «Los que más ves», que como favoritos está en casa y no se pide.
         *
         * Se repinta en el turno siguiente por el mismo motivo que aquélla:
         * esto se llama desde el listener del foco, y rehacer una lista
         * mientras la otra se desplaza es lo que tiraba la aplicación al menú.
         */
        if (MasVistos.CARPETA.equals(carpeta.id)) {
            if (pendiente != null) Hilos.olvidar(pendiente);
            pendiente = new Runnable() {
                @Override public void run() {
                    List<Catalogo.Item> suyos = MasVistos.lista(DirectoActivity.this);
                    boolean estabaEnLosCanales = listaCanales.hasFocus();
                    carpetaPintada = MasVistos.CARPETA;
                    canales.poner(suyos);
                    if (estabaEnLosCanales) listaCanales.requestFocus();
                    canales.sonando(listaCanales, sonando, null);
                    cuantos.setText(String.valueOf(suyos.size()));
                    listaCanales.scrollToPosition(0);
                    vacio.setText("Aquí saldrán los canales que más pongas.");
                    bloqueVacio.setVisibility(suyos.isEmpty() ? View.VISIBLE : View.GONE);
                }
            };
            Hilos.enPantallaDentroDe(pendiente, 120);
            return;
        }

        if (Favoritos.CARPETA.equals(carpeta.id)) {
            if (pendiente != null) Hilos.olvidar(pendiente);
            /* Aunque los favoritos estén en casa y no haya nada que pedir,
               se repinta en el turno siguiente y no aquí mismo: esto se
               llama desde el listener del foco, y rehacer una lista mientras
               la otra se está desplazando es justo lo que tiraba la
               aplicación al menú */
            pendiente = new Runnable() {
                @Override public void run() {
                    List<Catalogo.Item> suyos = Favoritos.lista(DirectoActivity.this);
                    boolean estabaEnLosCanales = listaCanales.hasFocus();
                    carpetaPintada = Favoritos.CARPETA;
                    canales.favoritos(Favoritos.marcados(DirectoActivity.this));
                    canales.poner(suyos);
                    if (estabaEnLosCanales) listaCanales.requestFocus();
                    canales.sonando(listaCanales, sonando, null);
                    cuantos.setText(String.valueOf(suyos.size()));
                    listaCanales.scrollToPosition(0);
                    vacio.setText("Aún no has marcado ningún canal.\n\nMantén pulsado OK sobre un canal para añadirlo aquí.");
                    bloqueVacio.setVisibility(suyos.isEmpty() ? View.VISIBLE : View.GONE);
                }
            };
            Hilos.enPantallaDentroDe(pendiente, 120);
            return;
        }

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
                        boolean estabaEnLosCanales = listaCanales.hasFocus();
                        carpetaPintada = carpeta.id;
                        canales.poner(lista);
                        // Rehacer la lista tira el foco: se le devuelve
                        if (estabaEnLosCanales) listaCanales.requestFocus();
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

    /** Mantener pulsado un canal lo marca o lo desmarca. */
    private void marcarFavorito(int posicion) {
        List<Catalogo.Item> lista = canales.datos();
        if (posicion < 0 || posicion >= lista.size()) return;
        Catalogo.Item canal = lista.get(posicion);

        boolean ahoraEs = Favoritos.alternar(this, canal);
        // La carpeta de favoritos ya no es la que estaba pintada
        if (Favoritos.CARPETA.equals(carpetaPintada)) carpetaPintada = "";
        canales.favoritos(Favoritos.marcados(this));
        android.widget.Toast.makeText(this,
                ahoraEs ? canal.nombre + " añadido a favoritos" : canal.nombre + " quitado de favoritos",
                android.widget.Toast.LENGTH_SHORT).show();

        // Estando dentro de favoritos, quitar uno tiene que verse al momento
        if (Favoritos.CARPETA.equals(tituloDeLaCarpetaAbierta())) {
            List<Catalogo.Item> suyos = Favoritos.lista(this);
            canales.poner(suyos);
            cuantos.setText(String.valueOf(suyos.size()));
            bloqueVacio.setVisibility(suyos.isEmpty() ? View.VISIBLE : View.GONE);
        } else {
            canales.sonando(listaCanales, sonando, null);
        }
    }

    /** Cuál es la carpeta abierta ahora mismo. */
    private String tituloDeLaCarpetaAbierta() {
        return carpetaAbierta == null ? "" : carpetaAbierta.id;
    }

    private void elegir(int posicion) {
        List<Catalogo.Item> lista = canales.datos();
        if (posicion < 0 || posicion >= lista.size()) return;
        Catalogo.Item canal = lista.get(posicion);

        // Segundo OK sobre el que ya suena: a pantalla completa
        if (canal.id.equals(sonando) && !enMovil) {
            expandir();
            return;
        }
        // En el teléfono, elegir canal es ir a verlo
        if (enMovil) irAlPaso(2);

        sonando = canal.id;
        /* Una raya en la pared, que es lo que llena «Los que más ves». Se
           apunta al ponerlo y no al terminarlo: en la tele no se «termina»
           un canal, se deja puesto */
        MasVistos.apuntar(this, canal);
        canales.sonando(listaCanales, sonando, "");
        nombreCanal.setText(canal.nombre);
        ahora.setText("");
        luegoLista.removeAllViews();
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
        /*
         * Y el carril, que flota encima de todo.
         *
         * Se escondían las tres columnas pero no él, así que a pantalla
         * completa quedaba una franja con «Inicio · Directo · Cine» encima
         * del partido, y detrás su hueco de 78 puntos en negro. Pantalla
         * completa es pantalla completa: se va el carril y se va su hueco.
         */
        conCarril(false);

        ViewGroup.LayoutParams medidas = caja.getLayoutParams();
        medidas.height = ViewGroup.LayoutParams.MATCH_PARENT;
        caja.setLayoutParams(medidas);

        if (enMovil) {
            /* Un vídeo a pantalla completa se ve apaisado y sin la barra de
               estado encima. Las dos cosas se deshacen al encoger */
            Pantalla.apaisado(this);
            Pantalla.pantallaCompleta(this, true);
            return;
        }
        // Que el mando no se quede sin sitio donde estar
        columnaVideo.setFocusable(true);
        columnaVideo.requestFocus();
    }

    private void encoger() {
        aPantallaCompleta = false;
        if (enMovil) {
            // En el teléfono solo se vuelve al vídeo con su información
            Pantalla.pantallaCompleta(this, false);
            Pantalla.colocar(this);
            conCarril(true);
            bloqueInfo.setVisibility(View.VISIBLE);
            columnaVideo.setPadding(0, 0, 0, 0);
            caja.post(new Runnable() {
                @Override public void run() { medirCaja(); }
            });
            return;
        }
        columnaCarpetas.setVisibility(View.VISIBLE);
        columnaCanales.setVisibility(View.VISIBLE);
        bloqueInfo.setVisibility(View.VISIBLE);
        conCarril(true);
        int p = (int) (22 * getResources().getDisplayMetrics().density);
        columnaVideo.setPadding(p, p, p, p);
        columnaVideo.setFocusable(false);

        caja.post(new Runnable() {
            @Override public void run() {
                medirCaja();
                listaCanales.requestFocus();
            }
        });
    }

    /**
     * El carril y el hueco que le reserva la pantalla.
     *
     * Son dos cosas y hay que mover las dos: la columna de iconos flota
     * encima del contenido, y detrás de ella el contenido lleva un margen de
     * su ancho para no quedar tapado. Escondiendo solo la primera, a
     * pantalla completa quedaba una banda negra a la izquierda.
     */
    private void conCarril(boolean si) {
        View c = findViewById(R.id.carril);
        if (c != null) c.setVisibility(si ? View.VISIBLE : View.GONE);
        View fila = findViewById(R.id.filaDirecto);
        if (fila != null) {
            /* El hueco es del menú, y el menú se ha ido de la columna
               izquierda a la barra de arriba: lo que hay que reservar es alto
               y no ancho. Sin esto, a pantalla completa se iba la barra pero
               su hueco seguía a la izquierda, y el vídeo salía descentrado */
            int hueco = si ? (int) (64 * getResources().getDisplayMetrics().density) : 0;
            fila.setPaddingRelative(fila.getPaddingStart(), enMovil ? fila.getPaddingTop() : hueco,
                    fila.getPaddingEnd(), fila.getPaddingBottom());
        }
    }

    private void ponerEnLaVentana(final Catalogo.Item canal) {
        if (reproductor == null) {
            reproductor = Reproduccion.nuevo(this);
            vista.setPlayer(reproductor);
            reproductor.addListener(new Player.Listener() {
                @Override public void onPlaybackStateChanged(int estado) {
                    girando.setVisibility(estado == Player.STATE_BUFFERING ? View.VISIBLE : View.GONE);
                    // Si ha arrancado, los intentos gastados ya no cuentan
                    if (estado == Player.STATE_READY) reintentos = 0;
                }
                @Override public void onPlayerError(PlaybackException error) {
                    if (volverAEngancharse()) return;
                    girando.setVisibility(View.GONE);
                    pista.setText(Reproduccion.porQue(error));
                    pista.setVisibility(View.VISIBLE);
                }
            });
        }
        reintentos = 0;
        /*
         * La dirección se pide al pulsar, no al pintar la lista.
         *
         * Con lista de la plataforma el catálogo llega sin direcciones: la de
         * un canal de Xtream lleva dentro el servidor, el usuario y la
         * contraseña del proveedor, y eso ya no baja al aparato. Se pide una,
         * la del canal que se ha pulsado, y se olvida.
         */
        final String cual = canal.id;
        Hilos.fuera(new Hilos.Trabajo<String>() {
            @Override public String hacer() throws Exception {
                return Enlaces.paraVer(canal.clase, canal.id, canal.extension, canal.url);
            }
        }, new Hilos.Luego<String>() {
            @Override public void listo(String direccion) {
                // Se puede haber zapeado mientras llegaba
                if (reproductor == null || !cual.equals(sonando)) return;
                reproductor.setMediaItem(MediaItem.fromUri(direccion));
                reproductor.prepare();
                reproductor.play();
            }
            @Override public void falla(Exception e) {
                girando.setVisibility(View.GONE);
                pista.setText(Hilos.enCristiano(e));
                pista.setVisibility(View.VISIBLE);
            }
        });
    }

    /**
     * Un canal que se corta se vuelve a enganchar solo.
     *
     * Un servidor de IPTV cierra la conexión cada dos por tres: se acaba el
     * segmento, cambia el nodo, o simplemente le da por ahí. Eso llega aquí
     * como un error y hasta ahora dejaba el canal muerto con un cartel,
     * cuando lo único que hacía falta era volver a pedirlo. Tres intentos,
     * y si a la tercera sigue sin ir, entonces sí se dice lo que pasa.
     */
    private boolean volverAEngancharse() {
        if (reproductor == null || sonando.isEmpty() || reintentos >= 3) return false;
        reintentos++;
        girando.setVisibility(View.VISIBLE);
        pista.setVisibility(View.GONE);
        if (reenganche != null) Hilos.olvidar(reenganche);
        reenganche = new Runnable() {
            @Override public void run() {
                if (reproductor == null || sonando.isEmpty()) return;
                reproductor.prepare();
                reproductor.play();
            }
        };
        Hilos.enPantallaDentroDe(reenganche, 1500);
        return true;
    }

    /** Cuántos programas se enseñan detrás del que está en antena. */
    private static final int CUANTOS_DESPUES = 5;

    private void pedirGuia(final Catalogo.Item canal) {
        Hilos.fuera(new Hilos.Trabajo<java.util.List<Catalogo.Programa>>() {
            @Override public java.util.List<Catalogo.Programa> hacer() { return Catalogo.guia(canal.id); }
        }, new Hilos.Luego<java.util.List<Catalogo.Programa>>() {
            @Override public void listo(java.util.List<Catalogo.Programa> parrilla) {
                if (parrilla == null || parrilla.isEmpty() || !canal.id.equals(sonando)) return;
                Catalogo.Programa enAntena = parrilla.get(0);
                etiquetaAhora.setVisibility(View.VISIBLE);
                ahora.setText(enAntena.hora.isEmpty()
                        ? enAntena.titulo
                        : enAntena.hora + "  " + enAntena.titulo);

                /*
                 * Y detrás, la parrilla. Cinco es lo que cabe sin empujar la
                 * lista de canales fuera de la pantalla, y son las tres o
                 * cuatro horas siguientes: bastante para decidir si esperar.
                 */
                luegoLista.removeAllViews();
                int puestos = 0;
                for (int i = 1; i < parrilla.size() && puestos < CUANTOS_DESPUES; i++, puestos++) {
                    luegoLista.addView(filaDeGuia(parrilla.get(i)));
                }
                etiquetaLuego.setVisibility(puestos > 0 ? View.VISIBLE : View.GONE);

                // Y en la lista, debajo del nombre del canal que suena
                canales.sonando(listaCanales, sonando, enAntena.titulo);
            }
            @Override public void falla(Exception e) { /* la guía es un extra */ }
        });
    }

    /**
     * Una línea de la parrilla: la hora a la izquierda y el título al lado.
     *
     * La hora en su columna y no pegada al texto: alineadas en vertical se
     * leen de un barrido, y sin ellas la lista es un montón de títulos sin
     * decir cuándo es ninguno.
     */
    private View filaDeGuia(Catalogo.Programa p) {
        android.widget.LinearLayout fila = new android.widget.LinearLayout(this);
        fila.setOrientation(android.widget.LinearLayout.HORIZONTAL);
        fila.setPadding(0, dp(3), 0, dp(3));

        TextView hora = new TextView(this);
        hora.setText(p.hora);
        hora.setTextSize(13);
        hora.setTextColor(getResources().getColor(R.color.tenue));
        hora.setWidth(dp(52));
        fila.addView(hora);

        TextView titulo = new TextView(this);
        titulo.setText(p.titulo);
        titulo.setTextSize(13);
        titulo.setTextColor(getResources().getColor(R.color.apagado));
        titulo.setMaxLines(1);
        titulo.setEllipsize(android.text.TextUtils.TruncateAt.END);
        fila.addView(titulo);
        return fila;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
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
        // Zapear también es poner un canal, y para el ranking cuenta igual
        MasVistos.apuntar(this, siguiente);
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
        if (enMovil && paso > 0) {
            irAlPaso(paso - 1);
            return;
        }
        /* Desde las carpetas, ATRÁS vuelve a los canales, que es de donde se
           vino; desde los canales, sale de la sección. Con las carpetas en
           una tira al otro lado, hacerlo al revés dejaba ATRÁS llevando a un
           sitio que no está en el camino de ida */
        if (!enMovil && listaCarpetas.hasFocus()) {
            listaCanales.requestFocus();
            return;
        }
        super.onBackPressed();
    }

    /**
     * Al girar el teléfono, la caja del vídeo vuelve a medirse.
     *
     * La actividad no se rehace —el manifiesto se queda con los cambios de
     * configuración— y por eso hay que hacerlo a mano: sin esto, la caja
     * conservaba el alto que le tocaba en vertical y en apaisado quedaba una
     * tira de vídeo con media pantalla negra debajo.
     */
    @Override public void onConfigurationChanged(Configuration nueva) {
        super.onConfigurationChanged(nueva);
        // Sin sesión, esta pantalla se abandona antes de tener nada dentro
        if (caja == null) return;
        caja.post(new Runnable() {
            @Override public void run() { medirCaja(); }
        });
    }

    /* Irse de la aplicación calla el canal. Con solo pausar en onStop, salir
       por el botón de inicio con el teléfono dejaba el sonido puesto un rato */
    @Override protected void onPause() {
        super.onPause();
        if (reproductor != null && enMovil) reproductor.pause();
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
        if (reenganche != null) Hilos.olvidar(reenganche);
        if (reproductor != null) {
            reproductor.release();
            reproductor = null;
        }
    }
}
