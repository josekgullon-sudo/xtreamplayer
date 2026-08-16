package app.totalplayer.tvnativo;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Los canales marcados, guardados en el aparato.
 *
 * Se guarda el canal entero —nombre, logotipo y dirección—, no solo su
 * identificador. Así la carpeta de favoritos se abre sin pedirle nada a
 * nadie, que es justo lo que se espera de ella: es la carpeta a la que se va
 * cuando no apetece buscar.
 *
 * Van por perfil: en una casa con varios, los favoritos de uno no son los
 * del otro. Es lo mismo que hace la web.
 */
public final class Favoritos {

    /** El identificador de la carpeta falsa que va la primera. */
    public static final String CARPETA = "*favoritos*";

    private Favoritos() {}

    private static String llave() {
        int perfil = Sesion.actual().perfilId;
        return perfil > 0 ? "favoritos_" + perfil : "favoritos";
    }

    public static List<Catalogo.Item> lista(Context c) {
        List<Catalogo.Item> lista = new ArrayList<>();
        try {
            JSONArray guardados = new JSONArray(Sesion.ajustes(c).getString(llave(), "[]"));
            for (int i = 0; i < guardados.length(); i++) {
                JSONObject o = guardados.getJSONObject(i);
                Catalogo.Item it = new Catalogo.Item();
                it.id = o.optString("id", "");
                it.nombre = o.optString("nombre", "");
                it.imagen = o.optString("imagen", "");
                it.url = o.optString("url", "");
                it.numero = o.optInt("numero", 0);
                /*
                 * La clase, que es lo que resuelve el canal cuando no hay
                 * dirección.
                 *
                 * Aquí estaba el fallo que dejaba la carpeta de favoritos
                 * siempre vacía justo a quien más la usa: con lista del
                 * proveedor los canales llegan SIN dirección —lleva dentro
                 * su servidor, su usuario y su contraseña, y eso no baja al
                 * aparato—, así que la línea de abajo, que exigía url, los
                 * descartaba todos. Marcabas cinco canales y favoritos
                 * seguía diciendo «aún no has marcado ninguno». Sin
                 * dirección se resuelve por clase e identificador, que es
                 * exactamente lo que hace la lista normal al pulsar OK.
                 * El valor por omisión vale para lo ya guardado antes de
                 * esto: en favoritos solo hay canales.
                 */
                it.clase = o.optString("clase", Enlaces.DIRECTO);
                if (!it.id.isEmpty()) lista.add(it);
            }
        } catch (Exception e) {
            // Un favorito ilegible no puede impedir ver la tele
        }
        return lista;
    }

    public static Set<String> marcados(Context c) {
        Set<String> ids = new HashSet<>();
        for (Catalogo.Item it : lista(c)) ids.add(it.id);
        return ids;
    }

    /** Marca o desmarca. Devuelve cómo queda, para poder decirlo. */
    public static boolean alternar(Context c, Catalogo.Item canal) {
        List<Catalogo.Item> lista = lista(c);
        boolean estaba = false;
        for (int i = 0; i < lista.size(); i++) {
            if (lista.get(i).id.equals(canal.id)) {
                lista.remove(i);
                estaba = true;
                break;
            }
        }
        // Los nuevos van al principio: el último que marcas es el que buscas
        if (!estaba) lista.add(0, canal);
        guardar(c, lista);
        return !estaba;
    }

    private static void guardar(Context c, List<Catalogo.Item> lista) {
        JSONArray fuera = new JSONArray();
        try {
            for (Catalogo.Item it : lista) {
                JSONObject o = new JSONObject();
                o.put("id", it.id);
                o.put("nombre", it.nombre);
                o.put("imagen", it.imagen);
                o.put("url", it.url);
                o.put("numero", it.numero);
                o.put("clase", it.clase);
                fuera.put(o);
            }
        } catch (Exception e) {
            return;
        }
        SharedPreferences.Editor e = Sesion.ajustes(c).edit();
        e.putString(llave(), fuera.toString());
        e.apply();
    }
}
