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
import androidx.media3.common.Tracks;
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
 *
 * En la tele la columna de la izquierda tiene dos niveles: las carpetas, y
 * dentro de cada una sus canales. ATRÁS vuelve a las carpetas. Antes las
 * carpetas eran una tira debajo del vídeo y la columna enseñaba de golpe
 * los ocho mil canales del proveedor: con veinte carpetas de ciento y pico
 * canales eso no es una lista, es un pozo.
 */
public class DirectoActivity extends Activity {

    private RecyclerView listaCarpetas, listaCanales;
    private AdaptadorCarpetas carpetas;
    private AdaptadorCanales canales;
    private TextView tituloCarpeta, nombreCanal, ahora, pista, comoAmpliar, vacio;
    private android.widget.LinearLayout luegoLista, antesLista;
    private TextView etiquetaAhora, etiquetaLuego, etiquetaAntes, cuantos;
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

    /** Si el canal que suena trae más de un audio o algún subtítulo. */
    private boolean hayIdiomas = false;
    /** Que el idioma guardado se ponga una vez por canal. Ver ReproductorActivity. */
    private boolean idiomaPuesto = false;

    /** Lo que dice la pista de debajo del vídeo antes de añadirle nada. */
    private String pistaDelLayout = "";

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
    /**
     * En la tele, carpetas y canales comparten la columna de la izquierda.
     *
     * En el teléfono no: allí las tres partes están apiladas y se navega
     * hacia dentro con `irAlPaso`, que ya hacía esto mismo.
     */
    private boolean dosNiveles = false;
    /** Qué enseña la columna: 0 las carpetas, 1 los canales de una. */
    private int nivel = 0;
    /** El canal cuya guía se está enseñando debajo del vídeo. */
    private String mirando = "";
    private Runnable pendienteGuia;
    private Runnable pendienteFoco;
    /** Lo que tarda la columna en tener filas donde poner el foco. */
    private static final int ESPERA_DEL_FOCO = 90;

    @Override protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        Pantalla.colocar(this);
        Tipos.poner(this);
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
        antesLista = findViewById(R.id.antesLista);
        pista = findViewById(R.id.pista);
        comoAmpliar = findViewById(R.id.comoAmpliar);
        /* La del televisor habla de OK y la del teléfono de tocar la
           imagen: se guarda la que traiga esta pantalla y se le añade lo
           del idioma encima, en vez de escribir aquí una de las dos */
        pistaDelLayout = comoAmpliar.getText().toString();
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
        etiquetaAntes = findViewById(R.id.etiquetaAntes);
        caja = findViewById(R.id.caja);
        vista = findViewById(R.id.vista);
        vista.setUseController(false);
        enMovil = Pantalla.esMovil(this);
        dosNiveles = !enMovil;

        // Ver la tele con la pantalla apagándose a los treinta segundos
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        caja.post(new Runnable() {
            @Override public void run() { medirCaja(); }
        });

        /* La tira de carpetas de debajo del vídeo solo se usa ya en el
           teléfono, donde es la lista por la que se entra. En la tele las
           carpetas están en la columna de la izquierda y esta tira se
           esconde —más abajo—, pero se le pone su gestor igual: la vista
           existe en las dos variantes del layout */
        listaCarpetas.setLayoutManager(new LinearLayoutManager(this));
        listaCanales.setLayoutManager(new LinearLayoutManager(this));
        listaCarpetas.setItemAnimator(null);
        listaCanales.setItemAnimator(null);

        carpetas = new AdaptadorCarpetas(new AdaptadorCarpetas.AlEntrar() {
            @Override public void en(int posicion) { abrirCarpeta(posicion); }
        });
        canales = new AdaptadorCanales(new AdaptadorCanales.AlElegir() {
            @Override public void canal(int posicion) { elegir(posicion); }
        });
        canales.alMarcar(new AdaptadorCanales.AlMarcar() {
            @Override public void favorito(int posicion) { marcarFavorito(posicion); }
        });
        canales.alPosarse(new AdaptadorCanales.AlPosarse() {
            @Override public void en(int posicion) { asomarse(posicion); }
        });
        canales.favoritos(Favoritos.marcados(this));

