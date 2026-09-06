package app.totalplayer.tvnativo;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * El menú: elegir qué se quiere ver.
 *
 * Es la pantalla que faltaba. Al entrar se caía directamente en una lista de
 * carpetas de canales, y las películas y las series del proveedor no
 * aparecían por ninguna parte, aunque estuvieran pagadas.
 */
public class InicioActivity extends Activity {

    /** Las secciones que el proveedor no sirve: se enseñan, pero no abren. */
    private final Set<String> vacias = new HashSet<>();

    @Override protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        Pantalla.colocar(this);
        Tipos.poner(this);
        setContentView(R.layout.inicio);
        if (!Guardia.haySesion(this)) return;

        Sesion s = Sesion.actual();
        // El nombre del proveedor manda sobre el nuestro: es su tele
        ((TextView) findViewById(R.id.marca))
                .setText((s.marca.isEmpty() ? "TOTALplayer" : s.marca).toUpperCase(Locale.getDefault()));

        String quien = s.perfil.isEmpty() ? s.entradaUsuario : s.perfil;
        /*
         * El saludo y la pregunta, en la misma línea.
         *
         * Ponía solo «Hola, fulano» justo encima de las cuatro pestañas, y
         * eso las dejaba sin explicar: cercada la primera por el foco,
         * parecían un filtro de lo que hay debajo en vez de cuatro sitios a
         * los que ir. Con la pregunta delante, las pestañas son la
         * respuesta, que es lo que son.
         */
        ((TextView) findViewById(R.id.saludo)).setText(
                quien.isEmpty() ? "¿Qué quieres ver?" : "Hola, " + quien + ". ¿Qué quieres ver?");
        /* «No soy fulano» se lee raro con la mitad de los nombres de perfil
           —«No soy primero»— y encima no dice a dónde lleva */
        ((TextView) findViewById(R.id.textoSalir)).setText(
                quien.isEmpty() ? "Cambiar de cuenta" : "Cambiar de perfil");

        preparar(R.id.tarjetaDirecto, R.drawable.ic_tv, "TV en directo", Catalogo.DIRECTO);
        preparar(R.id.tarjetaPelis, R.drawable.ic_cine, "Películas", Catalogo.PELIS);
        preparar(R.id.tarjetaSeries, R.drawable.ic_series, "Series", Catalogo.SERIES);
        prepararBajadas();
        cargarFilas();
        ponerVersion();

