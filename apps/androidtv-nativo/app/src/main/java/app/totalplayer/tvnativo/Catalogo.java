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

    /**
     * A quién se le pide.
     *
     * Con lista de la plataforma, a totalplayer.app enseñando la galleta; con
     * lista propia, al panel del proveedor. Escrito una vez aquí para que no
     * se olvide en la próxima llamada que se añada.
     */
    private static String pedir(String direccion) throws Exception {
        return Sesion.actual().gestionada ? Web.enCasa(direccion) : Web.pedir(direccion);
    }

    /*
     * TODO lo que pide catálogo pasa por `pedir`, nunca por `Web.pedir`.
     *
     * Aquí estaba el fallo que dejaba la aplicación inservible con una cuenta
     * de proveedor: las CARPETAS se pedían con `pedir` —con la galleta— y su
     * CONTENIDO con `Web.pedir` —sin ella—. El resultado era que las carpetas
     * cargaban, se veían, y al entrar en cualquiera salía «Entra en tu cuenta
     * para ver tu lista» estando dentro. Con lista propia no se notaba,
     * porque ahí las dos rutas hacen lo mismo.
     */

    public static final String DIRECTO = "directo";
    public static final String PELIS = "pelis";
    public static final String SERIES = "series";
    /** La carpeta única que se usa cuando el proveedor no tiene carpetas. */
    public static final String TODAS = "*";

    /** Una carpeta del proveedor. */
    public static class Carpeta {
        public final String id, nombre;
        /**
         * Cuántos trae dentro, o 0 si todavía no se sabe.
         *
         * Con una lista M3U se sabe desde el principio, porque el fichero
         * viene entero. Con un panel Xtream no: las carpetas se piden en una
         * llamada y sus canales en otra, y bajar los ocho mil solo para
         * poder escribir un número es justo lo que esta aplicación no hace.
         * Así que se aprende al abrirla y a partir de ahí ya se dice.
         */
        public int cuantos;
        public Carpeta(String id, String nombre) { this.id = id; this.nombre = nombre; }
        public Carpeta(String id, String nombre, int cuantos) { this(id, nombre); this.cuantos = cuantos; }
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
        /**
         * Qué clase de cosa es, para poder pedir su dirección al ir a verla.
         *
         * Con lista de la plataforma, `url` viene vacía a propósito: la
         * dirección no baja al aparato con el catálogo, se pide una a una al
         * pulsar. Esto es lo que hace falta saber para pedirla.
         */
        public String clase = Enlaces.DIRECTO;
        public String extension = "";
        public String sinopsis = "";
        /** Año, género o lo que el proveedor mande: la línea de debajo. */
        public String extra = "";
        /*
         * Y lo mismo, pero desmenuzado.
         *
         * `extra` es una sola cadena con todo pegado por puntos, que vale
         * para una línea debajo de un cartel y no vale para nada más: en la
         * ficha cada dato quiere su sitio —la nota en un chip, la edad en
         * otro, el reparto en su párrafo—. Se rellenan al abrir la ficha,
         * que es cuando se le pregunta al proveedor por el detalle.
         */
        public String nota = "";
        public String anio = "";
        public String edad = "";
        public String generos = "";
        public String reparto = "";
        public String duracion = "";
        /** Si ya se le ha preguntado al proveedor por el detalle de este. */
        public boolean detallePedido = false;
        /**
         * Cuándo lo subió el proveedor, en segundos.
         *
         * Viene en el listado, no en la ficha, y es lo único con lo que se
         * puede armar una fila de «recién añadidos» sin pedir mil fichas.
         */
        public long alta = 0;
        public boolean esSerie = false;
        /** El número que le ha puesto el proveedor. Solo en el directo. */
        public int numero = 0;
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
    /** Y lo mismo con las películas y las series. */
    private static List<Item> todasLasPelis, todasLasSeries;
    /** La lista M3U entera, ya troceada en tres. */
    private static Map<String, Map<String, List<Item>>> m3u;

    private Catalogo() {}

    public static void vaciar() {
        carpetas.clear();
        contenidos.clear();
        episodios.clear();
        todoElDirecto = null;
        todasLasPelis = null;
        todasLasSeries = null;
        m3u = null;
    }

    /**
     * Tira lo guardado de una sección para volver a pedirlo.
     *
     * Hace falta una manera de decir «vuelve a preguntar»: el proveedor
     * añade canales, cambia carpetas o se le cae el servidor un rato, y sin
     * esto la única salida era cerrar la aplicación y volver a abrirla.
     */
    public static void olvidarSeccion(String seccion) {
        carpetas.remove(seccion);
        List<String> fuera = new ArrayList<>();
        for (String llave : contenidos.keySet()) {
            if (llave.startsWith(seccion + "/")) fuera.add(llave);
        }
        for (String llave : fuera) contenidos.remove(llave);
        if (DIRECTO.equals(seccion)) {
            todoElDirecto = null;
            loQueEchan.clear();
        }
        if (PELIS.equals(seccion)) todasLasPelis = null;
        if (SERIES.equals(seccion)) { episodios.clear(); todasLasSeries = null; }
        // La lista M3U es una sola descarga para las tres secciones
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
            JSONArray cats = new JSONArray(pedir(Sesion.actual().api() + "&action=" + accion));
            for (int i = 0; i < cats.length(); i++) {
                JSONObject c = cats.getJSONObject(i);
                lista.add(new Carpeta(c.optString("category_id", ""), c.optString("category_name", "Otros")));
            }
        } else if (SERIES.equals(seccion)) {
            /* En M3U cada carpeta ya es una serie, así que no hay un nivel de
               carpetas encima: se enseñan todas juntas */
            lista.add(new Carpeta(TODAS, "Todas las series"));
        } else {
            for (Map.Entry<String, List<Item>> e : m3u().get(seccion).entrySet()) {
                lista.add(new Carpeta(e.getKey(), e.getKey(), e.getValue().size()));
            }
        }
        carpetas.put(seccion, lista);
        return lista;
    }

    /* ---------------- La portada: filas de una sección ---------------- */

    /** Una fila de la portada: un rótulo y sus títulos. */
    public static class Fila {
        public final String titulo;
        public final List<Item> items;
        /**
         * Si va numerada del 1 al 10, como el «en tendencia» de cualquier
         * aplicación de este tipo.
         */
        public final boolean numerada;
        /** La carpeta de la que sale, para el «ver todas». Vacío si es inventada. */
        public final String carpetaId;
        /**
         * Si la pantalla puede tirar de esta lista los que no tengan imagen.
         *
         * Solo las filas inventadas —lo mejor valorado, lo recién añadido—.
         * Son un escaparate: se eligen de todo el catálogo, así que sobran
         * candidatos y no cuesta nada quedarse con los que tienen carátula.
         * En la fila de una carpeta no vale: ahí están los que hay, y
         * esconder la mitad porque el proveedor no les puso imagen es
         * quitarle al cliente películas que sí puede ver.
         */
        public final boolean escaparate;
        public Fila(String titulo, List<Item> items, boolean numerada, String carpetaId) {
            this(titulo, items, numerada, carpetaId, false);
        }
        public Fila(String titulo, List<Item> items, boolean numerada, String carpetaId, boolean escaparate) {
            this.titulo = titulo;
            this.items = items;
            this.numerada = numerada;
            this.carpetaId = carpetaId;
            this.escaparate = escaparate;
        }
    }

    /** Cuántas carpetas se traen para la portada: más son más esperas. */
    private static final int CARPETAS_EN_PORTADA = 6;
    /** Y cuántos títulos por fila: los que caben de largo y un poco más. */
    private static final int POR_FILA = 20;

    /**
     * Las filas de la portada de cine o de series.
     *
     * Se traen las primeras carpetas del proveedor y con ellas se arman dos
     * filas inventadas —lo mejor valorado y lo último subido— más una fila
     * por carpeta. Las inventadas van primero porque son las que contestan a
     * «¿y qué veo?», que es la pregunta con la que se entra aquí.
     *
     * Un aviso que conviene tener escrito: «en tendencia» **no es un dato
     * que exista**. Nadie nos dice qué se está viendo más. Lo que hay es la
     * nota que manda el proveedor, así que esa fila es «mejor valoradas» y
     * se llama así. Inventar una tendencia ordenando por cualquier cosa y
     * ponerle ese nombre sería mentirle al cliente.
     *
     * Y va acotada a los últimos años. La nota sola sacaba arriba una
     * comedia de 1928 con un 10 puesto a mano por el proveedor: técnicamente
     * la mejor valorada del catálogo, y ninguna razón para enseñarla la
     * primera. Lo que se pone en la portada es lo bueno **de ahora**.
     */
    public static List<Fila> portada(String seccion) throws Exception {
        List<Fila> filas = new ArrayList<>();
        List<Carpeta> suyas = carpetas(seccion);
        List<Item> todos = new ArrayList<>();

        for (Carpeta c : suyas) {
            if (filas.size() >= CARPETAS_EN_PORTADA) break;
            List<Item> dentro;
            try {
                dentro = contenido(seccion, c.id);
            } catch (Exception falloDeUna) {
                /* Una carpeta que no contesta no puede dejar la portada en
                   blanco: se salta y las demás siguen */
                continue;
            }
            if (dentro.isEmpty()) continue;
            todos.addAll(dentro);
            filas.add(new Fila(Categorias.bonito(c.nombre), recorta(sinRepetir(dentro)), false, c.id));
        }

        if (todos.isEmpty()) return filas;

        List<Fila> arriba = new ArrayList<>();
        List<Item> valoradas = mejorValoradas(todos);
        if (valoradas.size() >= 4) arriba.add(new Fila("Mejor valoradas", valoradas, true, "", true));
        List<Item> recientes = recienAnadidas(todos);
        if (recientes.size() >= 4) {
            arriba.add(new Fila("Añadidas recientemente", recientes, false, "", true));
        }
        arriba.addAll(filas);
        return arriba;
    }

    /* ---------------- Lo de ahora ---------------- */

    /** Cuántos años atrás sigue contando como «de ahora». */
    private static final int VENTANA_DE_ANIOS = 3;

    /**
     * El año en el que estamos, para saber qué es reciente.
     *
     * Se lee del reloj del aparato. Un Fire Stick recién sacado de la caja
     * puede tener el reloj en 1970 hasta que coge la hora por la red, y
     * entonces «los últimos tres años» no dejaría pasar nada; por eso, si el
     * año que sale es anterior a cuando se escribió esto, no se filtra.
     */
    private static int anioDeHoy() {
        int a = java.util.Calendar.getInstance().get(java.util.Calendar.YEAR);
        return a < 2026 ? 0 : a;
    }

    /** Si el título es de los últimos años, con el año que traiga el panel. */
    private static boolean deAhora(Item i, int hoy) {
        if (hoy == 0) return true;
        int suyo = entero(i.anio);
        return suyo > 0 && suyo >= hoy - (VENTANA_DE_ANIOS - 1);
    }

    /**
     * Se queda con los de los últimos años, y solo si quedan bastantes.
     *
     * Un proveedor con catálogo viejo, o que no manda el año, se quedaría
     * con una fila de tres títulos —o de ninguno— si esto no tuviera vuelta
     * atrás. Debajo de ocho no merece la pena: se enseña el catálogo entero,
     * que es peor que lo ideal pero mucho mejor que una fila vacía.
     */
    private static List<Item> soloDeAhora(List<Item> de) {
        int hoy = anioDeHoy();
        if (hoy == 0) return de;
        List<Item> nuevos = new ArrayList<>();
        for (Item i : de) {
            if (deAhora(i, hoy)) nuevos.add(i);
        }
        return nuevos.size() >= 8 ? nuevos : de;
    }

    private static List<Item> recorta(List<Item> de) {
        return new ArrayList<>(de.subList(0, Math.min(POR_FILA, de.size())));
    }

    /* ---------------- Que no salga dos veces lo mismo ---------------- */

    /**
     * Los adornos que un proveedor le cuelga al título y que no lo cambian.
     *
     * La misma película está en «ESTRENOS» y en «ACCIÓN», y a veces la
     * segunda copia se llama igual con un «4K» o un «[LAT]» detrás. Para el
     * que mira la tele son la misma película, y verla dos veces en la misma
     * fila —una en el puesto 1 y otra en el 4— es de las cosas que hacen
     * pensar que la aplicación está rota.
     *
     * Van sin tildes porque cuando esto se aplica ya se han quitado: por eso
     * pone «espanol» y no «español».
     */
    private static final Pattern ADORNOS = Pattern.compile(
            "(?i)\\b(4k|uhd|fhd|hd|sd|hdr|dolby|atmos|latino|castellano|espanol|"
            + "vose|imax|remux|webdl|web-dl|bluray)\\b");

    /**
     * El mismo título escrito de dos maneras da la misma llave.
     *
     * Se quita el adorno, se quitan tildes y signos y se junta todo: «30
     * (2007)» y «30 (2007) HD» acaban los dos en «302007». El año se
     * mantiene a propósito —«Alien (1979)» y «Alien (2017)» no son la misma
     * película— y por eso no se borra lo que va entre paréntesis.
     */
    private static String llaveDeTitulo(String nombre) {
        if (nombre == null) return "";
        String n = java.text.Normalizer.normalize(nombre, java.text.Normalizer.Form.NFD)
                .replaceAll("[\\u0300-\\u036f]", "")
                .toLowerCase(java.util.Locale.ROOT);
        n = ADORNOS.matcher(n).replaceAll(" ");
        return n.replaceAll("[^a-z0-9]+", "");
    }

    /** La misma lista, quedándose con la primera copia de cada título. */
    private static List<Item> sinRepetir(List<Item> de) {
        List<Item> unos = new ArrayList<>();
        java.util.Set<String> vistos = new java.util.HashSet<>();
        for (Item i : de) {
            String llave = llaveDeTitulo(i.nombre);
            if (llave.isEmpty() || vistos.add(llave)) unos.add(i);
        }
        return unos;
    }

    /**
     * Cuántos candidatos se preparan para una fila de escaparate.
     *
     * Más de los que se van a enseñar, y a propósito: la pantalla prueba las
     * carátulas una a una y va tirando las que no llegan, así que necesita
     * de dónde sacar los recambios. Diez puestos, treinta candidatos.
     */
    private static final int CANDIDATOS_POR_FILA = 30;

    /** Las mejor valoradas de los últimos años, de las que traen carátula. */
    private static List<Item> mejorValoradas(List<Item> todos) {
        List<Item> con = new ArrayList<>();
        for (Item i : soloDeAhora(todos)) {
            if (!i.imagen.isEmpty() && nota(i) > 0) con.add(i);
        }
        Collections.sort(con, new Comparator<Item>() {
            @Override public int compare(Item a, Item b) {
                int porNota = Double.compare(nota(b), nota(a));
                /* Con la mitad del catálogo puesta a 10 por el proveedor, la
                   nota sola deja el orden al azar: a igualdad, lo más nuevo */
                return porNota != 0 ? porNota : Long.compare(b.alta, a.alta);
            }
        });
        /* Primero ordenar y luego quitar repetidos, no al revés: así la copia
           que se queda es la mejor puntuada de las dos */
        con = sinRepetir(con);
        return new ArrayList<>(con.subList(0, Math.min(CANDIDATOS_POR_FILA, con.size())));
    }

    /** Lo último que ha subido el proveedor, de lo que trae fecha. */
    private static List<Item> recienAnadidas(List<Item> todos) {
        List<Item> con = new ArrayList<>();
        for (Item i : todos) {
            if (!i.imagen.isEmpty() && i.alta > 0) con.add(i);
        }
        Collections.sort(con, new Comparator<Item>() {
            @Override public int compare(Item a, Item b) { return Long.compare(b.alta, a.alta); }
        });
        con = sinRepetir(con);
        return new ArrayList<>(con.subList(0, Math.min(CANDIDATOS_POR_FILA, con.size())));
    }

    /**
     * Por qué orden se prueban los títulos para el destacado de arriba.
     *
     * El destacado no puede elegirse a dedo —«el primero que tenga
     * carátula»—: si esa carátula no llega, la portada abre con un hueco
     * negro del alto de media pantalla, que es exactamente lo que se vio en
     * la tele. Esto devuelve una lista de candidatos, en orden de qué tan
     * bien queda cada uno arriba, y la pantalla va probando hasta que una
     * imagen llega de verdad.
     *
     * Se ordena por ser de ahora —que pesa más que nada: arriba salía una
     * película de 1928 con un 10 del proveedor— y luego por lo que tiene
     * que enseñar el banner: sinopsis, nota y año. Un título del que solo
     * sabemos el nombre deja el bloque con un rótulo grande y nada debajo.
     */
    public static List<Item> candidatosDestacado(List<Fila> filas) {
        List<Item> todos = new ArrayList<>();
        for (Fila f : filas) todos.addAll(f.items);

        List<Item> con = new ArrayList<>();
        for (Item i : sinRepetir(todos)) {
            if (!i.imagen.isEmpty()) con.add(i);
        }
        final int hoy = anioDeHoy();
        Collections.sort(con, new Comparator<Item>() {
            @Override public int compare(Item a, Item b) {
                int porLucir = luce(b, hoy) - luce(a, hoy);
                if (porLucir != 0) return porLucir;
                int porNota = Double.compare(nota(b), nota(a));
                return porNota != 0 ? porNota : Long.compare(b.alta, a.alta);
            }
        });
        return con;
    }

    /** Cuánto luce un título arriba: manda el que más tenga que contar. */
    private static int luce(Item i, int hoy) {
        int puntos = 0;
        /* Ser de este año o del anterior pesa más que todo lo demás junto:
           un catálogo tiene miles de títulos viejos con la nota a tope y
           ninguno de ellos es una razón para abrir la aplicación */
        if (deAhora(i, hoy)) puntos += 12;
        if (i.sinopsis.length() > 60) puntos += 4;
        else if (!i.sinopsis.isEmpty()) puntos += 2;
        if (nota(i) > 0) puntos += 2;
        if (!i.anio.isEmpty()) puntos += 1;
        if (!i.generos.isEmpty()) puntos += 1;
        return puntos;
    }

    private static double nota(Item i) {
        try {
            return Double.parseDouble(i.nota.replace(',', '.'));
        } catch (Exception noEsUnNumero) {
            return 0;
        }
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
        /* Ya sabemos cuántos tiene: se lo apuntamos a su carpeta para la
           próxima vez que se pinte la columna */
        List<Carpeta> suyas = carpetas.get(seccion);
        if (suyas != null) {
            for (Carpeta c : suyas) {
                if (c.id.equals(carpetaId)) { c.cuantos = lista.size(); break; }
            }
        }
        return lista;
    }

    private static List<Item> directoXtream(String carpetaId) throws Exception {
        JSONArray flujos = new JSONArray(pedir(
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
            it.numero = c.optInt("num", 0);
            /* .ts es el formato del directo en Xtream, y justo el que un
               navegador no sabe reproducir sin desmontarlo en JavaScript */
            it.clase = Enlaces.DIRECTO;
            it.url = Sesion.actual().urlDirecto(id);
            lista.add(it);
        }
        return lista;
    }

    private static List<Item> pelisXtream(String carpetaId) throws Exception {
        JSONArray flujos = new JSONArray(pedir(
                Sesion.actual().api() + "&action=get_vod_streams" + filtro(carpetaId)));
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
            /* La nota y la fecha vienen ya en el listado: guardarlas aquí es
               lo que permite ordenar las filas de la portada sin pedir la
               ficha de cada uno de los cuatrocientos títulos */
            it.nota = limpio(c.optString("rating", ""));
            it.anio = limpio(c.optString("year", ""));
            it.alta = c.optLong("added", 0);
            it.clase = Enlaces.PELICULA;
            it.url = Sesion.actual().urlPelicula(id, it.extension);
            lista.add(it);
        }
        return lista;
    }

    private static List<Item> seriesXtream(String carpetaId) throws Exception {
        JSONArray flujos = new JSONArray(pedir(
                Sesion.actual().api() + "&action=get_series" + filtro(carpetaId)));
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
            it.sinopsis = limpio(c.optString("plot", ""));
            it.extra = juntar(c.optString("releaseDate", "").length() >= 4
                    ? c.optString("releaseDate", "").substring(0, 4) : "", c.optString("rating", ""));
            it.nota = limpio(c.optString("rating", ""));
            it.anio = anioDe(primero(c.optString("releaseDate", ""), c.optString("release_date", "")));
            it.generos = limpio(c.optString("genre", ""));
            it.reparto = limpio(c.optString("cast", ""));
            /* En las series el panel manda «last_modified» en vez de «added» */
            it.alta = c.optLong("last_modified", 0);
            it.esSerie = true;
            lista.add(it);
        }
        return lista;
    }

    /**
     * El «solo de esta carpeta» de una petición a Xtream, o nada.
     *
     * Con la carpeta en blanco el panel devuelve el catálogo entero, que es
     * justo lo que hace falta para buscar: quien escribe un título no sabe
     * —ni tiene por qué saber— en qué carpeta lo puso su proveedor.
     */
    private static String filtro(String carpetaId) {
        return carpetaId == null || carpetaId.isEmpty() || TODAS.equals(carpetaId)
                ? "" : "&category_id=" + Web.escapar(carpetaId);
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
        /* La guarda mira si YA se preguntó, no si hay sinopsis: algunos
           paneles mandan la sinopsis en el listado y el resto —nota, año,
           reparto, edad— solo en la ficha, y con la condición vieja esos
           títulos se quedaban para siempre sin nada que enseñar */
        if (!Sesion.actual().esXtream() || peli.detallePedido) return;
        peli.detallePedido = true;
        try {
            JSONObject r = new JSONObject(pedir(
                    Sesion.actual().api() + "&action=get_vod_info&vod_id=" + Web.escapar(peli.id)));
            JSONObject info = r.optJSONObject("info");
            if (info == null) return;
            peli.sinopsis = primero(info.optString("plot", ""), info.optString("description", ""));
            String portada = primero(info.optString("movie_image", ""), info.optString("cover_big", ""));
            if (!portada.isEmpty()) peli.imagen = portada;
            String duracion = info.optString("duration", "");
            String genero = info.optString("genre", "");
            /* Cada dato por su lado, además de la línea de siempre: la ficha
               los coloca en su sitio y el cartel sigue usando `extra` */
            peli.duracion = limpio(duracion);
            peli.generos = limpio(genero);
            peli.nota = limpio(info.optString("rating", ""));
            peli.reparto = primero(limpio(info.optString("cast", "")), limpio(info.optString("actors", "")));
            peli.edad = limpio(info.optString("age", ""));
            peli.anio = anioDe(primero(info.optString("releasedate", ""), info.optString("release_date", "")));
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

    /** El texto que manda el panel, o nada. Los paneles escriben «null». */
    private static String limpio(String v) {
        if (v == null) return "";
        String t = v.trim();
        return ("null".equals(t) || "0".equals(t) || "N/A".equalsIgnoreCase(t)) ? "" : t;
    }

    /** Los cuatro dígitos del año, de una fecha escrita como sea. */
    private static String anioDe(String fecha) {
        if (fecha == null) return "";
        Matcher m = Pattern.compile("(19|20)\\d{2}").matcher(fecha);
        return m.find() ? m.group() : "";
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
            JSONObject r = new JSONObject(pedir(
                    Sesion.actual().api() + "&action=get_series_info&series_id=" + Web.escapar(serie.id)));
            JSONObject info = r.optJSONObject("info");
            if (info != null) {
                if (serie.sinopsis.isEmpty()) serie.sinopsis = limpio(info.optString("plot", ""));
                if (serie.nota.isEmpty()) serie.nota = limpio(info.optString("rating", ""));
                if (serie.generos.isEmpty()) serie.generos = limpio(info.optString("genre", ""));
                if (serie.reparto.isEmpty()) serie.reparto = limpio(info.optString("cast", ""));
                if (serie.anio.isEmpty()) {
                    serie.anio = anioDe(primero(info.optString("releaseDate", ""), info.optString("release_date", "")));
                }
                if (serie.duracion.isEmpty()) {
                    String porEp = limpio(info.optString("episode_run_time", ""));
                    if (!porEp.isEmpty()) serie.duracion = porEp + " min/ep";
                }
            }
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

    /* ---------------- El reparto, con cara y nombre ---------------- */

    /** Un actor, tal y como se enseña en la ficha. */
    public static class Actor {
        public String nombre = "";
        /** El personaje que hace. Vacío si no se sabe. */
        public String personaje = "";
        /** Su foto, ya como dirección entera. Vacía si no la hay. */
        public String foto = "";
    }

    /** Lo ya preguntado, para no repetirlo al reabrir la misma ficha. */
    private static final Map<String, List<Actor>> repartos = new LinkedHashMap<>();

    /**
     * El reparto de un título, con la cara de cada uno.
     *
     * El panel manda una lista de nombres separados por comas y nada más;
     * las caras las sabe TMDB y las sirve nuestro servidor, que además las
     * guarda para todos los clientes de todos los proveedores. Así que esto
     * es una petición nuestra, no del panel.
     *
     * Devuelve lista vacía cuando no se sabe: sin clave de TMDB configurada,
     * cuando el título no se reconoce, o cuando la petición falla. Ninguna
     * de las tres es un error que deba llegar a una pantalla — la ficha se
     * queda con los nombres del panel, que es lo que enseñaba hasta ahora.
     */
    public static List<Actor> reparto(String nombre, String anio, boolean serie) {
        String llave = (serie ? "s:" : "p:") + nombre + ":" + (anio == null ? "" : anio);
        List<Actor> ya = repartos.get(llave);
        if (ya != null) return ya;

        List<Actor> lista = new ArrayList<>();
        try {
            JSONObject peticion = new JSONObject();
            peticion.put("nombre", nombre);
            peticion.put("anio", anio == null ? "" : anio);
            peticion.put("serie", serie);
            JSONObject r = new JSONObject(Web.enCasaPost(Acceso.CASA + "/api/reparto", peticion.toString()));
            JSONArray gente = r.optJSONArray("reparto");
            for (int i = 0; gente != null && i < gente.length(); i++) {
                JSONObject a = gente.optJSONObject(i);
                if (a == null) continue;
                String suNombre = a.optString("nombre", "").trim();
                if (suNombre.isEmpty()) continue;
                Actor actor = new Actor();
                actor.nombre = suNombre;
                actor.personaje = a.optString("personaje", "");
                actor.foto = a.optString("foto", "");
                lista.add(actor);
            }
        } catch (Exception noSeSabe) {
            /* Se guarda la lista vacía igual: si el servidor no lo sabe, no
               lo va a saber por preguntárselo otra vez en la misma sesión */
        }
        repartos.put(llave, lista);
        return lista;
    }

    /* ---------------- Buscar ---------------- */

    /**
     * Todas las películas y todas las series, para el buscador.
     *
     * Se piden enteras y una sola vez. Son la petición más gorda que hace la
     * aplicación —hay listas de treinta mil títulos—, así que el buscador no
     * las espera: enseña los canales, que suelen estar ya pedidos, y mete lo
     * demás cuando llega.
     */
    public static List<Item> todasLasPelis() throws Exception {
        if (todasLasPelis != null) return todasLasPelis;
        List<Item> lista = new ArrayList<>();
        if (Sesion.actual().esXtream()) {
            lista = pelisXtream("");
        } else {
            for (List<Item> deLaCarpeta : m3u().get(PELIS).values()) lista.addAll(deLaCarpeta);
        }
        todasLasPelis = lista;
        return lista;
    }

    public static List<Item> todasLasSeries() throws Exception {
        if (todasLasSeries != null) return todasLasSeries;
        todasLasSeries = Sesion.actual().esXtream() ? seriesXtream("") : seriesDeM3u();
        return todasLasSeries;
    }

    /** Todos los canales, para el buscador. Se piden una vez y se guardan. */
    public static List<Item> todoElDirecto() throws Exception {
        if (todoElDirecto != null) return todoElDirecto;
        List<Item> lista = new ArrayList<>();
        if (Sesion.actual().esXtream()) {
            JSONArray flujos = new JSONArray(pedir(Sesion.actual().api() + "&action=get_live_streams"));
            for (int i = 0; i < flujos.length(); i++) {
                JSONObject c = flujos.getJSONObject(i);
                String id = c.optString("stream_id", "");
                String nombre = c.optString("name", "").trim();
                if (id.isEmpty() || nombre.isEmpty()) continue;
                Item it = new Item();
                it.id = id;
                it.nombre = nombre;
                it.imagen = c.optString("stream_icon", "");
                it.numero = c.optInt("num", 0);
                it.clase = Enlaces.DIRECTO;
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

    private static final Map<String, List<Programa>> loQueEchan = new LinkedHashMap<>();

    /** Un programa de la parrilla: cuándo empieza y qué es. */
    public static class Programa {
        public final String hora;
        public final String titulo;
        public final long inicio;
        public final long fin;
        Programa(String hora, String titulo, long inicio, long fin) {
            this.hora = hora; this.titulo = titulo; this.inicio = inicio; this.fin = fin;
        }
        /** Está en antena si el reloj cae dentro de su tramo. */
        boolean enAntena(long ahora) { return inicio > 0 && fin > 0 && ahora >= inicio && ahora < fin; }
    }

    /**
     * La parrilla del canal: lo que dan y lo que viene detrás.
     *
     * Pedía dos programas y se quedaba con el primero como «ahora». Dos
     * problemas. El primero es que el panel empieza la lista donde le
     * parece: la mitad manda el bloque de la hora anterior, así que lo que
     * salía como AHORA era un programa que ya había terminado. Se elige por
     * el reloj, no por el orden de llegada.
     *
     * El segundo es que con dos no hay «después» que valga: se ve el de
     * ahora y uno más, y la pregunta de si esperar o seguir zapeando
     * necesita ver la tarde, no el minuto siguiente.
     */
    public static List<Programa> guia(String streamId) {
        List<Programa> ya = loQueEchan.get(streamId);
        if (ya != null) return ya;
        if (!Sesion.actual().esXtream()) return null;
        try {
            JSONObject r = new JSONObject(pedir(Sesion.actual().api()
                    + "&action=get_short_epg&stream_id=" + Web.escapar(streamId) + "&limit=12"));
            JSONArray eps = r.optJSONArray("epg_listings");
            if (eps == null || eps.length() == 0) return null;
            List<Programa> parrilla = new ArrayList<>();
            for (int i = 0; i < eps.length(); i++) {
                JSONObject ep = eps.optJSONObject(i);
                if (ep == null) continue;
                String titulo = tituloEpg(ep);
                if (titulo.isEmpty()) continue;
                long ini = momentoEpg(ep, "start_timestamp", "start");
                long fin = momentoEpg(ep, "stop_timestamp", "end");
                parrilla.add(new Programa(horaDe(ini), titulo, ini, fin));
            }
            if (parrilla.isEmpty()) return null;
            /* Fuera lo ya emitido: ocupa sitio y no ayuda a decidir nada.
               Si ninguno cae en el reloj —panel sin horas fiables— se deja
               la lista entera, que es mejor que quedarse sin guía. */
            long ahora = System.currentTimeMillis();
            int deAqui = -1;
            for (int i = 0; i < parrilla.size(); i++) {
                if (parrilla.get(i).enAntena(ahora)) { deAqui = i; break; }
            }
            if (deAqui > 0) parrilla = new ArrayList<>(parrilla.subList(deAqui, parrilla.size()));
            loQueEchan.put(streamId, parrilla);
            return parrilla;
        } catch (Exception e) {
            return null;
        }
    }

    /** Xtream manda la hora en unix y en texto, según el panel. */
    private static long momentoEpg(JSONObject ep, String campoUnix, String campoTexto) {
        String unix = ep.optString(campoUnix, "");
        if (!unix.isEmpty()) {
            try { return Long.parseLong(unix.trim()) * 1000L; } catch (Exception ignored) { }
        }
        String texto = ep.optString(campoTexto, "");
        if (texto.isEmpty()) return 0;
        try {
            java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.US);
            return f.parse(texto.trim()).getTime();
        } catch (Exception e) {
            return 0;
        }
    }

    /** «21:30». Sin hora no se pone nada: un «00:00» inventado engaña. */
    private static String horaDe(long momento) {
        if (momento <= 0) return "";
        return new java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault())
                .format(new java.util.Date(momento));
    }

    /** Lo que está en antena, para quien solo necesita eso. */
    public static String enAntena(String streamId) {
        List<Programa> g = guia(streamId);
        return g == null || g.isEmpty() ? "" : g.get(0).titulo;
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

        /* La M3U de un cliente de proveedor la sirve el panel ya limpia: cada
           canal y cada logotipo salen convertidos en vales, no en direcciones */
        String texto = Sesion.actual().gestionada
                ? Web.enCasa(Acceso.CASA + "/api/m3u")
                : Web.pedir(Sesion.actual().servidor);
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
