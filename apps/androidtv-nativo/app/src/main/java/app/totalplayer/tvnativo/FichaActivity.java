package app.totalplayer.tvnativo;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import app.totalplayer.comun.Descargas;

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
    private TextView botonVer;
    private LinearLayout bloqueSerie, temporadas, episodios;
    private ProgressBar girando;
    private ImageView botonBajar;
    /*
     * La columna del botón de bajar: el icono, y debajo la palabra.
     *
     * La visibilidad es de la columna y no del icono. Estando en el icono, al
     * esconderlo —que es lo normal: solo hay algo que bajar en una película o
     * en un episodio— la palabra «Descargar» se quedaba sola en la fila,
     * debajo de nada.
     */
    private View bloqueBajar;
    private TextView etiquetaBajar;
    /*
     * Guardar en el aparato.
     *
     * El mismo motor que usan las otras dos aplicaciones de Android —está en
     * apps/comun—, solo que aquí no hace falta puente ni servidor local: el
     * reproductor es nativo y abre el fichero por su ruta.
     */
    private Descargas guardadas;

    private final Map<Integer, List<Catalogo.Episodio>> porTemporada = new LinkedHashMap<>();

    @Override protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        Pantalla.colocar(this);
        Tipos.poner(this);
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
        botonBajar = findViewById(R.id.botonBajar);
        bloqueBajar = findViewById(R.id.bloqueBajar);
        etiquetaBajar = findViewById(R.id.etiquetaBajar);
        guardadas = new Descargas(this);

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
        /* Con coma, que es como se escriben aquí los decimales y como lo
           dicen la web y la tele */
        chip(R.id.chipNota, ficha.nota.isEmpty() ? "" : "★ " + ficha.nota.replace('.', ','));
        chip(R.id.chipAnio, ficha.anio);
        chip(R.id.chipEdad, ficha.edad);
        chip(R.id.chipDuracion, ficha.duracion);
        chip(R.id.chipCalidad, calidadDe(ficha.nombre));

        rotulado(R.id.rotuloElenco, R.id.elenco, conPuntos(ficha.reparto));
        rotulado(R.id.rotuloGeneros, R.id.generos, conPuntos(ficha.generos));

        pintarNota();
        pedirReparto();
        pedirArte();
    }

    /**
     * El reparto con la cara de cada uno, si nuestro servidor lo sabe.
     *
     * Fuera del hilo de la pantalla: es una petición por red y la ficha ya
     * está pintada con lo que manda el panel. Cuando llega, las caras
     * sustituyen a la línea de nombres; si no llega o no se sabe, esa línea
     * se queda donde estaba y aquí no ha pasado nada.
     */
    private void pedirReparto() {
        final boolean esSerie = ficha.esSerie;
        Hilos.fuera(new Hilos.Trabajo<java.util.List<Catalogo.Actor>>() {
            @Override public java.util.List<Catalogo.Actor> hacer() {
                return Catalogo.reparto(ficha.nombre, ficha.anio, esSerie);
            }
        }, new Hilos.Luego<java.util.List<Catalogo.Actor>>() {
            @Override public void listo(java.util.List<Catalogo.Actor> gente) {
                pintarReparto(gente);
            }
            @Override public void falla(Exception e) {
                /* Sin caras, los nombres del panel. No es un error que deba
                   llegar a ninguna pantalla */
            }
        });
    }

    /**
     * El fondo apaisado, si nuestro servidor lo sabe.
     *
     * De fondo va la carátula vertical: un recorte del centro estirado a lo
     * ancho de un televisor, que da el color del título y poco más. El
     * apaisado lo sabe TMDB y sale de la misma fila que el reparto, así que
     * no cuesta una petición más. Y si el panel tampoco manda carátula, la
     * de TMDB llena ese hueco en vez de dejar el dibujo de reserva.
     */
    private void pedirArte() {
        final boolean esSerie = ficha.esSerie;
        Hilos.fuera(new Hilos.Trabajo<Catalogo.Arte>() {
            @Override public Catalogo.Arte hacer() {
                return Catalogo.arte(ficha.nombre, ficha.anio, esSerie);
            }
        }, new Hilos.Luego<Catalogo.Arte>() {
            @Override public void listo(Catalogo.Arte suyo) {
                pintarArte(suyo);
            }
            @Override public void falla(Exception e) {
                /* Sin fondo, la ficha se queda como estaba */
            }
        });
    }

    private void pintarArte(Catalogo.Arte suyo) {
        if (suyo == null) return;
        if (!suyo.cartel.isEmpty() && ficha.imagen.isEmpty()) {
            Imagenes.cargar((ImageView) findViewById(R.id.cartel), suyo.cartel,
                    ficha.esSerie ? R.drawable.ic_series : R.drawable.ic_cine);
        }
        if (suyo.fondo.isEmpty()) return;
        ImageView fondo = findViewById(R.id.fondo);
        if (fondo == null) return;
        /* Y con algo más de luz que la carátula: aquello era un trozo del
           centro de una imagen vertical y a un 14% es solo color; esto es la
           foto entera y a su forma, que es lo que se quiere ver detrás */
        fondo.setAlpha(0.30f);
        Imagenes.cargar(fondo, suyo.fondo, android.R.color.transparent);
    }

    private void pintarReparto(java.util.List<Catalogo.Actor> gente) {
        LinearLayout fila = findViewById(R.id.filaReparto);
        View bloque = findViewById(R.id.bloqueReparto);
        View rotulo = findViewById(R.id.rotuloReparto);
        if (fila == null || bloque == null || rotulo == null || gente == null || gente.isEmpty()) return;

        fila.removeAllViews();
        LayoutInflater de = LayoutInflater.from(this);
        for (Catalogo.Actor a : gente) {
            View pieza = de.inflate(R.layout.pieza_actor, fila, false);
            ((TextView) pieza.findViewById(R.id.nombreActor)).setText(a.nombre);
            ((TextView) pieza.findViewById(R.id.personaje)).setText(a.personaje);
            Imagenes.cargarRedonda((ImageView) pieza.findViewById(R.id.cara), a.foto, R.drawable.perfil_lleno);
            fila.addView(pieza);
        }
        rotulo.setVisibility(View.VISIBLE);
        bloque.setVisibility(View.VISIBLE);
        /* Y la línea de nombres se va: dice lo mismo que las caras y una
           debajo de la otra parecen dos repartos distintos */
        View viejoRotulo = findViewById(R.id.rotuloElenco);
        View viejoTexto = findViewById(R.id.elenco);
        if (viejoRotulo != null) viejoRotulo.setVisibility(View.GONE);
        if (viejoTexto != null) viejoTexto.setVisibility(View.GONE);
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
        /* La palabra se enciende con el corazón. Si solo cambiara el dibujo,
           desde el sofá los dos estados se parecen demasiado */
        TextView rotulo = findViewById(R.id.etiquetaFavorito);
        if (rotulo != null) {
            rotulo.setTextColor(getResources().getColor(marcado ? R.color.marca_viva : R.color.apagado));
        }
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
        prepararBajada("vod-" + ficha.id, ficha.nombre, ficha.imagen,
                Enlaces.PELICULA, ficha.id, ficha.extension, ficha.url);

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
        /* Apagado hasta que lleguen los episodios. Es un TextView y no un
           Button —ver el layout—, así que el apagado hay que pintarlo: un
           Button lo hacía el sistema, y con él venía el estilo del fabricante
           pisando el fondo rojo y dejando la pastilla blanca en algunos
           televisores */
        botonVer.setEnabled(false);
        botonVer.setAlpha(0.5f);
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
                botonVer.setAlpha(1f);
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
        /*
         * Cuántas temporadas, arriba con los demás datos.
         *
         * No es lo mismo empezar algo de una temporada que algo de nueve, y
         * es lo primero que se pregunta de una serie. La fila de abajo lo
         * dice —«Temporada 1», «Temporada 2»…— pero con una sola no se
         * pinta, que no hay nada que elegir, y entonces no se dice en
         * ninguna parte. Es el mismo dato que ya sale en la web y en la
         * tele. Si el panel no numera las temporadas, la única que hay es la
         * 0 y decir «1 temporada» sería inventárselo.
         */
        int cuantas = porTemporada.size();
        boolean sinNumerar = cuantas == 1 && porTemporada.containsKey(0);
        chip(R.id.chipTemporadas,
                sinNumerar ? "" : cuantas + (cuantas == 1 ? " temporada" : " temporadas"));

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
            /* En la lista de episodios el icono va suelto: la fila ya dice
               de qué episodio se trata y una palabra más solo estorba */
            pintarBoton(fila.findViewById(R.id.bajar), null, "ep-" + ep.id,
                    ficha.nombre + " · " + ep.titulo,
                    ep.imagen.isEmpty() ? ficha.imagen : ep.imagen,
                    Enlaces.EPISODIO, ep.id, ep.extension, ep.url);
            episodios.addView(fila);
        }
    }

    /** El botón de la cabecera, para una película. */
    private void prepararBajada(String id, String nombre, String cartel,
                                String clase, String cual, String ext, String yaLaTengo) {
        if (bloqueBajar != null) bloqueBajar.setVisibility(View.VISIBLE);
        pintarBoton(botonBajar, etiquetaBajar, id, nombre, cartel, clase, cual, ext, yaLaTengo);
    }

    /**
     * Un botón de descargar, con sus tres caras.
     *
     * Sin nada guardado, la flecha. Bajando, la flecha apagada —el porcentaje
     * está en la pantalla de Descargas, y meterlo aquí obligaría a repintar
     * la ficha cada segundo—. Ya guardado, la papelera: poner y quitar son la
     * misma decisión y se toman desde el mismo sitio, que es lo que evita que
     * un disco se llene y no se vacíe nunca.
     */
    private void pintarBoton(final ImageView boton, final TextView rotulo, final String id,
                             final String nombre, final String cartel, final String clase,
                             final String cual, final String ext, final String yaLaTengo) {
        if (boton == null) return;
        boton.setVisibility(View.VISIBLE);
        final Descargas.Cosa como = guardadas.comoVa(id);
        final boolean laTengo = como != null && "lista".equals(como.estado);
        boton.setImageResource(laTengo ? R.drawable.ic_papelera : R.drawable.ic_bajar);
        boton.setContentDescription(laTengo ? "Quitar del aparato" : "Descargar");
        /* La palabra dice lo mismo que el dibujo, y cambia con él: con la
           película ya guardada el icono es una papelera, y debajo tiene que
           poner «Quitar» y no «Descargar» */
        if (rotulo != null) rotulo.setText(laTengo ? "Quitar" : (como != null ? "Bajando" : "Descargar"));
        boton.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                if (como != null) {
                    guardadas.quitar(id);
                    Toast.makeText(FichaActivity.this, "Quitado del aparato", Toast.LENGTH_SHORT).show();
                    pintarBoton(boton, rotulo, id, nombre, cartel, clase, cual, ext, yaLaTengo);
                    return;
                }
                /* La dirección se pide al pulsar y fuera del hilo de la
                   pantalla: es una petición al panel del proveedor y en una
                   tele con wifi flojo son segundos, no milisegundos */
                Toast.makeText(FichaActivity.this, "Preparando la descarga…", Toast.LENGTH_SHORT).show();
                Hilos.fuera(new Hilos.Trabajo<String>() {
                    @Override public String hacer() throws Exception {
                        return Enlaces.paraVer(clase, cual, ext, yaLaTengo);
                    }
                }, new Hilos.Luego<String>() {
                    @Override public void listo(String url) {
                        guardadas.pedir(id, nombre, cartel, url);
                        Toast.makeText(FichaActivity.this,
                                "Descargando. Lo tienes en Descargas", Toast.LENGTH_LONG).show();
                        pintarBoton(boton, rotulo, id, nombre, cartel, clase, cual, ext, yaLaTengo);
                    }
                    @Override public void falla(Exception e) {
                        Toast.makeText(FichaActivity.this, Hilos.enCristiano(e), Toast.LENGTH_LONG).show();
                    }
                });
            }
        });
    }

    private void ver(Catalogo.Episodio ep) {
        Traspaso.reproducirSuelto(ep.url, ficha.nombre + " · " + ep.titulo,
                ep.imagen.isEmpty() ? ficha.imagen : ep.imagen,
                Enlaces.EPISODIO, ep.id, ep.extension);
        startActivity(new Intent(this, ReproductorActivity.class));
    }
}
