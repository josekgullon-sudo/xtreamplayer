package app.totalplayer.tvnativo;

import org.json.JSONObject;

/**
 * La dirección de lo que se va a reproducir, pedida en el momento.
 *
 * Antes se construía aquí mismo: servidor, barra, «live», barra, usuario,
 * barra, contraseña. Para eso este aparato tenía que llevar dentro la línea
 * del proveedor —y la llevaba, guardada en las preferencias—, así que
 * cualquiera con el teléfono en la mano la tenía. En Xtream esa dirección no
 * es un enlace: es la suscripción.
 *
 * Ahora, cuando la lista la administra la plataforma, se pide una por
 * reproducción y solo al pulsar. El servidor sabe a dónde va y devuelve por
 * dónde entrar, sin contar lo otro.
 */
public final class Enlaces {

    private Enlaces() {}

    public static final String DIRECTO = "live";
    public static final String PELICULA = "movie";
    public static final String EPISODIO = "series";
    /** Lo ya emitido: el panel lo sirve por otro guion. Ver `paraVerLoDeAntes`. */
    public static final String YA_EMITIDO = "timeshift";

    /**
     * @param clase  qué se pide: directo, película o episodio
     * @param id     el número que le da el panel
     * @param ext    contenedor, para lo que no es directo
     * @param yaLaTengo la que trae el item cuando la lista es propia
     */
    public static String paraVer(String clase, String id, String ext, String yaLaTengo) throws Exception {
        // Lista escrita a mano en este aparato: la dirección ya está hecha
        if (!Sesion.actual().gestionada) return yaLaTengo;

        /*
         * Y una M3U de la plataforma, también.
         *
         * El panel sirve la lista ya reescrita: cada canal sale con su
         * dirección puesta —o con su vale, si el vídeo va por nuestro
         * servidor—, así que no hay nada que resolver. Preguntar igualmente
         * era pedirle a /api/tele/ver algo que solo sabe dar para Xtream, y
         * contestaba «esa lista no es de tipo Xtream». El catálogo entraba
         * perfectamente y luego no arrancaba ni un canal.
         */
        if (yaLaTengo != null && !yaLaTengo.isEmpty()) return completar(yaLaTengo);

        JSONObject peticion = new JSONObject();
        peticion.put("clase", clase);
        peticion.put("id", id);
        if (ext != null && !ext.isEmpty()) peticion.put("ext", ext);

        JSONObject r = new JSONObject(Web.enCasaPost(Acceso.CASA + "/api/tele/ver", peticion.toString()));
        String url = r.optString("url", "");
        if (url.isEmpty()) throw new Exception("No hemos podido abrir esto. Prueba con otro.");
        return completar(url);
    }

    /**
     * Lo que ya se emitió: el programa de las siete, a las nueve.
     *
     * Es lo que en un panel se llama Catch Up, y la mitad de los canales de
     * una lista lo traen puesto sin que nadie lo use, porque no hay por
     * dónde pedirlo. El servidor ya sabe armarlo —lo hace para el
     * reproductor web—; aquí solo hay que decirle desde cuándo y cuánto.
     *
     * @param cuando en el formato que fija el panel: 2026-09-05:20-30
     * @param minutos lo que dura el programa
     */
    public static String paraVerLoDeAntes(String id, String cuando, int minutos) throws Exception {
        if (!Sesion.actual().gestionada || !Sesion.actual().esXtream()) {
            throw new Exception("Tu lista no permite ver lo ya emitido.");
        }
        JSONObject peticion = new JSONObject();
        peticion.put("clase", YA_EMITIDO);
        peticion.put("id", id);
        peticion.put("inicio", cuando);
        peticion.put("minutos", Math.max(1, minutos));

        JSONObject r = new JSONObject(Web.enCasaPost(Acceso.CASA + "/api/tele/ver", peticion.toString()));
        String url = r.optString("url", "");
        if (url.isEmpty()) throw new Exception("Este canal no guarda lo ya emitido.");
        return completar(url);
    }

    /** Una ruta nuestra necesita el dominio delante; una del proveedor, no. */
    private static String completar(String url) {
        return url.startsWith("/") ? Acceso.CASA + url : url;
    }
}
