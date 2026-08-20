package app.totalplayer.comun;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Guardar películas y episodios en el aparato, para verlos sin conexión.
 *
 * La interfaz es la misma web que en el navegador, y una web no puede
 * guardar dos gigas: lo que hay en un navegador es almacenamiento del sitio,
 * que el sistema borra cuando le hace falta espacio. Aquí sí se puede, así
 * que la web pregunta —«¿hay alguien que sepa descargar?»— y esta clase es la
 * que contesta que sí.
 *
 * El contrato con la web es a propósito de andar por casa: tres funciones que
 * reciben y devuelven texto. No es pereza, es que `@JavascriptInterface` no
 * sabe pasar objetos, y un puente que finge saber más de lo que sabe se rompe
 * en cuanto alguien lo toca. Está escrito igual en `components/tv/descargas.ts`.
 *
 * Los ficheros van a la carpeta privada de la aplicación: no hacen falta
 * permisos, no salen en la galería del televisor y se van con la aplicación
 * cuando se desinstala, que es lo que espera cualquiera.
 */
public class Descargas {

    private static final String TAG = "TPDescargas";
    /** Dónde se apunta lo que hay. El fichero se llama igual en las dos apps */
    private static final String CUADERNO = "tp_descargas";
    private static final String CLAVE = "lista";

    private final Context contexto;
    private final SharedPreferences cuaderno;
    /*
     * Una detrás de otra y no todas a la vez.
     *
     * Un televisor con wifi de casa y tres descargas en paralelo no baja tres
     * veces más rápido: baja lo mismo repartido, y mientras tanto el vídeo
     * que se está viendo se corta. En fila, la primera termina pronto y ya se
     * puede ver.
     */
    private final ExecutorService cola = Executors.newSingleThreadExecutor();
    /** Lo que se ha mandado parar mientras bajaba */
    private final Set<String> cancelados = new HashSet<>();
    private ServidorLocal servidor;

    public Descargas(Context contexto) {
        this.contexto = contexto.getApplicationContext();
        this.cuaderno = this.contexto.getSharedPreferences(CUADERNO, Context.MODE_PRIVATE);
        /*
         * Lo que quedara a medio bajar de la última vez, no está.
         *
         * Se apaga la tele con una descarga a la mitad y al volver a
         * encenderla el fichero está incompleto pero apuntado como si
         * estuviera bajando: sin esto, se queda «bajando 43%» para siempre.
         */
        repasarAlArrancar();
    }

    /* ---------- Lo que ve la web ---------- */

    /**
     * «Guárdame esto».
     *
     * El encargo trae identificador, nombre, carátula y la dirección del
     * vídeo ya resuelta contra el panel del proveedor: esa parte la hace la
     * web, que es la que tiene la sesión.
     */
    @JavascriptInterface
    public void bajar(String encargo) {
        try {
            final JSONObject e = new JSONObject(encargo);
            final String id = e.optString("id");
            final String origen = e.optString("url");
            if (id.isEmpty() || origen.isEmpty()) return;
            synchronized (this) {
                if (buscar(id) != null) return;  // ya está, o ya está bajando
                cancelados.remove(id);
                JSONObject fila = new JSONObject();
                fila.put("id", id);
                fila.put("nombre", e.optString("nombre"));
                fila.put("cartel", e.optString("cartel"));
                fila.put("estado", "bajando");
                fila.put("parte", 0);
                fila.put("bytes", 0);
                fila.put("origen", origen);
                anotar(fila);
            }
            cola.execute(new Runnable() {
                @Override
                public void run() {
                    traer(id, origen);
                }
            });
        } catch (Exception fallo) {
            Log.w(TAG, "encargo ilegible", fallo);
        }
    }

    /** «Quítame esto»: pare si está bajando, y borra lo que haya en disco. */
    @JavascriptInterface
    public void quitar(String id) {
        synchronized (this) {
            cancelados.add(id);
            borrar(id);
            File f = fichero(id);
            if (f.exists() && !f.delete()) Log.w(TAG, "no se ha podido borrar " + f);
            File medio = aMedias(id);
            if (medio.exists() && !medio.delete()) Log.w(TAG, "no se ha podido borrar " + medio);
        }
    }

