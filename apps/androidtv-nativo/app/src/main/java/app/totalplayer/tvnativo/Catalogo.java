package app.totalplayer.tvnativo;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * El catálogo del proveedor: directo, películas y series.
 *
 * Se pide por carpetas, no de golpe. Una lista de verdad trae ocho mil
 * canales y treinta mil películas: bajarlo todo al entrar son dos minutos de
 * pantalla en blanco y media tele quedándose sin memoria. Lo que se ha
 * pedido una vez se guarda, para que volver atrás sea instantáneo.
 */
public final class Catalogo {

    public static final String DIRECTO = "directo";
    public static final String PELIS = "pelis";
    public static final String SERIES = "series";
    /** La carpeta única que se usa cuando el proveedor no tiene carpetas. */
    public static final String TODAS = "*";

    /** Una carpeta del proveedor. */
    public static class Carpeta {
        public final String id, nombre;
        public Carpeta(String id, String nombre) { this.id = id; this.nombre = nombre; }
        @Override public String toString() { return nombre; }
    }

    /**
     * Un canal, una película o una serie. Es el mismo objeto a propósito:
     * las tres listas hacen lo mismo —enseñar algo y abrirlo—, y tener tres
     * clases casi iguales solo sirve para escribir tres veces cada pantalla.
     */
    public static class Item {
        public String id = "";
        public String nombre = "";
        public String imagen = "";
        /** Solo en las listas M3U, donde la dirección viene dada. */
        public String url = "";
        public String extension = "";
        public String sinopsis = "";
        /** Año, género o lo que el proveedor mande: la línea de debajo. */
        public String extra = "";
        public boolean esSerie = false;
        @Override public String toString() { return nombre; }
    }

    public static class Episodio {
        public String id = "", titulo = "", extension = "", imagen = "", sinopsis = "", url = "";
        public int temporada = 1, numero = 0;
    }

    /* ---------------- Lo ya pedido ---------------- */

    private static final Map<String, List<Carpeta>> carpetas = new LinkedHashMap<>();
    private static final Map<String, List<Item>> contenidos = new LinkedHashMap<>();
    private static final Map<String, List<Episodio>> episodios = new LinkedHashMap<>();
    /** Todos los canales de directo juntos, para buscar. */
    private static List<Item> todoElDirecto;
    /** La lista M3U entera, ya troceada en tres. */
    private static Map<String, Map<String, List<Item>>> m3u;

    private Catalogo() {}

    public static void vaciar() {
        carpetas.clear();
        contenidos.clear();
        episodios.clear();
        todoElDirecto = null;
        m3u = null;
    }

    /* ---------------- Carpetas ---------------- */

    public static List<Carpeta> carpetas(String seccion) throws Exception {
        List<Carpeta> ya = carpetas.get(seccion);
        if (ya != null) return ya;

        List<Carpeta> lista = new ArrayList<>();
        if (Sesion.actual().esXtream()) {
            String accion = DIRECTO.equals(seccion) ? "get_live_categories"
                    : PELIS.equals(seccion) ? "get_vod_categories" : "get_series_categories";
            JSONArray cats = new JSONArray(Web.pedir(Sesion.actual().api() + "&action=" + accion));
            for (int i = 0; i < cats.length(); i++) {
                JSONObject c = cats.getJSONObject(i);
                lista.add(new Carpeta(c.optString("category_id", ""), c.optString("category_name", "Otros")));
            }
        } else if (SERIES.equals(seccion)) {
            /* En M3U cada carpeta ya es una serie, así que no hay un nivel de
               carpetas encima: se enseñan todas juntas */
            lista.add(new Carpeta(TODAS, "Todas las series"));
        } else {
            for (String nombre : m3u().get(seccion).keySet()) lista.add(new Carpeta(nombre, nombre));
        }
        carpetas.put(seccion, lista);
        return lista;
    }

    /* ---------------- Contenido de una carpeta ---------------- */

