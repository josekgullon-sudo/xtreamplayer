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
        setContentView(R.layout.inicio);
        if (!Guardia.haySesion(this)) return;

        Sesion s = Sesion.actual();
        // El nombre del proveedor manda sobre el nuestro: es su tele
        ((TextView) findViewById(R.id.marca))
                .setText((s.marca.isEmpty() ? "TOTALplayer" : s.marca).toUpperCase(Locale.getDefault()));

        String quien = s.perfil.isEmpty() ? s.entradaUsuario : s.perfil;
        /* En voz baja y en una línea: con las filas debajo, el saludo ya no
           es lo que llena la pantalla, y «¿Qué te apetece ver?» sobra cuando
           lo que hay se está viendo justo debajo */
        ((TextView) findViewById(R.id.saludo)).setText(quien.isEmpty() ? "" : "Hola, " + quien);
        ((TextView) findViewById(R.id.textoSalir)).setText(
                quien.isEmpty() ? "Cambiar de cuenta" : "No soy " + quien);

        preparar(R.id.tarjetaDirecto, R.drawable.ic_tv, "TV en directo", Catalogo.DIRECTO);
        preparar(R.id.tarjetaPelis, R.drawable.ic_cine, "Películas", Catalogo.PELIS);
        preparar(R.id.tarjetaSeries, R.drawable.ic_series, "Series", Catalogo.SERIES);
        prepararBajadas();
        cargarFilas();

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
        encadenar(R.id.botonActualizar, R.id.botonSalir);
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
    private void cargarFilas() {
        final LinearLayout donde = findViewById(R.id.filas);
        if (donde == null) return;
        donde.removeAllViews();
        Hilos.fuera(new Hilos.Trabajo<List<Catalogo.Fila>>() {
            @Override public List<Catalogo.Fila> hacer() throws Exception {
                List<Catalogo.Fila> salen = new ArrayList<>();
                /* En directo primero: es lo que se pone nueve de cada diez
                   veces que se enciende una televisión */
                try {
                    List<Catalogo.Item> canales = Catalogo.todoElDirecto();
                    if (!canales.isEmpty()) {
                        salen.add(new Catalogo.Fila("En directo ahora",
                                canales.subList(0, Math.min(14, canales.size())), false, "", false));
                    }
                } catch (Exception niIdea) { /* sin directo, las otras dos siguen */ }
                for (String seccion : new String[] { Catalogo.SERIES, Catalogo.PELIS }) {
                    try {
                        List<Catalogo.Fila> suyas = Catalogo.portada(seccion);
                        if (!suyas.isEmpty()) {
                            Catalogo.Fila f = suyas.get(0);
                            salen.add(new Catalogo.Fila(
                                    Catalogo.SERIES.equals(seccion) ? "Series destacadas" : "Películas destacadas",
                                    f.items, false, "", true));
                        }
                    } catch (Exception niIdea) { /* ídem */ }
                }
                return salen;
            }
        }, new Hilos.Luego<List<Catalogo.Fila>>() {
            @Override public void listo(List<Catalogo.Fila> lista) { pintarFilas(donde, lista); }
            @Override public void falla(Exception e) {
                TextView aviso = findViewById(R.id.aviso);
                if (aviso != null) {
                    aviso.setText("No se ha podido cargar lo que hay. Elige una sección arriba.");
                    aviso.setVisibility(View.VISIBLE);
                }
            }
        });
    }

    private void pintarFilas(LinearLayout donde, List<Catalogo.Fila> lista) {
        LayoutInflater molde = LayoutInflater.from(this);
        for (Catalogo.Fila f : lista) {
            if (f.items.isEmpty()) continue;
            View fila = molde.inflate(R.layout.pieza_fila, donde, false);
            ((TextView) fila.findViewById(R.id.rotulo)).setText(f.titulo);

            final List<Catalogo.Item> deLaFila = f.items;
            AdaptadorCarteles carteles = new AdaptadorCarteles(new AdaptadorCarteles.AlElegir() {
                @Override public void ficha(int posicion) {
                    if (posicion >= 0 && posicion < deLaFila.size()) abrirDesdeElInicio(deLaFila, posicion);
                }
            });
            carteles.poner(deLaFila);

            RecyclerView tira = fila.findViewById(R.id.carteles);
            tira.setLayoutManager(new LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false));
            tira.setAdapter(carteles);
            /* Sin esto, al llegar al final de una fila el foco salta a la
               siguiente por dentro del RecyclerView y se pierde el sitio */
            tira.setFocusable(false);
            donde.addView(fila);
        }
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