    /** «¿Qué hay?». La web pregunta cada segundo y medio mientras algo baje. */
    @JavascriptInterface
    public String lista() {
        JSONArray fuera = new JSONArray();
        JSONArray dentro = leer();
        for (int i = 0; i < dentro.length(); i++) {
            JSONObject f = dentro.optJSONObject(i);
            if (f == null) continue;
            try {
                JSONObject copia = new JSONObject(f.toString());
                /* La dirección solo tiene sentido cuando el fichero está
                   entero: media película se ve como un vídeo roto */
                copia.put("url", "lista".equals(f.optString("estado")) ? donde(f.optString("id")) : "");
                copia.remove("origen");   // la web no tiene nada que hacer con ella
                fuera.put(copia);
            } catch (Exception ignorado) {
                /* Una fila ilegible no puede dejar sin lista a las demás */
            }
        }
        return fuera.toString();
    }

    /* ---------- Y lo mismo, para quien lo use desde Java ---------- */

    /*
     * La aplicación nativa de televisión no es una web: no hay puente ni
     * JavaScript, hay un reproductor que abre un fichero. Pero descargar es
     * exactamente lo mismo —la misma cola, el mismo `.medias`, el mismo
     * cuaderno—, así que se usa esta misma clase por la puerta de al lado.
     *
     * Lo que cambia es cómo se pregunta y cómo se ve: en Java se pasan y se
     * devuelven objetos, y el fichero se abre por su ruta y no por el
     * servidor local, que ahí no hace ninguna falta.
     */

    /** Una descarga, para quien la mira desde Java. */
    public static class Cosa {
        public String id = "";
        public String nombre = "";
        public String cartel = "";
        public String estado = "";
        public int parte;
        public long bytes;
        /** Dónde está el fichero, si ya está entero. Vacío si no. */
        public String ruta = "";
    }

    /** Encarga una descarga sin tener que montar el JSON a mano. */
    public void pedir(String id, String nombre, String cartel, String url) {
        try {
            JSONObject e = new JSONObject();
            e.put("id", id);
            e.put("nombre", nombre);
            e.put("cartel", cartel);
            e.put("url", url);
            bajar(e.toString());
        } catch (Exception fallo) {
            Log.w(TAG, "no se ha podido encargar " + id, fallo);
        }
    }

    /** Lo que hay guardado, de más reciente a más antiguo. */
    public java.util.List<Cosa> cosas() {
        java.util.List<Cosa> fuera = new java.util.ArrayList<>();
        JSONArray dentro = leer();
        for (int i = 0; i < dentro.length(); i++) {
            JSONObject f = dentro.optJSONObject(i);
            if (f == null) continue;
            Cosa c = new Cosa();
            c.id = f.optString("id");
            c.nombre = f.optString("nombre");
            c.cartel = f.optString("cartel");
            c.estado = f.optString("estado");
            c.parte = f.optInt("parte");
            c.bytes = f.optLong("bytes");
            c.ruta = "lista".equals(c.estado) ? rutaLocal(c.id) : "";
            fuera.add(c);
        }
        return fuera;
    }

    /** Cómo está una cosa concreta, o `null` si no está. */
    public Cosa comoVa(String id) {
        for (Cosa c : cosas()) if (c.id.equals(id)) return c;
        return null;
    }

    /**
     * Dónde está el fichero, ya en el aparato.
     *
     * Para el reproductor nativo esto es todo lo que hace falta: abre la
     * ruta y ya. El servidor local de aquí al lado solo existe porque un
     * WebView no puede abrir un `file://` desde una página en https.
     */
    public String rutaLocal(String id) {
        File f = fichero(id);
        return f.exists() ? f.getAbsolutePath() : "";
    }

