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

    /**
     * @param clase  qué se pide: directo, película o episodio
     * @param id     el número que le da el panel
     * @param ext    contenedor, para lo que no es directo
     * @param yaLaTengo la que trae el item cuando la lista es propia
     */
    public static String paraVer(String clase, String id, String ext, String yaLaTengo) throws Exception {
        // Lista escrita a mano en este aparato: la dirección ya está hecha
        if (!Sesion.actual().gestionada) return yaLaTengo;

        JSONObject peticion = new JSONObject();
        peticion.put("clase", clase);
        peticion.put("id", id);
        if (ext != null && !ext.isEmpty()) peticion.put("ext", ext);

        JSONObject r = new JSONObject(Web.enCasaPost(Acceso.CASA + "/api/tele/ver", peticion.toString()));
        String url = r.optString("url", "");
        if (url.isEmpty()) throw new Exception("No hemos podido abrir esto. Prueba con otro.");
        // Con el vídeo servido por la plataforma, la respuesta es una ruta suya
        return url.startsWith("/") ? Acceso.CASA + url : url;
    }
}