    public static List<Item> contenido(String seccion, String carpetaId) throws Exception {
        String llave = seccion + "/" + carpetaId;
        List<Item> ya = contenidos.get(llave);
        if (ya != null) return ya;

        List<Item> lista;
        if (Sesion.actual().esXtream()) {
            lista = DIRECTO.equals(seccion) ? directoXtream(carpetaId)
                    : PELIS.equals(seccion) ? pelisXtream(carpetaId) : seriesXtream(carpetaId);
        } else if (SERIES.equals(seccion)) {
            lista = seriesDeM3u();
        } else {
            List<Item> deLaLista = m3u().get(seccion).get(carpetaId);
            lista = deLaLista == null ? new ArrayList<Item>() : deLaLista;
        }
        contenidos.put(llave, lista);
        return lista;
    }

    private static List<Item> directoXtream(String carpetaId) throws Exception {
        JSONArray flujos = new JSONArray(Web.pedir(
                Sesion.actual().api() + "&action=get_live_streams&category_id=" + Web.escapar(carpetaId)));
        List<Item> lista = new ArrayList<>();
        for (int i = 0; i < flujos.length(); i++) {
            JSONObject c = flujos.getJSONObject(i);
            String id = c.optString("stream_id", "");
            String nombre = c.optString("name", "").trim();
            if (id.isEmpty() || nombre.isEmpty()) continue;
            Item it = new Item();
            it.id = id;
            it.nombre = nombre;
            it.imagen = c.optString("stream_icon", "");
            /* .ts es el formato del directo en Xtream, y justo el que un
               navegador no sabe reproducir sin desmontarlo en JavaScript */
            it.url = Sesion.actual().urlDirecto(id);
            lista.add(it);
        }
        return lista;
    }

    private static List<Item> pelisXtream(String carpetaId) throws Exception {
        JSONArray flujos = new JSONArray(Web.pedir(
                Sesion.actual().api() + "&action=get_vod_streams&category_id=" + Web.escapar(carpetaId)));
        List<Item> lista = new ArrayList<>();
        for (int i = 0; i < flujos.length(); i++) {
            JSONObject c = flujos.getJSONObject(i);
            String id = c.optString("stream_id", "");
            String nombre = c.optString("name", "").trim();
            if (id.isEmpty() || nombre.isEmpty()) continue;
            Item it = new Item();
            it.id = id;
            it.nombre = nombre;
            it.imagen = c.optString("stream_icon", "");
            it.extension = c.optString("container_extension", "mp4");
            it.extra = juntar(c.optString("year", ""), c.optString("rating", ""));
            it.url = Sesion.actual().urlPelicula(id, it.extension);
            lista.add(it);
        }
        return lista;
    }

    private static List<Item> seriesXtream(String carpetaId) throws Exception {
        JSONArray flujos = new JSONArray(Web.pedir(
                Sesion.actual().api() + "&action=get_series&category_id=" + Web.escapar(carpetaId)));
        List<Item> lista = new ArrayList<>();
        for (int i = 0; i < flujos.length(); i++) {
            JSONObject c = flujos.getJSONObject(i);
            String id = c.optString("series_id", "");
            String nombre = c.optString("name", "").trim();
            if (id.isEmpty() || nombre.isEmpty()) continue;
            Item it = new Item();
            it.id = id;
            it.nombre = nombre;
            it.imagen = c.optString("cover", "");
            it.sinopsis = c.optString("plot", "");
            it.extra = juntar(c.optString("releaseDate", "").length() >= 4
                    ? c.optString("releaseDate", "").substring(0, 4) : "", c.optString("rating", ""));
            it.esSerie = true;
            lista.add(it);
        }
        return lista;
    }

