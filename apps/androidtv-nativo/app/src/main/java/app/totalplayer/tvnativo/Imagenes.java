package app.totalplayer.tvnativo;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.LruCache;
import android.widget.ImageView;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Carátulas y logotipos, sin librerías.
 *
 * Tres cosas que hay que hacer sí o sí y son justo las que se olvidan:
 * guardar en memoria lo ya bajado, no bajar la imagen a tamaño completo para
 * pintarla en un hueco de 200 píxeles, y comprobar al terminar que la fila
 * sigue siendo la misma —en una rejilla las filas se reciclan mientras la
 * imagen viaja, y sin esa comprobación acabas viendo el cartel de otra—.
 */
public final class Imagenes {

    /* Un octavo de la memoria de la aplicación: suficiente para una pantalla
       de carteles y sus vecinos, sin ahogar al reproductor */
    /*
     * Las que no se pudieron bajar, para no volver a intentarlo nunca.
     *
     * Sin esto, un proveedor con la mitad de los logotipos rotos hace que
     * cada pasada por la lista repita todas esas peticiones fallidas.
     */
    private static final java.util.Set<String> ROTAS =
            java.util.Collections.synchronizedSet(new java.util.HashSet<String>());

    private static final LruCache<String, Bitmap> CACHE =
            new LruCache<String, Bitmap>((int) (Runtime.getRuntime().maxMemory() / 8192)) {
                @Override protected int sizeOf(String clave, Bitmap b) { return b.getByteCount() / 1024; }
            };

    private Imagenes() {}

    public static void cargar(final ImageView donde, final String url, final int deReserva) {
        if (donde == null) return;
        if (url == null || url.isEmpty() || !url.startsWith("http")) {
            donde.setTag(null);
            donde.setImageResource(deReserva);
            return;
        }

        if (ROTAS.contains(url)) {
            donde.setTag(null);
            donde.setImageResource(deReserva);
            return;
        }

        Bitmap ya = CACHE.get(url);
        if (ya != null) {
            donde.setTag(url);
            donde.setImageBitmap(ya);
            return;
        }

        donde.setTag(url);
        donde.setImageResource(deReserva);
        final int ancho = Math.max(donde.getWidth(), 320);

        Hilos.fueraLento(new Hilos.Trabajo<Bitmap>() {
            @Override public Bitmap hacer() {
                /*
                 * Antes de gastar una conexión, mirar si esta fila sigue
                 * enseñando lo mismo.
                 *
                 * Bajando deprisa por una carpeta de cuatrocientos canales
                 * se pedían cuatrocientos logotipos —todos al servidor del
                 * proveedor, el mismo que sirve el vídeo—, y esa ráfaga es
                 * la que hacía que el servidor dejara de contestar y que la
                 * tele se quedara sin memoria. La fila ya se ha reciclado
                 * veinte veces: ese logotipo no lo está mirando nadie.
                 */
                if (!url.equals(donde.getTag())) return null;
                Bitmap b = bajar(url, ancho);
                if (b == null) ROTAS.add(url);
                return b;
            }
        }, new Hilos.Luego<Bitmap>() {
            @Override public void listo(Bitmap b) {
                if (b == null) return;
                CACHE.put(url, b);
                // La fila puede haberse reciclado mientras la imagen viajaba
                if (url.equals(donde.getTag())) donde.setImageBitmap(b);
            }
            @Override public void falla(Exception e) { ROTAS.add(url); }
        });
    }

    private static Bitmap bajar(String url, int anchoDestino) {
        try {
            byte[] bytes = leer(url);
            if (bytes == null) return null;

            BitmapFactory.Options medir = new BitmapFactory.Options();
            medir.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, medir);

            int escala = 1;
            while (medir.outWidth / (escala * 2) >= anchoDestino) escala *= 2;

            BitmapFactory.Options opciones = new BitmapFactory.Options();
            opciones.inSampleSize = escala;
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opciones);
        } catch (Throwable e) {
            return null;
        }
    }

    private static byte[] leer(String url) throws Exception {
        /*
         * Las carátulas del catálogo llegan ya como ruta nuestra
         * —«/api/img?v=…»— porque el panel cambia cada dirección del proveedor
         * por un vale cifrado. Hay que completarla y enseñar la galleta: un
         * vale es de quien lo pidió y no vale sin sesión.
         */
        boolean nuestra = url.startsWith("/");
        HttpURLConnection con = (HttpURLConnection)
                new URL(nuestra ? Acceso.CASA + url : url).openConnection();
        if (nuestra && !Sesion.actual().galleta.isEmpty()) {
            con.setRequestProperty("Cookie", Sesion.actual().galleta);
        }
        con.setConnectTimeout(8000);
        con.setReadTimeout(8000);
        con.setInstanceFollowRedirects(true);
        con.setRequestProperty("User-Agent", Web.QUIEN_SOY);
        try {
            if (con.getResponseCode() >= 400) return null;
            InputStream in = con.getInputStream();
            java.io.ByteArrayOutputStream fuera = new java.io.ByteArrayOutputStream();
            byte[] trozo = new byte[8192];
            int leidos;
            int total = 0;
            while ((leidos = in.read(trozo)) > 0) {
                total += leidos;
                // Un «cartel» de 20 MB no es un cartel: es una avería
                if (total > 3 * 1024 * 1024) return null;
                fuera.write(trozo, 0, leidos);
            }
            in.close();
            return fuera.toByteArray();
        } finally {
            con.disconnect();
        }
    }
}
