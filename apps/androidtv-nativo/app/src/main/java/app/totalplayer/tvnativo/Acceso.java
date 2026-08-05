package app.totalplayer.tvnativo;

import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;
import java.util.Map;

/**
 * Entrar con el usuario y la contraseña que te dio tu proveedor.
 *
 * Esto es lo que vende el producto entero: el cliente no sabe —ni tiene por
 * qué— qué es un servidor, un puerto o una URL get.php. Su proveedor le dio
 * dos datos y con esos dos entra, aquí igual que en la web.
 *
 * La primera versión de esta aplicación pedía servidor, usuario y
 * contraseña. Eso es lo que pide un reproductor genérico, y hace al cliente
 * el trabajo del proveedor. Con el mando, además, escribir una dirección con
 * puerto es un suplicio.
 *
 * El reparto es el de siempre: se entra contra totalplayer.app, que es quien
 * guarda a qué servidor va cada cliente, y el vídeo se pide luego
 * directamente al servidor del proveedor.
 */
public class Acceso {

    /** Dónde vive el panel. apps/poner-dominio.sh lo cambia en todas las apps a la vez. */
    public static final String CASA = "https://totalplayer.app";

    /**
     * Lo que el panel cuenta de la lista de este cliente.
     *
     * Ya no trae servidor, usuario ni contraseña: esa línea se queda en
     * totalplayer.app y se resuelve allí en cada petición. Aquí solo llega si
     * es de Xtream o una M3U —que cambia por dónde se pide el catálogo— y de
     * quién es la marca.
     */
    public static class Lista {
        public final String tipo, marca;
        /** La sesión abierta en el panel: con ella se pide todo lo demás. */
        public final String galleta;
        Lista(String tipo, String marca, String galleta) {
            this.tipo = tipo; this.marca = marca; this.galleta = galleta;
        }
    }

    public static class NoEntra extends Exception {
        NoEntra(String porque) { super(porque); }
    }

    /**
     * Entra y devuelve la lista de ese cliente.
     *
     * Dos pasos, como en la web: el primero deja la sesión abierta, el
     * segundo pregunta qué lista le toca.
     */
    public static Lista entrar(String usuario, String clave, String aparato) throws Exception {
        JSONObject datos = new JSONObject();
        datos.put("username", usuario);
        datos.put("password", clave);
        // Identifica esta tele para el cupo de dispositivos del cliente
        datos.put("deviceKey", aparato);

        HttpURLConnection con = (HttpURLConnection) new URL(CASA + "/api/customer/login").openConnection();
        con.setRequestMethod("POST");
        con.setDoOutput(true);
        con.setConnectTimeout(15000);
        con.setReadTimeout(20000);
        con.setRequestProperty("Content-Type", "application/json");

        String galleta;
        try {
            OutputStream salida = con.getOutputStream();
            salida.write(datos.toString().getBytes("UTF-8"));
            salida.close();

            if (con.getResponseCode() != 200) {
                /* El panel explica por qué no entra —caducado, límite de
                   dispositivos, desactivado— y ese motivo es más útil que
                   cualquier cosa que podamos inventarnos aquí */
                throw new NoEntra(motivo(leer(con, true)));
            }
            galleta = sesion(con.getHeaderFields());
        } finally {
            con.disconnect();
        }
        if (galleta == null) throw new NoEntra("El acceso no ha devuelto sesión");

        HttpURLConnection quien = (HttpURLConnection) new URL(CASA + "/api/customer/me").openConnection();
        quien.setRequestProperty("Cookie", galleta);
        quien.setConnectTimeout(15000);
        quien.setReadTimeout(20000);
        try {
            JSONObject yo = new JSONObject(leer(quien, false));
            JSONObject lista = yo.optJSONObject("playlist");
            if (lista == null) throw new NoEntra("Tu proveedor no te ha asignado ninguna lista");
            return new Lista(lista.optString("type", "xtream"), yo.optString("brand", ""), galleta);
        } finally {
            quien.disconnect();
        }
    }

    private static String motivo(String cuerpo) {
        try {
            String e = new JSONObject(cuerpo).optString("error", "");
            if (!e.isEmpty()) return e;
        } catch (Exception ignorada) {
            Log.d("totalplayer", "respuesta sin JSON al entrar");
        }
        return "Usuario o contraseña incorrectos";
    }

    private static String sesion(Map<String, List<String>> cabeceras) {
        for (Map.Entry<String, List<String>> e : cabeceras.entrySet()) {
            if (e.getKey() == null || !e.getKey().equalsIgnoreCase("Set-Cookie")) continue;
            for (String c : e.getValue()) {
                if (c.startsWith("xp_customer=")) return c.split(";")[0];
            }
        }
        return null;
    }

    private static String leer(HttpURLConnection con, boolean error) throws Exception {
        StringBuilder sb = new StringBuilder();
        BufferedReader r = new BufferedReader(new InputStreamReader(
                error ? con.getErrorStream() : con.getInputStream(), "UTF-8"));
        String linea;
        while ((linea = r.readLine()) != null) sb.append(linea);
        r.close();
        return sb.toString();
    }
}
