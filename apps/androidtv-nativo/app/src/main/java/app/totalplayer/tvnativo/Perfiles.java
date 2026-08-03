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
 * Los perfiles de la cuenta, los mismos que en la web.
 *
 * Cada uno guarda sus favoritos y su historial, y uno puede ser infantil.
 * Cuántos hay disponibles lo decide el proveedor, así que crear uno puede
 * salir rechazado: ese motivo lo da el panel y es el que se enseña.
 */
public final class Perfiles {

    public static class Perfil {
        public final int id;
        public final String nombre;
        public final boolean infantil;
        Perfil(int id, String nombre, boolean infantil) {
            this.id = id; this.nombre = nombre; this.infantil = infantil;
        }
        /** La inicial que va dentro del cuadrado, como en la web. */
        public String inicial() {
            return nombre.isEmpty() ? "?" : nombre.substring(0, 1).toUpperCase();
        }
    }

    public static class Lista {
        public final List<Perfil> perfiles;
        public final boolean cabenMas;
        Lista(List<Perfil> perfiles, boolean cabenMas) {
            this.perfiles = perfiles; this.cabenMas = cabenMas;
        }
    }

    private Perfiles() {}

    public static Lista listar(String galleta) throws Exception {
        JSONObject r = new JSONObject(hablar("GET", "/api/profiles", galleta, null));
        JSONArray dentro = r.optJSONArray("profiles");
        List<Perfil> lista = new ArrayList<>();
        for (int i = 0; dentro != null && i < dentro.length(); i++) {
            JSONObject p = dentro.getJSONObject(i);
            lista.add(new Perfil(p.optInt("id"), p.optString("name", ""), p.optBoolean("kids", false)));
        }
        return new Lista(lista, r.optBoolean("canAddMore", false));
    }

    public static Perfil crear(String galleta, String nombre) throws Exception {
        JSONObject datos = new JSONObject();
        datos.put("name", nombre);
        JSONObject r = new JSONObject(hablar("POST", "/api/profiles", galleta, datos.toString()));
        JSONObject p = r.optJSONObject("profile");
        if (p == null) throw new Acceso.NoEntra(r.optString("error", "No se ha podido crear el perfil"));
        return new Perfil(p.optInt("id"), p.optString("name", nombre), p.optBoolean("kids", false));
    }

    private static String hablar(String metodo, String ruta, String galleta, String cuerpo) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(Acceso.CASA + ruta).openConnection();
        con.setRequestMethod(metodo);
        con.setConnectTimeout(15000);
        con.setReadTimeout(20000);
        if (galleta != null && !galleta.isEmpty()) con.setRequestProperty("Cookie", galleta);
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
                /* El panel dice por qué —«tu proveedor te permite 2 perfiles»—
                   y eso vale más que cualquier cosa que inventemos aquí */
                String porque = new JSONObject(sb.toString()).optString("error", "");
                throw new Acceso.NoEntra(porque.isEmpty() ? "No se ha podido" : porque);
            }
            return sb.toString();
        } finally {
            con.disconnect();
        }
    }
}
