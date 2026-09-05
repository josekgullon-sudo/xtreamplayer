package app.totalplayer.tvnativo;

import android.content.Context;

import androidx.media3.common.C;
import androidx.media3.common.Format;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Cómo se llaman los idiomas y cuál eligió el de esta casa.
 *
 * Dos cosas que parecen una sola:
 *
 * 1. Una pista de audio no dice «Español»: dice «spa», «es», «cast» o
 *    «lat», según quién montara la lista. Enseñar eso tal cual es enseñar
 *    el código de dentro, y quien está en el sofá no tiene por qué saber
 *    que «und» quiere decir que el fichero no lo dice.
 *
 * 2. Elegir el idioma en cada película es elegirlo en ninguna. El que ve
 *    todo en versión original lo ve todo en versión original: se apunta lo
 *    que eligió y la siguiente ya arranca así. Es lo mismo que hace el
 *    reproductor de la web, con las mismas ideas.
 */
public final class Idiomas {

    /** Lo que se guarda cuando alguien apaga los subtítulos a propósito. */
    public static final String SIN_SUBS = "*ninguno*";

    private static final String AUDIO = "idioma_audio";
    private static final String SUBS = "idioma_subs";

    /**
     * Los que salen de verdad en una lista de IPTV.
     *
     * No es la tabla ISO entera. Android sabe traducir los códigos de dos
     * letras, pero los ficheros de televisión vienen casi siempre con los
     * de tres —«spa», «eng»—, y ahí `Locale` devuelve el código otra vez.
     * Y hay dos que no son de ninguna norma y son los más frecuentes en
     * España: «cast» y «lat», que es como los paneles distinguen el español
     * de aquí del de allí.
     */
    private static final Map<String, String> NOMBRES = new HashMap<>();
    static {
        NOMBRES.put("spa", "Español");
        NOMBRES.put("es", "Español");
        NOMBRES.put("esp", "Español");
        NOMBRES.put("cast", "Español (España)");
        NOMBRES.put("es-es", "Español (España)");
        NOMBRES.put("lat", "Español (Latino)");
        NOMBRES.put("es-419", "Español (Latino)");
        NOMBRES.put("es-mx", "Español (Latino)");
        NOMBRES.put("eng", "Inglés");
        NOMBRES.put("en", "Inglés");
        NOMBRES.put("vo", "Versión original");
        NOMBRES.put("cat", "Catalán");
        NOMBRES.put("eus", "Euskera");
        NOMBRES.put("baq", "Euskera");
        NOMBRES.put("glg", "Gallego");
        NOMBRES.put("por", "Portugués");
        NOMBRES.put("pt", "Portugués");
        NOMBRES.put("fra", "Francés");
        NOMBRES.put("fre", "Francés");
        NOMBRES.put("fr", "Francés");
        NOMBRES.put("deu", "Alemán");
        NOMBRES.put("ger", "Alemán");
        NOMBRES.put("de", "Alemán");
        NOMBRES.put("ita", "Italiano");
        NOMBRES.put("it", "Italiano");
        NOMBRES.put("rus", "Ruso");
        NOMBRES.put("ru", "Ruso");
        NOMBRES.put("ara", "Árabe");
        NOMBRES.put("ar", "Árabe");
        NOMBRES.put("ron", "Rumano");
        NOMBRES.put("rum", "Rumano");
        NOMBRES.put("ro", "Rumano");
        NOMBRES.put("nld", "Neerlandés");
        NOMBRES.put("dut", "Neerlandés");
        NOMBRES.put("pol", "Polaco");
        NOMBRES.put("tur", "Turco");
        NOMBRES.put("jpn", "Japonés");
        NOMBRES.put("ja", "Japonés");
        NOMBRES.put("kor", "Coreano");
        NOMBRES.put("zho", "Chino");
        NOMBRES.put("chi", "Chino");
        NOMBRES.put("hin", "Hindi");
    }

    private Idiomas() {}

    /** El código tal cual lo trae la pista, en minúsculas y sin nada raro. */
    public static String codigo(Format f) {
        String c = f != null && f.language != null ? f.language.trim().toLowerCase(Locale.US) : "";
        // «und» es lo que pone ffmpeg cuando el fichero no dice nada
        return "und".equals(c) ? "" : c;
    }

    /**
     * Cómo se enseña una pista.
     *
     * El orden importa: primero el nombre que trae puesto el fichero
     * —cuando alguien se molestó en poner «Castellano 5.1», eso es mejor
     * que cualquier tabla—, luego la tabla, y si nada de eso, el código en
     * mayúsculas antes que un hueco en blanco.
     */
    public static String nombre(Format f, int numero) {
        String cod = codigo(f);
        String base = NOMBRES.get(cod);
        if (base == null && cod.contains("-")) base = NOMBRES.get(cod.split("-")[0]);
        if (base == null && f != null && f.label != null && !f.label.trim().isEmpty()) {
            base = f.label.trim();
        }
        if (base == null && !cod.isEmpty()) base = cod.toUpperCase(Locale.US);
        if (base == null) base = "Pista " + numero;

        /* Y el detalle que de verdad distingue dos pistas del mismo idioma:
           una película suele traer el español en estéreo y en 5.1, y con el
           mismo rótulo no hay manera de saber cuál se está eligiendo */
        String extra = detalle(f);
        return extra.isEmpty() ? base : base + " · " + extra;
    }

    /**
     * El nombre de un código suelto, sin pista delante.
     *
     * Lo pide la pantalla de ajustes: ahí no hay ningún fichero abierto, solo
     * lo que se guardó la última vez —«spa»— y hay que enseñarlo como se dice.
     */
    public static String nombreDe(String codigo) {
        if (codigo == null || codigo.isEmpty()) return "";
        String cod = codigo.toLowerCase(Locale.US);
        String base = NOMBRES.get(cod);
        if (base == null && cod.contains("-")) base = NOMBRES.get(cod.split("-")[0]);
        return base != null ? base : codigo.toUpperCase(Locale.US);
    }

    private static String detalle(Format f) {
        if (f == null) return "";
        if ((f.roleFlags & C.ROLE_FLAG_DESCRIBES_VIDEO) != 0) return "audiodescripción";
        if ((f.roleFlags & C.ROLE_FLAG_TRANSCRIBES_DIALOG) != 0) return "para sordos";
        if (f.channelCount == 6 || f.channelCount == 8) return "5.1";
        if (f.channelCount == 2) return "estéreo";
        return "";
    }

    public static String guardado(Context c, boolean subtitulos) {
        return Sesion.ajustes(c).getString(subtitulos ? SUBS : AUDIO, "");
    }

    public static void recordar(Context c, boolean subtitulos, String codigo) {
        Sesion.ajustes(c).edit().putString(subtitulos ? SUBS : AUDIO, codigo).apply();
    }

    /**
     * Si dos códigos son el mismo idioma.
     *
     * «es» y «spa» son lo mismo, y una película que trae «spa» tiene que
     * arrancar en español para quien eligió «es» en la anterior. Lo que no
     * se mezcla es el de España con el latino: quien eligió uno no quiere
     * el otro, y por eso se comparan por el nombre y no por las letras.
     */
    public static boolean mismo(String a, String b) {
        if (a == null || b == null) return false;
        if (a.equalsIgnoreCase(b)) return true;
        if (a.isEmpty() || b.isEmpty()) return false;
        String na = NOMBRES.get(a.toLowerCase(Locale.US));
        String nb = NOMBRES.get(b.toLowerCase(Locale.US));
        return na != null && na.equals(nb);
    }
}
