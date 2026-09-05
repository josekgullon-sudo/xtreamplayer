package app.totalplayer.tvnativo;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;

/**
 * La cuenta del cliente, vista desde su tele.
 *
 * Tres cosas, y las tres acababan hoy en una llamada al proveedor:
 *
 * - Qué aparatos ocupan su cupo, y poder cerrar uno. Es la llamada más
 *   frecuente que recibe un proveedor, y casi siempre por una tele suya que
 *   se quedó encendida en otra casa.
 * - Si el que falla es el proveedor o este aparato. El servidor lo sabe
 *   distinguir —contesta a él o no contesta— y aquí no había forma de
 *   preguntárselo.
 *
 * Nada de esto viaja con la línea del proveedor dentro: se pregunta a
 * totalplayer.app con la galleta de la sesión y el servidor resuelve. Es lo
 * mismo que hace el catálogo desde que dejó de guardarse la suscripción en
 * cada aparato. Ver `Sesion.gestionada`.
 */
public final class Cuenta {

    private Cuenta() {}

    /** Un aparato de los que ocupan el cupo. */
    public static final class Aparato {
        public String llave = "";
        public String plataforma = "";
        public long visto;

        /** «Televisor», no «tv»: lo lee alguien desde el sofá. */
        public String comoSeLlama() {
            if ("tv".equals(plataforma)) return "Televisor";
            if ("web".equals(plataforma)) return "Navegador";
            if ("android".equals(plataforma)) return "Android";
            if ("ios".equals(plataforma)) return "iPhone o iPad";
            if ("windows".equals(plataforma)) return "Windows";
            if ("mac".equals(plataforma)) return "Mac";
            return plataforma.isEmpty() ? "Aparato" : plataforma;
        }

        /**
         * «Hace 3 días».
         *
         * Una fecha exacta no sirve para nada: nadie recuerda el día que
         * encendió la tele del pueblo. El tiempo que hace, sí.
         */
        public String haceCuanto() {
            if (visto <= 0) return "";
            long min = Math.round((System.currentTimeMillis() - visto) / 60000.0);
            if (min < 2) return "ahora mismo";
            if (min < 60) return "hace " + min + " min";
            long h = Math.round(min / 60.0);
            if (h < 24) return "hace " + h + (h == 1 ? " hora" : " horas");
            long d = Math.round(h / 24.0);
            return "hace " + d + (d == 1 ? " día" : " días");
        }
    }

    public static List<Aparato> aparatos() throws Exception {
        List<Aparato> lista = new ArrayList<>();
        JSONObject r = new JSONObject(hablar("GET", "/api/customer/cuenta", null));
        JSONArray arr = r.optJSONArray("dispositivos");
        for (int i = 0; arr != null && i < arr.length(); i++) {
            JSONObject o = arr.getJSONObject(i);
            Aparato a = new Aparato();
            a.llave = o.optString("llave", "");
            a.plataforma = o.optString("plataforma", "");
            a.visto = o.optLong("visto", 0);
            if (!a.llave.isEmpty()) lista.add(a);
        }
        return lista;
    }

    /** Cerrar uno de los suyos. El servidor comprueba que lo sea. */
    public static void cerrar(String llave) throws Exception {
        hablar("DELETE", "/api/customer/cuenta?llave=" + Web.escapar(llave), null);
    }

    /**
     * Quién falla, contestado en una frase.
     *
     * La frase la escribe el servidor a propósito: es él quien sabe si el
     * proveedor le contesta, y es él quien tiene que decirlo sin nombrar la
     * dirección de nadie. Ver `app/api/diag/proveedor`.
     */
    public static String veredicto() throws Exception {
        JSONObject r = new JSONObject(hablar("POST", "/api/diag/proveedor", "{}"));
        String dice = r.optString("veredicto", "");
        return dice.isEmpty() ? "No se ha podido comprobar ahora mismo." : dice;
    }

    private static String hablar(String metodo, String ruta, String cuerpo) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(Acceso.CASA + ruta).openConnection();
        con.setRequestMethod(metodo);
        con.setConnectTimeout(15000);
        con.setReadTimeout(30000);
        con.setRequestProperty("User-Agent", Web.QUIEN_SOY);
        String galleta = Sesion.actual().galleta;
        if (!galleta.isEmpty()) con.setRequestProperty("Cookie", galleta);
        if (cuerpo != null) {
            con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "application/json");
            OutputStream salida = con.getOutputStream();
            salida.write(cuerpo.getBytes("UTF-8"));
            salida.close();
        }
        try {
            boolean mal = con.getResponseCode() >= 400;
            StringBuilder sb = new StringBuilder();
            BufferedReader r = new BufferedReader(new InputStreamReader(
                    mal ? con.getErrorStream() : con.getInputStream(), "UTF-8"));
            String linea;
            while ((linea = r.readLine()) != null) sb.append(linea);
            r.close();
            if (mal) {
                /* Lo que diga el panel: «ese aparato no es de esta cuenta»
                   se entiende mucho mejor que un 403 */
                String porque = "";
                try {
                    porque = new JSONObject(sb.toString()).optString("error", "");
                } catch (Exception noEraJson) {
                    // Se cuenta lo que se sabe, que es nada
                }
                throw new Acceso.NoEntra(porque.isEmpty() ? "No se ha podido" : porque);
            }
            return sb.toString();
        } finally {
            con.disconnect();
        }
    }
}
