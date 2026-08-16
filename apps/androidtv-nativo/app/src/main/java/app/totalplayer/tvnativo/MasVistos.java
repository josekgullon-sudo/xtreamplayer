package app.totalplayer.tvnativo;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/**
 * Los canales que más se ponen en este aparato.
 *
 * Es la única cuenta de «lo más visto» que se puede dar sin mentir: nadie
 * nos dice qué está viendo el resto del mundo, así que lo que hay es lo que
 * pone esta tele. Por eso la carpeta se llama «Los que más ves» y no
 * «Tendencias» ni «Lo más visto»: no es de nadie más, es tuyo.
 *
 * Va junto a favoritos y funciona igual —el canal entero guardado, para
 * poder abrirla sin pedirle nada a nadie, y por perfil, que en una casa con
 * varios lo que pone uno no es lo que pone el otro—. La diferencia es que
 * esta no hay que mantenerla: se llena sola con solo ver la tele, que es lo
 * que hace que exista de verdad. Una lista de favoritos vacía es lo normal;
 * una de canales vistos, no.
 *
 * Es la misma idea que `K_VISTOS` en la aplicación web (`components/tv`). Si
 * se cambia el criterio aquí, se cambia allí: son dos clientes de la misma
 * idea, no dos ideas.
 */
public final class MasVistos {

    /** El identificador de la carpeta falsa, como la de favoritos. */
    public static final String CARPETA = "*masvistos*";

    /** Cuántos entran: pasado de ahí ya no es un ranking, es la lista entera. */
    private static final int CUANTOS = 12;

    /**
     * Por debajo de esto la carpeta no se enseña.
     *
     * Con uno o dos canales puestos, un «Los que más ves» de dos filas no
     * dice nada de lo que uno ve: dice que acaba de instalar la aplicación.
     */
    public static final int MINIMO = 3;

    private MasVistos() {}

    private static String llave() {
        int perfil = Sesion.actual().perfilId;
        return perfil > 0 ? "masvistos_" + perfil : "masvistos";
    }

    /** Una raya más para este canal. Se llama al ponerlo, no al mirarlo. */
    public static void apuntar(Context c, Catalogo.Item canal) {
        if (canal == null || canal.id == null || canal.id.isEmpty()) return;
        List<Fila> filas = leer(c);
        for (Fila f : filas) {
            if (f.canal.id.equals(canal.id)) {
                f.veces++;
                /* El canal se vuelve a guardar entero: el logotipo o el
                   nombre pueden haber cambiado en el panel desde la primera
                   vez, y lo que se enseña tiene que ser lo de ahora */
                f.canal = canal;
                guardar(c, filas);
                return;
            }
        }
        Fila nueva = new Fila();
        nueva.canal = canal;
        nueva.veces = 1;
        filas.add(nueva);
        guardar(c, filas);
    }

    /** Los canales, del que más se pone al que menos. */
    public static List<Catalogo.Item> lista(Context c) {
        List<Fila> filas = leer(c);
        Collections.sort(filas, new Comparator<Fila>() {
            @Override public int compare(Fila a, Fila b) { return b.veces - a.veces; }
        });
        List<Catalogo.Item> fuera = new ArrayList<>();
        for (Fila f : filas) {
            if (fuera.size() >= CUANTOS) break;
            fuera.add(f.canal);
        }
        return fuera;
    }

    /** Cuántos canales distintos se han puesto alguna vez. */
    public static int cuantos(Context c) {
        return leer(c).size();
    }

    private static final class Fila {
        Catalogo.Item canal;
        int veces;
    }

    private static List<Fila> leer(Context c) {
        List<Fila> filas = new ArrayList<>();
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
                /* Sin exigir dirección: con lista del proveedor los canales
                   llegan sin ella y se resuelven por clase e identificador,
                   igual que al pulsar OK en la lista normal */
                it.clase = o.optString("clase", Enlaces.DIRECTO);
                if (it.id.isEmpty()) continue;
                Fila f = new Fila();
                f.canal = it;
                f.veces = Math.max(1, o.optInt("veces", 1));
                filas.add(f);
            }
        } catch (Exception e) {
            // Una cuenta ilegible no puede impedir ver la tele
        }
        return filas;
    }

    private static void guardar(Context c, List<Fila> filas) {
        JSONArray fuera = new JSONArray();
        try {
            for (Fila f : filas) {
                JSONObject o = new JSONObject();
                o.put("id", f.canal.id);
                o.put("nombre", f.canal.nombre);
                o.put("imagen", f.canal.imagen);
                o.put("url", f.canal.url);
                o.put("numero", f.canal.numero);
                o.put("clase", f.canal.clase);
                o.put("veces", f.veces);
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
