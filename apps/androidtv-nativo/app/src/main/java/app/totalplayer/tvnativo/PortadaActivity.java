package app.totalplayer.tvnativo;

import android.content.Intent;
import android.app.Activity;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.List;

/**
 * La portada de cine y de series.
 *
 * Antes esta sección era una columna de carpetas y una rejilla: para mirar
 * algo había que saber antes en qué carpeta estaba. Esto contesta a la
 * pregunta con la que se entra —«¿y qué veo?»—: un banner arriba con un
 * título y su ficha, y debajo filas de carteles que se recorren de lado.
 *
 * Las carpetas no desaparecen: siguen en su pantalla, a un OK del botón del
 * final. Lo que cambia es qué se enseña primero.
 */
public class PortadaActivity extends Activity {

    private String seccion = Catalogo.PELIS;
    private LinearLayout filas;
    private ProgressBar girando;
    private TextView vacio;
    private Catalogo.Item destacado;

    @Override protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        Pantalla.colocar(this);
        setContentView(R.layout.portada);
        if (!Guardia.haySesion(this)) return;

        seccion = getIntent().getStringExtra("seccion");
        if (seccion == null) seccion = Catalogo.PELIS;

        filas = findViewById(R.id.filas);
        girando = findViewById(R.id.girando);
        vacio = findViewById(R.id.vacio);
        /* Escondido del todo, no invisible: hasta que no haya una imagen de
           verdad, el banner no ocupa sitio. Un hueco reservado y vacío es
           lo que hacía que la portada abriese con media pantalla en negro */
        findViewById(R.id.heroe).setVisibility(View.GONE);

