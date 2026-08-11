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

    /**
     * Lo mismo, pero enseñando la galleta de la sesión del panel.
     *
     * El catálogo de un cliente de proveedor se pide ya a totalplayer.app y no
     * al servidor del proveedor, y allí hay que decir quién eres: es
     * precisamente lo que permite que el servidor resuelva la línea sin que
     * este aparato la conozca.
     */
    public static String enCasa(String direccion) throws Exception {
        return conGalleta(direccion, null);
    }

    /** Un POST con cuerpo JSON, para pedir el enlace de una reproducción. */
    public static String enCasaPost(String direccion, String cuerpo) throws Exception {
        return conGalleta(direccion, cuerpo);
    }

    private static String conGalleta(String direccion, String cuerpo) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(direccion).openConnection();
        con.setConnectTimeout(15000);
        con.setReadTimeout(40000);
        con.setInstanceFollowRedirects(true);
        con.setRequestProperty("User-Agent", QUIEN_SOY);
        String galleta = Sesion.actual().galleta;
        if (!galleta.isEmpty()) con.setRequestProperty("Cookie", galleta);
        try {
            if (cuerpo != null) {
                con.setRequestMethod("POST");
                con.setDoOutput(true);
                con.setRequestProperty("Content-Type", "application/json");
                java.io.OutputStream salida = con.getOutputStream();
                salida.write(cuerpo.getBytes("UTF-8"));
                salida.close();
            }
            int codigo = con.getResponseCode();
            if (codigo != 200) {
                /*
                 * El motivo lo cuenta el panel y no se inventa aquí: caducado,
                 * tope de aparatos, sesión perdida. Y va como NoEntra a
                 * propósito: es el único tipo de excepción cuyo mensaje sale a
                 * la pantalla —Hilos.enCristiano—. Lanzándolo como Exception a
                 * secas, el aparato enseñaba «comprueba tu conexión» aunque el
                 * servidor hubiera contestado perfectamente explicando el qué.
                 */
                throw new Acceso.NoEntra(motivoDe(leerTodo(con, true), codigo));
            }
            return leerTodo(con, false);
        } finally {
            con.disconnect();
        }
    }

    private static String motivoDe(String cuerpo, int codigo) {
        try {
            String e = new org.json.JSONObject(cuerpo).optString("error", "");
            if (!e.isEmpty()) return e;
        } catch (Exception ignorado) {
            // No era JSON: se cuenta lo que se sabe
        }
        if (codigo == 401 || codigo == 403) return "Tu sesión ha caducado. Vuelve a entrar.";
        if (codigo == 404) return "Tu proveedor dice que eso no existe (404).\nSuele ser que la dirección no es la que toca.";
        if (codigo >= 500) return "El servidor de tu proveedor está dando error (" + codigo + ").\nNo es cosa de tu conexión: pregúntale a quien te dio la lista.";
        /* Con el número delante: es lo que sirve para que alguien lo mire */
        return "Tu proveedor ha contestado con un error " + codigo + ".";
    }

    private static String leerTodo(HttpURLConnection con, boolean error) throws Exception {
        java.io.InputStream flujo = error ? con.getErrorStream() : con.getInputStream();
        if (flujo == null) return "";
        BufferedReader lector = new BufferedReader(new InputStreamReader(flujo, "UTF-8"));
        StringBuilder todo = new StringBuilder();
        String linea;
        while ((linea = lector.readLine()) != null) todo.append(linea);
        lector.close();
        return todo.toString();
    }

    private static String unaVez(String direccion) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(direccion).openConnection();
        con.setConnectTimeout(15000);
        /*
         * Cuarenta segundos para leer, no veinticinco.
         *
         * Una carpeta de un proveedor de verdad son dos mil canales y varios
         * megas de JSON que el panel genera en el momento. En un Fire Stick
         * con wifi de casa, veinticinco segundos se agotaban justo en las
         * carpetas grandes —las interesantes— y el cliente veía «comprueba tu
         * conexión» con la conexión perfecta.
         */
        con.setReadTimeout(40000);
        con.setInstanceFollowRedirects(true);
        con.setRequestProperty("User-Agent", QUIEN_SOY);
        try {
            /* Mirar el código antes de leer: un 404 o un 500 salían de aquí
               como una excepción de entrada/salida cualquiera, y acababan
               contados como «no hay internet» */
            int codigo = con.getResponseCode();
            if (codigo < 200 || codigo >= 300) {
                throw new Acceso.NoEntra(motivoDe(leerTodo(con, true), codigo));
            }
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
