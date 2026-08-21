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

    /**
     * El hueco de verdad, que en el primer pase todavía no está medido.
     *
     * `getWidth()` vale 0 mientras la celda no se ha colocado, y en un
     * RecyclerView eso es justo cuando se pide la imagen. Con el mínimo de
     * antes, TODA imagen se bajaba a 320 px: bien para un logotipo de la
     * lista, y una pena para el del canal que suena, que en una tele ocupa
     * varias veces eso y se veía estirado. Los layouts de televisor dan el
     * ancho en dp fijos, así que cuando la vista aún no está medida se mira
     * ahí antes de rendirse al mínimo.
     */
    private static int anchoDe(ImageView donde) {
        int medido = donde.getWidth();
        if (medido > 0) return medido;
        android.view.ViewGroup.LayoutParams lp = donde.getLayoutParams();
        if (lp != null && lp.width > 0) return lp.width;
        return 320;
    }

    /**
     * Tamaños en escalones, para la clave de la memoria.
     *
     * La memoria estaba indexada solo por la dirección, y ahí estaba el
     * verdadero motivo de que los logotipos se vieran pixelados: el primero
     * que pedía un logotipo fijaba su tamaño para todos los demás. Como la
     * lista de canales se pinta antes que el panel del canal que suena, el
     * panel —que es cuatro veces más grande— heredaba el bitmap pequeño de
     * la lista y lo estiraba.
     *
     * En escalones y no al píxel para no acabar guardando quince versiones
     * del mismo logotipo en una tele que va justa de memoria.
     */
    private static int escalon(int ancho) {
        if (ancho <= 160) return 160;
        if (ancho <= 320) return 320;
        if (ancho <= 640) return 640;
        return 1024;
    }

    private static String clave(String url, int escalon) { return url + "@" + escalon; }

    private static final LruCache<String, Bitmap> CACHE =
            new LruCache<String, Bitmap>((int) (Runtime.getRuntime().maxMemory() / 8192)) {
                @Override protected int sizeOf(String clave, Bitmap b) { return b.getByteCount() / 1024; }
            };

    private Imagenes() {}

    public static void cargar(final ImageView donde, final String url, final int deReserva) {
        if (donde == null) return;
        /*
         * Vale «http://…» y vale «/api/img?v=…».
         *
         * Aquí estaba el fallo que dejaba la aplicación sin una sola imagen
         * con cuenta de proveedor: las carátulas y los logotipos de una
         * lista de la plataforma no llegan como dirección, llegan como vale
         * —una ruta nuestra que el servidor cambia por la imagen de verdad—,
         * y esta línea las descartaba por no empezar por «http». Justo el
         * caso que `leer()`, treinta líneas más abajo, sabe resolver y
         * explica en su comentario. El resultado era una tele entera de
         * cuadrados grises: ni un logotipo de canal ni un cartel.
         */
        if (url == null || url.isEmpty() || !(url.startsWith("http") || url.startsWith("/"))) {
            donde.setTag(null);
            donde.setImageResource(deReserva);
            return;
        }

        if (ROTAS.contains(url)) {
            donde.setTag(null);
            donde.setImageResource(deReserva);
            return;
        }

        final int ancho = escalon(anchoDe(donde));
        final String clave = clave(url, ancho);

        Bitmap ya = CACHE.get(clave);
        if (ya != null) {
            donde.setTag(url);
            donde.setImageBitmap(ya);
            return;
        }

        donde.setTag(url);
        donde.setImageResource(deReserva);

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
                CACHE.put(clave, b);
                // La fila puede haberse reciclado mientras la imagen viajaba
                if (url.equals(donde.getTag())) donde.setImageBitmap(b);
            }
            @Override public void falla(Exception e) { ROTAS.add(url); }
        });
    }

    /**
     * Lo mismo, pero recortado en círculo. Para las caras del reparto.
     *
     * Recortado a mano con un `BitmapShader` y no con la utilidad de
     * androidx: son quince líneas de `android.graphics`, que está en todos
     * los aparatos desde siempre, y así esto no depende de que una librería
     * transitiva siga estando ahí mañana.
     *
     * El recorte se hace al pintar y no al guardar: la memoria de imágenes
     * es común con el resto de la aplicación y no tiene sentido tener el
     * mismo retrato dos veces, entero y redondo.
     */
    public static void cargarRedonda(final ImageView donde, final String url, final int deReserva) {
        if (donde == null) return;
        cargar(donde, url, deReserva);
        /* Y cuando la imagen esté, se redondea. Va en un `post` porque
           `cargar` puede pintarla ya —si estaba en memoria— o dentro de un
           rato, y aquí lo único que se sabe es que hay que mirar después */
        donde.post(new Runnable() {
            @Override public void run() { redondear(donde); }
        });
    }

    private static void redondear(ImageView donde) {
        android.graphics.drawable.Drawable d = donde.getDrawable();
        if (!(d instanceof android.graphics.drawable.BitmapDrawable)) return;
        Bitmap b = ((android.graphics.drawable.BitmapDrawable) d).getBitmap();
        if (b == null || b.getWidth() <= 0 || b.getHeight() <= 0) return;

        int lado = Math.min(b.getWidth(), b.getHeight());
        Bitmap fuera = Bitmap.createBitmap(lado, lado, Bitmap.Config.ARGB_8888);
        android.graphics.Canvas lienzo = new android.graphics.Canvas(fuera);
        android.graphics.Paint pincel =
                new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
        android.graphics.BitmapShader relleno = new android.graphics.BitmapShader(
                b, android.graphics.Shader.TileMode.CLAMP, android.graphics.Shader.TileMode.CLAMP);
        /* Centrado y un poco por encima: en un retrato la cara está en el
           tercio de arriba, y recortando por el centro geométrico se pierde
           media frente y sobra media camisa */
        android.graphics.Matrix donde2 = new android.graphics.Matrix();
        donde2.setTranslate(-(b.getWidth() - lado) / 2f, -(b.getHeight() - lado) * 0.25f);
        relleno.setLocalMatrix(donde2);
        pincel.setShader(relleno);
        lienzo.drawCircle(lado / 2f, lado / 2f, lado / 2f, pincel);
        donde.setImageBitmap(fuera);
    }

    /** Para cuando lo que hace falta es la imagen, no pintarla en un hueco. */
    public interface Traida { void llega(Bitmap b); }

    /**
     * Baja una imagen y la entrega, sin pintar nada.
     *
     * Existe por el destacado de la portada. `cargar` vale para un cartel de
     * una fila: si no llega, se queda el dibujo de reserva y no pasa nada.
     * Arriba sí pasa: el destacado ocupa media pantalla y sin su imagen deja
     * un hueco negro. Con esto la portada puede probar candidatos hasta que
     * uno conteste, y enseñar ese.
     *
     * Se apoya en la misma memoria y en la misma lista de rotas que `cargar`,
     * así que probar un candidato que ya falló antes no cuesta ni una
     * conexión.
     */
    public static void probar(final String url, final int anchoDestino, final Traida quien) {
        if (url == null || url.isEmpty()
                || !(url.startsWith("http") || url.startsWith("/"))
                || ROTAS.contains(url)) {
            quien.llega(null);
            return;
        }
        final String clave = clave(url, escalon(anchoDestino));
        Bitmap ya = CACHE.get(clave);
        if (ya != null) {
            quien.llega(ya);
            return;
        }
        Hilos.fueraLento(new Hilos.Trabajo<Bitmap>() {
            @Override public Bitmap hacer() {
                Bitmap b = bajar(url, anchoDestino);
                if (b == null) ROTAS.add(url);
                return b;
            }
        }, new Hilos.Luego<Bitmap>() {
            @Override public void listo(Bitmap b) {
                if (b != null) CACHE.put(clave, b);
                quien.llega(b);
            }
            @Override public void falla(Exception e) {
                ROTAS.add(url);
                quien.llega(null);
            }
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
            /*
             * Sin reescalar por densidad.
             *
             * Por defecto BitmapFactory da por hecho que los bytes vienen de
             * la carpeta `drawable` y los reescala de la densidad del
             * proyecto a la del aparato. Estos vienen de la red y no tienen
             * densidad ninguna: ese reescalado de más es un remuestreo que
             * no hacía falta, y en un logotipo con letras pequeñas se nota
             * en los bordes.
             */
            opciones.inScaled = false;
            /* Calidad por delante de memoria en el color: en un logotipo con
               degradados, 565 saca bandas donde el original no las tiene */
            opciones.inPreferredConfig = Bitmap.Config.ARGB_8888;
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
