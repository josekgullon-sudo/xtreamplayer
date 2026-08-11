package app.totalplayer.tvnativo;

import java.text.Normalizer;
import java.util.Locale;

/**
 * De qué va una carpeta, mirándole el nombre.
 *
 * Lo mismo que hace la web en `lib/categorias.ts`, y con las mismas palabras
 * y en el mismo orden: si aquí y allí una carpeta sale con dibujos
 * distintos, el cliente que usa las dos cosas cree que son dos catálogos.
 *
 * Una lista de proveedor trae sesenta carpetas y buena parte empiezan por la
 * misma palabra: «DAZN SLB», «DAZN - MOTO GP», «DAZN | EVENTOS», «DAZN - F1».
 * Puestas una debajo de otra son la misma mancha de texto y hay que leerlas
 * enteras para distinguirlas. Con un casco, un calendario y un balón delante
 * se distinguen de un vistazo, que es como se elige carpeta con un mando.
 *
 * El nombre es lo único que hay: el panel no manda ningún tipo ni ningún
 * icono. Y el orden de abajo importa: «MOTO GP» tiene que caer en motor
 * antes de que «GP» se lo lleve otra cosa, y «SERIE A» en fútbol antes que
 * en series.
 */
public final class Categorias {

    private Categorias() {}

    /** Sin acentos, sin signos y en minúsculas: «DAZN | Fútbol» y «dazn futbol» son lo mismo. */
    private static String llano(String texto) {
        if (texto == null) return "";
        String n = Normalizer.normalize(texto.toLowerCase(Locale.ROOT), Normalizer.Form.NFD);
        n = n.replaceAll("[\\u0300-\\u036f]", "");
        n = n.replaceAll("[^a-z0-9]+", " ").trim();
        return n;
    }

    /** Una familia: el dibujo y las palabras por las que se reconoce. */
    private static final class Familia {
        final int icono;
        final String[] palabras;
        Familia(int icono, String... palabras) { this.icono = icono; this.palabras = palabras; }
    }

    private static final Familia[] FAMILIAS = {
        new Familia(R.drawable.ic_cat_casco,
            "f1", "formula", "formula 1", "moto", "motogp", "moto gp", "motor", "rally", "nascar", "indycar", "superbike"),
        new Familia(R.drawable.ic_cat_guante,
            "ufc", "boxeo", "boxing", "mma", "wwe", "aew", "lucha", "combate"),
        new Familia(R.drawable.ic_cat_balon,
            "futbol", "laliga", "la liga", "premier", "champions", "bundesliga", "serie a", "ligue 1",
            "hypermotion", "rfef", "copa", "mundial", "eurocopa", "libertadores", "mls", "liga mx"),
        new Familia(R.drawable.ic_cat_silbato,
            "deporte", "deportes", "sport", "sports", "dazn", "espn", "bein", "eurosport", "basket",
            "nba", "acb", "tenis", "golf", "padel", "ciclismo", "atletismo", "nfl", "mlb", "nhl"),
        new Familia(R.drawable.ic_cat_calendario,
            "evento", "eventos", "event", "events", "ppv", "24 7", "24 h"),
        new Familia(R.drawable.ic_cat_bebe,
            "infantil", "infantiles", "kids", "nino", "ninos", "dibujos", "cartoon", "disney", "junior", "baby", "peques"),
        new Familia(R.drawable.ic_cat_musica,
            "musica", "music", "mtv", "radio", "hits", "conciertos"),
        new Familia(R.drawable.ic_cat_noticias,
            "noticia", "noticias", "news", "informativo", "informativos", "24h", "actualidad"),
        new Familia(R.drawable.ic_cat_libro,
            "documental", "documentales", "docu", "discovery", "natgeo", "national geographic",
            "history", "historia", "ciencia", "naturaleza"),
        new Familia(R.drawable.ic_cine,
            "cine", "peliculas", "pelicula", "movie", "movies", "estrenos"),
        new Familia(R.drawable.ic_series,
            "serie", "series", "novela", "novelas", "temporada"),
        new Familia(R.drawable.ic_cat_antena,
            "tdt", "autonomico", "autonomicos", "nacional", "nacionales", "locales", "generalista", "generalistas"),
    };

    /**
     * Qué dibujo le toca a esta carpeta. Lo que no encaja en nada se queda
     * con el de televisión, que es lo que es: una carpeta de canales.
     */
    public static int icono(String nombre) {
        String n = " " + llano(nombre) + " ";
        for (Familia f : FAMILIAS) {
            for (String palabra : f.palabras) {
                if (n.contains(" " + palabra + " ")) return f.icono;
            }
        }
        return R.drawable.ic_tv;
    }
}