        findViewById(R.id.botonBuscar).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                startActivity(new Intent(InicioActivity.this, BuscarActivity.class));
            }
        });
        findViewById(R.id.botonActualizar).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                Catalogo.vaciar();
                recargar();
                Toast.makeText(InicioActivity.this, "Actualizando tus listas…", Toast.LENGTH_SHORT).show();
            }
        });
        /* Ajustes: el idioma, los aparatos de la cuenta y quién falla cuando
           algo no se ve. Ver AjustesActivity */
        findViewById(R.id.botonAjustes).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                startActivity(new Intent(InicioActivity.this, AjustesActivity.class));
            }
        });
        findViewById(R.id.botonSalir).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                Sesion s = Sesion.actual();
                if (!s.galleta.isEmpty()) {
                    /* Con perfiles, «no soy este» es cambiar de perfil, no
                       cerrar la sesión: volver a escribir la contraseña con
                       el mando para pasarle la tele a otro es un castigo */
                    s.fijarPerfil(InicioActivity.this, false);
                    Intent i = new Intent(InicioActivity.this, PerfilesActivity.class);
                    // Viene a elegir: aquí no vale saltarse la pantalla
                    i.putExtra("elegir", true);
                    startActivity(i);
                } else {
                    Sesion.olvidar(InicioActivity.this);
                    startActivity(new Intent(InicioActivity.this, AccesoActivity.class));
                }
                finish();
            }
        });

        /*
         * El camino del mando, dicho a mano.
         *
         * Buscarlo solo por geometría funciona hasta que una tarjeta se
         * queda sin foco —un proveedor sin películas la apaga— y entonces
         * derecha desde la primera se salta a la tercera sin avisar. Escrito
         * así, el orden es siempre el que se ve.
         */
        encadenar(R.id.tarjetaDirecto, R.id.tarjetaPelis);
        encadenar(R.id.tarjetaPelis, R.id.tarjetaSeries);
        encadenar(R.id.tarjetaSeries, R.id.tarjetaBajadas);
        encadenar(R.id.botonBuscar, R.id.botonActualizar);
        encadenar(R.id.botonActualizar, R.id.botonAjustes);
        encadenar(R.id.botonAjustes, R.id.botonSalir);
        findViewById(R.id.tarjetaBajadas).setNextFocusRightId(R.id.tarjetaBajadas);
        findViewById(R.id.tarjetaDirecto).setNextFocusLeftId(R.id.tarjetaDirecto);

        findViewById(R.id.tarjetaDirecto).requestFocus();
    }

    /**
     * La cuarta pestaña: lo que hay guardado en el aparato.
     *
     * Va con las demás y no en la barra de abajo porque es un sitio donde se
     * entra a ver algo, igual que el cine o las series, y no un ajuste.
     */
    private void prepararBajadas() {
        final View tarjeta = findViewById(R.id.tarjetaBajadas);
        ((ImageView) tarjeta.findViewById(R.id.icono)).setImageResource(R.drawable.ic_bajar);
        ((TextView) tarjeta.findViewById(R.id.titulo)).setText("Descargas");
        Foco.agrandar(tarjeta, 1.04f);
        tarjeta.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                startActivity(new Intent(InicioActivity.this, DescargasActivity.class));
            }
        });
    }

    /**
     * Las filas de debajo: lo que hay, sin tener que entrar a buscarlo.
     *
     * Esta pantalla era un lanzador —tres tarjetas con el nombre de cada
     * sección y ni un solo título a la vista— y encender la tele para
     * encontrarse un menú es tener que elegir antes de haber visto nada.
     *
     * Se piden las dos portadas que ya sabe armar el catálogo y se coge la
     * primera fila de cada una: son las que ese mismo código considera el
     * escaparate, así que aquí no se inventa ningún criterio nuevo. Si una
     * sección no la sirve el proveedor, su fila simplemente no aparece.
     */
    /**
     * El rótulo de la fila del directo, escrito una vez.
     *
     * Lo usan dos sitios: el que arma la fila y el que decide que sus celdas
     * son de canal y no de cartel. Escrito dos veces, el día que alguien
     * cambie el texto la fila se queda con las celdas del otro y nadie
     * relaciona una cosa con la otra.
     */
    private static final String EN_DIRECTO = "En directo ahora";
    /** Lo tuyo: lo que has marcado y lo que más pones. Ver `tusCanales`. */
    private static final String TUS_CANALES = "Tus canales";

    /** Si esta fila lleva canales, que se pintan apaisados y llevan guía. */
    private static boolean deCanales(String rotulo) {
        return EN_DIRECTO.equals(rotulo) || TUS_CANALES.equals(rotulo);
    }

    private void cargarFilas() {
        final LinearLayout donde = findViewById(R.id.filas);
        if (donde == null) return;
        donde.removeAllViews();

        /*
         * Las tres filas se piden a la vez y cada una se pinta cuando llega.
         *
         * Antes se pedían las tres seguidas en el mismo trabajo y no se
         * pintaba NADA hasta tenerlas las tres: el directo entero —ocho mil
         * canales—, más la portada de series, más la de películas. Con un
         * catálogo de verdad eso son minutos de pantalla con las pestañas y
         * debajo el vacío, y quien enciende la tele no está esperando a que
         * cargue: está pensando que no funciona.
         *
         * Ahora son tres trabajos sueltos. El directo suele ser el primero
         * en volver, que además es el que se quiere nueve de cada diez
         * veces, y aparece él solo sin esperar a las otras dos. Si una falla,
         * las demás salen igual.
         *
         * Cada una sabe en qué puesto va y se mete ahí, no al final: lleguen
         * en el orden que lleguen, la pantalla queda siempre igual. Y se
         * INSERTA, sin tocar las que ya estén, para no tirar el foco de
         * quien ya esté recorriendo la primera fila cuando llegue la
         * segunda.
         */
        final int[] puestos = new int[FILAS_DEL_INICIO];
        /* Lo tuyo primero, y sin pedirle nada a nadie: sale al instante */
        pedirFila(donde, puestos, 0, new Hilos.Trabajo<Catalogo.Fila>() {
            @Override public Catalogo.Fila hacer() { return tusCanales(); }
        });
        pedirFila(donde, puestos, 1, new Hilos.Trabajo<Catalogo.Fila>() {
            @Override public Catalogo.Fila hacer() throws Exception { return enDirectoAhora(); }
        });
        pedirFila(donde, puestos, 2, new Hilos.Trabajo<Catalogo.Fila>() {
            @Override public Catalogo.Fila hacer() throws Exception {
                return destacados(Catalogo.SERIES, "Series destacadas");
            }
        });
        pedirFila(donde, puestos, 3, new Hilos.Trabajo<Catalogo.Fila>() {
            @Override public Catalogo.Fila hacer() throws Exception {
                return destacados(Catalogo.PELIS, "Películas destacadas");
            }
        });
    }

    /** Cuántos canales entran en una fila del inicio. */
    private static final int CUANTOS_CANALES = 12;

    /**
     * Los tuyos: los marcados y los que más pones.
     *
     * Es la fila que de verdad hace que una pantalla de inicio sirva para
     * algo, y la única que se puede pintar sin pedirle nada al proveedor:
     * las dos listas están guardadas en el aparato. Se llena sola con solo
     * ver la tele, así que a los dos días ya está ahí.
     */
    private Catalogo.Fila tusCanales() {
        List<Catalogo.Item> marcados = Favoritos.lista(this);
        List<Catalogo.Item> puestos = MasVistos.lista(this);
        /* Con un canal puesto una vez y ninguno marcado, «Tus canales» no
           dice lo que ves: dice que acabas de instalar esto. Es el mismo
           listón que la carpeta del directo, ver MasVistos.MINIMO */
        if (marcados.isEmpty() && puestos.size() < MasVistos.MINIMO) return null;

        List<Catalogo.Item> mios = new ArrayList<>();
        Set<String> ya = new HashSet<>();
        for (Catalogo.Item f : marcados) if (ya.add(f.id)) mios.add(f);
        for (Catalogo.Item v : puestos) if (ya.add(v.id)) mios.add(v);
        if (mios.isEmpty()) return null;
        if (mios.size() > CUANTOS_CANALES) mios = new ArrayList<>(mios.subList(0, CUANTOS_CANALES));
        return new Catalogo.Fila(TUS_CANALES, mios, false, "", false);
    }

    /**
     * El escaparate del directo.
     *
     * Eran los catorce primeros canales de la lista tal cual venían, y eso
     * en una lista de IPTV son «LA 1 4K», «LA 1 FHD», «LA 1 HD», «LA 1 SD»
     * y «LA 2 4K»: la pantalla de inicio entera enseñando el mismo canal
     * cuatro veces, con el logotipo del panel —que suele ser el número del
     * canal— de un palmo. No decía qué hay: decía que algo va mal.
     *
     * Ahora cada canal sale una vez —ver `Catalogo.sinRepetirCalidades`— y
     * los que ya están arriba en «Tus canales» no se repiten aquí.
     */
    private Catalogo.Fila enDirectoAhora() throws Exception {
        List<Catalogo.Item> todos = Catalogo.todoElDirecto();
        if (todos.isEmpty()) return null;

        Set<String> arriba = new HashSet<>();
        for (Catalogo.Item f : Favoritos.lista(this)) arriba.add(f.id);
        for (Catalogo.Item v : MasVistos.lista(this)) arriba.add(v.id);

        List<Catalogo.Item> escaparate = new ArrayList<>();
        for (Catalogo.Item c : Catalogo.sinRepetirCalidades(todos)) {
            if (arriba.contains(c.id)) continue;
            escaparate.add(c);
            if (escaparate.size() >= CUANTOS_CANALES) break;
        }
        return escaparate.isEmpty() ? null : new Catalogo.Fila(EN_DIRECTO, escaparate, false, "", false);
    }

    /**
     * Y qué echan ahora en cada uno, debajo del nombre.
     *
     * El rótulo dice «En directo ahora» y lo único que se veía era el
     * logotipo: para saber qué ponían había que entrar en el canal. La guía
     * se pide después de pintar la fila —son doce peticiones al panel— para
     * que la pantalla no espere por ella, y `Catalogo.guia` se la guarda,
     * así que la segunda vez es gratis.
     */
    private void ponerLoQueEchan(final View fila, final List<Catalogo.Item> canales) {
        final RecyclerView tira = fila.findViewById(R.id.carteles);
        /* En la cola de las imágenes y no en la de los datos: la guía es
           decoración, como un logotipo, y no puede ponerse por delante de
           las filas de cine y series que todavía están viniendo */
        Hilos.fueraLento(new Hilos.Trabajo<Boolean>() {
            @Override public Boolean hacer() {
                boolean alguno = false;
                for (Catalogo.Item c : canales) {
                    String echan = Catalogo.enAntena(c.id);
                    if (echan != null && !echan.isEmpty()) {
                        c.echan = echan;
                        alguno = true;
                    }
                }
                return alguno;
            }
        }, new Hilos.Luego<Boolean>() {
            @Override public void listo(Boolean alguno) {
                RecyclerView.Adapter<?> quien = tira.getAdapter();
                if (!alguno || quien == null) return;
                /* Celda a celda y no de golpe: `notifyDataSetChanged` rehace
                   las filas y se lleva por delante el foco de quien esté
                   recorriendo la fila justo en ese momento */
                for (int i = 0; i < canales.size(); i++) quien.notifyItemChanged(i);
            }
            @Override public void falla(Exception e) { /* la guía es un extra */ }
        });
    }

    /** Cuántas filas puede haber en el inicio. Ver `cargarFilas`. */
    private static final int FILAS_DEL_INICIO = 4;

    /** La primera fila de la portada de una sección, con su rótulo. */
    private Catalogo.Fila destacados(String seccion, String rotulo) throws Exception {
        List<Catalogo.Fila> suyas = Catalogo.portada(seccion);
        if (suyas.isEmpty()) return null;
        return new Catalogo.Fila(rotulo, suyas.get(0).items, false, "", true);
    }

    /**
     * Pide una fila y la coloca en su puesto en cuanto llega.
     *
     * `puestos` lleva un 1 en las que ya están, y de ahí sale en qué posición
     * hay que insertar: tantas como puestos anteriores ocupados. Así el orden
     * de la pantalla no depende de cuál conteste antes.
     */
    private void pedirFila(final LinearLayout donde, final int[] puestos, final int puesto,
                           Hilos.Trabajo<Catalogo.Fila> trabajo) {
        Hilos.fuera(trabajo, new Hilos.Luego<Catalogo.Fila>() {
            @Override public void listo(Catalogo.Fila f) {
                if (f == null || f.items.isEmpty()) return;
                int donde_va = 0;
                for (int i = 0; i < puesto; i++) donde_va += puestos[i];
                puestos[puesto] = 1;
                View fila = pintarFila(donde, f);
                donde.addView(fila, donde_va);
                // Y qué echan ahora en cada canal, que es lo que promete el rótulo
                if (deCanales(f.titulo)) ponerLoQueEchan(fila, f.items);
            }
            @Override public void falla(Exception e) {
                /* Una sección que no sirve el proveedor no impide las otras.
                   El aviso solo si no ha llegado ninguna */
                boolean alguna = false;
                for (int x : puestos) alguna = alguna || x == 1;
                if (alguna) return;
                TextView aviso = findViewById(R.id.aviso);
                if (aviso != null) {
                    aviso.setText("No se ha podido cargar lo que hay. Elige una sección arriba.");
                    aviso.setVisibility(View.VISIBLE);
                }
            }
        });
    }

    /** Arma una fila. Quien la llama decide dónde va. Ver `pedirFila`. */
    private View pintarFila(LinearLayout donde, Catalogo.Fila f) {
        LayoutInflater molde = LayoutInflater.from(this);
        View fila = molde.inflate(R.layout.pieza_fila, donde, false);
        ((TextView) fila.findViewById(R.id.rotulo)).setText(f.titulo);

        final List<Catalogo.Item> deLaFila = f.items;
        AdaptadorCarteles carteles = new AdaptadorCarteles(new AdaptadorCarteles.AlElegir() {
            @Override public void ficha(int posicion) {
                if (posicion >= 0 && posicion < deLaFila.size()) abrirDesdeElInicio(deLaFila, posicion);
            }
        });
        /* La fila del directo lleva canales, y un canal no es un cartel:
           su celda es apaisada y su logotipo cabe entero. Ver
           `AdaptadorCarteles.canales` */
        carteles.canales(deCanales(f.titulo));
        carteles.poner(deLaFila);

        RecyclerView tira = fila.findViewById(R.id.carteles);
        tira.setLayoutManager(new LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false));
        tira.setAdapter(carteles);
        /* Sin esto, al llegar al final de una fila el foco salta a la
           siguiente por dentro del RecyclerView y se pierde el sitio */
        tira.setFocusable(false);
        return fila;
    }

    /**
     * Qué pasa al pulsar algo de las filas.
     *
     * Un canal se pone; una película o una serie abren su ficha, que es donde
     * se decide de verdad si se quiere ver. Es lo mismo que hace la portada
     * de cada sección, y por eso se delega en ella en vez de repetir aquí la
     * mecánica de pedir enlaces.
     */
    private void abrirDesdeElInicio(List<Catalogo.Item> lista, int posicion) {
        Catalogo.Item it = lista.get(posicion);
        if (Enlaces.DIRECTO.equals(it.clase)) {
            /* Un canal se pone, y se le pasa la fila entera: así el zapeo con
               ▲▼ dentro del reproductor recorre lo que había en la fila */
            Traspaso.reproducir(lista, posicion);
            startActivity(new Intent(this, ReproductorActivity.class));
        } else {
            Traspaso.ficha = it;
            startActivity(new Intent(this, FichaActivity.class));
        }
    }

    /**
     * La versión instalada, abajo y en pequeño.
     *
     * Esta aplicación no se actualiza sola —es un APK que hay que reinstalar,
     * al revés que la web— así que sin el número en pantalla no hay forma de
     * saber si lo que se está mirando es lo último o lo de hace un mes. Sale
     * de `versionName`, que lo pone la propia compilación: no hay dos sitios
     * que puedan decir cosas distintas.
     */
    private void ponerVersion() {
        TextView donde = findViewById(R.id.version);
        if (donde == null) return;
        String cual = "";
        try {
            cual = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception niIdea) {
            /* Si el sistema no sabe decir su propia versión, mejor callarse
               que enseñar un hueco con la palabra «null» dentro */
        }
        if (cual == null || cual.isEmpty()) { donde.setVisibility(View.GONE); return; }
        donde.setText("Versión " + cual);
    }

    /** Deja «derecha» en uno y «izquierda» en el otro, en los dos sentidos. */
    private void encadenar(int izquierda, int derecha) {
        findViewById(izquierda).setNextFocusRightId(derecha);
        findViewById(derecha).setNextFocusLeftId(izquierda);
    }

    private void preparar(int cual, int icono, final String titulo, final String seccion) {
        final View tarjeta = findViewById(cual);
        ((ImageView) tarjeta.findViewById(R.id.icono)).setImageResource(icono);
        ((TextView) tarjeta.findViewById(R.id.titulo)).setText(titulo);
        final TextView detalle = tarjeta.findViewById(R.id.detalle);
        detalle.setText("Cargando…");
        Foco.agrandar(tarjeta, 1.04f);

        tarjeta.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                // Una tarjeta vacía se puede enfocar, pero no lleva a ninguna parte
                if (vacias.contains(seccion)) return;
                /* Cine y series entran por su portada —un destacado y filas
                   de carteles—; el directo, por sus carpetas, que es como se
                   busca un canal */
                Intent i = new Intent(InicioActivity.this,
                        Catalogo.DIRECTO.equals(seccion) ? DirectoActivity.class : PortadaActivity.class);
                i.putExtra("seccion", seccion);
                i.putExtra("titulo", titulo);
                startActivity(i);
            }
        });

        /*
         * Mantener pulsado actualiza esa sección.
         *
         * El proveedor añade canales y quita otros, y el catálogo se guarda
         * en memoria para que moverse sea instantáneo. Sin esto, la única
         * manera de ver lo nuevo era cerrar la aplicación entera.
         */
        tarjeta.setOnLongClickListener(new View.OnLongClickListener() {
            @Override public boolean onLongClick(View v) {
                Catalogo.olvidarSeccion(seccion);
                detalle.setText("Actualizando…");
                contar(tarjeta, detalle, seccion);
                Toast.makeText(InicioActivity.this,
                        "Actualizando " + titulo.toLowerCase(Locale.getDefault()) + "…",
                        Toast.LENGTH_SHORT).show();
                return true;
            }
        });

        contar(tarjeta, detalle, seccion);
    }

    /** Vuelve a preguntar por las tres secciones. */
    private void recargar() {
        preparar(R.id.tarjetaDirecto, R.drawable.ic_tv, "TV en directo", Catalogo.DIRECTO);
        preparar(R.id.tarjetaPelis, R.drawable.ic_cine, "Películas", Catalogo.PELIS);
        preparar(R.id.tarjetaSeries, R.drawable.ic_series, "Series", Catalogo.SERIES);
        /* Y lo de debajo también: «actualizar listas» vaciaba el catálogo y
           dejaba las filas enseñando lo de antes */
        cargarFilas();
    }

    private void contar(final View tarjeta, final TextView detalle, final String seccion) {
        /*
         * Cuántas carpetas hay dentro. No es un adorno: un proveedor que no
         * vende películas deja esa tarjeta vacía, y decirlo aquí ahorra
         * entrar, esperar y encontrarse la nada.
         */
        Hilos.fuera(new Hilos.Trabajo<Integer>() {
            @Override public Integer hacer() throws Exception { return Catalogo.carpetas(seccion).size(); }
        }, new Hilos.Luego<Integer>() {
            @Override public void listo(Integer cuantas) {
                vacias.remove(seccion);
                tarjeta.setAlpha(1f);
                if (cuantas == 0) {
                    /* Apagada, pero enfocable: quitarle el foco a una tarjeta
                       del medio parte el camino del mando y deja la de al
                       lado inalcanzable */
                    vacias.add(seccion);
                    detalle.setText("Tu proveedor no ofrece esto");
                    tarjeta.setAlpha(0.45f);
                } else {
                    detalle.setText(cuantas + (cuantas == 1 ? " categoría" : " categorías"));
                }
            }
            @Override public void falla(Exception e) {
                detalle.setText("No se ha podido consultar");
                vacias.add(seccion);
            }
        });
    }

    /** Desde el menú, atrás sale de la aplicación: no hay dónde volver. */
    @Override public void onBackPressed() {
        finish();
    }
}
