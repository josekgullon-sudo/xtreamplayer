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

    /** La base de player_api.php ya con usuario y contraseña. */
    public String api() {
        return servidor + "/player_api.php?username=" + Web.escapar(usuario)
                + "&password=" + Web.escapar(clave);
    }

    public String urlDirecto(String streamId) {
        return servidor + "/live/" + Web.escapar(usuario) + "/" + Web.escapar(clave) + "/" + streamId + ".ts";
    }

    public String urlPelicula(String vodId, String extension) {
        String ext = (extension == null || extension.isEmpty()) ? "mp4" : extension;
        return servidor + "/movie/" + Web.escapar(usuario) + "/" + Web.escapar(clave) + "/" + vodId + "." + ext;
    }

    public String urlEpisodio(String episodioId, String extension) {
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
                .apply();
    }

    /** ¿Sabemos a qué servidor pedir? Si no, hay que volver a entrar. */
    public boolean hayLista() { return !servidor.isEmpty(); }

    /**
     * Rehace la sesión desde el disco después de un reinicio del proceso.
     * Devuelve false cuando no hay nada guardado y toca volver a entrar.
     */
    public static boolean recuperar(Context c) {
        Sesion s = actual();
        if (s.hayLista()) return true;

        SharedPreferences a = ajustes(c);
        String servidor = a.getString("lista_servidor", "");
        if (servidor.isEmpty()) return false;

        s.tipo = a.getString("tipo", XTREAM);
        s.servidor = servidor;
        s.usuario = a.getString("lista_usuario", "");
        s.clave = a.getString("lista_clave", "");
        s.marca = a.getString("marca", "");
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
