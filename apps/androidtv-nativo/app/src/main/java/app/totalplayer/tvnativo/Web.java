package app.totalplayer.tvnativo;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

/**
 * Pedir cosas por HTTP, siempre fuera del hilo de la interfaz.
 *
 * Muchos servidores IPTV miran quién les pide el flujo y cuelgan a los que
 * no reconocen. VLC es el que todos dejan pasar, así que es el que decimos
 * ser: no es un truco, es lo que hace cualquier reproductor de este tipo
 * para que el proveedor no le cierre la puerta.
 */
public final class Web {

    public static final String QUIEN_SOY = "VLC/3.0.20 LibVLC/3.0.20";

    private Web() {}

    public static String escapar(String s) {
        try {
            return URLEncoder.encode(s == null ? "" : s, "UTF-8");
        } catch (Exception e) {
            return s == null ? "" : s;
        }
    }

    /**
     * Pide algo, y si falla lo intenta una segunda vez.
     *
     * Los servidores de IPTV cortan conexiones a la mínima —sobre todo
     * cuando les llegan varias peticiones seguidas al bajar deprisa por las
     * carpetas—, y el primer fallo casi nunca significa que no estén. Un
     * segundo intento medio segundo después salva la mayoría, y evita que
     * media aplicación se quede en blanco por un corte de un segundo.
     */
    public static String pedir(String direccion) throws Exception {
        try {
            return unaVez(direccion);
        } catch (Exception primera) {
            try {
                Thread.sleep(600);
            } catch (InterruptedException corte) {
                Thread.currentThread().interrupt();
                throw primera;
            }
            return unaVez(direccion);
        }
    }

    private static String unaVez(String direccion) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(direccion).openConnection();
        con.setConnectTimeout(15000);
        con.setReadTimeout(25000);
        con.setInstanceFollowRedirects(true);
        con.setRequestProperty("User-Agent", QUIEN_SOY);
        try {
            StringBuilder sb = new StringBuilder();
            BufferedReader r = new BufferedReader(new InputStreamReader(con.getInputStream(), "UTF-8"), 16384);
            String linea;
            while ((linea = r.readLine()) != null) sb.append(linea).append('\n');
            r.close();
            return sb.toString();
        } finally {
            con.disconnect();
        }
    }

    /** Quita la barra final y pone http:// si falta, que es lo que se escribe. */
    public static String normalizar(String servidor) {
        String s = servidor == null ? "" : servidor.trim();
        if (s.isEmpty()) return s;
        if (!s.startsWith("http")) s = "http://" + s;
        while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        return s;
    }
}