    private static String juntar(String anio, String nota) {
        StringBuilder sb = new StringBuilder();
        if (anio != null && !anio.isEmpty() && !"null".equals(anio)) sb.append(anio);
        if (nota != null && !nota.isEmpty() && !"null".equals(nota) && !"0".equals(nota)) {
            if (sb.length() > 0) sb.append("  ·  ");
            sb.append("★ ").append(nota);
        }
        return sb.toString();
    }

    /* ---------------- La ficha de una película ---------------- */

    /** Rellena sinopsis y demás; si el proveedor no los da, se queda como estaba. */
    public static void detallePelicula(Item peli) {
        if (!Sesion.actual().esXtream() || !peli.sinopsis.isEmpty()) return;
        try {
            JSONObject r = new JSONObject(Web.pedir(
                    Sesion.actual().api() + "&action=get_vod_info&vod_id=" + Web.escapar(peli.id)));
            JSONObject info = r.optJSONObject("info");
            if (info == null) return;
            peli.sinopsis = primero(info.optString("plot", ""), info.optString("description", ""));
            String portada = primero(info.optString("movie_image", ""), info.optString("cover_big", ""));
            if (!portada.isEmpty()) peli.imagen = portada;
            String duracion = info.optString("duration", "");
            String genero = info.optString("genre", "");
            StringBuilder extra = new StringBuilder(peli.extra);
            if (!genero.isEmpty() && !"null".equals(genero)) {
                if (extra.length() > 0) extra.append("  ·  ");
                extra.append(genero);
            }
            if (!duracion.isEmpty() && !"null".equals(duracion)) {
                if (extra.length() > 0) extra.append("  ·  ");
                extra.append(duracion);
            }
            peli.extra = extra.toString();
        } catch (Exception e) {
            // Una ficha sin sinopsis se sigue viendo; sin película, no
        }
    }

    private static String primero(String a, String b) {
        return (a != null && !a.isEmpty() && !"null".equals(a)) ? a : (b == null || "null".equals(b) ? "" : b);
    }

    /* ---------------- Los episodios de una serie ---------------- */

    public static List<Episodio> episodios(Item serie) throws Exception {
        List<Episodio> ya = episodios.get(serie.id);
        if (ya != null) return ya;

        List<Episodio> lista = new ArrayList<>();
        if (Sesion.actual().esXtream()) {
            JSONObject r = new JSONObject(Web.pedir(
                    Sesion.actual().api() + "&action=get_series_info&series_id=" + Web.escapar(serie.id)));
            JSONObject info = r.optJSONObject("info");
            if (info != null && serie.sinopsis.isEmpty()) serie.sinopsis = info.optString("plot", "");
            JSONObject porTemporada = r.optJSONObject("episodes");
            if (porTemporada != null) {
                JSONArray temporadas = porTemporada.names();
                for (int t = 0; temporadas != null && t < temporadas.length(); t++) {
                    String clave = temporadas.optString(t);
                    JSONArray eps = porTemporada.optJSONArray(clave);
                    for (int i = 0; eps != null && i < eps.length(); i++) {
                        JSONObject e = eps.optJSONObject(i);
                        if (e == null) continue;
                        Episodio ep = new Episodio();
                        ep.id = e.optString("id", "");
                        ep.temporada = e.optInt("season", entero(clave));
                        ep.numero = e.optInt("episode_num", i + 1);
                        ep.titulo = e.optString("title", "Episodio " + ep.numero);
                        ep.extension = e.optString("container_extension", "mp4");
                        JSONObject datos = e.optJSONObject("info");
                        if (datos != null) {
                            ep.sinopsis = datos.optString("plot", "");
                            ep.imagen = datos.optString("movie_image", "");
                        }
                        ep.url = Sesion.actual().urlEpisodio(ep.id, ep.extension);
                        lista.add(ep);
                    }
                }
            }
        } else {
            // En M3U los episodios son entradas sueltas; ya vienen agrupadas
            List<Item> sueltos = m3u().get(SERIES).get(serie.nombre);
            for (int i = 0; sueltos != null && i < sueltos.size(); i++) {
                Item it = sueltos.get(i);
                Episodio ep = new Episodio();
                ep.id = it.id;
                ep.titulo = it.nombre;
                ep.url = it.url;
                ep.imagen = it.imagen;
                Matcher m = TEMPORADA.matcher(it.nombre);
                if (m.find()) {
                    ep.temporada = entero(m.group(2));
                    ep.numero = entero(m.group(3));
                }
                lista.add(ep);
            }
        }

        Collections.sort(lista, new Comparator<Episodio>() {
            @Override public int compare(Episodio a, Episodio b) {
                if (a.temporada != b.temporada) return a.temporada - b.temporada;
                return a.numero - b.numero;
            }
        });
        episodios.put(serie.id, lista);
        return lista;
    }

