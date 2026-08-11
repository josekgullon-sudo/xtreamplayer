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
        /* `datos` se queda para lo que de verdad hace falta contar —un error
           al pedir los episodios, sobre todo—, no para la ficha: eso ahora
           son chips y bloques con su rótulo */
        datos.setVisibility(View.GONE);
        pintarDatos();
        pintarSinopsis();
        prepararFavorito();
        Imagenes.cargar(cartel, ficha.imagen, ficha.esSerie ? R.drawable.ic_series : R.drawable.ic_cine);
        Imagenes.cargar((ImageView) findViewById(R.id.fondo), ficha.imagen, android.R.color.transparent);

        if (ficha.esSerie) prepararSerie();
        else prepararPelicula();
    }

    /**
     * Los datos del título, cada uno en su sitio.
     *
     * Lo que el proveedor no manda no se pinta. Un chip vacío o un «0» de
     * nota es peor que no decir nada: parece que la película está sin
     * valorar cuando lo que pasa es que ese panel no manda valoraciones.
     */
    private void pintarDatos() {
        chip(R.id.chipNota, ficha.nota.isEmpty() ? "" : "★ " + ficha.nota);
        chip(R.id.chipAnio, ficha.anio);
        chip(R.id.chipEdad, ficha.edad);
        chip(R.id.chipDuracion, ficha.duracion);
        chip(R.id.chipCalidad, calidadDe(ficha.nombre));

        rotulado(R.id.rotuloElenco, R.id.elenco, conPuntos(ficha.reparto));
        rotulado(R.id.rotuloGeneros, R.id.generos, conPuntos(ficha.generos));

        pintarNota();
    }

    /**
     * El círculo del porcentaje.
     *
     * La nota viene de 0 a 10 y aquí se enseña de 0 a 100, que es como la
     * lee cualquiera que venga de otra aplicación. Sin nota no se pinta el
     * círculo: un 0% dice algo que no sabemos.
     */
    private void pintarNota() {
        double n;
        try {
            n = Double.parseDouble(ficha.nota.replace(',', '.'));
        } catch (Exception noEsUnNumero) {
            return;
        }
        if (n <= 0) return;
        /* Algunos paneles la mandan ya sobre 100 */
        int porciento = (int) Math.round(n > 10 ? n : n * 10);
        if (porciento > 100) porciento = 100;
        ProgressBar anillo = findViewById(R.id.anilloNota);
        if (anillo != null) anillo.setProgress(porciento);
        TextView texto = findViewById(R.id.textoNota);
        if (texto != null) texto.setText(porciento + "%");
        View bloque = findViewById(R.id.bloqueNota);
        if (bloque != null) bloque.setVisibility(View.VISIBLE);
        View pie = findViewById(R.id.pieNota);
        if (pie != null && pie.getLayoutParams() != null && pie.getLayoutParams().width != 0) {
            pie.setVisibility(View.VISIBLE);
        }
    }

    /** El corazón: marca y desmarca, y nace sabiendo cómo está. */
    private void prepararFavorito() {
        final ImageView corazon = findViewById(R.id.botonFavorito);
        if (corazon == null) return;
        pintarCorazon(corazon, Favoritos.marcados(this).contains(ficha.id));
        corazon.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                pintarCorazon(corazon, Favoritos.alternar(FichaActivity.this, ficha));
            }
        });
    }

    private void pintarCorazon(ImageView corazon, boolean marcado) {
        corazon.setImageResource(marcado ? R.drawable.ic_corazon_lleno : R.drawable.ic_corazon);
        corazon.setColorFilter(getResources().getColor(marcado ? R.color.marca_viva : R.color.apagado));
    }

    /** Pone un chip, o lo deja escondido si no hay nada que poner. */
    private void chip(int id, String valor) {
        TextView v = findViewById(id);
        if (v == null) return;
        if (valor == null || valor.trim().isEmpty()) {
            v.setVisibility(View.GONE);
            return;
        }
        v.setText(valor.trim());
        v.setVisibility(View.VISIBLE);
    }

    /** Un bloque con su rótulo de color: o se ven los dos, o ninguno. */
    private void rotulado(int idRotulo, int idTexto, String valor) {
        View rotulo = findViewById(idRotulo);
        TextView texto = findViewById(idTexto);
        boolean hay = valor != null && !valor.trim().isEmpty();
        if (rotulo != null) rotulo.setVisibility(hay ? View.VISIBLE : View.GONE);
        if (texto != null) {
            texto.setText(hay ? valor.trim() : "");
            texto.setVisibility(hay ? View.VISIBLE : View.GONE);
        }
    }

    /**
     * «Matt Smith, Emma D'Arcy» → «Matt Smith • Emma D'Arcy».
     *
     * Los paneles los separan por comas y los nombres compuestos también
     * llevan comas dentro a veces; el punto medio deja claro dónde acaba
     * cada uno y es lo que hace la referencia.
     */
    private String conPuntos(String lista) {
        if (lista == null || lista.trim().isEmpty()) return "";
        String[] trozos = lista.split("\\s*,\\s*");
        StringBuilder sb = new StringBuilder();
        for (String t : trozos) {
            if (t.trim().isEmpty()) continue;
            if (sb.length() > 0) sb.append("  •  ");
            sb.append(t.trim());
        }
        return sb.toString();
    }

    /**
     * La calidad, sacada del nombre.
     *
     * No hay ningún campo para esto: los proveedores la escriben dentro del
     * título —«La casa del dragón FHD», «[4K] Obsesión»— y en la lista queda
     * como ruido. Aquí se saca a su chip.
     */
    private String calidadDe(String nombre) {
        String n = nombre == null ? "" : nombre.toUpperCase(java.util.Locale.ROOT);
        if (n.contains("4K") || n.contains("UHD") || n.contains("2160")) return "4K";
        if (n.contains("FHD") || n.contains("1080")) return "FHD";
        if (n.contains("HD")) return "HD";
        if (n.contains("SD")) return "SD";
        return "";
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
                /* La nota, el reparto y el año llegan en esa misma respuesta */
                pintarDatos();
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
                /* La nota, el reparto y el año llegan en esa misma respuesta */
                pintarDatos();
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
