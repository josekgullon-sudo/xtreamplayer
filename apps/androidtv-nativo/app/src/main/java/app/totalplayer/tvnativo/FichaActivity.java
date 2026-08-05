package app.totalplayer.tvnativo;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * La ficha de una película o de una serie.
 *
 * Antes no había ninguna: se pulsaba un nombre y o arrancaba o no. Aquí se
 * ve de qué va, de qué año es y —si es serie— qué temporadas hay, que es lo
 * que hace falta para decidir sin tener que probar.
 */
public class FichaActivity extends Activity {

    private Catalogo.Item ficha;
    private TextView titulo, datos, sinopsis;
    private ImageView cartel;
    private Button botonVer;
    private LinearLayout bloqueSerie, temporadas, episodios;
    private ProgressBar girando;

    private final Map<Integer, List<Catalogo.Episodio>> porTemporada = new LinkedHashMap<>();

    @Override protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        Pantalla.colocar(this);
        setContentView(R.layout.ficha);
        if (!Guardia.haySesion(this)) return;

        ficha = Traspaso.ficha;
        if (ficha == null) { finish(); return; }

        titulo = findViewById(R.id.titulo);
        datos = findViewById(R.id.datos);
        sinopsis = findViewById(R.id.sinopsis);
        cartel = findViewById(R.id.cartel);
        botonVer = findViewById(R.id.botonVer);
        bloqueSerie = findViewById(R.id.bloqueSerie);
        temporadas = findViewById(R.id.temporadas);
        episodios = findViewById(R.id.episodios);
        girando = findViewById(R.id.girando);

        titulo.setText(ficha.nombre);
        datos.setText(ficha.extra);
        datos.setVisibility(ficha.extra.isEmpty() ? View.GONE : View.VISIBLE);
        pintarSinopsis();
        Imagenes.cargar(cartel, ficha.imagen, ficha.esSerie ? R.drawable.ic_series : R.drawable.ic_cine);
        Imagenes.cargar((ImageView) findViewById(R.id.fondo), ficha.imagen, android.R.color.transparent);