        Navegacion.montar(this, seccion);
        cargar();
    }

    private void cargar() {
        girando.setVisibility(View.VISIBLE);
        Hilos.fuera(new Hilos.Trabajo<List<Catalogo.Fila>>() {
            @Override public List<Catalogo.Fila> hacer() throws Exception {
                return Catalogo.portada(seccion);
            }
        }, new Hilos.Luego<List<Catalogo.Fila>>() {
            @Override public void listo(List<Catalogo.Fila> lista) {
                girando.setVisibility(View.GONE);
                if (lista.isEmpty()) {
                    decir("Tu proveedor no ha enviado nada en esta sección.");
                    return;
                }
                pintar(lista);
            }
            @Override public void falla(Exception e) {
                girando.setVisibility(View.GONE);
                decir(Hilos.enCristiano(e));
            }
        });
    }

    private void decir(String que) {
        vacio.setText(que);
        vacio.setVisibility(View.VISIBLE);
    }

    /** Cuántos carteles se enseñan en una fila de escaparate. */
    private static final int EN_ESCAPARATE = 10;

    private void pintar(List<Catalogo.Fila> lista) {
        LayoutInflater molde = LayoutInflater.from(this);
        for (Catalogo.Fila f : lista) {
            View fila = molde.inflate(R.layout.pieza_fila, filas, false);
            ((TextView) fila.findViewById(R.id.rotulo)).setText(f.titulo);

            /* Se pregunta al adaptador por lo que hay en esa posición, no a
               la lista de la fila: en las de escaparate no son la misma cosa
               —el repaso cambia unos carteles por otros— y con la lista de
               la fila se abría la ficha de una película distinta */
            final AdaptadorCarteles[] suyos = new AdaptadorCarteles[1];
            final AdaptadorCarteles carteles = new AdaptadorCarteles(new AdaptadorCarteles.AlElegir() {
                @Override public void ficha(int posicion) {
                    Catalogo.Item it = suyos[0].enPosicion(posicion);
                    if (it != null) abrir(it);
                }
            });
            suyos[0] = carteles;
            carteles.numerada(f.numerada);
            carteles.ancho(anchoDeCartel());
            /* La fila de escaparate se pinta con los primeros y luego se
               repasa: los que no tengan carátula se cambian por otros */
            List<Catalogo.Item> aLaVista = f.escaparate
                    ? f.items.subList(0, Math.min(EN_ESCAPARATE, f.items.size()))
                    : f.items;
            carteles.poner(aLaVista);

            RecyclerView tira = fila.findViewById(R.id.carteles);
            tira.setLayoutManager(new LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false));
            tira.setAdapter(carteles);
            /* Sin esto, al llegar al final de una fila el foco salta a la
               siguiente por dentro del RecyclerView y se pierde el sitio */
            tira.setFocusable(false);
            filas.addView(fila);

            if (f.escaparate) depurar(carteles, tira, f, new ArrayList<Catalogo.Item>(), 0);
        }

        verTodas(molde);
        buscarDestacado(Catalogo.candidatosDestacado(lista), 0);
    }

    /**
     * Cuánto mide un cartel de la portada.
     *
     * Más pequeño que el de la rejilla de carpetas, y por una razón concreta:
     * con el cartel de 150 puntos, debajo del banner solo cabía una fila y
     * el cliente no llegaba a ver que hubiera más. Con 132 entra la primera
     * entera y asoma el rótulo de la segunda, que es lo que hace bajar.
     */
    private int anchoDeCartel() {
        float porPunto = getResources().getDisplayMetrics().density;
        return (int) ((Pantalla.esMovil(this) ? 112 : 132) * porPunto);
    }

    /**
     * Repasa una fila de escaparate y tira lo que no tenga carátula.
     *
     * «Mejor valoradas» se elige de todo el catálogo, así que hay treinta
     * candidatos para diez puestos. Se van probando en orden y se queda con
     * los diez primeros cuya imagen conteste de verdad: en la tele, esa fila
     * abría con un cuadrado gris en el puesto uno porque el proveedor
     * apuntaba a una carátula que ya no existe.
     *
     * No se toca la fila si el mando está encima: cambiarle los carteles a
     * alguien que está pasando por ellos es peor que el cuadrado gris.
     */
    private void depurar(final AdaptadorCarteles carteles, final RecyclerView tira,
                         final Catalogo.Fila fila, final List<Catalogo.Item> buenos, final int cual) {
        if (buenos.size() >= EN_ESCAPARATE || cual >= fila.items.size()) {
            if (buenos.size() >= 4 && !tira.hasFocus()) carteles.poner(buenos);
            return;
        }
        final Catalogo.Item it = fila.items.get(cual);
        Imagenes.probar(it.imagen, 400, new Imagenes.Traida() {
            @Override public void llega(Bitmap b) {
                if (isFinishing()) return;
                if (b != null) buenos.add(it);
                depurar(carteles, tira, fila, buenos, cual + 1);
            }
        });
    }

    /** Cuántos candidatos se prueban antes de rendirse y dejar solo las filas. */
    private static final int CANDIDATOS = 8;

    /**
     * Busca un destacado cuya imagen llegue de verdad.
     *
     * Se pide la carátula del primer candidato; si no llega —el proveedor
     * apunta a una dirección muerta, que pasa a menudo—, se prueba el
     * siguiente. El banner no aparece hasta que hay una imagen en la mano,
     * así que no existe el caso «título enorme sobre un rectángulo negro»: o
     * sale entero o no sale.
     *
     * Si se acaban los candidatos, la portada se queda en filas y ya. Es lo
     * honesto: media pantalla ocupada por un hueco no informa de nada.
     */
    private void buscarDestacado(final List<Catalogo.Item> candidatos, final int cual) {
        if (candidatos.isEmpty() || cual >= Math.min(CANDIDATOS, candidatos.size())) return;
        final Catalogo.Item it = candidatos.get(cual);
        final int ancho = Math.max(getResources().getDisplayMetrics().widthPixels, 640);
        Imagenes.probar(it.imagen, ancho, new Imagenes.Traida() {
            @Override public void llega(Bitmap b) {
                if (isFinishing()) return;
                if (b == null) {
                    buscarDestacado(candidatos, cual + 1);
                    return;
                }
                destacado = it;
                pintarHeroe(b);
                completarFicha(it);
            }
        });
    }

    /**
     * Pide la ficha del destacado para poder enseñar su sinopsis.
     *
     * En el listado de películas el panel manda el nombre, la nota y el año,
     * pero no el argumento: eso solo viene en `get_vod_info`. Es una llamada
     * y solo para el título de arriba, así que sale a cuenta —sin ella el
     * banner enseña un nombre y dos números—.
     */
    private void completarFicha(final Catalogo.Item it) {
        if (it.esSerie || !it.sinopsis.isEmpty()) return;
        Hilos.fuera(new Hilos.Trabajo<Boolean>() {
            @Override public Boolean hacer() {
                Catalogo.detallePelicula(it);
                return Boolean.TRUE;
            }
        }, new Hilos.Luego<Boolean>() {
            @Override public void listo(Boolean r) {
                if (isFinishing() || destacado != it) return;
                TextView sinopsis = findViewById(R.id.heroeSinopsis);
                sinopsis.setText(it.sinopsis);
                sinopsis.setVisibility(it.sinopsis.isEmpty() ? View.GONE : View.VISIBLE);
                ((TextView) findViewById(R.id.heroeDatos)).setText(datosDe(it));
                pintarNota();
            }
            @Override public void falla(Exception e) { /* se queda como estaba */ }
        });
    }

    /**
     * La salida a las carpetas, al final de todo.
     *
     * La portada enseña las primeras seis carpetas y veinte títulos de cada
     * una. Un proveedor trae cuarenta carpetas y miles de títulos: sin esta
     * puerta, el resto del catálogo dejaría de existir.
     */
    private void verTodas(LayoutInflater molde) {
        View fila = molde.inflate(R.layout.pieza_fila, filas, false);
        fila.findViewById(R.id.carteles).setVisibility(View.GONE);
        TextView rotulo = fila.findViewById(R.id.rotulo);
        rotulo.setText("Ver todas las carpetas  ›");
        rotulo.setBackgroundResource(R.drawable.pastilla);
        int x = (int) (18 * getResources().getDisplayMetrics().density);
        int y = (int) (10 * getResources().getDisplayMetrics().density);
        rotulo.setPadding(x, y, x, y);
        rotulo.setFocusable(true);
        rotulo.setClickable(true);
        rotulo.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                Intent i = new Intent(PortadaActivity.this, VodActivity.class);
                i.putExtra("seccion", seccion);
                i.putExtra("titulo", Catalogo.SERIES.equals(seccion) ? "Series" : "Películas");
                startActivity(i);
            }
        });
        filas.addView(fila);
    }

    /** El banner de arriba, con su imagen ya en la mano. */
    private void pintarHeroe(Bitmap portada) {
        if (destacado == null) return;
        View heroe = findViewById(R.id.heroe);
        heroe.setVisibility(View.VISIBLE);

        ((TextView) findViewById(R.id.heroeTitulo)).setText(destacado.nombre);
        ((TextView) findViewById(R.id.heroeDatos)).setText(datosDe(destacado));
        TextView sinopsis = findViewById(R.id.heroeSinopsis);
        sinopsis.setText(destacado.sinopsis);
        sinopsis.setVisibility(destacado.sinopsis.isEmpty() ? View.GONE : View.VISIBLE);

        /*
         * La misma imagen dos veces y a propósito.
         *
         * Lo que manda el proveedor es una carátula vertical, no un fondo
         * apaisado. La primera versión la estiraba de lado a lado y salía
         * gigante y blanda: eso es lo que se veía mal. Ahora va de fondo
         * convertida en una mancha de sus propios colores, y entera y en su
         * proporción a la derecha, que es donde se mira.
         */
        ((ImageView) findViewById(R.id.fondo)).setImageBitmap(manchaDe(portada));
        ImageView cartel = findViewById(R.id.heroeCartel);
        if (cartel != null) {
            cartel.setImageBitmap(portada);
            cartel.setVisibility(View.VISIBLE);
        }

        /* El banner aparece después de las filas, así que hay que devolver la
           vista arriba: si no, la portada abre por la mitad */
        final View scroll = findViewById(R.id.scroll);
        scroll.post(new Runnable() {
            @Override public void run() { scroll.scrollTo(0, 0); }
        });

        TextView ver = findViewById(R.id.heroeVer);
        ver.setText(destacado.esSerie ? "Ver la serie" : "Reproducir");
        ver.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { abrir(destacado); }
        });
        /* Y el foco se va con él. Sin esto el mando se queda en el primer
           cartel de la primera fila y el ScrollView vuelve a bajar solo en
           cuanto se toca una flecha, deshaciendo el `scrollTo` de arriba */
        ver.requestFocus();

        pintarNota();
    }

    /**
     * Un desenfoque de pobre: bajar la carátula a 24 puntos y volver a
     * estirarla a lo ancho de la tele.
     *
     * Al ampliar tanto una imagen de 24×36, lo que queda es una mancha suave
     * de sus propios colores —Android interpola al dibujarla—, que es
     * exactamente el fondo que se quería y no cuesta ni una librería ni un
     * milisegundo. Un desenfoque de verdad haría falta RenderScript, que
     * está retirado, o recorrer el mapa de bits a mano.
     */
    private static Bitmap manchaDe(Bitmap b) {
        try {
            return Bitmap.createScaledBitmap(b, 24, 36, true);
        } catch (Throwable niEso) {
            return b;
        }
    }

    /** El círculo del porcentaje, si el proveedor manda nota. */
    private void pintarNota() {
        double n;
        try {
            n = Double.parseDouble(destacado.nota.replace(',', '.'));
        } catch (Exception noEsUnNumero) {
            return;
        }
        if (n <= 0) return;
        int porciento = (int) Math.round(n > 10 ? n : n * 10);
        if (porciento > 100) porciento = 100;
        ((ProgressBar) findViewById(R.id.heroeAnillo)).setProgress(porciento);
        ((TextView) findViewById(R.id.heroeNota)).setText(porciento + "%");
        findViewById(R.id.heroeBloqueNota).setVisibility(View.VISIBLE);
    }

    /** «2026 · ★ 8.2 · Terror, Suspense», con lo que haya. */
    private String datosDe(Catalogo.Item it) {
        StringBuilder sb = new StringBuilder();
        if (!it.anio.isEmpty()) sb.append(it.anio);
        if (!it.nota.isEmpty()) {
            if (sb.length() > 0) sb.append("   ·   ");
            sb.append("★ ").append(it.nota);
        }
        if (!it.generos.isEmpty()) {
            if (sb.length() > 0) sb.append("   ·   ");
            sb.append(it.generos);
        }
        return sb.toString();
    }

    private void abrir(Catalogo.Item it) {
        Traspaso.ficha = it;
        startActivity(new Intent(this, FichaActivity.class));
    }
}