    /** «1,4 GB». Vacío si todavía no se sabe cuánto ocupa. */
    public static String tamano(long bytes) {
        if (bytes <= 0) return "";
        if (bytes < 1024L * 1024) return Math.round(bytes / 1024f) + " KB";
        if (bytes < 1024L * 1024 * 1024) return Math.round(bytes / (1024f * 1024)) + " MB";
        return String.format(java.util.Locale.getDefault(), "%.1f GB", bytes / (1024f * 1024 * 1024));
    }

    /* ---------- Lo de dentro ---------- */

    /**
     * Baja el fichero, contando por dónde va.
     *
     * Se escribe en un `.medias` y solo al final se renombra: así, un corte
     * de luz deja basura reconocible y no una película que parece entera y
     * está partida por la mitad.
     */
    private void traer(String id, String origen) {
        HttpURLConnection con = null;
        InputStream entra = null;
        OutputStream sale = null;
        File destino = aMedias(id);
        try {
            URL url = new URL(origen);
            con = (HttpURLConnection) url.openConnection();
            con.setInstanceFollowRedirects(true);
            con.setConnectTimeout(20000);
            con.setReadTimeout(30000);
            /* Algunos paneles miran quién pide y contestan 403 a lo que no
               parece un reproductor */
            con.setRequestProperty("User-Agent", "TOTALplayer");
            con.connect();
            int codigo = con.getResponseCode();
            if (codigo < 200 || codigo >= 300) throw new Exception("respuesta " + codigo);

            long total = con.getContentLength();
            entra = con.getInputStream();
            sale = new FileOutputStream(destino);
            byte[] trozo = new byte[64 * 1024];
            long llevamos = 0;
            int ultimoAviso = -1;
            int leidos;
            while ((leidos = entra.read(trozo)) > 0) {
                if (cancelado(id)) {
                    cerrar(sale);
                    if (destino.exists() && !destino.delete()) Log.w(TAG, "sobra " + destino);
                    return;
                }
                sale.write(trozo, 0, leidos);
                llevamos += leidos;
                int parte = total > 0 ? (int) (llevamos * 100 / total) : 0;
                /* Se apunta cada punto porcentual y no cada trozo: escribir en
                   las preferencias sesenta veces por segundo es tocar el disco
                   sin necesidad y se nota en un aparato barato */
                if (parte != ultimoAviso) {
                    ultimoAviso = parte;
                    apuntarAvance(id, parte, llevamos);
                }
            }
            cerrar(sale);
            sale = null;
            if (cancelado(id)) {
                if (destino.exists() && !destino.delete()) Log.w(TAG, "sobra " + destino);
                return;
            }
            File entero = fichero(id);
            if (entero.exists() && !entero.delete()) Log.w(TAG, "no se ha podido reemplazar " + entero);
            if (!destino.renameTo(entero)) throw new Exception("no se ha podido cerrar el fichero");
            terminar(id, entero.length());
        } catch (Exception fallo) {
            Log.w(TAG, "no se ha podido bajar " + id, fallo);
            if (destino.exists() && !destino.delete()) Log.w(TAG, "sobra " + destino);
            if (!cancelado(id)) fallar(id);
        } finally {
            cerrar(sale);
            cerrar(entra);
            if (con != null) con.disconnect();
        }
    }

    private synchronized boolean cancelado(String id) {
        return cancelados.contains(id);
    }

    /** Dónde se ve, ya en el aparato. La sirve el servidor de aquí al lado. */
    private synchronized String donde(String id) {
        if (servidor == null || !servidor.enPie()) {
            servidor = new ServidorLocal(new ServidorLocal.Buscador() {
                @Override
                public File dame(String cual) {
                    File f = fichero(cual);
                    return f.exists() ? f : null;
                }
            });
            servidor.arrancar();
        }
        int puerto = servidor.puerto();
        if (puerto <= 0) return "";
        return "http://127.0.0.1:" + puerto + "/d/" + id;
    }