        if (ficha.esSerie) prepararSerie();
        else prepararPelicula();
    }

    private void pintarSinopsis() {
        sinopsis.setText(ficha.sinopsis.isEmpty()
                ? "Tu proveedor no ha enviado una descripción de este título."
                : ficha.sinopsis);
    }

    /* ---------------- Película ---------------- */

    private void prepararPelicula() {
        botonVer.setText("Ver ahora");
        botonVer.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                Traspaso.reproducirSuelto(ficha.url, ficha.nombre, ficha.imagen,
                        Enlaces.PELICULA, ficha.id, ficha.extension);
                startActivity(new Intent(FichaActivity.this, ReproductorActivity.class));
            }
        });
        botonVer.requestFocus();

        // La sinopsis y la carátula grande llegan en otra petición; la
        // película se puede ver mientras tanto
        Hilos.fuera(new Hilos.Trabajo<Boolean>() {
            @Override public Boolean hacer() {
                Catalogo.detallePelicula(ficha);
                return true;
            }
        }, new Hilos.Luego<Boolean>() {
            @Override public void listo(Boolean b) {
                pintarSinopsis();
                datos.setText(ficha.extra);
                datos.setVisibility(ficha.extra.isEmpty() ? View.GONE : View.VISIBLE);
                Imagenes.cargar(cartel, ficha.imagen, R.drawable.ic_cine);
            }
            @Override public void falla(Exception e) { /* la ficha ya se ve */ }
        });
    }

    /* ---------------- Serie ---------------- */

    private void prepararSerie() {
        botonVer.setText("Ver el primer episodio");
        botonVer.setEnabled(false);
        bloqueSerie.setVisibility(View.VISIBLE);
        girando.setVisibility(View.VISIBLE);

        Hilos.fuera(new Hilos.Trabajo<List<Catalogo.Episodio>>() {
            @Override public List<Catalogo.Episodio> hacer() throws Exception {
                return Catalogo.episodios(ficha);
            }
        }, new Hilos.Luego<List<Catalogo.Episodio>>() {
            @Override public void listo(List<Catalogo.Episodio> lista) {
                girando.setVisibility(View.GONE);
                pintarSinopsis();
                if (lista.isEmpty()) {
                    botonVer.setVisibility(View.GONE);
                    bloqueSerie.setVisibility(View.GONE);
                    datos.setText("Tu proveedor no ha enviado los episodios de esta serie.");
                    datos.setVisibility(View.VISIBLE);
                    return;
                }

                porTemporada.clear();
                for (Catalogo.Episodio ep : lista) {
                    List<Catalogo.Episodio> donde = porTemporada.get(ep.temporada);
                    if (donde == null) { donde = new ArrayList<>(); porTemporada.put(ep.temporada, donde); }
                    donde.add(ep);
                }

                pintarTemporadas();
                final Catalogo.Episodio primero = lista.get(0);
                botonVer.setText(primero.temporada > 0 && primero.numero > 0
                        ? "Ver T" + primero.temporada + " · E" + primero.numero
                        : "Ver el primer episodio");
                botonVer.setEnabled(true);
                botonVer.setOnClickListener(new View.OnClickListener() {
                    @Override public void onClick(View v) { ver(primero); }
                });
                botonVer.requestFocus();
            }
            @Override public void falla(Exception e) {
                girando.setVisibility(View.GONE);
                botonVer.setVisibility(View.GONE);
                datos.setText(Hilos.enCristiano(e));
                datos.setVisibility(View.VISIBLE);
            }
        });
    }

    private void pintarTemporadas() {
        temporadas.removeAllViews();
        LayoutInflater de = LayoutInflater.from(this);
        boolean primera = true;
        for (final Integer numero : porTemporada.keySet()) {
            TextView chip = (TextView) de.inflate(R.layout.pieza_temporada, temporadas, false);
            chip.setText(numero == 0 ? "Episodios" : "Temporada " + numero);
            chip.setActivated(primera);
            chip.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) { elegirTemporada(numero); }
            });
            chip.setOnFocusChangeListener(new View.OnFocusChangeListener() {
                @Override public void onFocusChange(View v, boolean tiene) {
                    if (tiene) elegirTemporada(numero);
                }
            });
            temporadas.addView(chip);
            primera = false;
        }
        // Una sola temporada no es una elección: se ahorra la fila
        temporadas.setVisibility(porTemporada.size() > 1 ? View.VISIBLE : View.GONE);
        elegirTemporada(porTemporada.keySet().iterator().next());
    }

    private void elegirTemporada(int numero) {
        for (int i = 0; i < temporadas.getChildCount(); i++) {
            View chip = temporadas.getChildAt(i);
            chip.setActivated(i == indiceDe(numero));
        }
        pintarEpisodios(porTemporada.get(numero));
    }

    private int indiceDe(int temporada) {
        int i = 0;
        for (Integer n : porTemporada.keySet()) {
            if (n == temporada) return i;
            i++;
        }
        return -1;
    }

    private void pintarEpisodios(List<Catalogo.Episodio> lista) {
        episodios.removeAllViews();
        if (lista == null) return;
        LayoutInflater de = LayoutInflater.from(this);
        for (final Catalogo.Episodio ep : lista) {
            View fila = de.inflate(R.layout.pieza_episodio, episodios, false);
            ((TextView) fila.findViewById(R.id.numero))
                    .setText(ep.numero > 0 ? String.valueOf(ep.numero) : "");
            Imagenes.cargar((android.widget.ImageView) fila.findViewById(R.id.foto),
                    ep.imagen.isEmpty() ? ficha.imagen : ep.imagen, R.drawable.ic_series);
            ((TextView) fila.findViewById(R.id.titulo)).setText(ep.titulo);
            TextView resumen = fila.findViewById(R.id.sinopsis);
            if (!ep.sinopsis.isEmpty()) {
                resumen.setText(ep.sinopsis);
                resumen.setVisibility(View.VISIBLE);
            }
            fila.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) { ver(ep); }
            });
            episodios.addView(fila);
        }
    }

    private void ver(Catalogo.Episodio ep) {
        Traspaso.reproducirSuelto(ep.url, ficha.nombre + " · " + ep.titulo,
                ep.imagen.isEmpty() ? ficha.imagen : ep.imagen,
                Enlaces.EPISODIO, ep.id, ep.extension);
        startActivity(new Intent(this, ReproductorActivity.class));
    }
}
