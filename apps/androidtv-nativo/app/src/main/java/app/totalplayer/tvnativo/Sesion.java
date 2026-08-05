package app.totalplayer.tvnativo;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.UUID;

/**
 * Quién ha entrado y a qué servidor va.
 *
 * Vive en memoria mientras la aplicación está abierta y se guarda en disco
 * para no volver a preguntar al encender la tele. Las pantallas no se pasan
 * las credenciales unas a otras: preguntan aquí.
 */
public final class Sesion {

    private static final String AJUSTES = "totalplayer.tv.nativo";

    /** Cómo se sirve la lista: el panel de Xtream o un fichero M3U. */
    public static final String XTREAM = "xtream";
    public static final String M3U = "m3u";

    private static Sesion actual;

    public String tipo = XTREAM;
    /** Servidor de Xtream sin barra final, o la URL del M3U. */
    public String servidor = "";
    public String usuario = "";
    public String clave = "";
    /** El nombre del proveedor, si entró por el panel. */
    public String marca = "";
    /**
     * La lista la administra la plataforma.
     *
     * Cuando es así, este aparato no sabe —ni tiene por qué— a qué servidor
     * va, con qué usuario ni con qué contraseña. Antes sí lo sabía: el panel
     * se lo mandaba al entrar y se quedaba guardado en las preferencias del
     * teléfono, o sea que la suscripción del proveedor viajaba a cada
     * aparato de cada cliente y se quedaba allí. Ahora se le pide el catálogo
     * a totalplayer.app con la galleta de sesión y quien resuelve es el
     * servidor.
     */
    public boolean gestionada = false;
    /** La sesión abierta en el panel: hace falta para los perfiles. */
    public String galleta = "";
    /** El perfil elegido, para saludar y para recordarlo. */
    public String perfil = "";
    public int perfilId = 0;
    /** Lo que escribió en la pantalla de acceso, para volver a entrar solo. */
    public String entradaUsuario = "";
    public String entradaClave = "";
    public String entradaServidor = "";

    private Sesion() {}

    public static Sesion actual() {
        if (actual == null) actual = new Sesion();
        return actual;
    }

    public boolean esXtream() { return XTREAM.equals(tipo); }

    /**
     * A quién se le pide el catálogo.
     *
     * Con lista de la plataforma, a totalplayer.app, que sabe el resto. Con
     * una lista escrita a mano en este aparato, al panel del proveedor
     * directamente: esa la ha tecleado quien mira y no hay nada que ocultarle.
     */
    public String api() {
        if (gestionada) return Acceso.CASA + "/api/xtream?desde=app";
        return servidor + "/player_api.php?username=" + Web.escapar(usuario)
                + "&password=" + Web.escapar(clave);
    }

    /*
     * Las direcciones de vídeo.
     *
     * Con lista de la plataforma devuelven vacío a propósito: no se pueden
     * construir aquí sin tener la línea, y tenerla es justo lo que se ha
     * quitado. Se piden una a una al ir a reproducir —Enlaces.paraVer—, que
     * además es cuando hacen falta: una carpeta de ocho mil canales no
     * necesita ocho mil direcciones, necesita la del canal que se pulsa.
     */
    public String urlDirecto(String streamId) {
        if (gestionada) return "";
        return servidor + "/live/" + Web.escapar(usuario) + "/" + Web.escapar(clave) + "/" + streamId + ".ts";
    }

    public String urlPelicula(String vodId, String extension) {
        if (gestionada) return "";
        String ext = (extension == null || extension.isEmpty()) ? "mp4" : extension;
        return servidor + "/movie/" + Web.escapar(usuario) + "/" + Web.escapar(clave) + "/" + vodId + "." + ext;
    }

    public String urlEpisodio(String episodioId, String extension) {
        if (gestionada) return "";
        String ext = (extension == null || extension.isEmpty()) ? "mp4" : extension;
        return servidor + "/series/" + Web.escapar(usuario) + "/" + Web.escapar(clave) + "/" + episodioId + "." + ext;
    }

    /* ---------------- Lo que se guarda en el aparato ---------------- */

    public static SharedPreferences ajustes(Context c) {
        return c.getSharedPreferences(AJUSTES, Context.MODE_PRIVATE);
    }

