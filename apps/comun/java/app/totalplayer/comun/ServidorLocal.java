package app.totalplayer.comun;

import android.util.Log;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Un servidor de tres líneas para servirle al WebView lo que ya está en disco.
 *
 * Suena a exageración y no lo es: la interfaz es una página en `https://`, y
 * desde una página así un `<video src="file:///...">` no carga —el navegador
 * lo bloquea, y hace bien—. Hay dos formas de salvar eso: interceptar las
 * peticiones del WebView, que no sabe de rangos y deja el vídeo sin poder
 * avanzar ni retroceder, o servirlo por `http://127.0.0.1`, que el navegador
 * trata como sitio de confianza y sí entiende de rangos. Esto es lo segundo.
 *
 * No sale del aparato: escucha solo en la dirección de bucle local, así que
 * nadie de la red de casa puede pedirle nada. Y solo sirve ficheros que le
 * dé el buscador que se le pasa: no se puede pedir «/etc/passwd» ni salirse
 * de la carpeta por mucha barra y punto que se escriba, porque no se le pasa
 * una ruta sino un identificador.
 */
public class ServidorLocal {

    private static final String TAG = "TPServidorLocal";

    /** Quién sabe qué fichero es cada identificador. */
    public interface Buscador {
        File dame(String id);
    }

    private final Buscador buscador;
    private final ExecutorService atendedores = Executors.newCachedThreadPool();
    private ServerSocket puerta;
    private Thread portero;

    public ServidorLocal(Buscador buscador) {
        this.buscador = buscador;
    }

    public boolean enPie() {
        return puerta != null && !puerta.isClosed();
    }

    public int puerto() {
        return puerta == null ? -1 : puerta.getLocalPort();
    }

    /** Abre en el primer puerto libre que dé el sistema. */
    public void arrancar() {
        try {
            puerta = new ServerSocket(0, 4, InetAddress.getByName("127.0.0.1"));
        } catch (Exception fallo) {
            Log.w(TAG, "no se ha podido abrir el servidor local", fallo);
            return;
        }
        portero = new Thread(new Runnable() {
            @Override
            public void run() {
                while (enPie()) {
                    try {
                        final Socket quien = puerta.accept();
                        atendedores.execute(new Runnable() {
                            @Override
                            public void run() {
                                atender(quien);
                            }
                        });
                    } catch (Exception fallo) {
                        if (enPie()) Log.w(TAG, "conexión perdida", fallo);
                    }
                }
            }
        }, "tp-servidor-local");
        portero.setDaemon(true);
        portero.start();
    }

    public void parar() {
        try {
            if (puerta != null) puerta.close();
        } catch (Exception ignorado) {
            /* Cerrar lo que ya está cerrado no es problema de nadie */
        }
        atendedores.shutdownNow();
    }

    /**
     * Un GET, con o sin rango.
     *
     * El rango es lo que hace que se pueda avanzar dentro de una película:
     * el reproductor pide «dame desde el byte tal» y espera un 206 con la
     * cabecera que dice qué trozo va dentro. Sin eso, el vídeo se ve entero
     * o no se ve, pero no se puede saltar.
     */
    private void atender(Socket quien) {
        RandomAccessFile lector = null;
        try {
            InputStream entra = quien.getInputStream();
            OutputStream sale = quien.getOutputStream();
            BufferedReader lineas = new BufferedReader(new InputStreamReader(entra, "UTF-8"));

            String peticion = lineas.readLine();
            if (peticion == null) return;
            String[] partes = peticion.split(" ");
            if (partes.length < 2 || !"GET".equals(partes[0])) {
                responderSeco(sale, 405, "Method Not Allowed");
                return;
            }
            String camino = URLDecoder.decode(partes[1], "UTF-8");

            long desde = 0;
            long hasta = -1;
            String linea;
            while ((linea = lineas.readLine()) != null && !linea.isEmpty()) {
                if (!linea.toLowerCase().startsWith("range:")) continue;
                String rango = linea.substring(6).trim();
                if (!rango.startsWith("bytes=")) continue;
                String[] extremos = rango.substring(6).split("-", 2);
                try {
                    if (!extremos[0].isEmpty()) desde = Long.parseLong(extremos[0].trim());
                    if (extremos.length > 1 && !extremos[1].isEmpty()) hasta = Long.parseLong(extremos[1].trim());
                } catch (NumberFormatException ignorado) {
                    /* Un rango ilegible se atiende como si no lo hubiera */
                }
            }

            if (!camino.startsWith("/d/")) {
                responderSeco(sale, 404, "Not Found");
                return;
            }
            File fichero = buscador.dame(camino.substring(3));
            if (fichero == null || !fichero.exists()) {
                responderSeco(sale, 404, "Not Found");
                return;
            }

            long tamano = fichero.length();
            if (hasta < 0 || hasta >= tamano) hasta = tamano - 1;
            if (desde >= tamano) {
                responderSeco(sale, 416, "Requested Range Not Satisfiable");
                return;
            }
            long cuanto = hasta - desde + 1;
            boolean porTrozos = desde > 0 || cuanto < tamano;

            StringBuilder cabecera = new StringBuilder();
            cabecera.append(porTrozos ? "HTTP/1.1 206 Partial Content\r\n" : "HTTP/1.1 200 OK\r\n");
            /* El tipo se deja en genérico a propósito: lo que baja de un panel
               puede ser mp4, mkv o ts, y el reproductor lo averigua mirando
               dentro mejor de lo que lo adivinaríamos por la extensión */
            cabecera.append("Content-Type: video/mp4\r\n");
            cabecera.append("Accept-Ranges: bytes\r\n");
            cabecera.append("Content-Length: ").append(cuanto).append("\r\n");
            if (porTrozos) {
                cabecera.append("Content-Range: bytes ").append(desde).append('-')
                        .append(hasta).append('/').append(tamano).append("\r\n");
            }
            /* La página que lo pide está en otro origen —es la web, en https—
               así que sin esto el navegador no la deja leerlo */
            cabecera.append("Access-Control-Allow-Origin: *\r\n");
            cabecera.append("Connection: close\r\n\r\n");
            sale.write(cabecera.toString().getBytes("UTF-8"));

            lector = new RandomAccessFile(fichero, "r");
            lector.seek(desde);
            byte[] trozo = new byte[64 * 1024];
            long quedan = cuanto;
            while (quedan > 0) {
                int piden = (int) Math.min(trozo.length, quedan);
                int leidos = lector.read(trozo, 0, piden);
                if (leidos <= 0) break;
                sale.write(trozo, 0, leidos);
                quedan -= leidos;
            }
            sale.flush();
        } catch (Exception fallo) {
            /* El reproductor corta la conexión en cuanto salta a otro punto
               del vídeo: eso no es un error, es lo normal */
            Log.d(TAG, "conexión cerrada", fallo);
        } finally {
            try {
                if (lector != null) lector.close();
            } catch (Exception ignorado) {
                /* Nada que hacer si ni cerrar se puede */
            }
            try {
                quien.close();
            } catch (Exception ignorado) {
                /* Ídem */
            }
        }
    }

    private void responderSeco(OutputStream sale, int codigo, String texto) throws Exception {
        String r = "HTTP/1.1 " + codigo + " " + texto + "\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        sale.write(r.getBytes("UTF-8"));
        sale.flush();
    }
}