    private static int entero(String s) {
        try { return Integer.parseInt(s.trim()); } catch (Exception e) { return 0; }
    }

    /* ---------------- Buscar en el directo ---------------- */

    /** Todos los canales, para el buscador. Se piden una vez y se guardan. */
    public static List<Item> todoElDirecto() throws Exception {
        if (todoElDirecto != null) return todoElDirecto;
        List<Item> lista = new ArrayList<>();
        if (Sesion.actual().esXtream()) {
            JSONArray flujos = new JSONArray(Web.pedir(Sesion.actual().api() + "&action=get_live_streams"));
            for (int i = 0; i < flujos.length(); i++) {
                JSONObject c = flujos.getJSONObject(i);
                String id = c.optString("stream_id", "");
                String nombre = c.optString("name", "").trim();
                if (id.isEmpty() || nombre.isEmpty()) continue;
                Item it = new Item();
                it.id = id;
                it.nombre = nombre;
                it.imagen = c.optString("stream_icon", "");
                it.url = Sesion.actual().urlDirecto(id);
                lista.add(it);
            }
        } else {
            for (List<Item> deLaCarpeta : m3u().get(DIRECTO).values()) lista.addAll(deLaCarpeta);
        }
        todoElDirecto = lista;
        return lista;
    }

    /* ---------------- Qué echan ahora ---------------- */

    private static final Map<String, String[]> loQueEchan = new LinkedHashMap<>();

    /**
     * Lo que están dando y lo que viene después, para el canal enfocado.
     *
     * Un nombre de canal no dice nada: «AXN HD» no es una razón para
     * quedarse. Lo que hace que alguien pare de zapear es ver el título de
     * lo que están echando.
     */
    public static String[] guia(String streamId) {
        String[] ya = loQueEchan.get(streamId);
        if (ya != null) return ya;
        if (!Sesion.actual().esXtream()) return null;
        try {
            JSONObject r = new JSONObject(Web.pedir(Sesion.actual().api()
                    + "&action=get_short_epg&stream_id=" + Web.escapar(streamId) + "&limit=2"));
            JSONArray eps = r.optJSONArray("epg_listings");
            if (eps == null || eps.length() == 0) return null;
            String ahora = tituloEpg(eps.optJSONObject(0));
            String luego = eps.length() > 1 ? tituloEpg(eps.optJSONObject(1)) : "";
            String[] par = new String[] { ahora, luego };
            loQueEchan.put(streamId, par);
            return par;
        } catch (Exception e) {
            return null;
        }
    }

    /** Xtream manda los títulos de la guía en base64. */
    private static String tituloEpg(JSONObject ep) {
        if (ep == null) return "";
        String bruto = ep.optString("title", "");
        if (bruto.isEmpty()) return "";
        try {
            String claro = new String(android.util.Base64.decode(bruto, android.util.Base64.DEFAULT), "UTF-8");
            return claro.trim().isEmpty() ? bruto : claro.trim();
        } catch (Exception e) {
            return bruto;
        }
    }

    /* ---------------- Listas M3U ---------------- */