    /**
     * Una llave por aparato, y que sobreviva a reinstalar.
     *
     * Era un número al azar guardado con los ajustes, así que desinstalar y
     * volver a instalar generaba otra llave, y el panel la contaba como una
     * tele nueva. Ocho pruebas seguidas se comieron el cupo de dispositivos
     * del cliente y lo dejaron sin poder entrar en su propia cuenta.
     *
     * ANDROID_ID es el identificador del aparato para esta aplicación: no
     * cambia al reinstalar, y sí cambia al restablecer de fábrica, que es
     * justo cuando debe contar como otra tele. El número al azar se queda
     * como último recurso para los aparatos raros que devuelven vacío.
     */
    public static String llaveDelAparato(Context c) {
        SharedPreferences a = ajustes(c);

        String delAparato = "";
        try {
            delAparato = android.provider.Settings.Secure.getString(
                    c.getContentResolver(), android.provider.Settings.Secure.ANDROID_ID);
        } catch (Throwable e) {
            // Alguna capa de fabricante lo capa; se sigue con el de siempre
        }
        if (delAparato != null && delAparato.length() >= 8) return "tv-" + delAparato;

        String llave = a.getString("aparato", "");
        if (llave.isEmpty()) {
            llave = "tv-" + UUID.randomUUID().toString().substring(0, 12);
            a.edit().putString("aparato", llave).apply();
        }
        return llave;
    }

    /**
     * Guarda también la lista ya resuelta, no solo lo que se escribió.
     *
     * Esto vivía solo en memoria, y Android mata el proceso de una
     * aplicación que pasa a segundo plano cuando le hace falta memoria. Al
     * volver, Android rehace la pantalla pero la sesión ya no está: la
     * aplicación aparecía con el usuario en blanco y «no se ha podido
     * consultar» en las tres secciones, sin más salida que reinstalar.
     */
    public void guardar(Context c) {
        ajustes(c).edit()
                .putString("usuario", entradaUsuario)
                .putString("clave", entradaClave)
                .putString("servidor", entradaServidor)
                .putString("tipo", tipo)
                .putString("lista_servidor", servidor)
                .putString("lista_usuario", usuario)
                .putString("lista_clave", clave)
                .putString("marca", marca)
                .putString("galleta", galleta)
                .putBoolean("gestionada", gestionada)
                .apply();
    }

    /** ¿Sabemos a qué servidor pedir? Si no, hay que volver a entrar. */
    public boolean hayLista() { return gestionada || !servidor.isEmpty(); }

    /**
     * Rehace la sesión desde el disco después de un reinicio del proceso.
     * Devuelve false cuando no hay nada guardado y toca volver a entrar.
     */
    public static boolean recuperar(Context c) {
        Sesion s = actual();
        if (s.hayLista()) return true;

        SharedPreferences a = ajustes(c);
        boolean gestionada = a.getBoolean("gestionada", false);
        String servidor = a.getString("lista_servidor", "");
        // Con lista de la plataforma no hay servidor guardado, y es lo correcto
        if (!gestionada && servidor.isEmpty()) return false;
        s.gestionada = gestionada;

        s.tipo = a.getString("tipo", XTREAM);
        s.servidor = servidor;
        s.usuario = a.getString("lista_usuario", "");
        s.clave = a.getString("lista_clave", "");
        s.marca = a.getString("marca", "");
        s.galleta = a.getString("galleta", "");
        s.entradaUsuario = a.getString("usuario", "");
        s.entradaClave = a.getString("clave", "");
        s.entradaServidor = a.getString("servidor", "");
        s.perfil = nombreFijado(c);
        s.perfilId = perfilFijado(c);
        return true;
    }

    /** «Entrar siempre con este perfil en este aparato». */
    public void fijarPerfil(Context c, boolean siempre) {
        ajustes(c).edit()
                .putInt("perfilId", siempre ? perfilId : 0)
                .putString("perfilNombre", siempre ? perfil : "")
                .apply();
    }

    public static int perfilFijado(Context c) { return ajustes(c).getInt("perfilId", 0); }
    public static String nombreFijado(Context c) { return ajustes(c).getString("perfilNombre", ""); }

    /** Cerrar sesión: se olvida todo menos la llave del aparato. */
    public static void olvidar(Context c) {
        // Se borra todo menos la llave del aparato, que no es de la cuenta
        String aparato = ajustes(c).getString("aparato", "");
        ajustes(c).edit().clear().putString("aparato", aparato).apply();
        actual = new Sesion();
        Catalogo.vaciar();
    }
}
