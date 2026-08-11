package app.totalplayer.tvnativo;

import android.content.Intent;
import android.app.Activity;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import java.util.List;

/**
 * La portada de cine y de series.
 *
 * Antes esta sección era una columna de carpetas y una rejilla: para mirar
 * algo había que saber antes en qué carpeta estaba. Esto contesta a la
 * pregunta con la que se entra —«¿y qué veo?»—: un título grande arriba con
 * su ficha, y debajo filas de carteles que se recorren de lado.
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
        findViewById(R.id.heroe).setVisibility(View.INVISIBLE);

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

    private void pintar(List<Catalogo.Fila> lista) {
        /* El destacado sale de la primera fila: es lo mejor valorado que
           tiene carátula, así que es lo que mejor queda de fondo */
        for (Catalogo.Fila f : lista) {
            for (Catalogo.Item i : f.items) {
                if (!i.imagen.isEmpty()) { destacado = i; break; }
            }
            if (destacado != null) break;
        }
        pintarHeroe();

        LayoutInflater molde = LayoutInflater.from(this);
        boolean primera = true;
        for (Catalogo.Fila f : lista) {
            View fila = molde.inflate(R.layout.pieza_fila, filas, false);
            TextView rotulo = fila.findViewById(R.id.rotulo);
            rotulo.setText(f.titulo);
            /* La primera fila lleva su rótulo en una pastilla sólida y las
               demás en blanco a secas: no todas pesan lo mismo, y eso tiene
               que verse sin leerlas */
            if (primera) {
                rotulo.setBackgroundResource(R.drawable.rotulo_fila);
                rotulo.setTextColor(getResources().getColor(R.color.negro_marca));
                int x = (int) (14 * getResources().getDisplayMetrics().density);
                int y = (int) (5 * getResources().getDisplayMetrics().density);
                rotulo.setPadding(x, y, x, y);
                primera = false;
            }

            final Catalogo.Fila suya = f;
            AdaptadorCarteles carteles = new AdaptadorCarteles(new AdaptadorCarteles.AlElegir() {
                @Override public void ficha(int posicion) {
                    abrir(suya.items.get(posicion));
                }
            });
            carteles.numerada(f.numerada);
            carteles.poner(f.items);

            RecyclerView tira = fila.findViewById(R.id.carteles);
            tira.setLayoutManager(new LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false));
            tira.setAdapter(carteles);
            /* Sin esto, al llegar al final de una fila el foco salta a la
               siguiente por dentro del RecyclerView y se pierde el sitio */
            tira.setFocusable(false);
            filas.addView(fila);
        }

        verTodas(molde);
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

    /** El título grande de arriba, con lo que se sepa de él. */
    private void pintarHeroe() {
        if (destacado == null) return;
        View heroe = findViewById(R.id.heroe);
        heroe.setVisibility(View.VISIBLE);

        ((TextView) findViewById(R.id.heroeTitulo)).setText(destacado.nombre);
        ((TextView) findViewById(R.id.heroeDatos)).setText(datosDe(destacado));
        TextView sinopsis = findViewById(R.id.heroeSinopsis);
        sinopsis.setText(destacado.sinopsis);
        sinopsis.setVisibility(destacado.sinopsis.isEmpty() ? View.GONE : View.VISIBLE);

        Imagenes.cargar((ImageView) findViewById(R.id.fondo), destacado.imagen,
                android.R.color.transparent);

        Button ver = findViewById(R.id.heroeVer);
        ver.setText(destacado.esSerie ? "Ver la serie" : "Reproducir");
        ver.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { abrir(destacado); }
        });

        pintarNota();
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