    private File carpeta() {
        File c = contexto.getExternalFilesDir("descargas");
        /* Sin tarjeta ni almacenamiento «externo» emulado —pasa en algún
           Fire TV viejo— se usa el interno, que siempre está */
        if (c == null) c = new File(contexto.getFilesDir(), "descargas");
        if (!c.exists() && !c.mkdirs()) Log.w(TAG, "no se ha podido crear " + c);
        return c;
    }

    /** Un nombre de fichero que no dependa de cómo se llame la película. */
    private File fichero(String id) {
        return new File(carpeta(), id.replaceAll("[^A-Za-z0-9_-]", "_") + ".dat");
    }

    private File aMedias(String id) {
        return new File(carpeta(), id.replaceAll("[^A-Za-z0-9_-]", "_") + ".medias");
    }

    /* ---------- El cuaderno ---------- */

    private synchronized JSONArray leer() {
        try {
            return new JSONArray(cuaderno.getString(CLAVE, "[]"));
        } catch (Exception fallo) {
            return new JSONArray();
        }
    }

    private synchronized void escribir(JSONArray lista) {
        cuaderno.edit().putString(CLAVE, lista.toString()).apply();
    }

    private synchronized JSONObject buscar(String id) {
        JSONArray lista = leer();
        for (int i = 0; i < lista.length(); i++) {
            JSONObject f = lista.optJSONObject(i);
            if (f != null && id.equals(f.optString("id"))) return f;
        }
        return null;
    }

    private synchronized void anotar(JSONObject fila) {
        JSONArray lista = leer();
        JSONArray nueva = new JSONArray();
        nueva.put(fila);                       // lo último encargado, arriba
        for (int i = 0; i < lista.length(); i++) nueva.put(lista.opt(i));
        escribir(nueva);
    }

    private synchronized void borrar(String id) {
        JSONArray lista = leer();
        JSONArray nueva = new JSONArray();
        for (int i = 0; i < lista.length(); i++) {
            JSONObject f = lista.optJSONObject(i);
            if (f != null && !id.equals(f.optString("id"))) nueva.put(f);
        }
        escribir(nueva);
    }

    private synchronized void cambiar(String id, String estado, int parte, long bytes) {
        JSONArray lista = leer();
        for (int i = 0; i < lista.length(); i++) {
            JSONObject f = lista.optJSONObject(i);
            if (f == null || !id.equals(f.optString("id"))) continue;
            try {
                if (estado != null) f.put("estado", estado);
                if (parte >= 0) f.put("parte", parte);
                if (bytes >= 0) f.put("bytes", bytes);
            } catch (Exception ignorado) {
                /* Un `put` de JSONObject no falla con estos tipos */
            }
            escribir(lista);
            return;
        }
    }

    private void apuntarAvance(String id, int parte, long bytes) {
        cambiar(id, null, parte, bytes);
    }

    private void terminar(String id, long bytes) {
        cambiar(id, "lista", 100, bytes);
    }

    private void fallar(String id) {
        cambiar(id, "fallo", -1, -1);
    }

    /**
     * Al arrancar, lo que quedó a medias queda como fallido.
     *
     * La cola de descargas no sobrevive a cerrar la aplicación, así que
     * cualquier cosa apuntada como «bajando» al arrancar es de la vez
     * anterior y no va a avanzar sola. Marcarla como fallida es lo honesto:
     * se ve, se sabe que ocupa disco, y se puede quitar o volver a pedir.
     */
    private void repasarAlArrancar() {
        JSONArray lista = leer();
        boolean tocado = false;
        for (int i = 0; i < lista.length(); i++) {
            JSONObject f = lista.optJSONObject(i);
            if (f == null || !"bajando".equals(f.optString("estado"))) continue;
            try {
                f.put("estado", "fallo");
                tocado = true;
            } catch (Exception ignorado) {
                /* No pasa con una cadena */
            }
        }
        if (tocado) escribir(lista);
    }

    private static void cerrar(Object c) {
        try {
            if (c instanceof InputStream) ((InputStream) c).close();
            if (c instanceof OutputStream) ((OutputStream) c).close();
        } catch (Exception ignorado) {
            /* Cerrar lo que ya está cerrado no es un problema de nadie */
        }
    }
}