        if (dosNiveles) {
            /* La tira de carpetas de debajo del vídeo se va: sus carpetas
               están ahora en la columna, y estando en los dos sitios rozarla
               con el foco vaciaba la columna sin manera de recuperarla */
            columnaCarpetas.setVisibility(View.GONE);
            listaCanales.setAdapter(carpetas);
        } else {
            listaCarpetas.setAdapter(carpetas);
            listaCanales.setAdapter(canales);
        }

        /*
         * Mantener pulsado la imagen abre el audio.
         *
         * En el teléfono es el único camino —no hay flechas—, y en la tele
         * no estorba: el OK largo del mando ya sirve para los favoritos,
         * pero eso es en la lista de canales, no encima del vídeo.
         */
        View.OnLongClickListener manteniendo = new View.OnLongClickListener() {
            @Override public boolean onLongClick(View v) {
                if (!hayIdiomas || reproductor == null) return false;
                SelectorIdioma.abrir(DirectoActivity.this, reproductor);
                return true;
            }
        };
        caja.setOnLongClickListener(manteniendo);
        vista.setOnLongClickListener(manteniendo);

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
        mirando = "";
        reintentos = 0;
        canales.sonando(listaCanales, "", null);
        nombreCanal.setText("");
        ahora.setText("");
        luegoLista.removeAllViews();
        antesLista.removeAllViews();
        etiquetaAhora.setVisibility(View.GONE);
        etiquetaLuego.setVisibility(View.GONE);
        etiquetaAntes.setVisibility(View.GONE);
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
                /* En la tele la columna arranca por las carpetas: es la
                   pantalla que se ha pedido, la lista de las veinte carpetas
                   del proveedor y no los ocho mil canales de dentro */
                if (dosNiveles) {
                    verCarpetas();
                    return;
                }
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
                // Y en el teléfono se entra ya en la primera con algo dentro
                abrirCarpeta(primera);
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
     * Abrir una carpeta: pedir sus canales y enseñarlos.
     *
     * En la tele la columna se queda en las carpetas mientras llegan y solo
     * cambia de nivel cuando hay algo que enseñar —ver más abajo—; en el
     * teléfono esto se llama al posarse encima, y por eso la petición espera
     * un poco: bajando deprisa por veinte carpetas se dispararían veinte
     * peticiones y solo importa la última.
     */
    private void abrirCarpeta(final int cual) {
        final Catalogo.Carpeta carpeta = carpetas.cual(cual);
        if (carpeta == null) return;
        carpetas.marcar(dosNiveles ? listaCanales : listaCarpetas, cual);
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
            // Ya están: se entra en el acto
            if (dosNiveles) verCanales();
            return;
        }
        /*
         * Y mientras llegan, la columna sigue enseñando las carpetas.
         *
         * Cambiar de nivel al pulsar y llenarlo después dejaba un momento
         * —el que tarde el proveedor— con los canales de la carpeta anterior
         * debajo del nombre de la nueva, o con la columna en blanco y el
         * mando sin ninguna fila donde estar. Lo que cambia al pulsar es el
         * encabezado, que ya dice que se ha entrado; el nivel cambia cuando
         * hay algo que enseñar. Ver `verCanales`.
         */
        cuantos.setText(dosNiveles ? "…" : "");

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
                    if (dosNiveles) verCanales();
                    focoEnLosCanales(estabaEnLosCanales || dosNiveles);
                    canales.sonando(listaCanales, sonando, null);
                    cuantos.setText(String.valueOf(suyos.size()));
                    listaCanales.scrollToPosition(0);
                    vacio.setText("Aquí saldrán los canales que más pongas.");
                    bloqueVacio.setVisibility(suyos.isEmpty() ? View.VISIBLE : View.GONE);
                }
            };
            Hilos.enPantallaDentroDe(pendiente, dosNiveles ? 0 : 120);
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
                    if (dosNiveles) verCanales();
                    focoEnLosCanales(estabaEnLosCanales || dosNiveles);
                    canales.sonando(listaCanales, sonando, null);
                    cuantos.setText(String.valueOf(suyos.size()));
                    listaCanales.scrollToPosition(0);
                    vacio.setText("Aún no has marcado ningún canal.\n\nMantén pulsado OK sobre un canal para añadirlo aquí.");
                    bloqueVacio.setVisibility(suyos.isEmpty() ? View.VISIBLE : View.GONE);
                }
            };
            Hilos.enPantallaDentroDe(pendiente, dosNiveles ? 0 : 120);
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
                        if (dosNiveles) verCanales();
                        // Rehacer la lista tira el foco: se le devuelve
                        focoEnLosCanales(estabaEnLosCanales || dosNiveles);
                        canales.sonando(listaCanales, sonando, null);
                        cuantos.setText(String.valueOf(lista.size()));
                        vacio.setText("Esta carpeta no tiene canales.");
                        listaCanales.scrollToPosition(0);
                        bloqueVacio.setVisibility(lista.isEmpty() ? View.VISIBLE : View.GONE);
                    }
                    @Override public void falla(Exception e) {
                        /* Sin tocar lo que ya estuviera puesto: vaciar la
                           lista por un corte de un segundo deja al que mira
                           peor que antes de pulsar. La columna se queda en
                           las carpetas, que es donde estaba */
                        cuantos.setText("");
                        vacio.setText(Hilos.enCristiano(e));
                        bloqueVacio.setVisibility(View.VISIBLE);
                    }
                });
            }
        };
        /* La espera es para no disparar veinte peticiones bajando deprisa
           por las carpetas, y eso solo pasa donde la carpeta se abre al
           posarse. En la tele hay un OK de por medio: no hay nada que
           amortiguar y esperar solo es tardar */
        Hilos.enPantallaDentroDe(pendiente, dosNiveles ? 0 : 220);
    }

    /**
     * La columna, enseñando las carpetas.
     *
     * Es el nivel de arriba: la lista de carpetas del proveedor. Se entra en
     * una con OK y se vuelve aquí con ATRÁS, y al volver el foco cae en la
     * carpeta de la que se salió y no en lo primero de la lista.
     */
    private void verCarpetas() {
        nivel = 0;
        if (pendiente != null) Hilos.olvidar(pendiente);
        bloqueVacio.setVisibility(View.GONE);
        tituloCarpeta.setText("Carpetas");
        cuantos.setText(String.valueOf(carpetas.getItemCount()));
        if (listaCanales.getAdapter() != carpetas) listaCanales.setAdapter(carpetas);
        final int donde = carpetas.elegida();
        listaCanales.scrollToPosition(donde);
        if (pendienteFoco != null) Hilos.olvidar(pendienteFoco);
        pendienteFoco = new Runnable() {
            @Override public void run() {
                RecyclerView.ViewHolder vh = listaCanales.findViewHolderForAdapterPosition(donde);
                if (vh != null) vh.itemView.requestFocus();
                else listaCanales.requestFocus();
            }
        };
        /* Y el foco, un momento después: cambiar de adaptador no pinta las
           filas al momento, y sobre una lista todavía vacía el foco no se
           engancha en ninguna */
        Hilos.enPantallaDentroDe(pendienteFoco, ESPERA_DEL_FOCO);
    }

    /**
     * La columna, enseñando los canales de la carpeta abierta.
     *
     * Se llama cuando ya están pintados, no al pulsar: ver `abrirCarpeta`.
     */
    private void verCanales() {
        nivel = 1;
        cuantos.setText(String.valueOf(canales.getItemCount()));
        if (listaCanales.getAdapter() != canales) listaCanales.setAdapter(canales);
        // El foco va detrás de los canales: ver `focoEnLosCanales`
        focoEnLosCanales(true);
    }

    /**
     * El foco, dentro de la columna, cuando acaba de repintarse.
     *
     * Rehacer una lista destruye la fila que lo tenía y Android lo manda a
     * lo primero que encuentre, que aquí es el carril de secciones: la
     * pantalla se quedaba con el mando en «Inicio · Directo · Cine» sin
     * haberse movido nadie. Y con la carpeta vacía no hay ni una fila que
     * enfocar, así que va al botón de volver a cargar, que es la única
     * salida que hay a la vista.
     *
     * Se hace en el turno siguiente porque el RecyclerView todavía no ha
     * pintado nada: pedírselo ahora mismo no engancha en ninguna fila.
     */
    private void focoEnLosCanales(boolean siNoLoTiene) {
        if (!siNoLoTiene) return;
        if (pendienteFoco != null) Hilos.olvidar(pendienteFoco);
        pendienteFoco = new Runnable() {
            @Override public void run() {
                if (dosNiveles && nivel != 1) return;
                if (listaCanales.getAdapter() == canales && canales.getItemCount() == 0) {
                    if (bloqueVacio.getVisibility() == View.VISIBLE) {
                        findViewById(R.id.botonReintentar).requestFocus();
                    }
                    return;
                }
                listaCanales.requestFocus();
            }
        };
        Hilos.enPantallaDentroDe(pendienteFoco, ESPERA_DEL_FOCO);
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

    /**
     * Posarse sobre un canal enseña SU guía debajo del vídeo.
     *
     * Es lo que hace la versión de ordenador y es lo que se busca al zapear:
     * bajar por la lista viendo qué dan en cada uno antes de poner ninguno.
     * Hasta ahora ahí solo salía la guía del canal que ya estaba puesto, así
     * que para saber qué echaban en otro había que ponerlo.
     *
     * La petición espera un cuarto de segundo: bajando deprisa por ciento y
     * pico canales se pedirían ciento y pico guías y solo importa la última.
     */
    private void asomarse(int posicion) {
        List<Catalogo.Item> lista = canales.datos();
        if (posicion < 0 || posicion >= lista.size()) return;
        final Catalogo.Item canal = lista.get(posicion);
        if (canal.id.equals(mirando)) return;
        mirando = canal.id;
        nombreCanal.setText(canal.nombre);
        ahora.setText("");
        luegoLista.removeAllViews();
        antesLista.removeAllViews();
        etiquetaAhora.setVisibility(View.GONE);
        etiquetaLuego.setVisibility(View.GONE);
        etiquetaAntes.setVisibility(View.GONE);
        if (pendienteGuia != null) Hilos.olvidar(pendienteGuia);
        pendienteGuia = new Runnable() {
            @Override public void run() { pedirGuia(canal); }
        };
        Hilos.enPantallaDentroDe(pendienteGuia, 260);
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
        mirando = canal.id;
        if (pendienteGuia != null) Hilos.olvidar(pendienteGuia);
        /* Una raya en la pared, que es lo que llena «Los que más ves». Se
           apunta al ponerlo y no al terminarlo: en la tele no se «termina»
           un canal, se deja puesto */
        MasVistos.apuntar(this, canal);
        canales.sonando(listaCanales, sonando, "");
        nombreCanal.setText(canal.nombre);
        ahora.setText("");
        luegoLista.removeAllViews();
        antesLista.removeAllViews();
        etiquetaAhora.setVisibility(View.GONE);
        etiquetaLuego.setVisibility(View.GONE);
        etiquetaAntes.setVisibility(View.GONE);
        pista.setVisibility(View.GONE);
        decirComoSeAmplia();
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
        avisarDelIdioma();
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

    /**
     * Que existe la flecha derecha, dicho una vez en la vida.
     *
     * Debajo del vídeo ya está escrito, pero a pantalla completa no se ve
     * nada de eso: se esconde todo menos la imagen. Y una función que nadie
     * sabe que está es una función que no está. Una vez y no más: repetirlo
     * en cada canal sería un cartel encima del partido cada dos minutos.
     */
    private void avisarDelIdioma() {
        if (!hayIdiomas) return;
        if (Sesion.ajustes(this).getBoolean("aviso_idioma", false)) return;
        Sesion.ajustes(this).edit().putBoolean("aviso_idioma", true).apply();
        android.widget.Toast.makeText(this, enMovil
                        ? "Mantén pulsado el vídeo para cambiar el audio o los subtítulos"
                        : "Pulsa la flecha derecha para cambiar el audio o los subtítulos",
                android.widget.Toast.LENGTH_LONG).show();
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
        if (!dosNiveles) columnaCarpetas.setVisibility(View.VISIBLE);
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

    /** El reproductor de la ventana, una sola vez. Ver `ponerEnLaVentana`. */
    private void prepararReproductor() {
        if (reproductor != null) return;
        reproductor = Reproduccion.nuevo(this);
        vista.setPlayer(reproductor);
        reproductor.addListener(new Player.Listener() {
            @Override public void onPlaybackStateChanged(int estado) {
                girando.setVisibility(estado == Player.STATE_BUFFERING ? View.VISIBLE : View.GONE);
                // Si ha arrancado, los intentos gastados ya no cuentan
                if (estado == Player.STATE_READY) reintentos = 0;
            }
            /**
             * Qué trae el canal dentro.
             *
             * En directo esto importa más que en una película: media
             * parrilla va en dual, y el partido con el narrador de la otra
             * cadena era exactamente lo que no se podía cambiar.
             */
            @Override public void onTracksChanged(Tracks pistas) {
                if (reproductor == null) return;
                if (!idiomaPuesto) {
                    idiomaPuesto = true;
                    SelectorIdioma.aplicarLoGuardado(DirectoActivity.this, reproductor);
                }
                hayIdiomas = SelectorIdioma.hayDondeElegir(reproductor);
                decirComoSeAmplia();
                // Las pistas llegan un segundo después de arrancar: si para
                // entonces ya se había ampliado, el aviso no ha salido
                if (aPantallaCompleta) avisarDelIdioma();
            }
            @Override public void onPlayerError(PlaybackException error) {
                if (volverAEngancharse()) return;
                girando.setVisibility(View.GONE);
                pista.setText(Reproduccion.porQue(error));
                pista.setVisibility(View.VISIBLE);
            }
        });
    }

    private void ponerEnLaVentana(final Catalogo.Item canal) {
        prepararReproductor();
        reintentos = 0;
        // Otro canal, otras pistas: lo que traía el anterior no vale
        idiomaPuesto = false;
        hayIdiomas = false;
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
    /** Y cuántos de los ya emitidos, para los canales que los guardan. */
    private static final int CUANTOS_ANTES = 4;

    private void pedirGuia(final Catalogo.Item canal) {
        Hilos.fuera(new Hilos.Trabajo<java.util.List<Catalogo.Programa>>() {
            @Override public java.util.List<Catalogo.Programa> hacer() { return Catalogo.guia(canal.id); }
        }, new Hilos.Luego<java.util.List<Catalogo.Programa>>() {
            @Override public void listo(java.util.List<Catalogo.Programa> parrilla) {
                // Se puede haber seguido bajando mientras llegaba
                if (parrilla == null || parrilla.isEmpty() || !canal.id.equals(mirando)) return;
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
                    luegoLista.addView(filaDeGuia(canal, parrilla.get(i)));
                }
                etiquetaLuego.setVisibility(puestos > 0 ? View.VISIBLE : View.GONE);

                /*
                 * Y lo de antes, cuando el canal lo guarda.
                 *
                 * La mitad de las listas traen archivo —`tv_archive`— y no
                 * había por dónde pedirlo: el programa de las siete se
                 * perdía a las siete y cinco. Aquí se ofrece lo que ya se
                 * emitió, del más reciente al más viejo, que es lo que se
                 * busca cuando se llega tarde a algo.
                 */
                antesLista.removeAllViews();
                int recuperables = 0;
                if (canal.diasGuardados > 0) {
                    for (int i = 1; i < parrilla.size() && recuperables < CUANTOS_ANTES; i++) {
                        Catalogo.Programa p = parrilla.get(i);
                        if (!p.yaPaso()) continue;
                        antesLista.addView(filaDeGuia(canal, p));
                        recuperables++;
                    }
                }
                etiquetaAntes.setVisibility(recuperables > 0 ? View.VISIBLE : View.GONE);

                /* Y en la lista, debajo del nombre del canal que suena. Solo
                   si la guía es la suya: la de un canal por el que se está
                   pasando no dice nada de lo que se está viendo */
                if (canal.id.equals(sonando)) {
                    canales.sonando(listaCanales, sonando, enAntena.titulo);
                }
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
    private View filaDeGuia(final Catalogo.Item canal, final Catalogo.Programa p) {
        android.widget.LinearLayout fila = new android.widget.LinearLayout(this);
        fila.setOrientation(android.widget.LinearLayout.HORIZONTAL);
        fila.setPadding(dp(6), dp(5), dp(6), dp(5));

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

        /*
         * Lo ya emitido se puede poner, si el canal lo guarda.
         *
         * Solo entonces la fila se vuelve un botón: hacer que se enfoque
         * todo lo que hay en la guía obligaría a recorrer diez renglones
         * con el mando para llegar a la lista de canales, y nueve de ellos
         * no harían nada al pulsar.
         */
        if (canal.diasGuardados > 0 && p.yaPaso() && !p.momento().isEmpty()) {
            fila.setBackgroundResource(R.drawable.pastilla);
            fila.setFocusable(true);
            fila.setClickable(true);
            TextView marca = new TextView(this);
            marca.setText("VER");
            marca.setTextSize(11);
            marca.setTextColor(getResources().getColor(R.color.marca_viva));
            marca.setPadding(dp(10), 0, 0, 0);
            fila.addView(marca);
            fila.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) { verLoDeAntes(canal, p); }
            });
        }
        // Hecha a mano y no inflada: la letra de la casa se le pone aquí
        Tipos.aplicar(fila);
        return fila;
    }

    /**
     * Poner un programa que ya se emitió.
     *
     * Es el mismo camino que un canal —la ventana de la derecha, y con otro
     * OK a pantalla completa—, solo que la dirección se pide con la hora y
     * la duración en vez de con el canal a secas.
     */
    private void verLoDeAntes(final Catalogo.Item canal, final Catalogo.Programa p) {
        sonando = "";
        mirando = canal.id;
        nombreCanal.setText(p.titulo);
        ahora.setText(canal.nombre + "  ·  " + p.hora);
        pista.setVisibility(View.GONE);
        decirComoSeAmplia();
        comoAmpliar.setVisibility(View.VISIBLE);
        girando.setVisibility(View.VISIBLE);
        if (reproductor == null) prepararReproductor();
        reintentos = 0;
        idiomaPuesto = false;
        hayIdiomas = false;
        Hilos.fuera(new Hilos.Trabajo<String>() {
            @Override public String hacer() throws Exception {
                return Enlaces.paraVerLoDeAntes(canal.id, p.momento(), p.minutos());
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
                pista.setText(Hilos.enCristiano(e));
                pista.setVisibility(View.VISIBLE);
            }
        });
    }

    /**
     * Lo que se puede hacer con este canal, escrito debajo del vídeo.
     *
     * El idioma solo se nombra cuando el canal trae algo que elegir: una
     * pista que ofrece lo que no existe es peor que ninguna pista.
     */
    private void decirComoSeAmplia() {
        if (!hayIdiomas) {
            comoAmpliar.setText(pistaDelLayout);
            return;
        }
        comoAmpliar.setText(pistaDelLayout + (enMovil
                ? " · Mantén pulsado el vídeo para el audio"
                : " · A pantalla completa, derecha para el audio"));
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
                /* Aquí no hay mandos donde poner un botón —pantalla completa
                   es el vídeo y nada más—, así que el idioma se abre con la
                   flecha, que a lo ancho no hace nada más */
                case KeyEvent.KEYCODE_DPAD_RIGHT:
                case KeyEvent.KEYCODE_MEDIA_AUDIO_TRACK:
                    if (!hayIdiomas) break;
                    SelectorIdioma.abrir(this, reproductor);
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
        mirando = siguiente.id;
        if (pendienteGuia != null) Hilos.olvidar(pendienteGuia);
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
        /* Desde los canales de una carpeta, ATRÁS vuelve a las carpetas, que
           es de donde se vino; desde las carpetas, sale de la sección */
        if (dosNiveles && nivel == 1) {
            verCarpetas();
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
        if (pendienteGuia != null) Hilos.olvidar(pendienteGuia);
        if (pendienteFoco != null) Hilos.olvidar(pendienteFoco);
        if (reenganche != null) Hilos.olvidar(reenganche);
        if (reproductor != null) {
            reproductor.release();
            reproductor = null;
        }
    }
}