    private static final Pattern EXTINF = Pattern.compile("#EXTINF:[^,]*,(.*)");
    private static final Pattern ATRIBUTO = Pattern.compile("([a-zA-Z\\-]+)=\"([^\"]*)\"");
    /** «Serie X S02 E07», «Serie X - 2x07»: lo que de verdad manda la gente. */
    private static final Pattern TEMPORADA =
            Pattern.compile("(?i)^(.*?)[\\s._\\-]*S(\\d{1,2})[\\s._\\-]*E(\\d{1,3})");

    /**
     * Trocea la lista M3U en directo, películas y series.
     *
     * Un M3U no dice de qué es cada cosa, pero el que genera un panel Xtream
     * sí lo deja en la dirección: /live/, /movie/ y /series/. Con eso se
     * acierta en la inmensa mayoría, y lo que no encaje se queda en directo,
     * que es donde menos molesta.
     */
    private static Map<String, Map<String, List<Item>>> m3u() throws Exception {
        if (m3u != null) return m3u;

        Map<String, Map<String, List<Item>>> troceada = new LinkedHashMap<>();
        troceada.put(DIRECTO, new LinkedHashMap<String, List<Item>>());
        troceada.put(PELIS, new LinkedHashMap<String, List<Item>>());
        troceada.put(SERIES, new LinkedHashMap<String, List<Item>>());

        String texto = Web.pedir(Sesion.actual().servidor);
        String[] lineas = texto.split("\n");
        String nombre = "", logo = "", grupo = "";
        int n = 0;

        for (String cruda : lineas) {
            String linea = cruda.trim();
            if (linea.isEmpty()) continue;
            if (linea.startsWith("#EXTINF")) {
                Matcher m = EXTINF.matcher(linea);
                nombre = m.find() ? m.group(1).trim() : "";
                logo = "";
                grupo = "";
                Matcher a = ATRIBUTO.matcher(linea);
                while (a.find()) {
                    String clave = a.group(1).toLowerCase();
                    if ("tvg-logo".equals(clave)) logo = a.group(2);
                    else if ("group-title".equals(clave)) grupo = a.group(2);
                }
            } else if (!linea.startsWith("#")) {
                if (nombre.isEmpty()) nombre = "Canal " + (n + 1);
                Item it = new Item();
                it.id = "m3u-" + (n++);
                it.nombre = nombre;
                it.imagen = logo;
                it.url = linea;

                String seccion = linea.contains("/series/") ? SERIES
                        : linea.contains("/movie/") ? PELIS : DIRECTO;
                String carpeta = grupo.isEmpty() ? "Sin carpeta" : grupo;

                if (SERIES.equals(seccion)) {
                    // Las series se agrupan por su nombre, no por su carpeta:
                    // lo que se busca es la serie, no la temporada suelta
                    Matcher m = TEMPORADA.matcher(nombre);
                    carpeta = m.find() ? m.group(1).trim() : nombre;
                    if (carpeta.isEmpty()) carpeta = nombre;
                }

                Map<String, List<Item>> deLaSeccion = troceada.get(seccion);
                List<Item> donde = deLaSeccion.get(carpeta);
                if (donde == null) { donde = new ArrayList<>(); deLaSeccion.put(carpeta, donde); }
                donde.add(it);
                nombre = "";
            }
        }

        m3u = troceada;
        return m3u;
    }

    /** En M3U, cada «serie» es una carpeta: se enseña como una ficha. */
    public static List<Item> seriesDeM3u() throws Exception {
        List<Item> lista = new ArrayList<>();
        for (Map.Entry<String, List<Item>> e : m3u().get(SERIES).entrySet()) {
            Item it = new Item();
            it.id = e.getKey();
            it.nombre = e.getKey();
            it.esSerie = true;
            if (!e.getValue().isEmpty()) it.imagen = e.getValue().get(0).imagen;
            it.extra = e.getValue().size() + (e.getValue().size() == 1 ? " episodio" : " episodios");
            lista.add(it);
        }
        return lista;
    }
}
